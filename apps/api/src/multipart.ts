import type { FastifyRequest } from "fastify";

export async function parseUpload(
  req: FastifyRequest
): Promise<{ buffer: Buffer; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let buffer: Buffer | null = null;

  for await (const part of req.parts()) {
    if (part.type === "file") {
      buffer = await part.toBuffer();
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!buffer) {
    throw new Error("file required");
  }

  return { buffer, fields };
}