export interface MemoryEntry {
  id: string;
  category: "preference" | "topic" | "fact" | "summary";
  key: string;
  value: string;
  source: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}
