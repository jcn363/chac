export interface PlatformInfo {
  os: "linux" | "darwin" | "windows" | "unknown";
  arch: "x64" | "arm64" | "unknown";
  platformKey: string;
}

export function detectPlatform(): PlatformInfo {
  const os = (() => {
    switch (process.platform) {
      case "linux":
        return "linux" as const;
      case "darwin":
        return "darwin" as const;
      case "win32":
        return "windows" as const;
      default:
        return "unknown" as const;
    }
  })();

  const arch = (() => {
    switch (process.arch) {
      case "x64":
        return "x64" as const;
      case "arm64":
        return "arm64" as const;
      default:
        return "unknown" as const;
    }
  })();

  return {
    os,
    arch,
    platformKey: `${os}-${arch}`,
  };
}
