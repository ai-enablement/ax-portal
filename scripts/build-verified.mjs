import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const cli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
const timeoutMs = Number(process.env.SITES_BUILD_TIMEOUT_MS || 180000);

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [fileURLToPath(cli), "build"], {
    cwd: fileURLToPath(root),
    stdio: "inherit",
    env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
  });
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    reject(new Error(`vinext build exceeded ${timeoutMs}ms.`));
  }, timeoutMs);
  child.once("error", reject);
  child.once("exit", (code) => {
    clearTimeout(timer);
    if (code === 0) resolve();
    else reject(new Error(`vinext build exited with code ${code}.`));
  });
});

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
const hostingUrl = new URL("../dist/.openai/hosting.json", import.meta.url);
await Promise.all([access(workerUrl), access(hostingUrl)]);
JSON.parse(await readFile(hostingUrl, "utf8"));

const importUrl = pathToFileURL(fileURLToPath(workerUrl));
importUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(importUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must export default.fetch.");
}

console.log("Validated Sites artifact and Worker entry point.");
