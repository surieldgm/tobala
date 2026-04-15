.PHONY: up down build logs ps db-shell backend-shell frontend-shell migrate makemigrations test clean worker worker-logs redis-cli celery-shell shell-plus redis-flush

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

db-shell:
	docker compose exec db psql -U $${POSTGRES_USER:-tobala} -d $${POSTGRES_DB:-tobala}

backend-shell:
	docker compose exec backend bash

frontend-shell:
	docker compose exec frontend sh

migrate:
	docker compose exec backend python manage.py migrate

makemigrations:
	docker compose exec backend python manage.py makemigrations $(app)

createsuperuser:
	docker compose exec backend python manage.py createsuperuser

shell:
	docker compose exec backend python manage.py shell

test:
	docker compose exec backend python manage.py test

clean:
	docker compose down -v

# --- R2: async pipeline --------------------------------------------------
worker:
	docker compose up -d worker

worker-logs:
	docker compose logs -f --tail=100 worker

celery-shell:
	docker compose exec worker celery -A tobala_project shell

shell-plus:
	docker compose exec backend python manage.py shell_plus

redis-cli:
	docker compose exec redis redis-cli

redis-flush:
	docker compose exec redis redis-cli FLUSHALL
