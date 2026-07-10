import { describe, it, expect, afterEach } from "vitest";
import { detectPlatform } from "../../../src/platform/detect";

const origPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const origArch = Object.getOwnPropertyDescriptor(process, "arch")!;

function mockPlatform(os: string, arch: string) {
  Object.defineProperty(process, "platform", { value: os, configurable: true });
  Object.defineProperty(process, "arch", { value: arch, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", origPlatform);
  Object.defineProperty(process, "arch", origArch);
});

describe("detectPlatform", () => {
  it("detects current OS", () => {
    const platform = detectPlatform();
    expect(["linux", "darwin", "windows"]).toContain(platform.os);
  });

  it("detects current arch", () => {
    const platform = detectPlatform();
    expect(["x64", "arm64"]).toContain(platform.arch);
  });

  it("constructs platformKey", () => {
    const platform = detectPlatform();
    expect(platform.platformKey).toBe(`${platform.os}-${platform.arch}`);
  });

  it("detects darwin", () => {
    mockPlatform("darwin", "arm64");
    expect(detectPlatform().os).toBe("darwin");
  });

  it("detects windows", () => {
    mockPlatform("win32", "x64");
    expect(detectPlatform().os).toBe("windows");
  });

  it("detects arm64", () => {
    mockPlatform("linux", "arm64");
    expect(detectPlatform().arch).toBe("arm64");
  });

  it("returns unknown for unsupported OS", () => {
    mockPlatform("freebsd", "x64");
    expect(detectPlatform().os).toBe("unknown");
  });

  it("returns unknown for unsupported arch", () => {
    mockPlatform("linux", "mips");
    expect(detectPlatform().arch).toBe("unknown");
  });
});
