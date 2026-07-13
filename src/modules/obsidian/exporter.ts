import type { Database } from 'bun:sqlite';
import type { WikiPage } from '../wiki/types';
import type { VaultStructure } from './types';

export class ObsidianExporter {
  constructor(private db: Database) {}

  async exportVault(): Promise<VaultStructure> {
    const pages = this.db.query('SELECT * FROM wiki_pages ORDER BY title').all() as WikiPage[];

    const docs = this.db.query('SELECT id, title, metadata, content_hash FROM documents ORDER BY title').all() as Array<{
      id: string; title: string; metadata: string | null; content_hash: string;
    }>;

    const pageTitles = pages.map(p => p.title);
    const wikiPages = pages.map(page => ({
      filename: `${this.sanitizeFilename(page.title)}.md`,
      content: this.generatePageContent(page, pageTitles),
    }));

    const documentPages = docs.map(doc => ({
      filename: `${this.sanitizeFilename(doc.title)}.md`,
      content: this.generateDocumentPage(doc),
    }));

    const readme = this.generateIndex(pages, docs);

    return { README: readme, wikiPages, documents: documentPages };
  }

  private generatePageContent(page: WikiPage, allTitles: string[]): string {
    let content = `---\ntitle: "${page.title}"\ntype: wiki\ncreated: ${page.created_at}\nupdated: ${page.updated_at}\ntags: [chac, wiki]\n---\n\n# ${page.title}\n\n`;

    let body = page.content;
    for (const title of allTitles) {
      if (title !== page.title && body.includes(title)) {
        body = body.replace(new RegExp(`\\b${this.escapeRegex(title)}\\b`, 'g'), `[[${title}]]`);
      }
    }

    content += body;
    return content;
  }

  private generateDocumentPage(doc: { id: string; title: string; metadata: string | null; content_hash: string }): string {
    let frontmatter = `---\ntitle: "${doc.title}"\ntype: document\nsource_id: ${doc.id}\n`;
    if (doc.metadata) {
      try {
        const meta = JSON.parse(doc.metadata);
        if (meta.pages) frontmatter += `pages: ${meta.pages}\n`;
        if (meta.author) frontmatter += `author: "${meta.author}"\n`;
        if (meta.format) frontmatter += `format: ${meta.format}\n`;
      } catch {
        // invalid JSON, skip metadata
      }
    }
    frontmatter += `tags: [chac, document]\n---\n\n# ${doc.title}\n\n`;
    frontmatter += `*Document ingested into Chac. Content hash: ${doc.content_hash}*\n`;
    return frontmatter;
  }

  private generateIndex(pages: WikiPage[], docs: Array<{ id: string; title: string }>): string {
    let index = `---\ntitle: Chac Vault Index\ntype: index\n---\n\n# Chac Vault\n\n`;
    index += `Exported from Chac on ${new Date().toISOString()}\n\n`;
    if (pages.length > 0) {
      index += `## Wiki Pages (${pages.length})\n\n`;
      for (const page of pages) {
        index += `- [[${page.title}]]\n`;
      }
    }
    if (docs.length > 0) {
      index += `\n## Documents (${docs.length})\n\n`;
      for (const doc of docs) {
        index += `- [[${doc.title}]]\n`;
      }
    }
    return index;
  }

  private sanitizeFilename(title: string): string {
    return title.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
