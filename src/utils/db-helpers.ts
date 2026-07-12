import type { Database } from "bun:sqlite";

export function deleteById(db: Database, table: string, id: string): boolean {
  const result = db.query(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function countRows(db: Database, table: string): number {
  const row = db.query(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export interface PaginationOptions {
  page?: number;
  perPage?: number;
}

export interface PaginationResult {
  page: number;
  perPage: number;
  offset: number;
}

export function parsePagination(options: PaginationOptions): PaginationResult {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 20;
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
