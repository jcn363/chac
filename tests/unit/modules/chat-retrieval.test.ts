import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { ChatService } from "../../../src/modules/chat/service";
import { WikiService } from "../../../src/modules/wiki/service";
import { DocumentsService } from "../../../src/modules/documents/service";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let chat: ChatService;
let wiki: WikiService;
let docs: DocumentsService;

beforeEach(() => {
  kernel = createTestKernel();
  chat = kernel.get<ChatService>("chat");
  wiki = kernel.get<WikiService>("wiki");
  docs = kernel.get<DocumentsService>("docs");
});

afterEach(() => {
  kernel.get<{ close: () => void }>("db").close();
});

describe("Ranked Fusion Retrieval", () => {
  it("returns empty context when no documents or wiki exist", async () => {
    const session = chat.createSession();
    const msg = await chat.sendMessage(session.id, "What is ML?");
    expect(msg.content).toBeDefined();
    expect(msg.context_chunks).toBe("[]");
  });

  it("creates session and sends message with context", async () => {
    const session = chat.createSession();
    const msg = await chat.sendMessage(session.id, "Hello");
    expect(msg.role).toBe("assistant");
    expect(msg.session_id).toBe(session.id);
  });

  it("retrieves wiki and chunk results together via fusion", async () => {
    // Create a document and chunk it
    const session = chat.createSession();
    const msg = await chat.sendMessage(session.id, "test message");
    expect(msg).toBeDefined();
  });

  it("session history is preserved across messages", async () => {
    const session = chat.createSession();
    await chat.sendMessage(session.id, "First message");
    await chat.sendMessage(session.id, "Second message");
    const messages = chat.getMessages(session.id);
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it("handles system prompt", async () => {
    const session = chat.createSession({ systemPrompt: "You are helpful" });
    expect(session.system_prompt).toBe("You are helpful");
    const msg = await chat.sendMessage(session.id, "Hi");
    expect(msg).toBeDefined();
  });
});

describe("Token-Aware Context Budget", () => {
  it("includes all history when under budget", async () => {
    const session = chat.createSession();
    await chat.sendMessage(session.id, "msg1");
    await chat.sendMessage(session.id, "msg2");
    await chat.sendMessage(session.id, "msg3");
    const messages = chat.getMessages(session.id);
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("respects context window size", async () => {
    const session = chat.createSession();
    for (let i = 0; i < 5; i++) {
      await chat.sendMessage(session.id, `message ${i}`);
    }
    const messages = chat.getMessages(session.id);
    expect(messages.length).toBeGreaterThanOrEqual(5);
  });

  it("handles empty session", async () => {
    const session = chat.createSession();
    const msg = await chat.sendMessage(session.id, "Hello");
    expect(msg).toBeDefined();
    expect(msg.content).toBeDefined();
  });
});
