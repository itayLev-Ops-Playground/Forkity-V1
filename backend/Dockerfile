FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=@forkity/backend --omit=dev

COPY --chown=node:node backend/src ./backend/src
USER node

EXPOSE 4000
CMD ["node", "backend/src/server.js"]
