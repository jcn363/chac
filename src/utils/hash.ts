export async function contentHash(content: string | Buffer): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
