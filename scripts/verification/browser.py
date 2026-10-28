"""Real provider browser checks. All accounts, credentials and services must be synthetic/local."""
import base64, hashlib, hmac, json, os, re, struct, subprocess, time, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
def report_failure(kind, value, traceback):
    while traceback.tb_next and traceback.tb_frame.f_code.co_filename != __file__: traceback = traceback.tb_next
    print("Provider browser failed:", kind.__name__, "at line", traceback.tb_lineno, "(page contents withheld)", flush=True)
sys.excepthook = report_failure
expect.set_options(timeout=15000)
base = os.environ.get("BASE_URL", "http://localhost:3004")
if urlparse(base).hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("Provider browser checks require loopback")
fixture = json.loads(Path(os.environ["PROVIDER_BROWSER_FIXTURE_PATH"]).read_text())
password = "isolated-provider-fixture-123"
errors, count = [], 0

def check(name, condition):
    global count
    if not condition: raise AssertionError(name)
    count += 1; print("PASS " + name, flush=True)

def login(context, email, recovery=None):
    page = context.new_page(); page.on("pageerror", lambda e: errors.append(type(e).__name__))
    page.goto(base + "/login")
    page.get_by_label("Email", exact=True).fill(email); page.get_by_label("Password", exact=True).fill(password)
    page.get_by_role("button", name="Sign in", exact=True).click()
    page.wait_for_url(re.compile(r"/(workspace|login/mfa|admin)$"))
    if recovery:
        page.get_by_label("Authenticator or recovery code").fill(recovery)
        page.get_by_role("button", name="Verify", exact=True).click(); page.wait_for_url(base + "/admin")
    return page

def audit(page, name):
    source = os.environ.get("AXE_SOURCE_PATH")
    if source:
        page.add_script_tag(path=source)
        violations = page.evaluate("async () => (await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>v.id)")
        check("WCAG A/AA " + name, not violations)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN") or None)
    context = browser.new_context(accept_downloads=True, viewport={"width": 390, "height": 844})
    page = login(context, fixture["email"]); page.goto(base + "/tasks/" + fixture["taskId"])
    expect(page.locator("input[type=file]")).to_be_enabled()
    page.locator("input[type=file]").set_input_files({"name":"browser.txt","mimeType":"text/plain","buffer":b"browser clean fixture"})
    expect(page.get_by_text("✓ browser.txt", exact=True)).to_be_visible()
    check("actual browser CORS presigned upload", True)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Submit for review", exact=True).click()
    expect(page.get_by_text(re.compile("browser.txt.*scan pending"))).to_be_visible()
    check("browser file withheld before scan", True)
    subprocess.run(["node", "--import", "tsx", "scripts/worker.ts", "--once"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    page.reload()
    with page.expect_download() as event:
        page.get_by_role("link", name="📎 browser.txt", exact=True).click()
    download = event.value
    check("browser attachment contains scanned bytes", Path(download.path()).read_bytes() == b"browser clean fixture")
    page.goto(base + "/settings/security"); audit(page, "student account security")
    change_form = page.locator("form").filter(has=page.get_by_role("button",name="Change password",exact=True))
    change_form.get_by_label("Current password", exact=True).fill(password)
    change_form.get_by_label("New password", exact=True).fill("replacement-browser-password")
    change_form.get_by_label("Confirm new password", exact=True).fill("replacement-browser-password")
    change_form.get_by_role("button", name="Change password", exact=True).click(); page.wait_for_url(re.compile(r"/login\?passwordChanged=1"))
    check("browser password rotation signs out", True); context.close()
    context = browser.new_context(viewport={"width":390,"height":844})
    page = login(context, fixture["adminEmail"], fixture["recoveryCode"])
    page.goto(base + "/admin/operations"); audit(page, "operations")
    check("operations does not expose job payload", "private-job-payload" not in page.content())
    retry_form = page.locator("form").filter(has=page.locator("input[name=id][value=\"" + fixture["failedJobId"] + "\"]"))
    retry_form.get_by_role("button", name="Retry failed job", exact=True).click()
    expect(retry_form).to_have_count(0)
    check("operator retries failed job through form", True)
    page.goto(base + "/settings/security"); audit(page, "admin account security")
    page.get_by_label("Password for authenticator replacement",exact=True).fill(password)
    page.get_by_role("button",name="Set up replacement authenticator",exact=True).click()
    page.wait_for_url(base + "/login/mfa"); page.locator("code").wait_for()
    secret = page.locator("code").inner_text()
    digest = hmac.new(base64.b32decode(secret),struct.pack(">Q",int(time.time())//30),hashlib.sha1).digest(); offset=digest[-1]&15
    code=str((struct.unpack(">I",digest[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
    page.get_by_label("Authenticator or recovery code").fill(code); page.get_by_role("button",name="Verify",exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Save these single-use recovery codes")
    check("replacement authenticator shows ten fresh recovery codes",len(re.findall(r"\b[a-f0-9]{24}\b",page.get_by_role("status").inner_text()))==10)
    page.get_by_role("link",name="Continue to administration").click(); page.wait_for_url(base + "/admin")
    check("replacement session reaches administration", True)
    check("provider browser has no page errors", not errors)
    context.close(); browser.close()
print(f"Provider browser passed {count} checks. No secrets printed.")
