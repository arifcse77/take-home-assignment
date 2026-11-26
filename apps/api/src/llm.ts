import OpenAI from "openai";
import { EXPECTED_FIELDS, type DocumentType, type LlmFieldResult } from "@lomi/shared";
import { config } from "./config.js";

const openai = config.openAiKey ? new OpenAI({ apiKey: config.openAiKey }) : null;

const FIELD_LABELS: Record<string, string[]> = {
  invoice_number: ["invoice number", "invoice #", "inv-"],
  issue_date: ["issue date", "issued"],
  due_date: ["due date", "due"],
  vendor_name: ["vendor", "from"],
  total_amount: ["total", "amount due"],
  tenant_name: ["tenant"],
  monthly_rent: ["monthly rent", "rent"],
  security_deposit: ["security deposit", "deposit"],
  lease_start: ["lease start", "start date"],
  term_months: ["term", "months"],
  report_quarter: ["quarter", "q1", "q2", "q3", "q4"],
  market_area: ["market", "area"],
  vacancy_rate: ["vacancy"],
  average_rent_1br: ["1br", "one bedroom", "1 br"],
  year_over_year_rent_growth: ["year-over-year", "yoy", "growth"],
  median_household_income: ["median household", "household income"],
};

function buildPrompt(documentType: DocumentType, parsedText: string): string {
  const fields = EXPECTED_FIELDS[documentType];
  return `You extract structured fields from a document. For each field return:
- value: the extracted value as a string, or null if not found
- evidence: an EXACT verbatim quote from the document text that supports the value (copy-paste from input), or null if not found
- gap_reason: if value is null, explain why; otherwise null

Fields: ${JSON.stringify(fields)}

Document text:
---
${parsedText}
---

Respond with JSON: { "fields": [ { "field": string, "value": string|null, "evidence": string|null, "gap_reason": string|null } ] }`;
}

function findLineForField(field: string, parsedText: string): { value: string; evidence: string } | null {
  const lines = parsedText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const labels = FIELD_LABELS[field] ?? [field.replace(/_/g, " ")];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!labels.some((l) => lower.includes(l))) continue;
    const colon = line.indexOf(":");
    if (colon >= 0) {
      const value = line.slice(colon + 1).trim();
      if (value) return { value, evidence: line };
    }
    const match = line.match(/(.+?)\s{2,}(.+)/);
    if (match?.[2]) {
      return { value: match[2].trim(), evidence: line };
    }
  }
  return null;
}

/** Regex line-matching mock for local dev without API key. */
function mockExtract(documentType: DocumentType, parsedText: string): LlmFieldResult[] {
  const fields = EXPECTED_FIELDS[documentType];
  return fields.map(({ field }) => {
    const hit = findLineForField(field, parsedText);
    if (!hit) {
      return {
        field,
        value: null,
        evidence: null,
        gap_reason: "Field not found in document (mock mode)",
      };
    }
    return { field, value: hit.value, evidence: hit.evidence, gap_reason: null };
  });
}

export async function extractWithLlm(
  documentType: DocumentType,
  parsedText: string
): Promise<{ prompt: string; rawResponse: string; fields: LlmFieldResult[] }> {
  const prompt = buildPrompt(documentType, parsedText);

  if (config.mockLlm) {
    const fields = mockExtract(documentType, parsedText);
    const rawResponse = JSON.stringify({ fields, mode: "mock" });
    return { prompt, rawResponse, fields };
  }

  if (!openai) {
    throw new Error("OPENAI_API_KEY is required when MOCK_LLM is not set");
  }

  const completion = await openai.chat.completions.create({
    model: config.openAiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract document fields. Evidence must be exact substrings of the provided document text.",
      },
      { role: "user", content: prompt },
    ],
  });

  const rawResponse = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(rawResponse) as { fields?: LlmFieldResult[] };
  const fields = parsed.fields ?? [];
  return { prompt, rawResponse, fields };
}