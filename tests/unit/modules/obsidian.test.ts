import { describe, it, expect } from 'bun:test';
import { createTestKernel } from '../../helpers/setup';
import { ObsidianExporter } from '../../../src/modules/obsidian/exporter';
import type { Kernel } from '../../../src/kernel/types';

function createExporter(kernel: Kernel) {
  const db = kernel.get<import('bun:sqlite').Database>('db');
  return new ObsidianExporter(db);
}

function insertWikiPage(db: import('bun:sqlite').Database, title: string, content: string) {
  db.query(`INSERT INTO wiki_pages (id, title, slug, content, content_hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
    crypto.randomUUID(), title, title.toLowerCase().replace(/\s+/g, '-'), content, 'hash_' + title
  );
}

function insertDocument(db: import('bun:sqlite').Database, title: string, metadata?: string) {
  db.query(`INSERT INTO documents (id, title, content_hash, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`).run(
    crypto.randomUUID(), title, 'hash_' + title
  );
  if (metadata) {
    db.query(`UPDATE documents SET metadata = ? WHERE title = ?`).run(metadata, title);
  }
}

describe('ObsidianExporter', () => {
  it('returns vault structure with README, wikiPages, documents', async () => {
    const kernel = createTestKernel();
    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault).toHaveProperty('README');
    expect(vault).toHaveProperty('wikiPages');
    expect(vault).toHaveProperty('documents');
    expect(Array.isArray(vault.wikiPages)).toBe(true);
    expect(Array.isArray(vault.documents)).toBe(true);
  });

  it('generates wikilinks between pages', async () => {
    const kernel = createTestKernel();
    const db = kernel.get<import('bun:sqlite').Database>('db');
    insertWikiPage(db, 'Machine Learning', 'Machine Learning is a subset of AI.');
    insertWikiPage(db, 'Deep Learning', 'Deep Learning uses neural networks.');
    insertWikiPage(db, 'Neural Networks', 'Neural Networks are used in Machine Learning.');

    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault.wikiPages.length).toBe(3);
    // Page about Neural Networks should wikilink Machine Learning
    const nnPage = vault.wikiPages.find(p => p.filename === 'Neural Networks.md')!;
    expect(nnPage).toBeDefined();
    expect(nnPage.content).toContain('[[Machine Learning]]');
  });

  it('includes frontmatter in wiki pages', async () => {
    const kernel = createTestKernel();
    const db = kernel.get<import('bun:sqlite').Database>('db');
    insertWikiPage(db, 'Test Page', 'Some content here.');

    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault.wikiPages.length).toBe(1);
    const page = vault.wikiPages[0]!;
    expect(page.content).toContain('---');
    expect(page.content).toContain('title: "Test Page"');
    expect(page.content).toContain('type: wiki');
    expect(page.content).toContain('tags: [chac, wiki]');
  });

  it('includes frontmatter with metadata in document pages', async () => {
    const kernel = createTestKernel();
    const db = kernel.get<import('bun:sqlite').Database>('db');
    insertDocument(db, 'My Report', JSON.stringify({ pages: 10, author: 'Alice', format: 'pdf' }));

    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault.documents.length).toBe(1);
    const doc = vault.documents[0]!;
    expect(doc.content).toContain('title: "My Report"');
    expect(doc.content).toContain('type: document');
    expect(doc.content).toContain('pages: 10');
    expect(doc.content).toContain('author: "Alice"');
    expect(doc.content).toContain('format: pdf');
  });

  it('sanitizes filenames', async () => {
    const kernel = createTestKernel();
    const exporter = createExporter(kernel);

    // Test via internal method — access through export
    const db = kernel.get<import('bun:sqlite').Database>('db');
    insertWikiPage(db, 'File:Name/Test', 'content');

    const vault = await exporter.exportVault();
    expect(vault.wikiPages[0]!.filename).toBe('File_Name_Test.md');
  });

  it('generates index with all pages and docs', async () => {
    const kernel = createTestKernel();
    const db = kernel.get<import('bun:sqlite').Database>('db');
    insertWikiPage(db, 'Page A', 'content');
    insertWikiPage(db, 'Page B', 'content');
    insertDocument(db, 'Doc 1');

    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault.README).toContain('## Wiki Pages (2)');
    expect(vault.README).toContain('[[Page A]]');
    expect(vault.README).toContain('[[Page B]]');
    expect(vault.README).toContain('## Documents (1)');
    expect(vault.README).toContain('[[Doc 1]]');
  });

  it('returns empty vault when no pages or docs exist', async () => {
    const kernel = createTestKernel();
    const exporter = createExporter(kernel);
    const vault = await exporter.exportVault();

    expect(vault.wikiPages.length).toBe(0);
    expect(vault.documents.length).toBe(0);
    expect(vault.README).toContain('Chac Vault');
  });
});
