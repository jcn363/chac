import { join, dirname } from "node:path";
import { realpathSync } from "node:fs";

let cachedRoot: string | null = null;

function resolveExeDir(): string | null {
  // Linux: /proc/self/exe is the most reliable
  if (process.platform === "linux") {
    try {
      return dirname(realpathSync("/proc/self/exe"));
    } catch {}
  }
  // macOS / Windows: resolve argv[0]
  try {
    const arg0 = process.argv[0];
    if (arg0) return dirname(realpathSync(arg0));
  } catch {}
  return null;
}

export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot;

  // Try to find real executable directory first
  const exeDir = resolveExeDir();
  if (exeDir) {
    // Verify it's not the bun runtime itself (dev mode)
    const exeName = exeDir.split("/").pop() ?? "";
    if (exeName !== "bun" && exeName !== "node") {
      // If binary lives inside bin/, project root is one level up
      cachedRoot = exeName === "bin" ? join(exeDir, "..") : exeDir;
      return cachedRoot;
    }
  }

  // Dev mode: source tree relative to this file
  cachedRoot = join(import.meta.dir, "..", "..");
  return cachedRoot;
}

export function appPath(...segments: string[]): string {
  return join(getAppRoot(), ...segments);
}

export function dataPath(...segments: string[]): string {
  return join(getAppRoot(), "data", ...segments);
}
