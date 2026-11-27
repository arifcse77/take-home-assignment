# Lomi Document Review (submission)

Original assignment text: [BRIEF.md](./BRIEF.md).

## Run it

```sh
docker compose up --build
```

Open **http://localhost:8080**. Three seeded documents (invoice, lease, market report) extract in the background; the list polls every 3 seconds.

1. Open **Invoice — Meridian Office Supplies** and approve fields.
2. Upload `fixtures/documents/invoice-001.v2.pdf` on that page to run re-extraction — unchanged evidence becomes **carried over**; the two changed invoice fields return to **pending** with a previous-version snapshot.

**Real LLM:** set `OPENAI_API_KEY` and `MOCK_LLM=0` in your environment (or `.env`). Default Docker setup uses mock extraction (line-based heuristics on parsed PDF text) so the stack works without a key.

**Local dev:** `pnpm install`, start Postgres + Redis, copy `.env.example` → `.env`, then:

```sh
pnpm db:migrate
pnpm --filter @lomi/api seed
pnpm --filter @lomi/api dev          # API :3001
pnpm --filter @lomi/api worker:dev   # worker
pnpm --filter @lomi/web dev          # UI :5173
```

## Monorepo

| Package | Purpose |
|---------|---------|
| `apps/api` | Fastify API, BullMQ worker, seed + job recovery |
| `apps/web` | Vite + React review UI |
| `packages/database` | Prisma schema (Postgres) |
| `packages/shared` | Field definitions, evidence validation |

Turborepo runs `build` / `lint` / `test` across packages.

## Schema

- **Document** — stable id (`fixtures` ids or UUID on upload).
- **DocumentVersion** — PDF file path, `parsedText`, extraction debug fields, status lifecycle.
- **ExtractedValue** — one row per field per version; **reviews** live here (`reviewStatus`, `correctedValue`, `reviewNote`). Corrections annotate rather than overwrite the LLM `value`; API returns `displayValue`.

Prior versions are never deleted. **`GET /documents/:id/versions`** lists them; **`GET /documents/:id/versions/:n`** returns that version’s values and parsed text. The detail UI has a version dropdown (historical views are read-only). The document list shows review progress counts when extraction is complete.

## Redis vs Postgres

| Redis | Postgres |
|-------|----------|
| BullMQ queue only | All durable state |
| Job id `extract-{versionId}` | Status + values + reviews |

On API/worker startup, **`recoverStuckExtractions`** moves `extracting` → `queued` and re-enqueues. Survives Redis `FLUSHALL` and mid-extraction restarts. Field rows use `upsert` on `(versionId, fieldName)` so retries never duplicate.

## Evidence & carry-over

Evidence must appear **verbatim** in the version’s `parsedText` (whitespace-normalized). Invalid evidence → gap (`value: null`, `gapReason`).

Carry-over: **normalized evidence string equality** between N−1 and N. Matching evidence keeps approved/corrected reviews as `carried_over`. Changed evidence → `pending` + `previousSnapshot` JSON for the UI.

## Decisions

| Topic | Choice |
|-------|--------|
| Corrections | `correctedValue` annotation; `displayValue` in API |
| New version while extracting | Allowed; independent queue jobs |
| UI updates | 3s polling |
| PDF parsing | `pdfjs-dist` (fixture PDFs break `pdf-parse`) |

## Tests

```sh
pnpm test
```

Focused on evidence validation and hallucination guard.

## Cut / next

- Auth, WebSockets for status, richer PDF highlighting, S3 storage
- At 10k docs: object storage for PDFs, queue sharding, progress materialized views, read replicas for list UI