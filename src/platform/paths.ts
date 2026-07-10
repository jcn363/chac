import { join, dirname } from "node:path";
import { realpathSync, existsSync } from "node:fs";

let cachedRoot: string | null = null;

function isCompiledBinary(): boolean {
  // Check if running as a standalone compiled binary (not via bun/node runtime)
  const argv0 = process.argv[0] ?? "";
  // Bun compiled binaries have argv[0] set to "bun" but /proc/self/exe points to the real binary
  // Dev mode: argv[0] is the full path to bun/node binary
  if (argv0.includes("/") || argv0 === "node") return false;
  // argv[0] is "bun" — could be compiled or dev mode via bun
  // Compiled binary: /proc/self/exe differs from bun binary
  if (process.platform === "linux") {
    try {
      const exePath = realpathSync("/proc/self/exe");
      const exeName = exePath.split("/").pop() ?? "";
      // If /proc/self/exe is not "bun", it's a compiled binary
      return exeName !== "bun" && exeName !== "node";
    } catch {}
  }
  return false;
}

function resolveCompiledExeDir(): string | null {
  if (!isCompiledBinary()) return null;
  // Linux: /proc/self/exe is the most reliable
  if (process.platform === "linux") {
    try {
      const dir = dirname(realpathSync("/proc/self/exe"));
      const dirName = dir.split("/").pop() ?? "";
      return dirName === "bin" ? join(dir, "..") : dir;
    } catch {}
  }
  // macOS / Windows: resolve argv[0]
  try {
    const arg0 = process.argv[0];
    if (arg0) {
      const dir = dirname(realpathSync(arg0));
      const dirName = dir.split("/").pop() ?? "";
      return dirName === "bin" ? join(dir, "..") : dir;
    }
  } catch {}
  return null;
}

export function getAppRoot(): string {
  if (cachedRoot) return cachedRoot;

  // Production mode: compiled binary location
  const exeDir = resolveCompiledExeDir();
  if (exeDir) {
    cachedRoot = exeDir;
    return cachedRoot;
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
