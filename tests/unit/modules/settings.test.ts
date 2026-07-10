import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SettingsService } from "../../../src/modules/settings/service";
import { runMigrations } from "../../../src/database/migrations";

let db: Database;
let settings: SettingsService;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  settings = new SettingsService(db);
});

afterEach(() => {
  db.close();
});

describe("SettingsService", () => {
  it("loads default settings", () => {
    const all = settings.getAll();
    expect(all.length).toBeGreaterThan(0);
  });

  it("gets a setting by key", () => {
    const value = settings.get("llm.chat.temperature");
    expect(value).toBe(0.7);
  });

  it("sets a setting", () => {
    settings.set("llm.chat.temperature", 0.9);
    expect(settings.get("llm.chat.temperature")).toBe(0.9);
  });

  it("upserts on duplicate key", () => {
    settings.set("llm.chat.temperature", 0.5);
    settings.set("llm.chat.temperature", 0.8);
    expect(settings.get("llm.chat.temperature")).toBe(0.8);
  });

  it("returns undefined for unknown key", () => {
    expect(settings.get("nonexistent.key")).toBeUndefined();
  });
});
