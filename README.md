# Forkity

Forkity is a recipe hub for discovering recipes online, saving personal recipes, and viewing recipe details. It is a learning project for building a locally runnable web application before adding Docker and CI/CD in a separate project.

## Stack

- **Frontend:** React and Vite with custom CSS; no Bootstrap or UI framework
- **Backend:** Node.js and Express REST API
- **Database:** SQLite
- **Online recipe search:** TheMealDB, requested by the backend

## Architecture

The browser loads the React frontend. The frontend calls the Express API to search online recipes and manage personal recipes. The API queries TheMealDB for discovery searches and stores personal recipes in a local SQLite database.

![Forkity application architecture](docs/architecture.png)

The editable Mermaid source is in [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js 22 or newer
- npm (included with Node.js)

## Run locally

From the project root:

```bash
npm install
npm run dev
```

Open the Vite URL printed by the frontend (usually `http://localhost:5173`). The API runs on `http://localhost:4000`. SQLite creates its database at `backend/data/forkity.db` on first start.

To run the frontend and API separately, open two terminals and run `npm run dev --workspace frontend` and `npm run dev --workspace backend` from the project root.

## Features

- Search online recipes through TheMealDB
- Open recipe details, including ingredients and instructions
- Register and sign in with a personal account
- Add, browse, and view recipes stored per account in SQLite
- Bookmark recipes to your account; your added recipes and bookmarks appear together in **My recipes**
- Responsive layout styled with project-owned CSS

## Project layout

```text
frontend/       React app and custom styles
backend/        Express API and SQLite persistence
docs/           Architecture diagram and its source
```

Docker packaging will be added after local development is working.
