import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { db } from "../src/lib/db";
import { createInitialAdmin } from "../src/server/bootstrap";

// Readline handles raw terminal input; mute only the password response.
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });

async function main() {
  const input = {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  if (!input.email || !input.name || !input.password) {
    if (!process.stdin.isTTY) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD, or run this command in an interactive terminal.");
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    try {
      input.email ??= await prompt.question("Admin email: ");
      input.name ??= await prompt.question("Admin name: ");
      if (!input.password) {
        const answer = prompt.question("Admin password (12+ characters; hidden): ");
        muted = true;
        input.password = await answer;
        muted = false;
        process.stdout.write("\n");
      }
    } finally { muted = false; prompt.close(); }
  }
  const result = await createInitialAdmin(input);
  console.log(result.created ? "Initial super-admin created. Sign in to complete security setup." : "Installation already has an administrator. No account or password was changed.");
}

main().catch(() => { console.error("Bootstrap failed. Check the database connection and provide a new email, name (2+ characters), and password (12–128 characters). No existing password is overwritten."); process.exitCode = 1; }).finally(() => db.$disconnect());
