import express from 'express';
import { createHash, randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getAll, getOne, initializeDatabase, insert, run } from './database.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const mealDbBase = 'https://www.themealdb.com/api/json/v1/1';
const scrypt = promisify(callbackScrypt);
const sessionCookieName = 'forkity_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function getSessionToken(req) {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? cookie.slice(sessionCookieName.length + 1) : null;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function createSession(user, res) {
  const token = randomBytes(32).toString('base64url');
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), user.id, Date.now() + sessionLifetimeSeconds * 1000]);
  setSessionCookie(res, token);
  return { id: user.id, email: user.email };
}

app.use((req, _res, next) => {
  const token = getSessionToken(req);
  if (token) {
    const row = getOne(`SELECT users.id, users.email, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?`, [hashToken(token)]);
    if (row && row.expires_at > Date.now()) req.user = { id: row.id, email: row.email };
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to access your recipes.' });
  next();
}

function toRecipe(row) {
  if (!row) return row;
  return { ...row, ingredients: JSON.parse(row.ingredients) };
}

function bookmarkKeyFor(id) {
  if (typeof id === 'string' && /^meal-\d+$/.test(id)) return id;
  const recipeId = Number(id);
  return Number.isSafeInteger(recipeId) && recipeId > 0 ? `recipe-${recipeId}` : null;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/auth/session', (req, res) => res.json({ user: req.user || null }));

app.post('/api/auth/register', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }
  if (getOne('SELECT id FROM users WHERE email = ?', [email])) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  try {
    const existingUsers = getOne('SELECT COUNT(*) AS count FROM users').count;
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const id = insert('INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)', [email, passwordHash, salt]);
    if (existingUsers === 0) run('UPDATE recipes SET user_id = ? WHERE user_id IS NULL', [id]);
    const user = { id, email };
    res.status(201).json({ user: await createSession(user, res) });
  } catch (error) {
    console.error('Registration failed:', error.message);
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (typeof password !== 'string' || !email || email.length > 254 || password.length > 128) {
    return res.status(400).json({ error: 'Enter your email address and password.' });
  }
  const user = getOne('SELECT id, email, password_hash, password_salt FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });

  try {
    const candidate = await scrypt(password, user.password_salt, 64);
    const expected = Buffer.from(user.password_hash, 'hex');
    if (!timingSafeEqual(candidate, expected)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.json({ user: await createSession(user, res) });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Enter a dish or ingredient to search.' });
  if (query.length > 80) return res.status(400).json({ error: 'Search must be 80 characters or fewer.' });

  try {
    const response = await fetch(`${mealDbBase}/search.php?s=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Recipe service returned ${response.status}.`);
    const data = await response.json();
    const meals = (data.meals || []).map((meal) => ({
      id: `meal-${meal.idMeal}`,
      title: meal.strMeal,
      category: meal.strCategory || 'Recipe',
      area: meal.strArea || 'World kitchen',
      image: meal.strMealThumb || '',
      ingredients: Array.from({ length: 20 }, (_, index) => {
        const ingredient = meal[`strIngredient${index + 1}`]?.trim();
        const measure = meal[`strMeasure${index + 1}`]?.trim();
        return ingredient ? `${measure ? `${measure} ` : ''}${ingredient}` : null;
      }).filter(Boolean),
      instructions: meal.strInstructions || '',
      sourceUrl: meal.strSource || meal.strYoutube || '',
    }));
    res.json(meals);
  } catch (error) {
    console.error('Recipe search failed:', error.message);
    res.status(502).json({ error: 'Online recipe search is temporarily unavailable. Please try again.' });
  }
});

app.get('/api/recipes', requireAuth, (req, res) => {
  const query = String(req.query.q || '').trim();
  const rows = query
    ? getAll('SELECT * FROM recipes WHERE user_id = ? AND (title LIKE ? OR category LIKE ?) ORDER BY created_at DESC, id DESC', [req.user.id, `%${query}%`, `%${query}%`])
    : getAll('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC, id DESC', [req.user.id]);
  res.json(rows.map(toRecipe));
});

app.get('/api/recipes/:id', requireAuth, (req, res) => {
  const row = getOne('SELECT * FROM recipes WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Recipe not found.' });
  res.json(toRecipe(row));
});

app.post('/api/recipes', requireAuth, (req, res) => {
  const { title, category, area, image, ingredients, instructions } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 120) return res.status(400).json({ error: 'Recipe name is required and must be 120 characters or fewer.' });
  if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > 100 || ingredients.some((item) => typeof item !== 'string' || !item.trim() || item.length > 200)) {
    return res.status(400).json({ error: 'Add between 1 and 100 valid ingredients.' });
  }
  if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 12000) return res.status(400).json({ error: 'Cooking method is required and must be 12,000 characters or fewer.' });
  if (image && (typeof image !== 'string' || image.length > 1000 || !/^https?:\/\//i.test(image))) return res.status(400).json({ error: 'Photo URL must begin with http:// or https://.' });

  const id = insert(`INSERT INTO recipes (user_id, title, category, area, image, ingredients, instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    req.user.id,
    title.trim(),
    typeof category === 'string' && category.trim() ? category.trim().slice(0, 60) : 'Homemade',
    typeof area === 'string' && area.trim() ? area.trim().slice(0, 60) : 'Your kitchen',
    typeof image === 'string' ? image.trim() : '',
    JSON.stringify(ingredients.map((item) => item.trim())),
    instructions.trim(),
  ]);
  const created = getOne('SELECT * FROM recipes WHERE id = ?', [id]);
  res.status(201).json(toRecipe(created));
});

app.get('/api/bookmarks', requireAuth, (req, res) => {
  const rows = getAll('SELECT recipe_json FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC, recipe_key', [req.user.id]);
  res.json(rows.map((row) => JSON.parse(row.recipe_json)));
});

app.post('/api/bookmarks', requireAuth, (req, res) => {
  const recipe = req.body?.recipe;
  const recipeKey = bookmarkKeyFor(recipe?.id);
  if (!recipeKey || typeof recipe.title !== 'string' || !recipe.title.trim() || recipe.title.length > 120) {
    return res.status(400).json({ error: 'A valid recipe is required to bookmark it.' });
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length > 100 || recipe.ingredients.some((item) => typeof item !== 'string' || item.length > 200)) {
    return res.status(400).json({ error: 'This recipe has invalid ingredient data.' });
  }
  if (typeof recipe.instructions !== 'string' || recipe.instructions.length > 12000) {
    return res.status(400).json({ error: 'This recipe has invalid instructions.' });
  }
  const snapshot = {
    id: recipe.id,
    title: recipe.title.trim(),
    category: typeof recipe.category === 'string' ? recipe.category.slice(0, 60) : 'Recipe',
    area: typeof recipe.area === 'string' ? recipe.area.slice(0, 60) : 'World kitchen',
    image: typeof recipe.image === 'string' && /^https?:\/\//i.test(recipe.image) ? recipe.image.slice(0, 1000) : '',
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    sourceUrl: typeof recipe.sourceUrl === 'string' && /^https?:\/\//i.test(recipe.sourceUrl) ? recipe.sourceUrl.slice(0, 1000) : '',
  };
  const recipeJson = JSON.stringify(snapshot);
  if (recipeJson.length > 40000) return res.status(400).json({ error: 'This recipe is too large to bookmark.' });

  run(`INSERT OR REPLACE INTO bookmarks (user_id, recipe_key, recipe_json)
    VALUES (?, ?, ?)`, [req.user.id, recipeKey, recipeJson]);
  res.status(201).json({ bookmarked: true, key: recipeKey });
});

app.delete('/api/bookmarks/:recipeKey', requireAuth, (req, res) => {
  const key = req.params.recipeKey;
  if (!/^meal-\d+$/.test(key) && !/^recipe-\d+$/.test(key)) {
    return res.status(400).json({ error: 'Invalid bookmark key.' });
  }
  run('DELETE FROM bookmarks WHERE user_id = ? AND recipe_key = ?', [req.user.id, key]);
  res.json({ bookmarked: false, key });
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.message);
  res.status(400).json({ error: 'The request could not be processed.' });
});

await initializeDatabase();
app.listen(port, () => console.log(`Forkity API listening on http://localhost:${port}`));
