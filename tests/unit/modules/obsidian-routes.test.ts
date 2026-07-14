import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createTestKernel } from '../../helpers/setup';
import { setupObsidianRoutes } from '../../../src/modules/router/routes/obsidian';
import type { Database } from 'bun:sqlite';

describe('Obsidian Routes', () => {
  let app: Hono;
  let kernel: ReturnType<typeof createTestKernel>;

  beforeEach(() => {
    kernel = createTestKernel();
    app = new Hono();
    setupObsidianRoutes(app, kernel);
  });

  it('GET /api/obsidian/pages returns empty array when no pages', async () => {
    const res = await app.request('/api/obsidian/pages');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });

  it('GET /api/obsidian/pages returns pages from DB', async () => {
    const db = kernel.get<Database>('db');
    db.query(`INSERT INTO wiki_pages (id, title, slug, content, content_hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
      crypto.randomUUID(), 'Test Page', 'test-page', 'Some content.', 'hash1'
    );
    db.query(`INSERT INTO wiki_pages (id, title, slug, content, content_hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
      crypto.randomUUID(), 'Another Page', 'another-page', 'More content.', 'hash2'
    );

    const res = await app.request('/api/obsidian/pages');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0]!.title).toBeDefined();
  });

  it('GET /api/obsidian/export returns markdown by default', async () => {
    const res = await app.request('/api/obsidian/export');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('markdown');
    expect(body).toHaveProperty('pageCount');
    expect(body).toHaveProperty('docCount');
    expect(typeof body.markdown).toBe('string');
    expect(typeof body.pageCount).toBe('number');
    expect(typeof body.docCount).toBe('number');
  });

  it('GET /api/obsidian/export?format=zip returns vault JSON', async () => {
    const res = await app.request('/api/obsidian/export?format=zip');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('README');
    expect(body).toHaveProperty('wikiPages');
    expect(body).toHaveProperty('documents');
    expect(Array.isArray(body.wikiPages)).toBe(true);
    expect(Array.isArray(body.documents)).toBe(true);
  });

  it('GET /api/obsidian/export includes wiki pages in markdown output', async () => {
    const db = kernel.get<Database>('db');
    db.query(`INSERT INTO wiki_pages (id, title, slug, content, content_hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
      crypto.randomUUID(), 'AI Knowledge', 'ai-knowledge', 'Artificial intelligence overview.', 'hash_ai'
    );

    const res = await app.request('/api/obsidian/export');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.pageCount).toBe(1);
    expect(body.markdown).toContain('Artificial intelligence overview.');
  });
});
