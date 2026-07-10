import { mkdirSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-x64-baseline",
  "bun-linux-arm64",
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-darwin-x64-baseline",
  "bun-windows-x64",
  "bun-windows-x64-baseline",
] as const;

const USB_DIR = "usb-drive";
const BIN_DIR = join(USB_DIR, "bin");

async function build() {
  console.log("Building Chac...\n");

  // Create USB drive structure
  mkdirSync(join(USB_DIR, "bin"), { recursive: true });
  mkdirSync(join(USB_DIR, "bin", "llama.cpp"), { recursive: true });
  mkdirSync(join(USB_DIR, "models"), { recursive: true });

  // Build each target
  for (const target of TARGETS) {
    const name = target.replace("bun-", "");
    const outfile = join(BIN_DIR, `chac-${name}${target.includes("windows") ? ".exe" : ""}`);
    console.log(`Building ${target} → ${outfile}`);

    const result = await Bun.build({
      entrypoints: ["./src/main.ts"],
      compile: {
        target: target as any,
        outfile,
      },
      minify: true,
      sourcemap: "linked",
      define: {
        BUILD_VERSION: JSON.stringify(process.env.npm_package_version || "0.1.0"),
      },
    });

    if (!result.success) {
      const logMessages = result.logs.map(l => l.text || String(l)).join("\n");
      console.error(`  FAILED: ${logMessages}`);
      process.exit(1);
    }
    console.log(`  OK (${(await Bun.file(outfile).arrayBuffer()).byteLength} bytes)`);
  }

  // Copy launcher scripts
  copyLauncher("start.sh");
  copyLauncher("start.command");
  copyLauncher("start.bat");
  copyLauncher("README.txt");

  console.log(`\nDone! USB drive structure at ./${USB_DIR}/`);
}

function copyLauncher(name: string) {
  const src = join("launchers", name);
  const dst = join(USB_DIR, name);
  if (existsSync(src)) {
    cpSync(src, dst);
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
