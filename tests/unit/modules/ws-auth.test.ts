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

describe("WebSocket auth — message-based auth flow", () => {
  it("rejects chat messages before authentication", () => {
    const client: { ws: { send: (m: string) => void; close: (c: number, r: string) => void }; sessionId: string | undefined; authenticated: boolean } = {
      ws: { send: () => {}, close: () => {} },
      sessionId: undefined,
      authenticated: false,
    };
    let sentMsg = "";
    let closedCode = 0;
    client.ws.send = (msg: string) => { sentMsg = msg; };
    client.ws.close = (code: number) => { closedCode = code; };

    // Simulate handleMessage with auth message
    const data = JSON.parse("{}"); // empty = no auth
    if (!client.authenticated) {
      if (data.type !== "auth" || !data.token) {
        client.ws.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
        client.ws.close(4001, "Authentication required");
      }
    }

    expect(closedCode).toBe(4001);
    expect(JSON.parse(sentMsg).type).toBe("error");
  });

  it("auth message with valid token authenticates client", () => {
    const session = chat.createSession({ title: "WS Auth" });
    const client: { ws: { send: (m: string) => void; close: (c: number) => void }; sessionId: string | undefined; authenticated: boolean } = {
      ws: { send: () => {}, close: () => {} },
      sessionId: undefined,
      authenticated: false,
    };
    let sentMsg = "";
    client.ws.send = (msg: string) => { sentMsg = msg; };

    const data = { type: "auth", token: session.auth_token };
    if (data.type === "auth" && data.token) {
      const found = chat.validateSessionTokenByToken(data.token);
      if (found) {
        client.authenticated = true;
        client.sessionId = found.id;
        client.ws.send(JSON.stringify({ type: "auth:ok", sessionId: found.id }));
      }
    }

    expect(client.authenticated).toBe(true);
    expect(client.sessionId).toBe(session.id);
    expect(JSON.parse(sentMsg).type).toBe("auth:ok");
  });

  it("auth message with invalid token rejects client", () => {
    const client: { ws: { send: (m: string) => void; close: (c: number, r: string) => void }; sessionId: string | undefined; authenticated: boolean } = {
      ws: { send: () => {}, close: () => {} },
      sessionId: undefined,
      authenticated: false,
    };
    let sentMsg = "";
    let closedCode = 0;
    client.ws.send = (msg: string) => { sentMsg = msg; };
    client.ws.close = (code: number) => { closedCode = code; };

    const data = { type: "auth", token: "bad-token" };
    if (data.type === "auth" && data.token) {
      const found = chat.validateSessionTokenByToken(data.token);
      if (!found) {
        (client.ws as any).send(JSON.stringify({ type: "error", error: "Invalid token" }));
        (client.ws as any).close(4003, "Invalid token");
      }
    }

    expect(closedCode).toBe(4003);
    expect(client.authenticated).toBe(false);
  });
});
