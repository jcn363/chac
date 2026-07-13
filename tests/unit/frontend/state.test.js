import { describe, it, expect, beforeEach } from "bun:test";
import { getCurrentSession, setCurrentSession } from "../../../src/public/js/lib/state.js";

describe("getCurrentSession", () => {
  it("returns null initially", () => {
    expect(getCurrentSession()).toBeNull();
  });
});

describe("setCurrentSession", () => {
  beforeEach(() => {
    setCurrentSession(null);
  });

  it("sets a session id", () => {
    setCurrentSession("session-abc-123");
    expect(getCurrentSession()).toBe("session-abc-123");
  });

  it("overwrites previous session", () => {
    setCurrentSession("session-1");
    setCurrentSession("session-2");
    expect(getCurrentSession()).toBe("session-2");
  });

  it("can be set back to null", () => {
    setCurrentSession("session-1");
    setCurrentSession(null);
    expect(getCurrentSession()).toBeNull();
  });

  it("accepts numeric string ids", () => {
    setCurrentSession("42");
    expect(getCurrentSession()).toBe("42");
  });
});
