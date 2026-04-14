# 🌵 Tobalá

> *A Zettelkasten powered by agave — where notes grow roots, branches, and meaning of their own.*

Tobalá is a personal knowledge-management web app inspired by the Zettelkasten method. Every note is both a document **and** a node in a knowledge graph, and (soon) a vector in a semantic space — so the connections between your ideas can be explored, discovered, and eventually suggested automatically by an LLM.

---

## 🧰 Tech Stack

The challenge required **Django / Django REST Framework** on the backend and **Next.js** on the frontend. Tobalá extends that baseline with a graph- and vector-aware database layer:

| Layer | Tech |
|---|---|
| **Frontend** | Next.js 16 (App Router, React 19, Turbopack), TypeScript, TanStack Query |
| **Backend** | Django 5, Django REST Framework, SimpleJWT |
| **Database** | PostgreSQL 16 + Apache AGE 1.6 (property graph) + pgvector (similarity search) |
| **OGM** | [`django-agave`](https://github.com/surieldgm/django-agave) — my own package that unifies relational, graph, and vector access under a single Django-ORM-style API |
| **Dev** | Docker Compose (db + backend + frontend), hot-reload on both sides |

The whole stack runs with a single `docker compose up`.

---

## 🗂️ Monorepo layout

```
tobala/
├── apps/
│   ├── backend/                # Django 5 + DRF project (tobala_project, accounts, notes)
│   └── frontend/               # Next.js 16 App Router (auth, notes, graph)
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
docker compose up --build
```

Then:

- Frontend → <http://localhost:3000>
- Backend  → <http://localhost:8000/api/>
- Admin    → <http://localhost:8000/admin/>
- Postgres (host) → `localhost:5433` (internal: `db:5432`)

Sign up at `/signup`, create notes at `/notes`, explore the graph at `/notes?view=graph`.

### Common commands

| Command | What it does |
|---|---|
| `make up` | `docker compose up -d` (db, backend, frontend) |
| `make down` | Stop all services |
| `make logs` | Tail logs from all services |
| `make db-shell` | `psql` inside the db container |
| `make backend-shell` | `bash` inside the backend container |
| `make migrate` | `python manage.py migrate` in backend |
| `make makemigrations` | `python manage.py makemigrations` in backend |
| `make test` | Run backend tests |

### Updating the vendored `django-agave` subtree

```bash
git subtree pull --prefix=packages/django-agave \
  https://github.com/surieldgm/django-agave.git main --squash
```

---

## 🧵 Process summary

1. **Discovery.** Read the spec, confirmed the dual-store requirement (relational + graph + vector), and decided to dogfood my own `django-agave` OGM so every note round-trips through Django ORM, AGE Cypher, and pgvector in one transaction.
2. **Planning.** Wrote an explicit multi-phase bootstrap plan (repo skeleton → db → Django → notes app → JWT auth → REST API → frontend → UI) so each phase could be verified independently before moving on.
3. **Backend.** Scaffolded Django, wired `agave.db.backends.postgresql` as the DB engine, defined `Note(GraphModel)` and `NoteLink(Edge)` with a fixed edge-label vocabulary (`REFERENCES`, `SUPPORTS`, `CONTRADICTS`, `EXTENDS`, `INSPIRES`), and generated hand-written migrations that call `CreateGraph` / `CreateEdgeLabel` / `CreateVectorIndex`. The `neighbors`, `suggestions`, and `graph_data` actions are thin wrappers over agave's managers.
4. **Auth.** JWT with `rotate_refresh_tokens=True`, plus a single-flight refresh interceptor on the frontend to avoid refresh storms on parallel 401s.
5. **Frontend.** Translated a warm, hand-drawn mockup into a design-tokens file (`src/lib/design.ts`: fonts, colors, categories, edge legend, shared styles) and built every screen against those tokens. Sidebar state (search, category filter, view mode) lives in the URL so it survives route changes and reloads.
6. **Polish.** Auto-save with an 800 ms debounce and live timestamp updates, a custom SVG force-directed graph (so it works under SSR without window probes), category pills, inline edge creator, empty-state illustrations.

---

## 🧱 Key design & technical decisions

- **Dual-store, single model.** A note is a row in `notes_note`, a vertex in the `tobala_graph` AGE graph, and a vector in a pgvector column — all inside one Postgres database, all written through `django-agave` so there is no drift between stores. A single transaction updates the SQL row, the Cypher vertex, and (eventually) the embedding.
- **Fixed edge vocabulary.** Edge labels are pre-declared in migration `0002_agave_graph.py`. This lets AGE enforce them at the graph layer and keeps the UI legend deterministic.
- **Pluggable embeddings.** `notes/embeddings.py` exposes a single `generate(text) -> list[float] | None` function, stubbed to return `None` for the MVP. The `/suggestions/` endpoint and HNSW index are wired end-to-end; swapping in a real embedding provider is a one-function change.
- **JWT in localStorage + single-flight refresh.** The frontend `api.ts` wrapper queues parallel 401s behind one refresh promise and retries them once the new access token lands — no refresh storms, no lost in-flight requests. (Caveat: localStorage is fine for this MVP; any production deploy should move to HttpOnly cookies.)
- **Design tokens, not a component library.** A single `src/lib/design.ts` file holds fonts, colors, category metadata, and shared inline-style objects. Every view reads from it, so the whole palette swaps in one file. Inline styles keep each screen self-contained and diffable.
- **URL-driven sidebar state.** `?q=`, `?cat=`, `?view=` persist filter / search / view mode across route transitions and reloads — no Redux, no context provider.
- **Custom SVG force graph.** Instead of pulling `react-force-graph-2d` (which touches `window` at import time and breaks SSR), I wrote a lightweight SVG simulation with repulsion + spring + centre-pull. Arrow markers, hover labels, degree-based node sizing — all in one file.
- **All-in-Docker dev.** `docker compose up` brings db + backend + frontend up with bind-mounts so code changes hot-reload on both sides. No host Python or Node install required.

---

## 🤖 AI tools used

I used **Claude Code** (Anthropic's agentic CLI) throughout the build. Concretely:

- **Planning.** Claude generated the phased bootstrap plan, surfaced ordering constraints (e.g. that `AUTH_USER_MODEL` has to be set before the first `makemigrations`), and flagged the `django-agave` APIs I should reuse verbatim.
- **Scaffolding.** Claude wrote most of the Docker / Django / Next.js boilerplate, the initial migrations, and the DRF viewsets. I reviewed every file, corrected a handful of things (mostly idiomatic Django choices), and moved on.
- **Mockup-to-code translation.** I pasted the visual mockup (Newsreader serif, earthy palette, cactus branding, hand-drawn SVGs) and Claude produced a coherent design-tokens file plus per-screen inline styles. The translation was ~80% usable; I tuned spacing and a few states by hand.
- **Validation audits.** After the UI was up, I asked Claude to audit the implementation against the feature spec. That pass caught three real regressions: the signup password-visibility toggle was missing, the editor still had a manual "Save" button instead of auto-save, and the "last edited" timestamp wasn't updating on keystroke. All three were fixed.
- **Custom force graph.** Claude wrote the SVG force-simulation component when I explained I didn't want a client-only library for a feature this small.

Claude accelerated the build noticeably, but every architectural choice (dual-store, edge vocabulary, design-tokens file, URL-driven state, single-flight refresh) was made by me and then implemented with Claude's help — not the other way around.

---


---

## 🗺️ Roadmap

The north star is the same north star every Zettelkasten dreams of: **notes that find their own relations.** The plan below makes that incremental — each step leaves a working product behind.

### 🌱 Short term — real embeddings, real suggestions

- Swap the `notes/embeddings.py` stub for a real provider (sentence-transformers running locally in the backend container, or OpenAI / Cohere / Voyage via API key). The dimension is already `384` in settings and in the HNSW index — drop-in replacement.
- Activate the `/api/notes/{id}/suggestions/` endpoint end-to-end. The SQL, the index, and the UI panel are already built; they just need non-null vectors.
- Backfill embeddings for existing notes via a management command.
- Outcome: the **Suggestions** panel starts showing "similar but not linked" notes, and the user can link them with one click.

### 🌿 Medium term — LLM-assisted auto-linking

- After a note is saved, run a small LLM pass over the top-K most-similar notes from the vector index and ask it to propose edge labels from the fixed vocabulary (`REFERENCES` / `SUPPORTS` / `CONTRADICTS` / `EXTENDS` / `INSPIRES`).
- Surface those proposals inline in the editor — each one a single click to accept (or dismiss).
- Add a lightweight feedback loop: accepted / dismissed proposals tune future suggestions (re-ranking, not re-training).
- Outcome: writing becomes collaborative with the graph. The user stops thinking "which note does this relate to?" and instead curates a stream of ranked proposals.

### 🌳 Long term — graph-aware RAG & synthesis

- Combine AGE's Cypher traversal with pgvector similarity for **multi-hop reasoning**: *"notes semantically close to X **and** within two `REFERENCES` hops of Y."*
- An LLM reads the local subgraph around a seed note (its neighbors, their neighbors, and the semantically-similar-but-unlinked frontier) and drafts a **synthesis note** — a new vertex summarizing a cluster of ideas, with edges back to its sources.
- A conversational interface that navigates the Zettelkasten as a retrievable knowledge base: questions become graph queries, answers cite specific notes, and follow-ups either drill deeper into a branch or pivot via semantic similarity.
- Outcome: Tobalá stops being a passive notebook and becomes an active thinking partner — one that reads what you've written, sees how your ideas are related, and helps you say the next thing.

---

*Powered by agave.* 🌵
