.PHONY: up down build logs ps db-shell backend-shell frontend-shell migrate makemigrations test clean

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
