import { readFile, writeFile } from "node:fs/promises";

const raw = await readFile(new URL("../.env", import.meta.url), "utf8");
const allowed = new Set(["DATABASE_GATEWAY_URL", "DATABASE_GATEWAY_TOKEN"]);
const lines = raw
  .split(/\r?\n/)
  .filter((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    return match && allowed.has(match[1]);
  });

if (lines.length !== allowed.size) {
  throw new Error("DATABASE_GATEWAY_URL and DATABASE_GATEWAY_TOKEN are required in .env.");
}

await writeFile(new URL("../.dev.vars", import.meta.url), `${lines.join("\n")}\n`, {
  mode: 0o600,
});
console.log("Local portal gateway settings prepared.");
