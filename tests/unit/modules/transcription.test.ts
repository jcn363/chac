import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TranscriptionServiceImpl } from "../../../src/modules/transcription/service";

// Mock existsSync to control whisper availability
const existsSyncMock = mock(() => false);

// We need to mock the module-level function, so we test via the class behavior
describe("TranscriptionServiceImpl", () => {
  describe("dev mode (binary not found)", () => {
    let service: TranscriptionServiceImpl;

    beforeEach(() => {
      service = new TranscriptionServiceImpl();
    });

    it("isAvailable() returns false in dev mode", () => {
      expect(service.isAvailable()).toBe(false);
    });

    it("transcribe() returns placeholder text in dev mode", async () => {
      const result = await service.transcribe("/tmp/test.wav");
      expect(result.text).toBe("[Transcription not available - whisper.cpp binary not installed]");
      expect(result.language).toBe("en");
    });

    it("transcribe() returns result matching TranscriptionResult shape", async () => {
      const result = await service.transcribe("/tmp/audio.mp3");
      expect(typeof result.text).toBe("string");
      expect(result.language).toBeDefined();
      // segments should be undefined in dev mode (not present in placeholder)
      expect(result.segments).toBeUndefined();
    });
  });

  describe("result shape", () => {
    it("transcription result has expected fields", async () => {
      const service = new TranscriptionServiceImpl();
      const result = await service.transcribe("/tmp/test.wav");

      // Verify result conforms to TranscriptionResult interface
      expect(result).toHaveProperty("text");
      expect(typeof result.text).toBe("string");

      // Optional fields
      if (result.language !== undefined) {
        expect(typeof result.language).toBe("string");
      }
      if (result.duration !== undefined) {
        expect(typeof result.duration).toBe("number");
      }
      if (result.segments !== undefined) {
        expect(Array.isArray(result.segments)).toBe(true);
        for (const seg of result.segments) {
          expect(typeof seg.start).toBe("number");
          expect(typeof seg.end).toBe("number");
          expect(typeof seg.text).toBe("string");
        }
      }
    });
  });

  describe("error handling", () => {
    it("handles empty file path gracefully in dev mode", async () => {
      const service = new TranscriptionServiceImpl();
      const result = await service.transcribe("");
      expect(result.text).toBe("[Transcription not available - whisper.cpp binary not installed]");
    });
  });
});
