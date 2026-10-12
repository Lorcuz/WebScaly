import { describe, expect, it } from "vitest";
import { audit } from "../../scripts/release-files.mjs";

const files = text => ({ "assets/example.js": new TextEncoder().encode(text) });

describe("publication privacy audit", () => {
  it("accepts ordinary runner identifiers without depending on the build account", () => {
    expect(() => audit(files('const runner = "local"; function renderRunner() {}'))).not.toThrow();
  });

  it("rejects home-directory paths, including escaped Windows paths", () => {
    const unix = ["", "home", "example", "private.txt"].join("/");
    const windows = ["C:", "Users", "Example", "private.txt"].join("\\");
    for (const path of [unix, windows, JSON.stringify(windows)]) {
      expect(() => audit(files(path))).toThrow("Private data detected");
    }
  });

  it("continues rejecting credentials and excluded source paths", () => {
    expect(() => audit(files("ghp_" + "x".repeat(30)))).toThrow("Private data detected");
    expect(() => audit({ ".env": new TextEncoder().encode("EXAMPLE=value") })).toThrow("Excluded path");
  });
});

