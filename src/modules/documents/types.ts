export interface Document {
  id: string;
  title: string;
  source_path: string | null;
  source_type: string;
  content_hash: string | null;
  mime_type: string | null;
  file_size: number | null;
  chunk_count: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  embedding: Buffer | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  created_at: string;
}

export interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  documentId: string;
  documentTitle?: string;
  citation?: string;
}

export interface IngestResult {
  id: string;
  title: string;
  chunkCount: number;
}

export interface BatchIngestResult {
  results: IngestResult[];
  errors: Array<{ path: string; error: string }>;
  total: number;
  succeeded: number;
  failed: number;
}

export interface BatchDeleteResult {
  deleted: number;
  notFound: string[];
}

export interface DocumentStatus {
  total: number;
  totalChunks: number;
  lastIngestedAt: string | null;
}

export interface ExpandedQuery {
  original: string;
  expanded: string;
  keywords: string[];
}

export interface TagInfo {
  tag: string;
  documentCount: number;
}

export interface DocumentWithTags extends Document {
  tags: string[];
}
