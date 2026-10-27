// `npm start`: run the production standalone server built by `npm run build`.
// (`next start` does not support `output: "standalone"`.) Copies the static assets the
// standalone bundle expects beside server.js, then starts it. The Docker image does the
// same copy at build time.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

process.chdir(standalone);
process.env.PORT ??= "3000";
await import(pathToFileURL(join(standalone, "server.js")).href);
