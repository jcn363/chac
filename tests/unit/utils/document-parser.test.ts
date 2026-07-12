import { describe, it, expect } from "bun:test";
import { detectFormat, parseDocument } from "../../../src/utils/document-parser";

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
  });
});
