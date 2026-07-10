import { describe, it, expect } from "bun:test";
import { getAppRoot, appPath, dataPath } from "../../../src/platform/paths";

describe("getAppRoot", () => {
  it("returns a string path", () => {
    const root = getAppRoot();
    expect(typeof root).toBe("string");
    expect(root.length).toBeGreaterThan(0);
  });
});

describe("appPath", () => {
  it("joins segments to app root", () => {
    const path = appPath("src", "main.ts");
    expect(path).toContain("src/main.ts");
  });
});

describe("dataPath", () => {
  it("joins segments under data directory", () => {
    const path = dataPath("chac.db");
    expect(path).toContain("data/chac.db");
  });
});
