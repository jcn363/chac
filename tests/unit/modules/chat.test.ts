import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { ChatService } from "../../../src/modules/chat/service";

let kernel: ReturnType<typeof createTestKernel>;
let chat: ChatService;

beforeEach(() => {
  kernel = createTestKernel();
  chat = new ChatService(kernel);
});

afterEach(() => {
  const db = kernel.get<{ close: () => void }>("db" as any);
  db.close();
});

describe("ChatService", () => {
  it("creates a session", () => {
    const session = chat.createSession({ title: "Test" });
    expect(session.id).toBeDefined();
    expect(session.title).toBe("Test");
  });

  it("lists sessions", () => {
    chat.createSession({ title: "A" });
    chat.createSession({ title: "B" });
    const sessions = chat.listSessions();
    expect(sessions.length).toBe(2);
  });

  it("gets a session by id", () => {
    const created = chat.createSession({ title: "Test" });
    const found = chat.getSession(created.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Test");
  });

  it("returns undefined for unknown session", () => {
    expect(chat.getSession("nonexistent")).toBeUndefined();
  });

  it("gets messages for a session", () => {
    const session = chat.createSession();
    const messages = chat.getMessages(session.id);
    expect(messages).toHaveLength(0);
  });
});
