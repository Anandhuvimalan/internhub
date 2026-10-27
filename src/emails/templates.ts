// Plain transactional email templates (used by the worker; no server-only imports).

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const BRAND = process.env.BRAND_NAME ?? "InternHub";

/** Escape text from users (names, titles) before it goes into email HTML. */
export function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f5f2;padding:24px;color:#1c1b19">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4e1da;border-radius:12px;padding:28px">
  <div style="font-weight:700;font-size:14px;letter-spacing:.04em;color:#0f5f4f">${BRAND}</div>
  <h1 style="font-size:20px;margin:12px 0 16px">${title}</h1>${body}
  <p style="color:#77736b;font-size:12px;margin-top:28px">You received this because of your ${BRAND} internship account.</p>
  </div></body></html>`;
}
const btn = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#0f5f4f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;

export function leadAck(p: { name: string }) {
  return {
    subject: `We received your internship enquiry`,
    html: layout(`Thanks, ${esc(p.name)}!`, `<p>Our admissions team will review your enquiry and contact you shortly with batch and duration options.</p>`),
  };
}

export function welcome(p: { name: string; studentCode: string; internship: string; durationMonths: number; startDate: string; activationToken: string | null }) {
  const start = new Date(p.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const action = p.activationToken ? btn(`${APP_URL}/activate/${p.activationToken}`, "Activate your account") : btn(`${APP_URL}/login`, "Sign in");
  return {
    subject: `Welcome to ${p.internship} — your student ID is ${p.studentCode}`,
    html: layout(
      `Welcome aboard, ${esc(p.name)}`,
      `<p>Your admission is confirmed.</p>
       <table style="font-size:14px;margin:12px 0"><tr><td style="color:#77736b;padding-right:16px">Student ID</td><td><b>${esc(p.studentCode)}</b></td></tr>
       <tr><td style="color:#77736b">Internship</td><td>${esc(p.internship)}</td></tr>
       <tr><td style="color:#77736b">Duration</td><td>${p.durationMonths} month${p.durationMonths > 1 ? "s" : ""}</td></tr>
       <tr><td style="color:#77736b">Starts</td><td>${start}</td></tr></table>
       <p>Set your password to open your workspace. Your team and first project will appear once they are assigned.</p>${action}`,
    ),
  };
}

export function meetingInvite(p: { title: string; type: string; when: string; url?: string | null; id: string }) {
  return {
    subject: `Invitation: ${p.title} (${p.when} IST)`,
    html: layout(`${esc(p.type)}: ${esc(p.title)}`, `<p><b>${esc(p.when)} IST</b></p>${p.url ? `<p>Join link: <a href="${esc(p.url)}">${esc(p.url)}</a></p>` : ""}${btn(`${APP_URL}/meetings/${p.id}`, "RSVP")}`),
  };
}

export function meetingReminder(p: { title: string; when: string; minutesBefore: number; url?: string | null; id: string }) {
  const lead = p.minutesBefore >= 1440 ? "tomorrow" : `in ${p.minutesBefore >= 60 ? `${p.minutesBefore / 60} hour(s)` : `${p.minutesBefore} minutes`}`;
  return {
    subject: `Reminder: ${p.title} starts ${lead}`,
    html: layout(`${esc(p.title)} starts ${lead}`, `<p>${esc(p.when)} IST</p>${p.url ? `<p><a href="${esc(p.url)}">Join meeting</a></p>` : ""}${btn(`${APP_URL}/meetings/${p.id}`, "Open meeting")}`),
  };
}
