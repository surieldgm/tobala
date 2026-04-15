# 🌵 Tobalá

> ### *write first, organise never.*

*A Zettelkasten powered by agave — where notes grow roots, branches, and meaning of their own.*

Tobalá is a personal knowledge-management web app inspired by the Zettelkasten method. Every note is, at the same time, a document, a vertex in a property graph, and a vector in a semantic space. An async LLM pipeline embeds each note, infers topic tags, proposes typed links to related notes, and — when you ask a question — walks the graph to synthesise a cited answer grounded in your own writing.

The motto above is the whole UX hypothesis: the user writes, the pipeline does the rest.

---

## 🧰 Tech Stack

The challenge required **Django / Django REST Framework** on the backend and **Next.js** on the frontend. Tobalá extends that baseline with a graph- and vector-aware database layer, an async LLM pipeline, and a real-time channel so the UI updates without polling.

| Layer | Tech |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Turbopack), TypeScript, TanStack Query |
| **Backend** | Django 5, Django REST Framework, SimpleJWT, Django Channels (ASGI via Daphne) |
| **Async pipeline** | Celery 5 + Redis (broker + result backend + channel layer) |
| **Database** | PostgreSQL 16 + Apache AGE 1.6 (property graph) + pgvector (1536-d HNSW index) |
| **LLM providers** | OpenAI (`text-embedding-3-small`, `gpt-4o-mini`, `gpt-4o`) — swappable via env |
| **OGM** | [`django-agave`](https://github.com/surieldgm/django-agave) — my own package that unifies relational, graph, and vector access under a single Django-ORM-style API |
| **Dev** | Docker Compose (db + redis + backend + worker + frontend), hot-reload on both sides |

The whole stack runs with a single `docker compose up`.

---

## 🗂️ Monorepo layout

```
tobala/
├── apps/
│   ├── backend/                # Django 5 + DRF project (tobala_project, accounts, notes)
│   │   └── notes/
│   │       ├── tasks.py        # Celery chain: embed_note → infer_tags → propose_links
│   │       ├── onboarding.py   # seeds 10 interlinked notes for every new user
│   │       ├── providers/      # pluggable embedding / chat backends
│   │       └── fixtures/       # onboarding.yaml (seed note set)
│   └── frontend/               # Next.js 16 App Router (auth, notes, graph, ask)
├── packages/
│   └── django-agave/           # Vendored via git subtree from surieldgm/django-agave
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── Makefile
```

---

## 🚀 Quick start

```bash
cp .env.example .env
# Put your OpenAI key in .env (OPENAI_API_KEY=...) so the pipeline can run.
docker compose up --build
```

Then:

- Frontend → <http://localhost:3000>
- Backend  → <http://localhost:8000/api/>
- Admin    → <http://localhost:8000/admin/>
- Postgres (host) → `localhost:5433` (internal: `db:5432`)

Sign up at `/signup` — on first login, you'll find a pre-seeded "Welcome to Tobalá" context with 10 interlinked notes explaining how the system works. From there, start writing at `/notes`, ask questions at `/ask`, and explore the graph at `/notes?view=graph`.

### Common commands

| Command | What it does |
|---|---|
| `make up` | `docker compose up -d` (db, redis, backend, worker, frontend) |
| `make down` | Stop all services |
| `make logs` | Tail logs from all services |
| `make db-shell` | `psql` inside the db container |
| `make backend-shell` | `bash` inside the backend container |
| `make migrate` | `python manage.py migrate` in backend |
| `make makemigrations` | `python manage.py makemigrations` in backend |
| `make test` | Run backend tests |

### Evaluating the pipeline

Two management commands ship with the backend for regression testing the LLM layers:

```bash
# Tagging quality (Jaccard vs. golden_tags.yaml)
docker compose exec backend python manage.py eval_tagging --model gpt-4o-mini

# Retrieval recall (top-K against golden_questions.yaml)
docker compose exec backend python manage.py eval_retrieval --k 8
```

Both write per-row CSVs to `apps/backend/eval/results/` so you can compare providers / models / prompt revisions side by side.

### Updating the vendored `django-agave` subtree

```bash
git subtree pull --prefix=packages/django-agave \
  https://github.com/surieldgm/django-agave.git main --squash
```

---

## 🧵 Process summary

1. **Discovery.** Read the spec, confirmed the dual-store requirement (relational + graph + vector), and decided to dogfood my own `django-agave` OGM so every note round-trips through Django ORM, AGE Cypher, and pgvector in one transaction.
2. **Planning.** Wrote an explicit multi-phase bootstrap plan (repo skeleton → db → Django → notes app → JWT auth → REST API → frontend → UI → pipeline → retrieval) so each phase could be verified independently before moving on.
3. **Backend foundations.** Scaffolded Django, wired `agave.db.backends.postgresql` as the DB engine, defined `Note(GraphModel)` and `NoteLink(Edge)` with a fixed edge-label vocabulary (`REFERENCES`, `SUPPORTS`, `CONTRADICTS`, `EXTENDS`, `INSPIRES`), and generated hand-written migrations that call `CreateGraph` / `CreateEdgeLabel` / `CreateVectorIndex`.
4. **Auth.** JWT with `rotate_refresh_tokens=True`, plus a single-flight refresh interceptor on the frontend to avoid refresh storms on parallel 401s.
5. **Frontend.** Translated a warm, hand-drawn mockup into a design-tokens file (`src/lib/design.ts`: fonts, colors, contexts, edge legend, shared styles) and built every screen against those tokens. Sidebar state (search, context filter, view mode) lives in the URL so it survives route changes and reloads.
6. **LLM pipeline.** Added a three-stage Celery chain (`embed_note → infer_tags → propose_links`), each stage publishing a WS event so the frontend flips badges live. Content-hash guards on all three tasks make the pipeline cheap under rapid auto-save and safe under queue-backlog replay.
7. **Graph RAG `/ask`.** The retrieval endpoint ranks notes by cosine distance, expands with one hop of typed edges, and hands that subgraph to `gpt-4o` with a citation-strict prompt. The answer renders with inline `[N:id]` chips that link back to the source notes, plus two side panels for **missing knowledge** (questions you haven't written about) and **inspired notes** (one-click "write this" prompts).
8. **Observability.** Every LLM call is logged to `LLMInvocation` with per-task cost / latency / input hash. The admin changelist groups them and shows p50 / p95 spend.
9. **Onboarding.** A `post_save` signal on `User` fires a Celery task that seeds the new user's vault with 10 interlinked notes about how Tobalá works — so the graph, the `/ask` endpoint, and the sidebar all demo themselves from first login.

---

## 🧱 Key design & technical decisions

- **Dual-store, single model.** A note is a row in `notes_note`, a vertex in the `tobala` AGE graph, and a 1536-d vector in a pgvector column — all inside one Postgres database, all written through `django-agave` so there is no drift between stores. A single transaction updates the SQL row, the Cypher vertex, and the embedding.
- **Fixed edge vocabulary.** Edge labels are pre-declared in migration `0002_agave_graph.py`. This lets AGE enforce them at the graph layer and keeps the UI legend deterministic.
- **One LLM per task.** Embedding, tagging, link classification, and `/ask` synthesis each have their own model — `text-embedding-3-small`, `gpt-4o-mini` (×2), and `gpt-4o` respectively. Each is swappable per-env without code changes (see `TOBALA_LLM` in `settings.py`). Cost ≈ $0.005 per saved note at current prices.
- **Content-hash guards.** Every pipeline stage stores a sha1 of the text it processed (`embedding_content_hash`, `tagging_content_hash`, `linking_content_hash`). Rapid auto-save, undo/redo, and queue-backlog replay all short-circuit without LLM calls. During a backlog drain, hundreds of queued tasks drop to O(1) actual API calls.
- **Coalesced WebSocket invalidations.** The client collects WS events in a `Set` and flushes TanStack Query invalidations after a 150 ms debounce — collapses a burst of pipeline events into one round of GETs.
- **User-curated contexts, not fixed categories.** Contexts replaced the original fixed `category` enum. They're CRUD'd by the user with a name + palette color, used for filtering in the sidebar, and carried as a vertex property so future Cypher queries can filter traversals by folder.
- **JWT in localStorage + single-flight refresh.** The frontend `api.ts` wrapper queues parallel 401s behind one refresh promise and retries them once the new access token lands — no refresh storms, no lost in-flight requests. (Caveat: localStorage is fine for this MVP; any production deploy should move to HttpOnly cookies.)
- **Design tokens, not a component library.** A single `src/lib/design.ts` file holds fonts, colors, context metadata, and shared inline-style objects. Every view reads from it, so the whole palette swaps in one file.
- **URL-driven sidebar state.** `?q=`, `?ctx=`, `?tag=`, `?view=` persist filter / search / view mode across route transitions and reloads — no Redux, no context provider.
- **Custom SVG force graph.** Instead of pulling `react-force-graph-2d` (which touches `window` at import time and breaks SSR), I wrote a lightweight SVG simulation with repulsion + spring + centre-pull. Arrow markers, hover labels, degree-based node sizing, edge-type colour inheritance — all in one file.
- **Onboarding seeds the demo.** On `User.post_save`, a Celery task seeds 10 interlinked notes about Tobalá itself. The user lands on a populated graph, the pipeline has pre-filled `linking_content_hash` to stop the LLM from second-guessing the hand-crafted topology, and the seeded notes become first-class retrieval targets for `/ask`.
- **All-in-Docker dev.** `docker compose up` brings db + redis + backend + worker + frontend up with bind-mounts so code changes hot-reload on both sides. No host Python or Node install required.

---

## 📡 The async pipeline in one diagram

```
  User types in NoteEditor
            │
            ▼   (3 000 ms debounce, flush on unmount)
  PATCH /api/notes/{id}/
            │
            ▼
  Note.post_save  ──(content_hash == stored?)──► skip
            │ else
            ▼
  embed_note  ───────────────┐
   ▪ hash guard              │
   ▪ OpenAI embedding        │  on commit
   ▪ store vector + hash     │  (transaction.on_commit)
            │                │
            ▼                ▼
  infer_tags   (gpt-4o-mini, structured output, 3–7 tags)
            │
            ▼
  propose_links   (top-k pgvector → LLM classify edge label → NoteLink(status="proposed"))
            │
            ▼
  WS events ────► frontend invalidates cache, proposal inbox lights up
```

Each stage publishes `note.embedding.{pending,ready,failed}`, `note.tags.updated`, or `note.link.proposed` events over Django Channels. The frontend `useNoteEvents` hook coalesces these into one round of TanStack Query invalidations per burst.

---

## 🧪 The `/ask` endpoint (graph RAG)

```
  Question
      │
      ▼
  Embed the question (same model as notes)
      │
      ▼
  Top-k anchor notes by cosine distance (pgvector HNSW)
      │
      ▼
  Walk 1 hop of typed edges → expanded candidate set
      │
      ▼
  Prompt gpt-4o with the subgraph + citation schema
      │
      ▼
  Structured response:
   · answer (with [N:id] citation chips)
   · cited_note_ids
   · missing_knowledge      (bullet list of gaps)
   · inspired_notes         ("write this" prompt cards)
```

The frontend renders citations as chips that scroll the referenced note into view, surfaces the two side panels, and lets the user click "Write this" on an inspired-note card to create a pre-tagged draft.

---

## 🤖 AI tools used

I used **Claude Code** (Anthropic's agentic CLI) throughout the build. Concretely:

- **Planning.** Claude generated the phased bootstrap plan, surfaced ordering constraints (e.g. that `AUTH_USER_MODEL` has to be set before the first `makemigrations`), and flagged the `django-agave` APIs I should reuse verbatim.
- **Scaffolding.** Claude wrote most of the Docker / Django / Next.js boilerplate, the initial migrations, and the DRF viewsets. I reviewed every file, corrected a handful of things (mostly idiomatic Django choices), and moved on.
- **Pipeline + retrieval.** Claude implemented the three-stage Celery chain, the WS event bus, and the `/ask` structured-output prompt. I designed the hash-guard strategy after a production-like log analysis showed a request storm during queue backlog — Claude then added the guards, the coalesced WS invalidations, and the frontend optimistic-prepend fix that was causing React duplicate-key warnings.
- **Mockup-to-code translation.** I pasted the visual mockup and Claude produced a coherent design-tokens file plus per-screen inline styles. The translation was ~80% usable; I tuned spacing and a few states by hand. The three mascot illustrations (`tobala.jpeg`, `michi.png`, `tascalate.png`) were integrated into the sidebar brand, empty-note state, and `/ask` idle state.
- **Validation audits.** After each phase I asked Claude to audit the implementation against the spec. Those passes caught real regressions — missing signup password toggle, non-working auto-save, stale `edited` timestamp, a silent "embedding never re-runs after first success" bug in the `post_save` guard (fixed by switching the guard from status to content hash).
- **Onboarding design.** The seeded-notes fixture was written end-to-end with Claude: the content, the hand-crafted edge topology, the Celery task, the post-save signal, and the pre-filled `linking_content_hash` trick that stops the LLM from proposing ~36 extra edges on every signup.
- **Custom force graph.** Claude wrote the SVG force-simulation component when I explained I didn't want a client-only library for a feature this small.

Claude accelerated the build noticeably, but every architectural choice (dual-store, edge vocabulary, hash-guard design, model-per-task, URL-driven state, single-flight refresh, onboarding-as-demo) was made by me and then implemented with Claude's help — not the other way around.

---

## 🗺️ Roadmap

The north star is the same north star every Zettelkasten dreams of: **notes that find their own relations.** The short-and-medium-term goals listed in the first spec are now shipped; what's below is what I'd build next.

### ✅ Done

- Pluggable embedding + chat provider layer (OpenAI, stub, swappable).
- Real `/suggestions/` endpoint with pgvector HNSW.
- LLM-assisted auto-linking: `propose_links` classifies edge labels from the fixed vocabulary, surfaced in a proposals inbox with accept / reject — no inline editor clutter.
- Observability: `LLMInvocation` table + admin dashboard with p50 / p95 per task.
- Regression eval: `manage.py eval_tagging` and `eval_retrieval` with YAML golden sets.

### 🌳 Next — deeper retrieval

- **Multi-hop graph walk.** Today `/ask` does one hop from anchor notes. Add a configurable depth with edge-type weighting (e.g. `REFERENCES` cheaper to traverse than `CONTRADICTS`).
- **Synthesis notes.** An LLM reads the local subgraph around a dense cluster of ideas and drafts a *new* vertex summarising them, with typed edges back to the sources. Review before commit.
- **Conversational `/ask`.** Multi-turn with the retrieved subgraph as persistent context. Follow-ups pivot via semantic similarity or drill deeper into the current branch.
- **Structured outlines.** Ask for an outline on a topic; get back a DAG of notes (existing + proposed) with their logical ordering.

### 🔧 Next — infra & UX

- HttpOnly-cookie auth (drop the localStorage MVP).
- Mobile-first editor shell (current layout is desktop-first).
- Import from Obsidian / Roam / Markdown fairly → run the pipeline over the whole vault in bulk.
- Model abstraction: local `llama-cpp` / `ollama` provider for the tagging + linking stages (keep `/ask` on a frontier model).

---

*Powered by agave.* 🌵
