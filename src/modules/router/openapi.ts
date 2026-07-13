import type { Hono } from "hono";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Chac API",
    version: "0.1.0",
    description: "Portable RAG chat application — local-first, no cloud dependencies.",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {
    "/api/status": {
      get: {
        summary: "Health check",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, version: { type: "string" } } } } } } },
      },
    },
    "/api/settings": {
      get: {
        summary: "List all settings",
        responses: {
          200: {
            description: "Settings array",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      key: { type: "string" },
                      value: {},
                      category: { type: "string" },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        summary: "Update a setting",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { key: { type: "string" }, value: {} }, required: ["key", "value"] } } },
        },
        responses: { 200: { description: "Updated" } },
      },
    },
    "/api/llm/status": {
      get: {
        summary: "LLM instance status",
        responses: { 200: { description: "Status object with chat/embed/vision/gpu/mtp booleans" } },
      },
    },
    "/api/documents": {
      get: {
        summary: "List documents (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: { description: "Paginated document list" } },
      },
      post: {
        summary: "Ingest a file",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        },
        responses: { 201: { description: "Ingest result" }, 400: { description: "Invalid path" } },
      },
    },
    "/api/documents/status": {
      get: {
        summary: "Document count/stats",
        responses: { 200: { description: "Status object" } },
      },
    },
    "/api/documents/batch": {
      post: {
        summary: "Batch ingest (max 50)",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } } }, required: ["paths"] } } },
        },
        responses: { 201: { description: "Batch result" }, 400: { description: "Invalid paths" } },
      },
    },
    "/api/documents/batch/delete": {
      post: {
        summary: "Batch delete by IDs",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } } },
        },
        responses: { 200: { description: "Delete result" } },
      },
    },
    "/api/documents/{id}": {
      get: {
        summary: "Get single document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Document with metadata",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    source_path: { type: "string", nullable: true },
                    source_type: { type: "string" },
                    content_hash: { type: "string", nullable: true },
                    mime_type: { type: "string", nullable: true },
                    file_size: { type: "integer", nullable: true },
                    chunk_count: { type: "integer" },
                    metadata: { type: "string", nullable: true, description: "JSON-encoded parsed metadata from document" },
                    created_at: { type: "string" },
                    updated_at: { type: "string" },
                  },
                },
              },
            },
          },
          404: { description: "Not found" },
        },
      },
      delete: {
        summary: "Delete a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
      },
    },
    "/api/documents/{id}/reingest": {
      post: {
        summary: "Re-ingest (re-chunk + re-embed)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Reingest result" }, 404: { description: "Not found" } },
      },
    },
    "/api/documents/search": {
      post: {
        summary: "Semantic search",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" }, rerank: { type: "boolean" }, expand: { type: "boolean" } }, required: ["query"] } } },
        },
        responses: { 200: { description: "Search results" } },
      },
    },
    "/api/search/history": {
      get: {
        summary: "Get search history",
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 50 } }],
        responses: { 200: { description: "Search history" } },
      },
      delete: {
        summary: "Clear search history",
        responses: { 200: { description: "Cleared" } },
      },
    },
    "/api/search/analytics": {
      get: {
        summary: "Search analytics",
        responses: {
          200: {
            description: "Search analytics data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    totalSearches: { type: "integer" },
                    uniqueQueries: { type: "integer" },
                    avgResults: { type: "number" },
                    expandedCount: { type: "integer" },
                    rerankedCount: { type: "integer" },
                    topQueries: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          query: { type: "string" },
                          count: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/tags": {
      get: {
        summary: "List all tags with document counts",
        responses: { 200: { description: "Tag list" } },
      },
    },
    "/api/tags/{tag}/documents": {
      get: {
        summary: "Documents by tag",
        parameters: [{ name: "tag", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Document list" } },
      },
    },
    "/api/documents/{id}/tags": {
      put: {
        summary: "Replace all tags on a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { tags: { type: "array", items: { type: "string" } } } } } },
        },
        responses: { 200: { description: "Updated" } },
      },
      post: {
        summary: "Add tags to a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { tags: { type: "array", items: { type: "string" } } } } } },
        },
        responses: { 200: { description: "Added" } },
      },
      delete: {
        summary: "Remove tags from a document",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { tags: { type: "array", items: { type: "string" } } } } } },
        },
        responses: { 200: { description: "Removed" } },
      },
    },
    "/api/suggest": {
      get: {
        summary: "Generate suggested questions",
        parameters: [
          { name: "documentId", in: "query", schema: { type: "string" } },
          { name: "count", in: "query", schema: { type: "integer", default: 5 } },
        ],
        responses: { 200: { description: "Question list" } },
      },
    },
    "/api/chat/sessions": {
      get: {
        summary: "List all sessions",
        responses: { 200: { description: "Session list" } },
      },
      post: {
        summary: "Create new session",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, systemPrompt: { type: "string" } } } } },
        },
        responses: { 201: { description: "Created session" } },
      },
      put: {
        summary: "Reorder sessions",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } } } } },
        },
        responses: { 200: { description: "Reordered" } },
      },
    },
    "/api/chat/sessions/{id}": {
      get: {
        summary: "Get messages for a session",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Message list" } },
      },
      delete: {
        summary: "Delete a session",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" } },
      },
      put: {
        summary: "Rename a session",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },
        },
        responses: { 200: { description: "Updated" } },
      },
    },
    "/api/chat/sessions/{id}/messages": {
      get: {
        summary: "Get messages for a session",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Message list" } },
      },
    },
    "/api/chat/messages/{id}": {
      put: {
        summary: "Edit a message",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } } },
        },
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        summary: "Delete a message",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" } },
      },
    },
    "/api/chat": {
      post: {
        summary: "Send a chat message (main RAG endpoint)",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { sessionId: { type: "string" }, message: { type: "string" } }, required: ["sessionId", "message"] } } },
        },
        responses: { 200: { description: "Assistant message" }, 400: { description: "Invalid input" } },
      },
    },
    "/api/chat/sessions/{id}/export": {
      get: {
        summary: "Export session + messages as JSON",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Export data" } },
      },
    },
    "/api/chat/import": {
      post: {
        summary: "Import a conversation",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 201: { description: "Imported session" } },
      },
    },
    "/api/wiki": {
      get: {
        summary: "List wiki pages (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: { description: "Wiki page list" } },
      },
    },
    "/api/wiki/{id}": {
      get: {
        summary: "Get single wiki page",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Wiki page" }, 404: { description: "Not found" } },
      },
      delete: {
        summary: "Delete a wiki page",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
      },
    },
    "/api/wiki/compile": {
      post: {
        summary: "Compile documents into wiki",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  documentIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional list of document IDs to compile. Compiles all documents if omitted.",
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Compiled pages" } },
      },
    },
    "/api/wiki/search": {
      post: {
        summary: "Semantic search wiki pages",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] } } },
        },
        responses: { 200: { description: "Search results" } },
      },
    },
    "/api/memory": {
      get: {
        summary: "List all memory entries",
        responses: { 200: { description: "Memory list" } },
      },
      put: {
        summary: "Upsert a memory entry",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { category: { type: "string", enum: ["preference", "topic", "fact", "summary"] }, key: { type: "string" }, value: { type: "string" } }, required: ["category", "key", "value"] } } },
        },
        responses: { 200: { description: "Upserted entry" } },
      },
    },
    "/api/memory/{id}": {
      delete: {
        summary: "Delete a memory entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" } },
      },
    },
    "/api/cache/stats": {
      get: {
        summary: "Cache statistics",
        responses: { 200: { description: "Cache stats" } },
      },
    },
    "/api/cache/clear": {
      post: {
        summary: "Clear all caches",
        responses: { 200: { description: "Cleared" } },
      },
    },
    "/api/scheduler/status": {
      get: {
        summary: "Scheduler task status",
        responses: { 200: { description: "Task status list" } },
      },
    },
    "/api/scheduler/run/{name}": {
      post: {
        summary: "Manually trigger a scheduled task",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Result" } },
      },
    },
    "/api/backup": {
      get: {
        summary: "Export full database as JSON",
        responses: { 200: { description: "Database export" } },
      },
    },
    "/api/restore": {
      post: {
        summary: "Import database from JSON",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { 200: { description: "Restored" } },
      },
    },
  },
};

export function setupOpenApi(app: Hono): void {
  app.get("/api/openapi.json", (c) => c.json(OPENAPI_SPEC));
}
