import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentSummary } from "../api";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function formatProgress(progress: DocumentSummary["progress"]): string {
  if (!progress) return "—";
  const parts: string[] = [];
  if (progress.pending > 0) parts.push(`${progress.pending} pending`);
  if (progress.approved > 0) parts.push(`${progress.approved} approved`);
  if (progress.corrected > 0) parts.push(`${progress.corrected} corrected`);
  if (progress.carried_over > 0) parts.push(`${progress.carried_over} carried`);
  return parts.length > 0 ? parts.join(", ") : "all reviewed";
}

export function DocumentListPage() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.listDocuments();
        if (!cancelled) setDocs(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div>
      <h1>Documents</h1>
      <p className="hint">Status polls every 3s while extractions run — uploads return immediately.</p>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Version</th>
            <th>Extraction</th>
            <th>Review</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>{d.title}</td>
              <td><code>{d.type}</code></td>
              <td>v{d.currentVersion}</td>
              <td><StatusBadge status={d.status} /></td>
              <td className="review-col">
                {d.status === "extracted" ? (
                  <span className={d.progress?.pending ? "needs-review" : ""}>
                    {formatProgress(d.progress)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <Link to={`/documents/${d.id}`}>Review →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}