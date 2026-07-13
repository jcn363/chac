import { marked } from "marked";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type DocumentFormat = "text" | "markdown" | "html" | "pdf" | "docx";

export interface ParseResult {
  content: string;
  format: DocumentFormat;
  metadata?: Record<string, unknown>;
}

export function detectFormat(filePath: string): DocumentFormat {
  const ext = filePath.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
    case "doc":
      return "docx";
    case "md":
    case "markdown":
      return "markdown";
    case "html":
    case "htm":
      return "html";
    case "txt":
    case "text":
    default:
      return "text";
  }
}

export function validateFormat(
  filePath: string,
  buffer: ArrayBuffer
): DocumentFormat {
  const header = new Uint8Array(buffer.slice(0, 8));

  // PDF magic bytes: %PDF
  if (
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  ) {
    return "pdf";
  }

  // DOCX/ZIP magic bytes: PK
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return "docx";
  }

  // Text-based detection for remaining formats
  const textStart = new TextDecoder()
    .decode(buffer.slice(0, 500))
    .toLowerCase();

  // HTML detection: look for <html or <!DOCTYPE
  if (textStart.includes("<html") || textStart.includes("<!doctype")) {
    return "html";
  }

  // Markdown detection: look for markdown syntax markers
  if (
    /^#{1,6}\s/m.test(textStart) ||
    textStart.includes("**") ||
    textStart.includes("```")
  ) {
    return "markdown";
  }

  // Fall back to extension-based detection
  return detectFormat(filePath);
}

export async function parseDocument(
  filePath: string,
  buffer: ArrayBuffer
): Promise<ParseResult> {
  const format = validateFormat(filePath, buffer);

  switch (format) {
    case "pdf":
      return parsePDF(buffer);
    case "docx":
      return parseDOCX(buffer);
    case "markdown":
      return parseMarkdown(buffer);
    case "html":
      return parseHTML(buffer);
    case "text":
    default:
      return parseText(buffer);
  }
}

async function parsePDF(buffer: ArrayBuffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await parser.getText();
  const info = await parser.getInfo();
  return {
    content: textResult.text,
    format: "pdf",
    metadata: {
      pages: textResult.total,
      title: (info.info as any)?.Title,
      author: (info.info as any)?.Author,
    },
  };
}

async function parseDOCX(buffer: ArrayBuffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return {
    content: result.value,
    format: "docx",
    metadata: {
      messages: result.messages,
    },
  };
}

async function parseMarkdown(buffer: ArrayBuffer): Promise<ParseResult> {
  const text = new TextDecoder().decode(buffer);
  const html = await marked.parse(text);
  const plainText = stripHtml(html);
  return {
    content: plainText,
    format: "markdown",
    metadata: {
      html,
    },
  };
}

async function parseHTML(buffer: ArrayBuffer): Promise<ParseResult> {
  const text = new TextDecoder().decode(buffer);
  const plainText = stripHtml(text);
  return {
    content: plainText,
    format: "html",
    metadata: {
      originalLength: text.length,
    },
  };
}

async function parseText(buffer: ArrayBuffer): Promise<ParseResult> {
  const content = new TextDecoder().decode(buffer);
  return {
    content,
    format: "text",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
