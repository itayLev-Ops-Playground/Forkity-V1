import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { importLegacySqlite } from './legacy-import.js';

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, '../../.env') });

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'forkity',
  user: process.env.PGUSER || process.env.POSTGRES_USER || 'forkity',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD,
  max: 10,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error.message));

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Homemade',
      area TEXT NOT NULL DEFAULT 'Your kitchen',
      image TEXT NOT NULL DEFAULT '',
      ingredients JSONB NOT NULL,
      instructions TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipe_key TEXT NOT NULL,
      recipe_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, recipe_key)
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes(user_id);
    CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks(user_id);
  `);
  await importLegacySqlite(pool);
}

export async function getAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function getOne(sql, params = []) {
  const rows = await getAll(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rowCount;
}

export async function insert(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0]?.id;
}
