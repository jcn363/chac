import { describe, it, expect, beforeEach } from "bun:test";
import { getCurrentSession, setCurrentSession, getCurrentToken, setCurrentToken } from "../../../src/public/js/lib/state.js";

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

describe("getCurrentToken", () => {
  it("returns null initially", () => {
    setCurrentToken(null);
    expect(getCurrentToken()).toBeNull();
  });
});

describe("setCurrentToken", () => {
  beforeEach(() => {
    setCurrentToken(null);
  });

  it("sets a token", () => {
    setCurrentToken("abc-123-token");
    expect(getCurrentToken()).toBe("abc-123-token");
  });

  it("overwrites previous token", () => {
    setCurrentToken("token-1");
    setCurrentToken("token-2");
    expect(getCurrentToken()).toBe("token-2");
  });

  it("can be set back to null", () => {
    setCurrentToken("token-1");
    setCurrentToken(null);
    expect(getCurrentToken()).toBeNull();
  });

  it("accepts empty string", () => {
    setCurrentToken("");
    expect(getCurrentToken()).toBe("");
  });
});
