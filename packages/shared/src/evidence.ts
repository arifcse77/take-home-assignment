/** Normalize whitespace so minor PDF/LLM spacing differences don't break matching. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Evidence must appear verbatim in parsed document text (after whitespace normalization). */
export function evidenceExistsInText(evidence: string, parsedText: string): boolean {
  const e = normalizeText(evidence);
  const doc = normalizeText(parsedText);
  if (!e) return false;
  return doc.includes(e);
}

/** Two evidence strings are "unchanged" for carry-over when normalized forms match. */
export function evidenceUnchanged(a: string | null, b: string | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return normalizeText(a) === normalizeText(b);
}