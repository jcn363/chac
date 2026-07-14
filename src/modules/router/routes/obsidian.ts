import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import type { Kernel } from '../../../kernel/types';
import { ObsidianExporter } from '../../obsidian/exporter';
import { wrap } from '../utils';

export function setupObsidianRoutes(app: Hono, kernel: Kernel): void {
  app.get('/api/obsidian/export', wrap(async (c) => {
    const format = c.req.query('format') ?? 'markdown';
    const exporter = kernel.get<ObsidianExporter>('obsidian');

    if (format === 'zip') {
      const vault = await exporter.exportVault();
      return c.json(vault);
    }

    const vault = await exporter.exportVault();
    let output = vault.README + '\n\n---\n\n';
    for (const page of vault.wikiPages) {
      output += page.content + '\n\n---\n\n';
    }
    for (const doc of vault.documents) {
      output += doc.content + '\n\n---\n\n';
    }
    return c.json({ markdown: output, pageCount: vault.wikiPages.length, docCount: vault.documents.length });
  }));

  app.get('/api/obsidian/pages', wrap((c) => {
    const db = kernel.get<Database>('db');
    const pages = db.query('SELECT id, title, slug, content, created_at, updated_at FROM wiki_pages ORDER BY title').all();
    return c.json(pages);
  }));
}
