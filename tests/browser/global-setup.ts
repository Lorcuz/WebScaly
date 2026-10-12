import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync(process.execPath, ["scripts/make-fixtures.mjs"], {
    stdio: "inherit",
  });
}
