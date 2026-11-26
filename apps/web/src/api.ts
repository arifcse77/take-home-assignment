const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export interface DocumentSummary {
  id: string;
  type: string;
  title: string;
  currentVersion: number;
  status: string;
}

export interface ValueRow {
  id: string;
  fieldName: string;
  value: string | null;
  displayValue: string | null;
  evidence: string | null;
  gapReason: string | null;
  reviewStatus: string;
  correctedValue: string | null;
  reviewNote: string | null;
  previousSnapshot?: {
    value: string | null;
    evidence: string | null;
    reviewStatus: string;
    correctedValue: string | null;
    reviewNote: string | null;
  } | null;
}

export interface DocumentDetail {
  id: string;
  type: string;
  title: string;
  currentVersion: number;
  status: string;
  failureReason: string | null;
  parsedText: string | null;
  values: ValueRow[];
}

export interface Progress {
  pending: number;
  approved: number;
  corrected: number;
  carried_over: number;
  status: string;
  version: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listDocuments: () => fetch(`${API_BASE}/documents`).then(json<DocumentSummary[]>),
  getDocument: (id: string) => fetch(`${API_BASE}/documents/${id}`).then(json<DocumentDetail>),
  getProgress: (id: string) => fetch(`${API_BASE}/documents/${id}/progress`).then(json<Progress>),
  review: (valueId: string, body: { action: "approve" | "correct"; correctedValue?: string; note?: string }) =>
    fetch(`${API_BASE}/values/${valueId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  uploadVersion: async (docId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/documents/${docId}/versions`, { method: "POST", body: fd }).then(json);
  },
  retry: (docId: string) => fetch(`${API_BASE}/documents/${docId}/retry`, { method: "POST" }).then(json),
};