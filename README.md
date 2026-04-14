# Tobalá

A Zettelkasten web app built on [django-agave](https://github.com/surieldgm/django-agave) — notes as graph vertices with typed edges and vector similarity.

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + TanStack Query
- **Backend:** Django 5 + DRF + djangorestframework-simplejwt
- **Database:** PostgreSQL 16 + Apache AGE 1.6 (graph) + pgvector (similarity)
- **OGM:** django-agave (pulled in as a git subtree under `packages/django-agave/`)

## Monorepo layout

```
tobala/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── Makefile
├── packages/
│   └── django-agave/        # git subtree
└── apps/
    ├── backend/             # Django project
    └── frontend/            # Next.js app
```

## Quick start

```bash
cp .env.example .env
make up            # bring up db, backend, frontend
make migrate       # apply Django + AGE migrations
make backend-shell # open a shell in the backend container
```

Frontend: http://localhost:3000 · Backend: http://localhost:8000

## Common commands

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

## Updating the django-agave subtree

```bash
git subtree pull --prefix=packages/django-agave \
  https://github.com/surieldgm/django-agave.git main --squash
```
