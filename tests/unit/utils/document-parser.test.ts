import { describe, it, expect } from "bun:test";
import {
  detectFormat,
  validateFormat,
  parseDocument,
} from "../../../src/utils/document-parser";

describe("Document Parser", () => {
  describe("detectFormat", () => {
    it("detects text files", () => {
      expect(detectFormat("file.txt")).toBe("text");
      expect(detectFormat("file.text")).toBe("text");
      expect(detectFormat("file")).toBe("text");
    });

    it("detects markdown files", () => {
      expect(detectFormat("file.md")).toBe("markdown");
      expect(detectFormat("file.markdown")).toBe("markdown");
    });

    it("detects HTML files", () => {
      expect(detectFormat("file.html")).toBe("html");
      expect(detectFormat("file.htm")).toBe("html");
    });

    it("detects PDF files", () => {
      expect(detectFormat("file.pdf")).toBe("pdf");
    });

    it("detects DOCX files", () => {
      expect(detectFormat("file.docx")).toBe("docx");
      expect(detectFormat("file.doc")).toBe("docx");
    });

    it("is case insensitive", () => {
      expect(detectFormat("FILE.PDF")).toBe("pdf");
      expect(detectFormat("file.HTML")).toBe("html");
    });
  });

  describe("parseDocument", () => {
    it("parses plain text", async () => {
      const buffer = new TextEncoder().encode("Hello world").buffer;
      const result = await parseDocument("test.txt", buffer);
      expect(result.content).toBe("Hello world");
      expect(result.format).toBe("text");
    });

    it("parses markdown to plain text", async () => {
      const md = "# Title\n\nThis is **bold** text.";
      const buffer = new TextEncoder().encode(md).buffer;
      const result = await parseDocument("test.md", buffer);
      expect(result.content).toContain("Title");
      expect(result.content).toContain("bold");
      expect(result.format).toBe("markdown");
      expect(result.metadata?.html).toBeDefined();
    });

    it("parses HTML to plain text", async () => {
      const html = "<html><body><h1>Title</h1><p>Content</p></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      const result = await parseDocument("test.html", buffer);
      expect(result.content).toContain("Title");
      expect(result.content).toContain("Content");
      expect(result.format).toBe("html");
    });

    it("strips script tags from HTML", async () => {
      const html = "<html><body><p>Hello</p><script>alert('xss')</script></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      const result = await parseDocument("test.html", buffer);
      expect(result.content).toContain("Hello");
      expect(result.content).not.toContain("alert");
    });

    it("strips style tags from HTML", async () => {
      const html = "<html><head><style>body{color:red}</style></head><body><p>Styled</p></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      const result = await parseDocument("test.html", buffer);
      expect(result.content).toContain("Styled");
      expect(result.content).not.toContain("color");
    });

    it("handles HTML with metadata", async () => {
      const html = "<html><body><p>Content here</p></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      const result = await parseDocument("page.htm", buffer);
      expect(result.format).toBe("html");
      expect(result.metadata?.originalLength).toBe(html.length);
    });

    it("handles markdown with complex formatting", async () => {
      const md = "# Title\n\n## Subtitle\n\n- item 1\n- item 2\n\n> blockquote\n\n`code`";
      const buffer = new TextEncoder().encode(md).buffer;
      const result = await parseDocument("complex.md", buffer);
      expect(result.content).toContain("Title");
      expect(result.content).toContain("Subtitle");
      expect(result.format).toBe("markdown");
    });

    it("parses PDF files", async () => {
      // Minimal valid PDF
      const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;
      const buffer = new TextEncoder().encode(pdf).buffer;
      const result = await parseDocument("test.pdf", buffer);
      expect(result.format).toBe("pdf");
      expect(result.content).toBeDefined();
      expect(result.metadata?.pages).toBeDefined();
    });

    it("parses DOCX files", async () => {
      // Create a minimal DOCX (ZIP with word/document.xml)
      const { writeFileSync, readFileSync } = require("node:fs");
      const { join } = require("node:path");
      const { execSync } = require("node:child_process");

      const tmpDir = join(import.meta.dir, ".parser-test-tmp");
      const { mkdirSync, rmSync, existsSync } = require("node:fs");
      mkdirSync(tmpDir, { recursive: true });

      try {
        // Create minimal DOCX structure
        const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

        const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

        const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello DOCX World</w:t></w:r></w:p>
  </w:body>
</w:document>`;

        const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

        // Write files and create ZIP
        const docxDir = join(tmpDir, "docx");
        mkdirSync(join(docxDir, "_rels"), { recursive: true });
        mkdirSync(join(docxDir, "word", "_rels"), { recursive: true });
        writeFileSync(join(docxDir, "[Content_Types].xml"), contentTypes);
        writeFileSync(join(docxDir, "_rels", ".rels"), rels);
        writeFileSync(join(docxDir, "word", "document.xml"), document);
        writeFileSync(join(docxDir, "word", "_rels", "document.xml.rels"), wordRels);

        const docxPath = join(tmpDir, "test.docx");
        execSync(`cd "${docxDir}" && zip -r "${docxPath}" .`);

        const buffer = readFileSync(docxPath);
        const result = await parseDocument("test.docx", buffer.buffer);
        expect(result.format).toBe("docx");
        expect(result.content).toContain("Hello DOCX World");
        expect(result.metadata?.messages).toBeDefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("detects unknown extension as text", () => {
      expect(detectFormat("file.xyz")).toBe("text");
      expect(detectFormat("file.unknown")).toBe("text");
    });
  });

  describe("validateFormat", () => {
    it("detects PDF by magic bytes even with wrong extension", () => {
      const pdfHeader = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
      ]);
      const buffer = pdfHeader.buffer;
      expect(validateFormat("file.txt", buffer)).toBe("pdf");
      expect(validateFormat("file.md", buffer)).toBe("pdf");
      expect(validateFormat("file.docx", buffer)).toBe("pdf");
    });

    it("detects DOCX by ZIP magic bytes even with wrong extension", () => {
      const zipHeader = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, // PK....
      ]);
      const buffer = zipHeader.buffer;
      expect(validateFormat("file.txt", buffer)).toBe("docx");
      expect(validateFormat("file.pdf", buffer)).toBe("docx");
      expect(validateFormat("file.xyz", buffer)).toBe("docx");
    });

    it("detects HTML by content even with wrong extension", () => {
      const html = "<html><head><title>Test</title></head><body></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("html");
      expect(validateFormat("file.xyz", buffer)).toBe("html");
    });

    it("detects HTML by DOCTYPE even with wrong extension", () => {
      const html =
        "<!DOCTYPE html><html><head></head><body></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("html");
      expect(validateFormat("page.htm", buffer)).toBe("html");
    });

    it("detects markdown by heading syntax even with wrong extension", () => {
      const md = "# Title\n\nSome content";
      const buffer = new TextEncoder().encode(md).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("markdown");
      expect(validateFormat("file.xyz", buffer)).toBe("markdown");
    });

    it("detects markdown by bold syntax even with wrong extension", () => {
      const md = "This is **bold** text";
      const buffer = new TextEncoder().encode(md).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("markdown");
    });

    it("detects markdown by code fence even with wrong extension", () => {
      const md = "```js\nconst x = 1;\n```";
      const buffer = new TextEncoder().encode(md).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("markdown");
    });

    it("falls back to extension when content is ambiguous", () => {
      const plain = "Just some plain text without any special markers.";
      const buffer = new TextEncoder().encode(plain).buffer;
      expect(validateFormat("file.txt", buffer)).toBe("text");
      expect(validateFormat("file.md", buffer)).toBe("markdown");
      expect(validateFormat("file.html", buffer)).toBe("html");
    });

    it("prioritizes magic bytes over extension", () => {
      // A real PDF header but saved as .txt
      const pdfContent = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF";
      const buffer = new TextEncoder().encode(pdfContent).buffer;
      expect(validateFormat("notes.txt", buffer)).toBe("pdf");
    });

    it("handles empty buffer gracefully", () => {
      const buffer = new ArrayBuffer(0);
      expect(validateFormat("file.txt", buffer)).toBe("text");
      expect(validateFormat("file.md", buffer)).toBe("markdown");
    });

    it("handles small buffers without errors", () => {
      const buffer = new TextEncoder().encode("Hi").buffer;
      expect(validateFormat("file.txt", buffer)).toBe("text");
    });
  });

  describe("parseDocument with content-based validation", () => {
    it("parses PDF detected by content even with .txt extension", async () => {
      const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;
      const buffer = new TextEncoder().encode(pdf).buffer;
      const result = await parseDocument("renamed.txt", buffer);
      expect(result.format).toBe("pdf");
      expect(result.content).toBeDefined();
    });

    it("parses HTML detected by content even with .txt extension", async () => {
      const html =
        "<html><body><h1>Hello</h1><p>World</p></body></html>";
      const buffer = new TextEncoder().encode(html).buffer;
      const result = await parseDocument("page.txt", buffer);
      expect(result.format).toBe("html");
      expect(result.content).toContain("Hello");
      expect(result.content).toContain("World");
    });

    it("parses markdown detected by content even with .txt extension", async () => {
      const md = "# My Title\n\nThis is **important** content.";
      const buffer = new TextEncoder().encode(md).buffer;
      const result = await parseDocument("readme.txt", buffer);
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("My Title");
      expect(result.content).toContain("important");
    });
  });
});
