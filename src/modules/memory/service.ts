import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { collectLlmResponse, extractJsonFromLlm } from "../../utils/llm-helpers";
import type { MemoryEntry } from "./types";
import type { LlmService } from "../llm/types";

/** Cross-session user memory with LLM-powered extraction. */
export class MemoryService {
  private db: Database;
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  isEnabled(): boolean {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    return settings.get("memory.enabled") as boolean;
  }

  list(): MemoryEntry[] {
    return this.db
      .query("SELECT * FROM user_memory ORDER BY category, key")
      .all() as MemoryEntry[];
  }

  get(category: string, key: string): MemoryEntry | undefined {
    const row = this.db
      .query("SELECT * FROM user_memory WHERE category = ? AND key = ?")
      .get(category, key);
    return row ? (row as MemoryEntry) : undefined;
  }

  upsert(category: MemoryEntry["category"], key: string, value: string, source: string = "chat"): MemoryEntry {
    const existing = this.get(category, key);
    if (existing) {
      this.db
        .query(
          "UPDATE user_memory SET value = ?, source = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(value, source, existing.id);
      return this.db.query("SELECT * FROM user_memory WHERE id = ?").get(existing.id) as MemoryEntry;
    }

    const id = generateId();
    this.db
      .query(
        "INSERT INTO user_memory (id, category, key, value, source) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, category, key, value, source);
    return this.db.query("SELECT * FROM user_memory WHERE id = ?").get(id) as MemoryEntry;
  }

  delete(id: string): boolean {
    const result = this.db.query("DELETE FROM user_memory WHERE id = ?").run(id);
    return result.changes > 0;
  }

  buildContextString(): string {
    if (!this.isEnabled()) return "";
    const entries = this.list();
    if (entries.length === 0) return "";

    const grouped = new Map<string, string[]>();
    for (const entry of entries) {
      if (!grouped.has(entry.category)) grouped.set(entry.category, []);
      grouped.get(entry.category)!.push(`${entry.key}: ${entry.value}`);
    }

    const lines: string[] = [];
    for (const [category, items] of grouped) {
      lines.push(`${category}:`);
      for (const item of items) {
        lines.push(`  - ${item}`);
      }
    }
    return lines.join("\n");
  }

  async extractFromConversation(
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const llm = this.kernel.get<LlmService>("llm");

    const messages = [
      {
        role: "system",
        content:
          "Extract user preferences, topics of interest, or facts about the user from this conversation. " +
          'Return a JSON array of objects with "category" (preference/topic/fact/summary), "key", and "value" fields. ' +
          "Return empty array [] if nothing relevant. Only output the JSON array, no other text.",
      },
      {
        role: "user",
        content: `User: ${userMessage}\nAssistant: ${assistantMessage}`,
      },
    ];

    const response = await collectLlmResponse(llm, messages);

    const memories = extractJsonFromLlm<Array<{
      category: MemoryEntry["category"];
      key: string;
      value: string;
    }>>(response, /\[[\s\S]*\]/);

    if (memories) {
      for (const m of memories) {
        if (m.category && m.key && m.value) {
          this.upsert(m.category, m.key, m.value, "chat");
        }
      }
    }
  }
}
