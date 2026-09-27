import initSqlJs from 'sql.js';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function readRows(database, sql) {
  const statement = database.prepare(sql);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

export async function importLegacySqlite(pool) {
  const source = process.env.SQLITE_IMPORT_PATH || resolve(here, '../data/forkity.db');
  if (!existsSync(source)) return;

  const { rows: counts } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM recipes) AS recipes,
      (SELECT COUNT(*) FROM bookmarks) AS bookmarks
  `);
  const targetIsEmpty = Object.values(counts[0]).every((count) => Number(count) === 0);
  if (!targetIsEmpty) {
    console.log('Skipping SQLite import because PostgreSQL already contains Forkity data.');
    return;
  }

  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  const sqlite = new SQL.Database(readFileSync(source));
  const tables = new Set(readRows(sqlite, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
  if (!tables.has('users') || !tables.has('recipes')) {
    sqlite.close();
    console.log('Skipping SQLite import because the source does not contain Forkity account and recipe tables.');
    return;
  }

  const users = readRows(sqlite, 'SELECT id, email, password_hash, password_salt, created_at FROM users');
  const recipeColumns = new Set(readRows(sqlite, 'PRAGMA table_info(recipes)').map((row) => row.name));
  const recipes = readRows(sqlite, `SELECT id, ${recipeColumns.has('user_id') ? 'user_id' : 'NULL AS user_id'}, title, category, area, image, ingredients, instructions, created_at FROM recipes`);
  const bookmarks = tables.has('bookmarks')
    ? readRows(sqlite, 'SELECT user_id, recipe_key, recipe_json, created_at FROM bookmarks')
    : [];
  sqlite.close();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const user of users) {
      await client.query(`INSERT INTO users (id, email, password_hash, password_salt, created_at)
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, CURRENT_TIMESTAMP))`, [
        user.id, user.email, user.password_hash, user.password_salt, user.created_at,
      ]);
    }
    for (const recipe of recipes) {
      const ingredients = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
      await client.query(`INSERT INTO recipes (id, user_id, title, category, area, image, ingredients, instructions, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, COALESCE($9::timestamptz, CURRENT_TIMESTAMP))`, [
        recipe.id, recipe.user_id, recipe.title, recipe.category, recipe.area, recipe.image,
        JSON.stringify(ingredients), recipe.instructions, recipe.created_at,
      ]);
    }
    for (const bookmark of bookmarks) {
      const recipe = typeof bookmark.recipe_json === 'string' ? JSON.parse(bookmark.recipe_json) : bookmark.recipe_json;
      await client.query(`INSERT INTO bookmarks (user_id, recipe_key, recipe_json, created_at)
        VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, CURRENT_TIMESTAMP))`, [
        bookmark.user_id, bookmark.recipe_key, JSON.stringify(recipe), bookmark.created_at,
      ]);
    }

    for (const table of ['users', 'recipes']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ${table}`);
    }
    await client.query('COMMIT');
    console.log(`Imported ${users.length} account(s), ${recipes.length} recipe(s), and ${bookmarks.length} bookmark(s) from SQLite. Existing sessions will require signing in again.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
