import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAppRoot } from "../../platform/paths";
import { detectPlatform } from "../../platform/detect";
import { createLogger } from "../../utils/logger";
import type { TranscriptionServiceType, TranscriptionResult } from "./types";

const log = createLogger("transcription");

function isWhisperAvailable(): boolean {
  const platform = detectPlatform();
  const ext = platform.os === "windows" ? ".exe" : "";
  const binaryPath = join(getAppRoot(), "bin", "whisper.cpp", platform.platformKey, `whisper-cli${ext}`);
  return existsSync(binaryPath);
}

/** Manages whisper.cpp for audio transcription. */
export class TranscriptionServiceImpl implements TranscriptionServiceType {
  private devMode: boolean;

  constructor() {
    this.devMode = !isWhisperAvailable();
    if (this.devMode) {
      log.info("Dev mode: whisper.cpp not found. Transcription will return placeholder text.");
    }
  }

  isAvailable(): boolean {
    return !this.devMode;
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    if (this.devMode) {
      return {
        text: "[Transcription not available - whisper.cpp binary not installed]",
        language: "en",
      };
    }

    const platform = detectPlatform();
    const ext = platform.os === "windows" ? ".exe" : "";
    const binaryPath = join(getAppRoot(), "bin", "whisper.cpp", platform.platformKey, `whisper-cli${ext}`);

    log.info(`Transcribing: ${filePath}`);

    const proc = Bun.spawn([
      binaryPath,
      "--model", "base",
      "--language", "auto",
      "--output-format", "json",
      "--output-dir", "/tmp",
      filePath,
    ], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 300000, // 5 minutes
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      log.error(`Whisper process failed with code ${exitCode}: ${stderr}`);
      throw new Error(`Transcription failed: ${stderr || "unknown error"}`);
    }

    const result = JSON.parse(stdout);
    return {
      text: result.text || "",
      language: result.language,
      duration: result.duration,
      segments: result.segments?.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
    };
  }
}
