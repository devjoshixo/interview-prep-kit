import { existsSync, readFileSync } from "node:fs";

// Minimal .env loader — no dependency. Loads KEY=VALUE lines into process.env
// without overriding anything already set. The Next.js app auto-loads .env.local;
// the CLI (run via tsx) does not, so it calls this so `npm run evaluate` works
// from a clean clone with a filled-in .env.local.
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const inlineComment = value.indexOf(" #");
      if (inlineComment !== -1) value = value.slice(0, inlineComment).trim();
    }
    process.env[key] = value;
  }
}
