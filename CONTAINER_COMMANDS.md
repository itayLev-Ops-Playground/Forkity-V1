## Initial setup

Generate a strong random password with `openssl rand -hex 32`.

Create `.env` from `.env.example` (`Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux/macOS), then set `POSTGRES_PASSWORD` in `.env` to the generated value.

## Native development

Start Postgres in Docker:

```sh
docker compose up -d db
```

Run the backend and frontend locally:

```sh
npm run dev
```

Open http://localhost:5173. Postgres is published on `127.0.0.1:5432` for local development only.

## Run the full stack in Docker

```sh
docker compose up --build -d
docker compose ps
```

Open http://localhost:8080.

Stop the containers with `docker compose down`.