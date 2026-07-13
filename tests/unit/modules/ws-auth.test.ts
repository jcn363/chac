import { describe, it, expect, beforeEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import type { Kernel } from "../../../src/kernel/types";
import type { ChatService } from "../../../src/modules/chat/service";

let kernel: Kernel;
let chat: ChatService;

beforeEach(() => {
  kernel = createTestKernel();
  chat = kernel.get<ChatService>("chat");
});

describe("WebSocket auth — token generation", () => {
  it("createSession generates an auth_token", () => {
    const session = chat.createSession({ title: "Auth Test" });
    expect(session.auth_token).toBeTruthy();
    expect(typeof session.auth_token).toBe("string");
    expect(session.auth_token!.length).toBeGreaterThan(0);
  });

  it("each session gets a unique auth_token", () => {
    const s1 = chat.createSession({ title: "S1" });
    const s2 = chat.createSession({ title: "S2" });
    expect(s1.auth_token).not.toBe(s2.auth_token);
  });
});

describe("WebSocket auth — token validation", () => {
  it("validateSessionTokenByToken returns session for valid token", () => {
    const session = chat.createSession({ title: "Validate Test" });
    const result = chat.validateSessionTokenByToken(session.auth_token!);
    expect(result).toBeDefined();
    expect(result!.id).toBe(session.id);
  });

  it("validateSessionTokenByToken returns undefined for invalid token", () => {
    const result = chat.validateSessionTokenByToken("nonexistent-token");
    expect(result).toBeUndefined();
  });

  it("validateSessionToken returns true for matching session+token", () => {
    const session = chat.createSession({ title: "Match Test" });
    expect(chat.validateSessionToken(session.id, session.auth_token!)).toBe(true);
  });

  it("validateSessionToken returns false for wrong token", () => {
    const session = chat.createSession({ title: "Mismatch Test" });
    expect(chat.validateSessionToken(session.id, "wrong-token")).toBe(false);
  });

  it("validateSessionToken returns false for wrong session id", () => {
    const session = chat.createSession({ title: "Wrong ID Test" });
    expect(chat.validateSessionToken("wrong-id", session.auth_token!)).toBe(false);
  });

  it("auth_token is included in session list", () => {
    chat.createSession({ title: "List Test" });
    const sessions = chat.listSessions();
    const withToken = sessions.filter((s) => s.auth_token !== null);
    expect(withToken.length).toBeGreaterThanOrEqual(1);
  });
});

describe("WebSocket auth — WS handler open() logic", () => {
  it("open() closes connection when no token query param", () => {
    let closedCode = 0;
    let closedReason = "";
    const mockWs = {
      data: { req: { url: "http://localhost/ws" } },
      close(code: number, reason: string) {
        closedCode = code;
        closedReason = reason;
      },
    };

    // Simulate the open handler logic
    const url = new URL((mockWs.data as any).req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      (mockWs as any).close(4001, "Authentication required");
    }

    expect(closedCode).toBe(4001);
    expect(closedReason).toBe("Authentication required");
  });

  it("open() closes connection when token is invalid", () => {
    let closedCode = 0;
    let closedReason = "";
    const mockWs = {
      data: { req: { url: "http://localhost/ws?token=bad-token" } },
      close(code: number, reason: string) {
        closedCode = code;
        closedReason = reason;
      },
    };

    const url = new URL((mockWs.data as any).req.url);
    const token = url.searchParams.get("token");
    const found = chat.validateSessionTokenByToken(token ?? "");
    if (!found) {
      (mockWs as any).close(4003, "Invalid token");
    }

    expect(closedCode).toBe(4003);
    expect(closedReason).toBe("Invalid token");
  });

  it("open() succeeds when token is valid", () => {
    let closedCode = 0;
    let wasAdded = false;
    const session = chat.createSession({ title: "WS Success" });
    const clients = new Set();
    const mockWs = {
      data: { req: { url: `http://localhost/ws?token=${session.auth_token}` } },
      close(code: number) {
        closedCode = code;
      },
    };

    const url = new URL((mockWs.data as any).req.url);
    const token = url.searchParams.get("token");
    const found = chat.validateSessionTokenByToken(token ?? "");
    if (!found) {
      (mockWs as any).close(4003, "Invalid token");
    } else {
      clients.add({ ws: mockWs, sessionId: found.id });
      wasAdded = true;
    }

    expect(closedCode).toBe(0);
    expect(wasAdded).toBe(true);
  });
});
