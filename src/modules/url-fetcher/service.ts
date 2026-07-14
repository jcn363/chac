import type { Kernel } from "../../kernel/types";
import { createLogger } from "../../utils/logger";
import type { UrlFetcherServiceType, UrlFetchResult } from "./types";
import type { LlmService } from "../llm/types";
import { collectLlmResponse } from "../../utils/llm-helpers";
import { ExternalServiceError } from "../../errors";

const log = createLogger("url-fetcher");

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || "Untitled";
}

export class UrlFetcherServiceImpl implements UrlFetcherServiceType {
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  async isAccessible(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchUrl(url: string): Promise<UrlFetchResult> {
    log.info(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: { "User-Agent": "Chac/1.0" },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    }).catch((error) => {
      throw new ExternalServiceError("url-fetcher", `Failed to fetch URL: ${error}`);
    });

    if (!response.ok) {
      throw new ExternalServiceError("url-fetcher", `HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "text/html";
    const raw = await response.text();
    const title = extractTitle(raw);

    let content: string;
    if (contentType.includes("text/html")) {
      content = stripHtml(raw);
    } else if (contentType.includes("text/plain")) {
      content = raw;
    } else {
      // Unknown or binary type: try text extraction, cap at 100KB
      content = raw.length > 100000 ? raw.slice(0, 100000) : raw;
    }

    // Generate description via LLM
    let description: string | undefined;
    try {
      const llm = this.kernel.get<LlmService>("llm");
      const truncated = content.slice(0, 2000);
      description = await collectLlmResponse(llm, [
        { role: "system", content: "Summarize the following content in 1-2 concise sentences. Only output the summary, nothing else." },
        { role: "user", content: truncated },
      ]);
    } catch (error) {
      log.warn(`Failed to generate description: ${error}`);
    }

    return {
      url,
      title,
      content,
      description,
      contentType,
      fetchedAt: new Date().toISOString(),
    };
  }
}
