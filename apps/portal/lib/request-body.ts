export async function readLimitedJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!request.body) throw new Error("Body required");
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error("Body limit exceeded"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Object required");
  return value as Record<string, unknown>;
}
