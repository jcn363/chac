export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  content_hash: string | null;
  parent_id: string | null;
  tags: string | null;
  source_document_ids: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
