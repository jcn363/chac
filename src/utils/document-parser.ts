import { marked } from "marked";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type DocumentFormat = "text" | "markdown" | "html" | "pdf" | "docx" | "audio" | "video" | "image";

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
    case "mp3":
    case "wav":
    case "flac":
    case "ogg":
    case "m4a":
    case "aac":
    case "wma":
      return "audio";
    case "mp4":
    case "mkv":
    case "avi":
    case "mov":
    case "webm":
    case "flv":
    case "wmv":
      return "video";
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
    case "gif":
    case "bmp":
    case "tiff":
    case "tif":
      return "image";
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

  // MP3 sync bytes: 0xFF 0xFB, 0xFF 0xF3, or 0xFF 0xE3
  if (
    header[0] === 0xff &&
    (header[1] === 0xfb || header[1] === 0xf3 || header[1] === 0xe3)
  ) {
    return "audio";
  }

  // MP4/MOV: ftyp at offset 4-7
  const header16 = new Uint8Array(buffer.slice(0, 12));
  if (
    header16[4] === 0x66 &&
    header16[5] === 0x74 &&
    header16[6] === 0x79 &&
    header16[7] === 0x70
  ) {
    return "video";
  }

  // WebM: 0x1A 0x45 0xDF 0xA3
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    return "video";
  }

  // PNG: 0x89 0x50 0x4E 0x47
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return "image";
  }
  // JPEG: 0xFF 0xD8 0xFF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image";
  }
  // GIF: 0x47 0x49 0x46 0x38
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return "image";
  }
  // WebP: RIFF....WEBP
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
    const header12 = new Uint8Array(buffer.slice(0, 12));
    if (header12[8] === 0x57 && header12[9] === 0x45 && header12[10] === 0x42 && header12[11] === 0x50) {
      return "image";
    }
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
    case "audio":
      return parseAudio(filePath);
    case "video":
      return parseVideo(filePath);
    case "image":
      return parseImage(filePath);
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

async function parseAudio(filePath: string): Promise<ParseResult> {
  return {
    content: "",
    format: "audio",
    metadata: { filePath, needsTranscription: true },
  };
}

async function parseVideo(filePath: string): Promise<ParseResult> {
  return {
    content: "",
    format: "video",
    metadata: { filePath, needsTranscription: true },
  };
}

async function parseImage(filePath: string): Promise<ParseResult> {
  return {
    content: "",
    format: "image",
    metadata: { filePath, needsVision: true },
  };
}
