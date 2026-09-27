import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(here, '..', 'data', 'forkity.db');
mkdirSync(dirname(dbPath), { recursive: true });
const require = createRequire(import.meta.url);
let db;

export async function initializeDatabase() {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipe_key TEXT NOT NULL,
      recipe_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, recipe_key)
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Homemade',
      area TEXT NOT NULL DEFAULT 'Your kitchen',
      image TEXT NOT NULL DEFAULT '',
      ingredients TEXT NOT NULL,
      instructions TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const recipeColumns = getAll('PRAGMA table_info(recipes)');
  if (!recipeColumns.some((column) => column.name === 'user_id')) {
    db.run('ALTER TABLE recipes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  }
  db.run('CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks(user_id)');
  saveDatabase();
}

export function getAll(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

export function getOne(sql, params = []) {
  return getAll(sql, params)[0];
}

export function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

export function insert(sql, params = []) {
  db.run(sql, params);
  const id = getOne('SELECT last_insert_rowid() AS id').id;
  saveDatabase();
  return id;
}

function saveDatabase() {
  writeFileSync(dbPath, Buffer.from(db.export()));
}
