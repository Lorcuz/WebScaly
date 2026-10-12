import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const child = spawn(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: process.env,
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
