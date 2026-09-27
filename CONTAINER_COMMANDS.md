Copy-Item .env.example .env
notepad .env
docker compose up --build -d
docker compose ps

Open http://localhost:8080 in your browser.

Close all containers: docker compose down