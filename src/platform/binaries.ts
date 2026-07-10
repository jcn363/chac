import { join } from "node:path";
import { existsSync, chmodSync } from "node:fs";
import { detectPlatform } from "./detect";
import { appPath } from "./paths";

const BINARIES_ROOT = appPath("bin", "llama.cpp");

export function resolveBinary(name: string): string {
  const platform = detectPlatform();
  const ext = platform.os === "windows" ? ".exe" : "";

  function findInDir(dir: string): string | null {
    const fullPath = join(dir, `${name}${ext}`);
    if (existsSync(fullPath)) return fullPath;
    return null;
  }

  // Exact platform match
  const exactDir = join(BINARIES_ROOT, name, platform.platformKey);
  const exact = findInDir(exactDir);
  if (exact) return exact;

  // Fallback: x64-baseline, x64-modern
  if (platform.arch === "x64") {
    for (const v of ["x64-baseline", "x64-modern"]) {
      const variantDir = join(BINARIES_ROOT, name, `${platform.os}-${v}`);
      const found = findInDir(variantDir);
      if (found) return found;
    }
  }

  throw new Error(
    `No binary found for ${name} on ${platform.platformKey}. ` +
      `Expected at: ${join(exactDir, name + ext)}`
  );
}

export async function spawnBinary(
  name: string,
  args: string[] = [],
  options?: { env?: Record<string, string> }
): Promise<Bun.Subprocess> {
  const binaryPath = resolveBinary(name);

  if (process.platform !== "win32") {
    chmodSync(binaryPath, 0o755);
  }

  return Bun.spawn([binaryPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: options?.env,
  });
}
