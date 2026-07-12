import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { ChatService } from "../../../src/modules/chat/service";
import type { Kernel } from "../../../src/kernel/types";
import type { ChatMessage } from "../../../src/modules/chat/types";

describe("Conversation Export/Import", () => {
  let kernel: Kernel;
  let chat: ChatService;

  beforeEach(() => {
    kernel = createTestKernel();
    chat = new ChatService(kernel);
  });

  afterEach(() => {
    kernel.get<{ close: () => void }>("db").close();
  });

  it("exports a session with messages", async () => {
    const session = chat.createSession({ title: "Test Export" });
    await chat.sendMessage(session.id, "Hello");
    await chat.sendMessage(session.id, "How are you?");

    const exported = chat.exportSession(session.id);
    expect(exported).toBeDefined();
    expect(exported!.session.title).toBe("Test Export");
    expect(exported!.messages.length).toBeGreaterThan(0);
  });

  it("returns undefined for non-existent session", () => {
    const exported = chat.exportSession("nonexistent");
    expect(exported).toBeUndefined();
  });

  it("imports a session with messages", () => {
    const imported = chat.importSession({
      session: { title: "Imported Test" },
      messages: [
        { role: "user" as const, content: "Hello from import" } as Partial<ChatMessage>,
        { role: "assistant" as const, content: "Hello! I was imported." } as Partial<ChatMessage>,
      ],
    });

    expect(imported.title).toBe("Imported Test");
    const messages = chat.getMessages(imported.id);
    expect(messages.length).toBe(2);
    expect(messages[0]!.content).toBe("Hello from import");
    expect(messages[1]!.content).toBe("Hello! I was imported.");
  });

  it("import preserves message metadata", () => {
    const now = new Date().toISOString();
    const imported = chat.importSession({
      session: { title: "Metadata Test" },
      messages: [
        {
          role: "user" as const,
          content: "Test message",
          latency_ms: 150,
          model: "test-model",
          created_at: now,
        } as Partial<ChatMessage>,
      ],
    });

    const messages = chat.getMessages(imported.id);
    expect(messages[0]!.latency_ms).toBe(150);
    expect(messages[0]!.model).toBe("test-model");
    expect(messages[0]!.created_at).toBe(now);
  });

  it("round-trip export then import", async () => {
    const original = chat.createSession({ title: "Round Trip" });
    await chat.sendMessage(original.id, "First message");
    await chat.sendMessage(original.id, "Second message");

    const exported = chat.exportSession(original.id)!;
    const imported = chat.importSession({
      session: { title: exported.session.title },
      messages: exported.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as Partial<ChatMessage>[],
    });

    expect(imported.title).toBe("Round Trip");
    const importedMessages = chat.getMessages(imported.id);
    expect(importedMessages.length).toBe(exported.messages.length);
  });

  it("import with missing role defaults to user", () => {
    const imported = chat.importSession({
      session: { title: "Missing Role Test" },
      messages: [
        { content: "Test" } as Partial<ChatMessage>,
      ],
    });

    const messages = chat.getMessages(imported.id);
    expect(messages[0]!.role).toBe("user");
  });

  it("import with empty messages array", () => {
    const imported = chat.importSession({
      session: { title: "Empty Test" },
      messages: [],
    });

    expect(imported.title).toBe("Empty Test");
    expect(chat.getMessages(imported.id).length).toBe(0);
  });
});
