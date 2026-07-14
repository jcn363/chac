export interface TranscriptionServiceType {
  transcribe(filePath: string): Promise<TranscriptionResult>;
  isAvailable(): boolean;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}
