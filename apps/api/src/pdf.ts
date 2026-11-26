import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

export async function parsePdfFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);
  const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n");
}