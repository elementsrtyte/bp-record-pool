#!/usr/bin/env node

/**
 * Bulk-upload MP3s to the Blueprint Record Pool API.
 *
 * Usage:
 *   node scripts/bulk-upload.mjs <dir-of-mp3s> [--api URL] [--email EMAIL] [--password PASSWORD] [--dry-run] [--concurrency N]
 *
 * Reads ID3 tags from every .mp3 in the directory (non-recursive by default;
 * add --recursive to walk subdirs). Falls back to the filename when tags are
 * missing. Embedded cover art is sent as artwork.
 *
 * Auth: logs in via Supabase email/password to get a JWT. You can also
 * set ADMIN_EMAIL / ADMIN_PASSWORD env vars instead of flags.
 *
 * Requires: music-metadata (devDependency in monorepo root).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseBuffer } from "music-metadata";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    api: { type: "string", default: process.env.VITE_API_URL ?? "http://localhost:3000" },
    email: { type: "string", default: process.env.ADMIN_EMAIL ?? "" },
    password: { type: "string", default: process.env.ADMIN_PASSWORD ?? "" },
    "dry-run": { type: "boolean", default: false },
    recursive: { type: "boolean", default: false },
    concurrency: { type: "string", default: "3" },
    help: { type: "boolean", default: false },
  },
});

if (flags.help || positionals.length === 0) {
  console.log(
    `Usage: node scripts/bulk-upload.mjs <dir> [--api URL] [--email E] [--password P] [--dry-run] [--recursive] [--concurrency N]

Reads .mp3 files, extracts ID3 tags, and POSTs each as a track to the admin API.

Options:
  --api          API base URL             (default: $VITE_API_URL or http://localhost:3000)
  --email        Supabase admin email     (default: $ADMIN_EMAIL)
  --password     Supabase admin password  (default: $ADMIN_PASSWORD)
  --dry-run      Print what would upload without sending
  --recursive    Walk subdirectories
  --concurrency  Parallel uploads         (default: 3)
  --help         Show this message`,
  );
  process.exit(0);
}

const dir = path.resolve(positionals[0]);
const apiBase = flags.api.replace(/\/$/, "");
const dryRun = flags["dry-run"];
const recursive = flags.recursive;
const concurrency = Math.max(1, Number(flags.concurrency) || 3);

async function collectMp3s(root) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory() && recursive) {
      results.push(...(await collectMp3s(full)));
    } else if (e.isFile() && /\.mp3$/i.test(e.name)) {
      results.push(full);
    }
  }
  return results;
}

function titleFromFilename(fp) {
  return path.basename(fp, path.extname(fp)).replace(/[-_]+/g, " ").trim();
}

async function extractMeta(fp) {
  const buf = await readFile(fp);
  let meta;
  try {
    meta = await parseBuffer(buf, { mimeType: "audio/mpeg" });
  } catch {
    meta = null;
  }

  const title = meta?.common?.title || titleFromFilename(fp);
  const artist = meta?.common?.artist || "Unknown Artist";
  const genre = meta?.common?.genre?.[0] ?? "";
  const year = meta?.common?.year;
  const releaseDate = year ? `${year}-01-01` : new Date().toISOString().slice(0, 10);

  let artworkBuf = null;
  let artworkMime = null;
  const pic = meta?.common?.picture?.[0];
  if (pic?.data?.length > 0) {
    artworkBuf = pic.data;
    artworkMime = pic.format ?? "image/jpeg";
  }

  return { buf, title, artist, genre, releaseDate, artworkBuf, artworkMime, fp };
}

async function login(email, password) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "";

  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Login failed (${r.status}): ${body}`);
  }
  const j = await r.json();
  return j.access_token;
}

async function upload(token, meta) {
  const form = new FormData();
  form.append("title", meta.title);
  form.append("artist", meta.artist);
  form.append("releaseDate", meta.releaseDate);
  if (meta.genre) form.append("genre", meta.genre);

  const ext = path.extname(meta.fp) || ".mp3";
  form.append("master", new Blob([meta.buf], { type: "audio/mpeg" }), `master${ext}`);

  if (meta.artworkBuf) {
    const artExt = meta.artworkMime === "image/png" ? ".png" : ".jpg";
    form.append("artwork", new Blob([meta.artworkBuf], { type: meta.artworkMime }), `cover${artExt}`);
  }

  const r = await fetch(`${apiBase}/api/admin/tracks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body };
}

async function runBatch(items, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ── main ──

console.log(`Scanning ${dir} for .mp3 files…`);
const files = await collectMp3s(dir);
console.log(`Found ${files.length} file(s).`);

if (files.length === 0) process.exit(0);

console.log(`Parsing ID3 tags…`);
const metas = await Promise.all(files.map(extractMeta));

if (dryRun) {
  console.log("\n── DRY RUN ──\n");
  for (const m of metas) {
    console.log(`  ${m.title}  —  ${m.artist}  [${m.genre || "no genre"}]  ${m.releaseDate}  artwork:${m.artworkBuf ? "yes" : "no"}  ${path.basename(m.fp)}`);
  }
  console.log(`\n${metas.length} track(s) would be uploaded.`);
  process.exit(0);
}

if (!flags.email || !flags.password) {
  console.error("Error: --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD env vars) are required for upload.");
  process.exit(1);
}

console.log(`Logging in as ${flags.email}…`);
const token = await login(flags.email, flags.password);
console.log("Authenticated.\n");

let ok = 0;
let fail = 0;

await runBatch(metas, async (m, i) => {
  const label = `[${i + 1}/${metas.length}]`;
  try {
    const res = await upload(token, m);
    if (res.ok) {
      ok++;
      console.log(`${label} ✓  ${m.title} — ${m.artist}  (id: ${res.body.id})`);
    } else {
      fail++;
      console.error(`${label} ✗  ${m.title} — ${m.artist}  → ${res.status} ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    fail++;
    console.error(`${label} ✗  ${m.title} — ${m.artist}  → ${err.message}`);
  }
});

console.log(`\nDone: ${ok} uploaded, ${fail} failed out of ${metas.length}.`);
process.exit(fail > 0 ? 1 : 0);
