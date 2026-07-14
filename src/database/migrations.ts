import { Database } from "bun:sqlite";

interface Migration {
  version: number;
  up: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_path TEXT,
  source_type TEXT NOT NULL DEFAULT 'file'
    CHECK(source_type IN ('file', 'url', 'text', 'clipboard')),
  content_hash TEXT,
  mime_type TEXT,
  file_size INTEGER,
  chunk_count INTEGER DEFAULT 0,
  metadata TEXT,
  description TEXT,
  transcription TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_hash
  ON documents(content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding BLOB,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  system_prompt TEXT,
  model TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  context_chunks TEXT,
  context_scores TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  model TEXT,
  latency_ms INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  embedding BLOB,
  parent_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  tags TEXT,
  source_document_ids TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wiki_slug ON wiki_pages(slug);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: SCHEMA_SQL,
  },
  {
    version: 2,
    up: `
      ALTER TABLE chat_sessions ADD COLUMN sort_order INTEGER DEFAULT 0;
      UPDATE chat_sessions SET sort_order = (
        SELECT COUNT(*) FROM chat_sessions AS s2
        WHERE s2.created_at <= chat_sessions.created_at
      );
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS user_memory (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN ('preference', 'topic', 'fact', 'summary')),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_key ON user_memory(category, key);
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results_count INTEGER DEFAULT 0,
        expanded_query TEXT,
        reranked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);
    `,
  },
  {
    version: 5,
    up: `ALTER TABLE chat_messages ADD COLUMN citations TEXT;`,
  },
  {
    version: 6,
    up: `
      CREATE TABLE IF NOT EXISTS vector_index_cache (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        embedding_norm REAL NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_vector_cache_table ON vector_index_cache(table_name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_cache_entry ON vector_index_cache(table_name, entry_id);
    `,
  },
  {
    version: 7,
    up: `
      ALTER TABLE chat_sessions ADD COLUMN auth_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(auth_token) WHERE auth_token IS NOT NULL;
    `,
  },
];

function ensureMetaTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | undefined;

  if (!row) {
    db.query("INSERT INTO schema_meta (key, value) VALUES ('version', '0')").run();
  }
}

function getCurrentVersion(db: Database): number {
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string };
  return parseInt(row.value, 10);
}

export function runMigrations(db: Database): void {
  ensureMetaTable(db);
  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current);

  if (pending.length === 0) return;

  const applyAll = db.transaction((migrations: Migration[]) => {
    for (const migration of migrations) {
      db.exec(migration.up);
      db.query("UPDATE schema_meta SET value = ? WHERE key = 'version'")
        .run(String(migration.version));
    }
  });

  applyAll(pending);
}
