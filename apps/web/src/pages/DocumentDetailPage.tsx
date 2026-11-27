import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type DocumentDetail,
  type DocumentVersionMeta,
  type Progress,
  type ValueRow,
} from "../api";

function highlightEvidence(text: string | null, evidence: string | null): string {
  if (!text || !evidence) return text ?? "";
  const idx = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (idx < 0) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + evidence.length);
  const after = text.slice(idx + evidence.length);
  return `${before}<<<${match}>>>${after}`;
}

function ValueCard({
  row,
  parsedText,
  onUpdated,
  readOnly,
}: {
  row: ValueRow;
  parsedText: string | null;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [correctValue, setCorrectValue] = useState(row.displayValue ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      await api.review(row.id, { action: "approve" });
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const submitCorrect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.review(row.id, { action: "correct", correctedValue: correctValue, note: note || undefined });
      setCorrecting(false);
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const needsAttention = !readOnly && row.reviewStatus === "pending";

  return (
    <article className={`value-card ${needsAttention ? "value-card--attention" : ""}`}>
      <div className="value-card__head">
        <h3>{row.fieldName}</h3>
        <span className={`badge badge-${row.reviewStatus}`}>{row.reviewStatus.replace("_", " ")}</span>
      </div>
      {row.gapReason ? (
        <p className="gap">
          <strong>Gap:</strong> {row.gapReason}
        </p>
      ) : (
        <p className="extracted-value">{row.displayValue ?? row.value ?? "—"}</p>
      )}
      {row.evidence && (
        <blockquote className="evidence">“{row.evidence}”</blockquote>
      )}
      {row.previousSnapshot && (
        <div className="previous">
          <strong>Previous version</strong>
          <div>Value: {row.previousSnapshot.correctedValue ?? row.previousSnapshot.value ?? "—"}</div>
          <div>Review: {row.previousSnapshot.reviewStatus}</div>
          {row.previousSnapshot.evidence && <div>Evidence: “{row.previousSnapshot.evidence}”</div>}
        </div>
      )}
      {parsedText && row.evidence && (
        <pre className="context">{highlightEvidence(parsedText, row.evidence)}</pre>
      )}
      {needsAttention && !row.gapReason && (
        <div className="actions">
          <button type="button" disabled={busy} onClick={approve}>
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => setCorrecting((c) => !c)}>
            Correct
          </button>
        </div>
      )}
      {needsAttention && row.gapReason && (
        <div className="actions">
          <button type="button" disabled={busy} onClick={approve}>
            Acknowledge gap
          </button>
        </div>
      )}
      {correcting && (
        <form className="correct-form" onSubmit={submitCorrect}>
          <label>
            Corrected value
            <input value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} required />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            Save correction
          </button>
        </form>
      )}
    </article>
  );
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [versions, setVersions] = useState<DocumentVersionMeta[]>([]);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isLatestView = viewVersion === null;

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const versionList = await api.listVersions(id);
      setVersions(versionList);

      if (viewVersion != null) {
        const d = await api.getDocumentVersion(id, viewVersion);
        setDoc(d);
        const meta = versionList.find((v) => v.version === viewVersion);
        setProgress(
          meta?.progress
            ? { ...meta.progress, version: viewVersion, status: meta.status }
            : null
        );
      } else {
        const [d, p] = await Promise.all([api.getDocument(id), api.getProgress(id)]);
        setDoc({ ...d, isLatest: true });
        setProgress(p);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [id, viewVersion]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [reload]);

  const onSelectVersion = (v: number) => {
    const latest = versions[0]?.version;
    setViewVersion(v === latest ? null : v);
  };

  const onUploadVersion = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      await api.uploadVersion(id, file);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!id) return null;
  if (!doc) return <p>Loading…</p>;

  const pendingCount = progress?.pending ?? 0;

  return (
    <div>
      <p>
        <Link to="/">← All documents</Link>
      </p>
      <h1>{doc.title}</h1>
      {versions.length > 0 && (
        <div className="version-bar">
          <label>
            View version{" "}
            <select
              value={viewVersion ?? versions[0]?.version ?? 1}
              onChange={(e) => onSelectVersion(Number(e.target.value))}
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </select>
          </label>
          {!isLatestView && (
            <span className="hint">Read-only snapshot — switch to latest to review or upload.</span>
          )}
        </div>
      )}
      <p>
        Version {doc.currentVersion}
        {!isLatestView && " (historical)"} ·{" "}
        <span className={`badge badge-${doc.status}`}>{doc.status}</span>
        {progress && (
          <span className="progress-summary">
            {" "}
            — pending {progress.pending}, approved {progress.approved}, corrected {progress.corrected}, carried over{" "}
            {progress.carried_over}
          </span>
        )}
      </p>
      {isLatestView && pendingCount > 0 && doc.status === "extracted" && (
        <p className="attention-banner">{pendingCount} field(s) need review</p>
      )}
      {isLatestView && doc.status === "failed" && (
        <div className="error-box">
          <p>Extraction failed: {doc.failureReason}</p>
          <button type="button" onClick={() => api.retry(id).then(reload)}>
            Retry extraction
          </button>
        </div>
      )}
      {isLatestView && id === "doc-invoice-001" && (
        <div className="upload-box">
          <label>
            Upload revised invoice (v2) to test carry-over
            <input
              type="file"
              accept="application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadVersion(f);
              }}
            />
          </label>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="value-grid">
        {doc.values.map((v) => (
          <ValueCard
            key={v.id}
            row={v}
            parsedText={doc.parsedText}
            onUpdated={reload}
            readOnly={!isLatestView}
          />
        ))}
      </div>
      {doc.status !== "extracted" && doc.values.length === 0 && <p>Waiting for extraction…</p>}
    </div>
  );
}