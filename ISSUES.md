# ISSUES.md

Analysis of the Infinite Dungeon codebase, captured from a full review. Each issue includes its status — ✅ = fixed, ❌ = still open.

---

## Critical bugs

### 1. Race condition on concurrent LLM generation — ✅ FIXED
**Original:** If two players pick the same unexplored option at the same time, both see `target_scene_id IS NULL`, both fire LLM calls, and both call `insertScene` + `setOptionTarget`. One of the two generated scenes becomes an orphan (no option points to it), corrupting the tree. The race window is large (LLM calls take 2–10 seconds).

**Fix:** Added an in-memory mutex (`pendingGenerations` Map) in `routes/api.js` that de-duplicates LLM calls per option ID. A waiting request awaits the in-progress generation's lock promise, then re-checks the database for a cache hit; if the first attempt failed, it retries.

### 2. Database restore doesn't reload in-memory DB — ✅ FIXED
**Original:** `POST /admin/restore` did `fs.copyFileSync(src, DB_PATH)` but the in-memory database object still held stale data, so the API kept serving old data until server restart.

**Fix:** Fixed as part of the migration to `better-sqlite3`. The restore endpoint now closes the active connection, cleans up stale WAL/SHM sidecar files, and re-initialises the database (`db.initDatabase()`) so restored data is immediately visible.

### 3. Build script and deploy workflow cannot inject API_BASE_URL — ✅ FIXED
**Original:** Both `build.js` and `.github/workflows/deploy.yml` search for the string `window.API_BASE = ''`, but all HTML files contain `window.API_BASE = 'https://infinite-dungeon-ujbn.onrender.com'`. The `sed`/replacement never matches, so the `API_BASE_URL` variable is never injected.

**Fix:** `build.js` now uses a regex (`/window\.API_BASE = '[^']*'/`) to match whatever value is present (the hardcoded Render URL), and only patches when `API_BASE_URL` is set — so the Render URL remains the default. The GitHub Actions `sed` command in `deploy.yml` was updated to the same pattern. Verified: with a custom `API_BASE_URL` it replaces the value; without it, `https://infinite-dungeon-ujbn.onrender.com` is preserved.

---

## High-severity bugs

### 4. Auth module doesn't use `API_BASE` — ✅ FIXED
**Original:** All `Auth.fetch()`, `Auth.login()`, `Auth.register()`, `Auth.logout()` calls in `public/js/auth.js` use bare paths like `/api/auth/me`. When deployed to GitHub Pages (different origin than Render), these requests go to `github.io` instead of the Render backend. Only `game.js` and `homepage.js` correctly prefix with `API_BASE`.

**Fix:** All auth fetches in `public/js/auth.js` now prefix with `API_BASE`. The same bare-path bug in `public/js/admin.js` was also fixed. Additionally, `api.js` (which defines the `API_BASE` constant) is now loaded on every page that needs it (`index.html`, `login.html`, `about.html`, `admin.html`) — previously only `game.html` loaded it, so `homepage.js` and auth calls would silently fail on other pages.

### 5. `saveToFile()` called redundantly inside a loop — ✅ FIXED
**Original:** `insertOptions()` in `db/database.js` called `saveToFile()` inside the `for` loop, writing the file once per option instead of once total.

**Fix:** Eliminated entirely by migrating to `better-sqlite3`, which persists writes directly to disk — no manual save calls remain.

### 6. `saveToFile()` is synchronous — ✅ FIXED
**Original:** `fs.writeFileSync` blocked the Node.js event loop on every database write.

**Fix:** Eliminated by the `better-sqlite3` migration. Writes now go through native file storage with WAL mode enabled (`journal_mode = WAL`), allowing concurrent reads during writes.

### 7. CORS `*` with `credentials: true` — ❌ OPEN
**Original:** In `server.js`, production with no `CORS_ORIGIN` set falls back to `'*'`, but browsers reject `Access-Control-Allow-Origin: *` when `Access-Control-Allow-Credentials: true`, blocking all credentialed cross-origin requests.

**Suggested fix:** Require `CORS_ORIGIN` in production instead of falling back to `'*'`.

---

## Medium issues

### 8. JWT secret has hardcoded dev fallback — ❌ OPEN
**Original:** `services/auth.js` uses `JWT_SECRET = process.env.JWT_SECRET || 'infinite-dungeon-dev-secret'`. If the env var is missing in production, tokens are signed with a publicly known secret.

**Suggested fix:** Log a fatal error and exit in production when `JWT_SECRET` is unset.

### 9. `attachUser` does a DB lookup on every request — ❌ OPEN
**Original:** `middleware/auth.js` runs `db.getUserById(payload.id)` on every request, including static assets and the health endpoint.

**Suggested fix:** Cache user data in the JWT payload, or skip the DB lookup for non-API requests.

### 10. `getAncestorChain` does N individual queries — ❌ OPEN
**Original:** `db/database.js` runs one `getScene()` query per ancestor. A depth-50 adventure triggers 50 SQL queries.

**Suggested fix:** Use a single `WITH RECURSIVE` CTE.

### 11. LLM `temperature: 1` — ❌ OPEN
**Original:** `services/llm.js` uses maximum randomness, which can produce incoherent output and require more validation retries.

**Suggested fix:** Use 0.7–0.85 for a balance of creativity and coherence.

### 12. No rate limiting on LLM generation endpoint — ❌ OPEN
**Original:** `POST /scenes/:sceneId/options/:optionId/choose` has no throttling; a single user rapidly clicking unexplored options could cost significant API credits.

**Suggested fix:** Add per-IP or per-user rate limiting.

### 13. No input validation on integer route params — ❌ OPEN
**Original:** `req.params.id` is passed directly to `db.getScene()` as a string in `routes/api.js`, relying on implicit SQLite coercion.

**Suggested fix:** Parse with `parseInt` and validate the result is a positive integer.

---

## Minor issues & improvements

### 14. Admin panel served without auth at `/admin.html` — ❌ OPEN
**Original:** `express.static` is mounted before the `/admin` route handler in `server.js`, so `/admin.html` serves the page without auth (though the API calls remain admin-protected).

**Suggested fix:** Move the static middleware after the protected route, or protect `/admin.html`. 

### 15. Admin backup delete: path traversal — ❌ OPEN
**Original:** `routes/admin.js` uses `path.join(BACKUPS_DIR, req.params.name)` without sanitisation, allowing an admin to pass `../data/dungeon.db` to delete the live database.

**Suggested fix:** Validate that the backup name contains no `..` or path separators.

### 16. LLM failure loses player state silently — ❌ OPEN
**Original:** When `generateAndValidateScene` fails after max retries, the option stays unexplored and the player gets no recovery path or suggested action.

**Suggested fix:** Return a more actionable error and/or offer the player a retry path.

### 17. Missing `.env.example` — ❌ OPEN
**Original:** No documented list of required environment variables (OPENAI_API_KEY, JWT_SECRET, ADMIN_USERNAMES, etc.) exists, making onboarding harder.

**Suggested fix:** Add a `.env.example` with all variables and descriptions.

### 18. `escapeHtml` duplicated — ❌ OPEN
**Original:** The identical `escapeHtml` function exists in `game.js` and `admin.js`.

**Suggested fix:** Move to a shared `utils.js`.

### 19. `apiPost` doesn't accept a body — ❌ OPEN
**Original:** `public/js/api.js` `apiPost(path)` has no body parameter. It works today (the only POST endpoint uses URL params) but any future POST requiring a body will break.

**Suggested fix:** Add a body parameter to `apiPost`.

### 20. `typewriterQueue` shared global — ❌ OPEN
**Original:** In `game.js`, calling `renderCurrentScene` while the typewriter is still running clears the timeout but incompletely cleans up the DOM, which can cause visual glitches with rapid navigation.

**Suggested fix:** Properly abort and clear the typewriter on re-render.

### 21. No password confirmation in registration — ❌ OPEN
**Original:** `login.js` registration has no "confirm password" field; a typo locks the user out of their account.

**Suggested fix:** Add a confirm-password field with client-side validation.

### 22. Tests are minimal — ❌ OPEN
**Original:** `test.js` only covers the database layer and auth services — no route handlers, LLM service, or HTTP-level tests. The test also deletes the live `dungeon.db` on each run.

**Suggested fix:** Add route/HTTP tests and use a disposable test database path.

---

## Architectural suggestions

- **Add a mutex/lock per unexplored option ID** — ✅ FIXED (see issue #1).
- **Bundle the frontend JS** — ❌ OPEN. The 6 separate JS files with global variable dependencies are fragile. A simple bundler (e.g. esbuild) would catch type mismatches and missing dependencies at build time.
- **Move off sql.js** — ✅ FIXED. Migrated to `better-sqlite3` (native SQLite backing store, WAL mode, synchronous prepared statements, no manual export/save cycle).
- **Add request body validation** — ❌ OPEN. Use a lightweight schema validator (e.g. `zod`) on route handlers instead of manual `if (!x) return 400` checks.