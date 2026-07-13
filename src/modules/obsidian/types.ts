export interface VaultStructure {
  README: string;
  wikiPages: Array<{ filename: string; content: string }>;
  documents: Array<{ filename: string; content: string }>;
}

export interface ObsidianExportOptions {
  format: 'zip' | 'markdown';
}
