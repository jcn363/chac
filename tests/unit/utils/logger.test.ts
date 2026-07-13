import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createLogger, setLogLevel } from "../../../src/utils/logger";

describe("logger", () => {
  let originalError: typeof console.error;
  let originalLog: typeof console.log;
  let errorOutput: string[];
  let logOutput: string[];

  beforeEach(() => {
    originalError = console.error;
    originalLog = console.log;
    errorOutput = [];
    logOutput = [];
    console.error = (...args: unknown[]) => errorOutput.push(String(args[0]));
    console.log = (...args: unknown[]) => logOutput.push(String(args[0]));
    setLogLevel("info");
  });

  afterEach(() => {
    console.error = originalError;
    console.log = originalLog;
    setLogLevel("info");
  });

  it("produces structured JSON output via console.error", () => {
    const log = createLogger("test");
    log.info("hello world");
    expect(errorOutput).toHaveLength(1);
    const entry = JSON.parse(errorOutput[0]!);
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello world");
    expect(entry.module).toBe("test");
    expect(entry.timestamp).toBeDefined();
  });

  it("includes meta object when provided", () => {
    const log = createLogger("test");
    log.warn("warning", { code: 42 });
    const entry = JSON.parse(errorOutput[0]!);
    expect(entry.level).toBe("warn");
    expect(entry.meta).toEqual({ code: 42 });
  });

  it("tags output with module name via console.log", () => {
    const log = createLogger("mymod");
    log.info("test msg");
    expect(logOutput).toHaveLength(1);
    expect(logOutput[0]).toContain("[mymod]");
    expect(logOutput[0]).toContain("test msg");
  });

  it("filters out messages below current log level", () => {
    setLogLevel("warn");
    const log = createLogger("test");
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(errorOutput).toHaveLength(2);
    expect(errorOutput[0]).toContain('"warn"');
    expect(errorOutput[1]).toContain('"error"');
  });

  it("level set to debug allows all messages", () => {
    setLogLevel("debug");
    const log = createLogger("test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(errorOutput).toHaveLength(4);
  });

  it("level set to error only allows error", () => {
    setLogLevel("error");
    const log = createLogger("test");
    log.debug("nope");
    log.info("nope");
    log.warn("nope");
    log.error("yes");
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('"error"');
  });

  it("no meta produces no meta field in JSON", () => {
    const log = createLogger("test");
    log.info("clean");
    const entry = JSON.parse(errorOutput[0]!);
    expect(entry.meta).toBeUndefined();
  });
});
