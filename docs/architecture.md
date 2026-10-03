# Forkity Application Architecture

![Forkity application architecture](architecture.png)

Editable Mermaid source: [architecture.mmd](architecture.mmd).

## Request and data flow

- Nginx serves the built React application and proxies browser `/api` requests to the Express API on port 4000.
- The backend uses `pg` to read and write users, sessions, recipes, and bookmarks in PostgreSQL over the Compose network.
- Online recipe searches go from the backend to TheMealDB over HTTPS; results return through the API to the browser.
- PostgreSQL data persists in the `postgres-data` named volume. Compose starts the backend after the database health check and the frontend after the backend health check.

## Existing SQLite data

If PostgreSQL is empty and `backend/data/forkity.db` exists, Compose mounts it read-only into the backend container. The backend imports users, recipes, and bookmarks at startup; sessions are not imported.

## Local development

With `npm run dev`, Vite and the backend run on the development machine. Vite serves the frontend on port 5173 and proxies `/api` to the backend on port 4000. PostgreSQL can still run in Docker, published to `127.0.0.1:5432` for local access.
