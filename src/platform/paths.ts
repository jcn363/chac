import { join, dirname } from "node:path";

export function getAppRoot(): string {
  if (Bun.isStandaloneExecutable) {
    return dirname(process.argv[0]);
  }
  return join(import.meta.dir, "..", "..");
}

export function appPath(...segments: string[]): string {
  return join(getAppRoot(), ...segments);
}

export function dataPath(...segments: string[]): string {
  return join(getAppRoot(), "data", ...segments);
}
