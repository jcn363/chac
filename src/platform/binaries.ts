import { join } from "node:path";
import { existsSync, chmodSync } from "node:fs";
import { detectPlatform } from "./detect";
import { appPath } from "./paths";

const BINARIES_ROOT = appPath("bin", "llama.cpp");

export function resolveBinary(name: string): string {
  const platform = detectPlatform();

  const exactPath = join(BINARIES_ROOT, name, platform.platformKey);
  if (existsSync(exactPath)) return exactPath;

  if (platform.arch === "x64") {
    for (const variant of ["x64-baseline", "x64-modern"]) {
      const variantPath = join(BINARIES_ROOT, name, `${platform.os}-${variant}`);
      if (existsSync(variantPath)) return variantPath;
    }
  }

  throw new Error(
    `No binary found for ${name} on ${platform.platformKey}. ` +
      `Expected at: ${join(BINARIES_ROOT, name, platform.platformKey)}`
  );
}

export async function spawnBinary(
  name: string,
  args: string[] = [],
  options?: { env?: Record<string, string> }
): Promise<Bun.ChildProcess> {
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
