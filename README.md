# Blueprint Record Pool

Monorepo: **public web** (`apps/web`), **admin** (`apps/admin`), and **API** (`apps/api`). Styling matches Blueprint **bp-invoicer** tokens via `packages/ui`.

Local development uses the **[Supabase CLI](https://supabase.com/docs/guides/cli)** (`supabase start`) for Postgres, Auth, Studio, and JWT issuance—not a standalone `docker compose` Postgres unless you opt into that separately.

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io) 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (and Docker Desktop / Docker Engine for `supabase start`)

## Quick start

1. **Start Supabase** (from repo root):

   ```bash
   pnpm supabase:start
   # or: supabase start
   ```

   This reads [`supabase/config.toml`](supabase/config.toml). **Studio** is typically [http://127.0.0.1:54323](http://127.0.0.1:54323).

2. **Environment file at repo root** (recommended: **`.env.local`**). Copy values from the CLI:

   ```bash
   supabase status -o env
   ```

   Paste into `.env.local` as needed, or map manually:

   - **DB URL** → `DATABASE_URL`
   - **API URL** → `SUPABASE_URL`
   - **Publishable** key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **Secret** key → `SUPABASE_SERVICE_ROLE_KEY` (or paste the **`SERVICE_ROLE_KEY=`** line from `-o env` as-is — the API also reads **`SERVICE_ROLE_KEY`**)

   **Required for the API (local):** set **`SUPABASE_JWT_SECRET`** to the **`JWT_SECRET`** line from `supabase status -o env`. Local GoTrue signs user access tokens with that value (HS256); the API checks Bearer tokens with it first.

   **Optional:** **`SUPABASE_SERVICE_ROLE_KEY`** (or **`SERVICE_ROLE_KEY`**) from the same command — opaque `sb_secret_…` keys are normal. The API tries JWT verification first, then `getUser` with the service key.

   The Vite apps only need the publishable URL + publishable key (never the secret key or JWT secret).

   Optionally still use `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` if you prefer; those override the non-`VITE_` names.

   Put API-only vars in the same root file or in **`apps/api/.env`**. For the frontends, `VITE_API_URL` defaults in code to `http://localhost:3000` if unset—you can add it explicitly:

   ```bash
   VITE_API_URL=http://localhost:3000
   ```

   Use **repo root** `.env.local` for secrets. If you copied [`.env.example`](.env.example) to `.env`, avoid **empty** `SUPABASE_SERVICE_ROLE_KEY=` there — empty values can block loading; prefer setting real values only in `.env.local`, or rely on the API’s load order (`.env.local` overrides `.env`).

   See [`.env.example`](.env.example) for the full list.

3. **Install dependencies**, apply **SQL migrations**, then **push** any remaining Drizzle schema drift (app tables live in `public`; Auth already owns `auth.*`):

   ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:push
   ```

   Migrations in [`apps/api/drizzle/`](apps/api/drizzle/) include splitting audio keys into `track_versions`. `db:migrate` is idempotent for already-applied tags; run it whenever you pull new migration files.

4. **Admin access**: in root `.env.local`, set **`ADMIN_EMAIL`** to the address you use in Supabase Auth (e.g. `you@company.com`). Only that user can call **`/api/admin/*`** (uploads, admin release list). Matching is case-insensitive. If you leave **`ADMIN_EMAIL`** empty, the API falls back to **`profiles.role = 'admin'`** instead (you can set that in SQL or Studio).

5. **Run the app stack**:

   ```bash
   pnpm dev
   ```

| URL | App |
|-----|-----|
| [http://localhost:5173](http://localhost:5173) | Public web |
| [http://localhost:5174](http://localhost:5174) | Admin |
| [http://localhost:3000](http://localhost:3000) | API |
| [http://127.0.0.1:54323](http://127.0.0.1:54323) | Supabase Studio |

### Useful Supabase scripts

| Command | Description |
|--------|--------------|
| `pnpm supabase:start` | Start local Supabase (Docker) |
| `pnpm supabase:stop` | Stop local stack |
| `pnpm supabase:status` | Print URLs, keys, DB URL |
| `pnpm db:migrate` | Run [`apps/api/drizzle`](apps/api/drizzle) SQL migrations (e.g. `track_versions` backfill) |
| `pnpm migrate-track-versions` | Legacy TS helper; prefer `pnpm db:migrate` |
| `pnpm reset-catalog -- --dry-run` | Show counts for tracks / versions / playlist links (no deletes) |
| `pnpm reset-catalog -- --yes` | Delete all tracks (and related `track_versions` + `playlist_tracks`); playlists stay empty |

### Schema note

**Drizzle** defines tables in code (`apps/api/src/db/schema.ts`). Use **`pnpm db:migrate`** for versioned SQL in **`apps/api/drizzle`** (data backfills, enum/table creation before column drops), and **`pnpm db:push`** to reconcile any remaining drift against that schema. Use **`supabase/migrations`** only for extra SQL you want applied on `supabase db reset` (e.g. triggers on `auth.users`); the repo does not require that for the MVP.

### Optional: docker-compose Postgres only

[`docker-compose.yml`](docker-compose.yml) still provides a bare Postgres on **5433** if you ever want DB without the full Supabase stack. The default docs assume **Supabase CLI** on **54322** instead.

## Stripe

Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (recurring price), and `STRIPE_WEBHOOK_SECRET` for `POST /webhooks/stripe`.

## Storage

Without S3 env vars, uploads go to `apps/api/uploads` and are served from `GET /files/...`. Configure S3-compatible storage for production.

## Optional: Stem separation (instrumental + acapella)

For **original** uploads (`work_kind = original`), the API can run **[python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator)** 2-stem separation in the background after the main master is stored, then create **instrumental** and **acapella** `track_versions` (skipping any kind that already exists or duplicates the primary upload).

1. Install per [their README](https://github.com/nomadkaraoke/python-audio-separator): e.g. `pip install "audio-separator[cpu]"` (or `[gpu]` where appropriate), plus **`ffmpeg`** on the host (`brew install ffmpeg` on macOS). Models download on first run.
2. In **`apps/api`** env (or repo root `.env.local`), set:
   - **`STEM_SEPARATION_ENABLED=true`** (or **`AUDIO_SEPARATOR_ENABLED=true`**)
   - **`AUDIO_SEPARATOR_PYTHON=/path/to/venv/bin/python`** so the API runs the `audio-separator` CLI from that venv’s `bin` / `Scripts`.
   - Optionally **`STEM_SEPARATION_TIMEOUT_MS`** (default 25 minutes per job).
   - Optionally **`AUDIO_SEPARATOR_MODEL`** (`-m` model filename), **`AUDIO_SEPARATOR_MODEL_DIR`**, **`AUDIO_SEPARATOR_CHUNK_DURATION`** (seconds; helps long files / memory).

Jobs run **asynchronously** after `POST /api/admin/tracks` returns; check API logs for `stem_separation_*`. Remix uploads are not processed.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | API + web + admin |
| `pnpm build` | Build all packages |
| `pnpm db:push` | Drizzle push to `DATABASE_URL` |
