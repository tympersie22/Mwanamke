import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

const environmentFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const next = fileURLToPath(new URL("../../../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  env: { ...process.env, PORT: process.env.PORTAL_PORT ?? "3000" },
  stdio: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
