import { describe, it, expect } from "bun:test";
import {
  getCorrelationId,
  runWithCorrelation,
  generateCorrelationId,
} from "../../../src/utils/tracing";

describe("tracing", () => {
  it("returns undefined outside any context", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("generates an 8-char correlation ID", () => {
    const id = generateCorrelationId();
    expect(id).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(id)).toBe(true);
  });

  it("generates unique IDs", () => {
    const a = generateCorrelationId();
    const b = generateCorrelationId();
    expect(a).not.toBe(b);
  });

  it("propagates correlation ID within runWithCorrelation", () => {
    const id = "abc12345";
    runWithCorrelation(id, () => {
      expect(getCorrelationId()).toBe(id);
    });
  });

  it("returns undefined after leaving the context", () => {
    const id = "xyz99999";
    runWithCorrelation(id, () => {
      expect(getCorrelationId()).toBe(id);
    });
    expect(getCorrelationId()).toBeUndefined();
  });

  it("preserves ID through nested async calls", async () => {
    const id = "nested12";
    await runWithCorrelation(id, async () => {
      expect(getCorrelationId()).toBe(id);
      await Bun.sleep(1);
      expect(getCorrelationId()).toBe(id);
    });
  });

  it("does not leak ID between parallel contexts", async () => {
    const results: string[] = [];
    await Promise.all([
      runWithCorrelation("ctx1aaaa", async () => {
        await Bun.sleep(5);
        results.push(getCorrelationId() ?? "");
      }),
      runWithCorrelation("ctx2bbbb", async () => {
        await Bun.sleep(5);
        results.push(getCorrelationId() ?? "");
      }),
    ]);
    expect(results).toContain("ctx1aaaa");
    expect(results).toContain("ctx2bbbb");
  });
});
