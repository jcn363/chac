import { join, dirname } from "node:path";
import { realpathSync } from "node:fs";

let cachedRoot: string | null = null;

function isDevMode(): boolean {
  // Dev mode: running via bun/node directly (not compiled binary)
  const argv0 = process.argv[0] ?? "";
  const base = argv0.split("/").pop() ?? "";
  return base === "bun" || base === "node";
}

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

  // Dev mode: source tree relative to this file
  if (isDevMode()) {
    cachedRoot = join(import.meta.dir, "..", "..");
    return cachedRoot;
  }

  // Production mode: compiled binary
  const exeDir = resolveExeDir();
  if (exeDir) {
    // If binary lives inside bin/, project root is one level up
    const exeName = exeDir.split("/").pop() ?? "";
    cachedRoot = exeName === "bin" ? join(exeDir, "..") : exeDir;
    return cachedRoot;
  }

  // Fallback
  cachedRoot = join(import.meta.dir, "..", "..");
  return cachedRoot;
}

export function appPath(...segments: string[]): string {
  return join(getAppRoot(), ...segments);
}

export function dataPath(...segments: string[]): string {
  return join(getAppRoot(), "data", ...segments);
}
