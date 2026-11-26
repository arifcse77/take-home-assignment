export type DocumentType = "invoice" | "lease" | "market_report";

export type ExtractionStatus = "queued" | "extracting" | "extracted" | "failed";

export type ReviewStatus = "pending" | "approved" | "corrected" | "carried_over";

export interface FieldSpec {
  field: string;
  type: string;
}

export interface LlmFieldResult {
  field: string;
  value: string | null;
  evidence: string | null;
  gap_reason: string | null;
}