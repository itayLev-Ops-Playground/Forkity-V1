import { useEffect, useState } from 'react';

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    fork: <><path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M17 3v18M17 3c-2 2-3 5-3 8h3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function recipeKey(recipe) {
  return typeof recipe?.id === 'string' ? recipe.id : `recipe-${recipe?.id}`;
}

function mergeCollection(ownedRecipes, bookmarkedRecipes) {
  const owned = ownedRecipes.map((recipe) => ({ ...recipe, collectionType: 'owned' }));
  const ownedKeys = new Set(owned.map(recipeKey));
  const bookmarked = bookmarkedRecipes
    .filter((recipe) => !ownedKeys.has(recipeKey(recipe)))
    .map((recipe) => ({ ...recipe, collectionType: 'bookmarked' }));
  return [...owned, ...bookmarked];
}

function RecipeCard({ recipe, onSelect, onToggleBookmark, isBookmarked, bookmarkBusy }) {
  return <article className="recipe-card">
    <div className="recipe-image-wrap">
      {recipe.image ? <img className="recipe-image" src={recipe.image} alt="" loading="lazy" /> : <div className="image-placeholder">🍲</div>}
      <span className="recipe-tag">{recipe.category || 'Homemade'}</span>
      <button className={`bookmark-button card-bookmark${isBookmarked ? ' is-bookmarked' : ''}`} onClick={() => onToggleBookmark(recipe)} aria-label={isBookmarked ? `Remove ${recipe.title} from bookmarks` : `Bookmark ${recipe.title}`} aria-pressed={isBookmarked} disabled={bookmarkBusy}>
        <Icon name="heart" size={17} />
      </button>
    </div>
    <button className="recipe-card-open" onClick={() => onSelect(recipe)}>
      <div className="recipe-card-copy"><div className="recipe-meta">{recipe.area || 'Forkity kitchen'} <span>·</span> {recipe.time || 'Easy'}</div>{recipe.collectionType && <span className={`collection-origin ${recipe.collectionType}`}>{recipe.collectionType === 'owned' ? 'YOUR RECIPE' : 'BOOKMARKED'}</span>}<h3>{recipe.title}</h3><span className="card-link">View recipe <Icon name="arrow" size={15} /></span></div>
    </button>
  </article>;
}

function RecipeDialog({ recipe, onClose, onToggleBookmark, isBookmarked, bookmarkBusy }) {
  useEffect(() => {
    if (!recipe) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [recipe, onClose]);
  if (!recipe) return null;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="recipe-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close recipe"><Icon name="close" /></button>
      {recipe.image && <img className="dialog-image" src={recipe.image} alt="" />}
      <div className="dialog-content"><p className="eyebrow">{recipe.area || 'A Forkity favorite'} {recipe.category && `· ${recipe.category}`}</p>
        <div className="dialog-title-row"><h2 id="dialog-title">{recipe.title}</h2><button className={`button bookmark-dialog-button${isBookmarked ? ' is-bookmarked' : ''}`} onClick={() => onToggleBookmark(recipe)} aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark recipe'} aria-pressed={isBookmarked} disabled={bookmarkBusy}><Icon name="heart" size={17} />{isBookmarked ? 'Saved' : 'Bookmark'}</button></div>
        <div className="dialog-columns"><div><h3>Ingredients</h3><ul>{ingredients.length ? ingredients.map((item, i) => <li key={`${item}-${i}`}>{item}</li>) : <li>Ingredients not listed.</li>}</ul></div><div><h3>Method</h3><p className="instructions">{recipe.instructions || 'No cooking instructions were added.'}</p></div></div>
        {recipe.sourceUrl && <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Original recipe <Icon name="arrow" size={15} /></a>}
      </div>
    </section>
  </div>;
}

function AddRecipeDialog({ onClose, onAdded }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handleSubmit(event) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const recipe = {
      title: form.get('title'), category: form.get('category'), area: 'Your kitchen', image: form.get('image'),
      ingredients: String(form.get('ingredients')).split('\n').map((item) => item.trim()).filter(Boolean),
      instructions: form.get('instructions'),
    };
    try {
      const response = await fetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your recipe.');
      onAdded(result);
    } catch (err) { setError(err.message || 'The API is not available. Please try again.'); }
    finally { setSaving(false); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="recipe-dialog add-dialog" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close form"><Icon name="close" /></button>
      <div className="dialog-content"><p className="eyebrow">A recipe of your own</p><h2 id="add-title">Add to your table</h2>
        <form className="recipe-form" onSubmit={handleSubmit}>
          <label>Recipe name<input name="title" required maxLength="120" placeholder="e.g. Sunday tomato pasta" /></label>
          <div className="form-row"><label>Category<input name="category" maxLength="60" placeholder="Dinner, dessert…" /></label><label>Photo URL <span>(optional)</span><input name="image" type="url" placeholder="https://…" /></label></div>
          <label>Ingredients <span>(one per line)</span><textarea name="ingredients" required rows="4" placeholder={'2 cups flour\n1 cup milk'} /></label>
          <label>Method<textarea name="instructions" required rows="5" placeholder="Tell us how you make it…" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary form-submit" disabled={saving}>{saving ? 'Saving…' : 'Save recipe'} <Icon name="arrow" size={16} /></button>
        </form>
      </div>
    </section>
  </div>;
}

function AuthDialog({ mode, onModeChange, onClose, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not sign in.');
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.message || 'The API is not available. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="recipe-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close sign in"><Icon name="close" /></button>
      <div className="dialog-content">
        <p className="eyebrow">YOUR RECIPES, TOGETHER</p>
        <h2 id="auth-title">{mode === 'register' ? 'Make it yours.' : 'Welcome back.'}</h2>
        <p className="auth-intro">{mode === 'register' ? 'Create an account to keep your recipes in one place.' : 'Sign in to get back to your recipe collection.'}</p>
        <form className="recipe-form auth-form" onSubmit={handleSubmit}>
          <label>Email address<input type="email" name="email" autoComplete="email" required maxLength="254" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" name="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength="8" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          {mode === 'register' && <label>Confirm password<input type="password" name="confirm-password" autoComplete="new-password" required minLength="8" maxLength="128" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary form-submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={16} /></button>
        </form>
        <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to Forkity?'} <button onClick={() => { setError(''); onModeChange(mode === 'register' ? 'login' : 'register'); }}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></p>
      </div>
    </section>
  </div>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('discover');
  const [query, setQuery] = useState('chicken');
  const [searchText, setSearchText] = useState('chicken');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [authIntent, setAuthIntent] = useState('mine');
  const [bookmarks, setBookmarks] = useState([]);
  const [pendingBookmark, setPendingBookmark] = useState(null);
  const [bookmarkBusyKey, setBookmarkBusyKey] = useState('');
  const [bookmarkError, setBookmarkError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then((result) => { if (!cancelled) setUser(result.user); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    if (!user) { setBookmarks([]); return undefined; }
    let cancelled = false;
    fetch('/api/bookmarks')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load bookmarks.');
        if (!cancelled) setBookmarks(result);
      })
      .catch((err) => { if (!cancelled) setBookmarkError(err.message); });
    return () => { cancelled = true; };
  }, [user, authReady]);

  useEffect(() => {
    if (!authReady) return undefined;
    if (activeTab === 'mine' && !user) { setRecipes([]); setLoading(false); return undefined; }
    let cancelled = false;
    async function loadRecipes() {
      setLoading(true); setError('');
      try {
        if (activeTab === 'discover') {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Could not load recipes.');
          if (!cancelled) setRecipes(result);
        } else {
          const [ownedResponse, bookmarksResponse] = await Promise.all([fetch('/api/recipes'), fetch('/api/bookmarks')]);
          const [owned, saved] = await Promise.all([ownedResponse.json(), bookmarksResponse.json()]);
          if (!ownedResponse.ok) throw new Error(owned.error || 'Could not load your recipes.');
          if (!bookmarksResponse.ok) throw new Error(saved.error || 'Could not load your bookmarks.');
          if (!cancelled) {
            setBookmarks(saved);
            setRecipes(mergeCollection(owned, saved));
          }
        }
      } catch (err) {
        if (!cancelled) { setRecipes([]); setError(err.message || 'The API is not available.'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    loadRecipes(); return () => { cancelled = true; };
  }, [activeTab, query, user, authReady]);

  function requestAuth(mode = 'login', intent = 'mine') {
    setAuthMode(mode);
    setAuthIntent(intent);
  }

  function submitSearch(event) {
    event.preventDefault(); if (searchText.trim()) { setActiveTab('discover'); setQuery(searchText.trim()); }
  }
  function handleAdded(recipe) {
    const ownRecipe = { ...recipe, collectionType: 'owned' };
    setShowAdd(false); setActiveTab('mine'); setRecipes((current) => [ownRecipe, ...current.filter((item) => recipeKey(item) !== recipeKey(ownRecipe))]);
  }
  function handleAuthenticated(authenticatedUser) {
    setUser(authenticatedUser);
    setAuthMode(null);
    if (authIntent === 'add') setShowAdd(true);
    if (authIntent === 'mine') setActiveTab('mine');
    if (authIntent === 'bookmark' && pendingBookmark) {
      const recipe = pendingBookmark;
      setPendingBookmark(null);
      toggleBookmark(recipe, authenticatedUser);
    }
  }
  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setUser(null);
    setBookmarks([]);
    setActiveTab('discover');
  }
  async function toggleBookmark(recipe, signedInUser = user) {
    if (!signedInUser) {
      setPendingBookmark(recipe);
      requestAuth('login', 'bookmark');
      return;
    }
    const key = recipeKey(recipe);
    const wasBookmarked = bookmarks.some((item) => recipeKey(item) === key);
    setBookmarkBusyKey(key);
    setBookmarkError('');
    try {
      const response = await fetch(wasBookmarked ? `/api/bookmarks/${encodeURIComponent(key)}` : '/api/bookmarks', {
        method: wasBookmarked ? 'DELETE' : 'POST',
        headers: wasBookmarked ? undefined : { 'Content-Type': 'application/json' },
        body: wasBookmarked ? undefined : JSON.stringify({ recipe }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setPendingBookmark(recipe);
          requestAuth('login', 'bookmark');
          return;
        }
        throw new Error(result.error || 'Could not update bookmark.');
      }
      setBookmarks((current) => wasBookmarked ? current.filter((item) => recipeKey(item) !== key) : [recipe, ...current.filter((item) => recipeKey(item) !== key)]);
      if (wasBookmarked && activeTab === 'mine' && recipe.collectionType !== 'owned') setRecipes((current) => current.filter((item) => recipeKey(item) !== key));
    } catch (err) {
      setBookmarkError(err.message || 'Could not update bookmark.');
    } finally {
      setBookmarkBusyKey('');
    }
  }
  function openAddRecipe() {
    if (!user) { requestAuth('register', 'add'); return; }
    setShowAdd(true);
  }
  function openMyRecipes() {
    if (!user) { requestAuth('login', 'mine'); return; }
    setActiveTab('mine');
  }
  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Forkity home"><span className="brand-icon"><Icon name="fork" size={20} /></span><span>forkity<span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Main navigation"><button className={activeTab === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveTab('discover')}>Discover</button><button className={activeTab === 'mine' ? 'nav-link active' : 'nav-link'} onClick={openMyRecipes}>My recipes</button></nav>
      <div className="header-actions">{user ? <><span className="user-email">{user.email}</span><button className="nav-link logout-button" onClick={handleLogout}>Log out</button></> : <><button className="nav-link login-button" onClick={() => requestAuth('login')}>Log in</button><button className="button button-dark header-add" onClick={() => requestAuth('register')}><span className="signup-label">Sign up</span><span className="signup-plus"><Icon name="plus" size={16} /></span></button></>}</div>
    </header>
    <main id="top">
      <section className="hero">
        <div className="hero-content"><span className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT FAVORITE IS HERE</span><h1>Good food,<br /><em>found.</em></h1><p className="hero-text">A little inspiration for whatever’s in your fridge — and every recipe you want to keep.</p>
          <form className="search-box" onSubmit={submitSearch}><Icon name="search" size={20} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-label="Search recipes" placeholder="Try “crispy potatoes”…" /><button aria-label="Submit search"><Icon name="arrow" size={19} /></button></form><p className="search-hint">Try a dish, ingredient, or craving</p>
        </div>
        <div className="hero-art" aria-label="A fresh summer salad"><img src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1000&q=85" alt="Colorful fresh salad in a bowl" /><div className="hero-note"><span className="note-star">✳</span><span>Made for<br />the good stuff</span></div><span className="hero-ring" /></div>
        <div className="hero-index"><span>01</span><span className="index-line" /><span>FIND YOUR FLAVOR</span></div>
      </section>
      <section className="collection-section" aria-labelledby="collection-title">
        <div className="section-topline"><span className="eyebrow">THE GOOD STUFF</span><span className="section-count">{activeTab === 'discover' ? '01 / DISCOVER' : '02 / YOUR COLLECTION'}</span></div>
        <div className="collection-heading"><div><h2 id="collection-title">{activeTab === 'discover' ? 'A fresh find' : 'Your kitchen'}</h2><p>{activeTab === 'discover' ? `Recipes to make “${query}” the best part of your day.` : 'Your recipes and bookmarks, together in one place.'}</p></div><button className="text-button" onClick={openAddRecipe}><Icon name="plus" size={16} /> Add your recipe</button></div>
        {bookmarkError && <p className="bookmark-error" role="alert">{bookmarkError}</p>}
        {activeTab === 'mine' && !user ? <div className="empty-state"><span className="empty-illustration">✳</span><h3>Sign in to see your collection.</h3><p>Your recipes and bookmarks are saved to your account.</p><button className="button button-primary" onClick={() => requestAuth('login', 'mine')}>Sign in <Icon name="arrow" size={16} /></button></div> : loading || !authReady ? <div className="state-message"><span className="loader" /> Finding something delicious…</div> : error ? <div className="state-message error-state"><strong>We couldn’t load recipes.</strong><span>{error}</span><button className="text-button" onClick={() => setQuery((value) => `${value} `)}>Try again <Icon name="arrow" size={15} /></button></div> : recipes.length ? <div className="recipe-grid">{recipes.map((recipe) => <RecipeCard key={`${activeTab}-${recipeKey(recipe)}`} recipe={recipe} onSelect={setSelected} onToggleBookmark={toggleBookmark} isBookmarked={bookmarks.some((item) => recipeKey(item) === recipeKey(recipe))} bookmarkBusy={bookmarkBusyKey === recipeKey(recipe)} />)}</div> : <div className="empty-state"><span className="empty-illustration">✳</span><h3>{activeTab === 'mine' ? 'Your kitchen is waiting.' : 'No recipes found just yet.'}</h3><p>{activeTab === 'mine' ? 'Add a recipe or bookmark one from Discover to start your collection.' : 'Try another dish or ingredient.'}</p>{activeTab === 'mine' && <><button className="button button-primary" onClick={openAddRecipe}><Icon name="plus" size={16} /> Add your first recipe</button><button className="text-button" onClick={() => setActiveTab('discover')}>Discover recipes <Icon name="arrow" size={15} /></button></>}</div>}
        {recipes.length > 0 && <div className="collection-footer"><span>GOOD THINGS ARE COOKING</span><span className="footer-spark">✳</span><span>{recipes.length} {recipes.length === 1 ? 'RECIPE' : 'RECIPES'}</span></div>}
      </section>
    </main>
    <footer className="site-footer"><a className="brand footer-brand" href="#top"><span className="brand-icon"><Icon name="fork" size={17} /></span><span>forkity<span className="brand-dot">.</span></span></a><span>Make something good.</span><span>© 2026 FORKITY</span></footer>
    <RecipeDialog recipe={selected} onClose={() => setSelected(null)} onToggleBookmark={toggleBookmark} isBookmarked={selected ? bookmarks.some((item) => recipeKey(item) === recipeKey(selected)) : false} bookmarkBusy={selected ? bookmarkBusyKey === recipeKey(selected) : false} />{showAdd && <AddRecipeDialog onClose={() => setShowAdd(false)} onAdded={handleAdded} />}{authMode && <AuthDialog mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} onAuthenticated={handleAuthenticated} />}
  </div>;
}
