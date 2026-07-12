import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { deleteById, countRows, parsePagination } from "../../utils/db-helpers";
import { VectorIndex } from "../../utils/vector-index";
import type { WikiPage } from "./types";
import type { WikiCompiler } from "./compiler";

/** Wiki service — queries, search, and compilation delegation. */
export class WikiService {
  private db: Database;
  private kernel: Kernel;
  private wikiIndex: VectorIndex;
  private compiler: WikiCompiler;
  private onCompileCallback?: () => void;

  constructor(kernel: Kernel, compiler?: WikiCompiler) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
    this.wikiIndex = new VectorIndex(this.db, "wiki_pages");
    this.compiler = compiler!;
  }

  setCompiler(compiler: WikiCompiler): void {
    this.compiler = compiler;
  }

  async compile(): Promise<WikiPage[]> {
    const results = await this.compiler.compile();
    this.onCompileCallback?.();
    return results;
  }

  onCompile(cb: () => void): void {
    this.onCompileCallback = cb;
  }

  async updatePageInsight(pageId: string, insight: string): Promise<void> {
    await this.compiler.updatePageInsight(pageId, insight);
    this.wikiIndex.invalidate();
  }

  list(options: { page?: number; perPage?: number } = {}): {
    pages: WikiPage[];
    total: number;
  } {
    const { page, perPage, offset } = parsePagination(options);

    const total = countRows(this.db, "wiki_pages");
    const pages = this.db
      .query("SELECT * FROM wiki_pages ORDER BY updated_at DESC LIMIT ? OFFSET ?")
      .all(perPage, offset) as WikiPage[];

    return { pages, total };
  }

  get(id: string): WikiPage | undefined {
    const row = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(id);
    return row ? (row as WikiPage) : undefined;
  }

  delete(id: string): boolean {
    return deleteById(this.db, "wiki_pages", id);
  }

  async search(query: string, options: { limit?: number } = {}): Promise<Array<WikiPage & { score: number }>> {
    const limit = options.limit ?? 3;
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const results = this.wikiIndex.search(this.db, "wiki_pages", "id", "content", queryVec, { limit });

    return results.map((r) => {
      const page = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(r.id) as WikiPage;
      return { ...page, score: r.score };
    });
  }

  invalidateIndex(): void {
    this.wikiIndex.invalidate();
  }
}
