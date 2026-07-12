/** Shared type for LLM chat completion interface used across services. */
export interface ChatCompletionLLM {
  chat: {
    completions: (opts: {
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
    }) => AsyncGenerator<string>;
  };
}

/** Re-export settings type for convenience. */
export type { SettingsServiceType } from '../modules/settings/types';
