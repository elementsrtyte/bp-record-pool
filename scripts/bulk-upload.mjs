#!/usr/bin/env node

/**
 * Bulk-upload audio to the Blueprint Record Pool API.
 *
 * Usage:
 *   node scripts/bulk-upload.mjs <dir> [--api URL] [--email EMAIL] [--password PASSWORD] [--dry-run] [--concurrency N]
 *
 * Reads common audio files in the directory (non-recursive by default;
 * add --recursive to walk subdirs): mp3, wav, aiff/aif, flac, m4a, aac,
 * ogg, opus, mp4, caf, wavpack (.wv). Tags come from metadata when present;
 * otherwise the filename is used. Embedded cover art is sent as artwork.
 * Version kind (Clean, Radio Edit, Instrumental, …) is inferred from the title and filename when possible.
 * The API normalizes masters to MP3 (lossless → 320 kbps, etc.).
 *
 * Auth: logs in via Supabase email/password to get a JWT. You can also
 * set ADMIN_EMAIL / ADMIN_PASSWORD env vars instead of flags.
 *
 * Requires: music-metadata (devDependency in monorepo root).
 */

import { readdir, readFile } from "node:fs/promises";
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

Reads standard audio files (mp3, wav, aiff, flac, m4a, aac, ogg, opus, mp4, caf, wv), extracts tags, and POSTs each to the admin API.
Skips uploads when **title + artist** (normalized) already exists in the catalog or
appears earlier in the same run.

Options:
  --api          API base URL             (default: $VITE_API_URL or http://localhost:3000)
  --email        Supabase admin email     (default: $ADMIN_EMAIL)
  --password     Supabase admin password  (default: $ADMIN_PASSWORD)
  --dry-run      Print what would upload without sending (add --email/--password to flag duplicates against the API)
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

/** Extensions the script will upload; server-side ffmpeg must decode the format. */
const AUDIO_FILE_RE =
  /\.(mp3|wav|aif|aiff|flac|m4a|aac|ogg|opus|mp4|caf|wv)$/i;

function mimeForAudioPath(fp) {
  const ext = path.extname(fp).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".aif":
    case ".aiff":
      return "audio/aiff";
    case ".flac":
      return "audio/flac";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".opus":
      return "audio/opus";
    case ".caf":
      return "audio/x-caf";
    case ".wv":
      return "audio/wavpack";
    default:
      return "application/octet-stream";
  }
}

/**
 * Keep in sync with `inferTrackVersionKindFromTitle` in packages/shared/src/index.ts
 * (title + filename heuristics for Clean / Radio Edit / Instrumental / …).
 */
function inferTrackVersionKindFromTitle(title, filenameHint) {
  const stem = (() => {
    if (!filenameHint) return "";
    const norm = String(filenameHint).replace(/\\/g, "/");
    const base = norm.slice(norm.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
  })();
  const blob = [title ?? "", stem].filter((s) => String(s).trim().length > 0).join("\n");

  const matchParenBlob = (s) => {
    const t = s.toLowerCase().normalize("NFKC");
    if (/\b(a\s*cappella|acapella)\b/.test(t)) return "acapella";
    if (/\b(instrumental)\b/.test(t) || /\binst\.?\b/.test(t)) return "instrumental";
    if (/\b(extended|ext\.?)\b/.test(t)) return "extended";
    if (/\b(radio)\b/.test(t)) return "radio";
    if (/\b(clean)\b/.test(t)) return "clean";
    if (/\b(dirty|explicit)\b/.test(t)) return "dirty";
    if (/\b(intro)\b/.test(t)) return "intro";
    return null;
  };

  for (const m of blob.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)) {
    const inner = (m[1] ?? m[2] ?? "").trim();
    if (!inner) continue;
    const k = matchParenBlob(inner);
    if (k) return k;
  }

  const t = blob.toLowerCase().normalize("NFKC");
  if (/\b(a\s*cappella|acapella)\b/.test(t)) return "acapella";
  if (/\b(instrumental)\b/.test(t) || /\binst\.?\b/.test(t)) return "instrumental";
  if (/\bextended(\s+(mix|version|edit))?\b/.test(t) || /\bext\.\s*(mix|version)?\b/.test(t)) {
    return "extended";
  }
  if (/\b(radio\s+(edit|mix|cut|version)|radio\s*edit)\b/.test(t)) return "radio";
  if (/\bclean\s+(version|edit|mix|v)\b/.test(t) || /\s-\s*clean\s*$/i.test(blob)) return "clean";
  if (/\b(dirty\s+(version|edit|mix)?|explicit|parental)\b/.test(t)) return "dirty";
  if (/\bintro\s+(edit|version|mix|only)\b/.test(t)) return "intro";

  if (stem) {
    const slug = stem.toLowerCase().normalize("NFKC").replace(/[_-]+/g, " ");
    if (/\b(a\s*cappella|acapella)\b/.test(slug)) return "acapella";
    if (/\b(instrumental|inst)\b/.test(slug)) return "instrumental";
    if (/\b(extended|ext)\b/.test(slug)) return "extended";
    if (/\b(clean)\b/.test(slug)) return "clean";
    if (/\b(dirty|explicit)\b/.test(slug)) return "dirty";
    if (/\b(intro)\b/.test(slug)) return "intro";
    if (/\b(radio)\b/.test(slug) && /\b(edit|mix|cut)\b/.test(slug)) return "radio";
  }

  return "standard";
}

async function collectAudioFiles(root) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory() && recursive) {
      results.push(...(await collectAudioFiles(full)));
    } else if (e.isFile() && AUDIO_FILE_RE.test(e.name)) {
      results.push(full);
    }
  }
  return results;
}

function titleFromFilename(fp) {
  return path.basename(fp, path.extname(fp)).replace(/[-_]+/g, " ").trim();
}

/** Same normalization for API titles and local tags — case/whitespace insensitive. */
function trackDedupeKey(title, artist) {
  const norm = (s) =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFKC");
  return `${norm(title)}||${norm(artist)}`;
}

async function fetchExistingDedupeKeys(token) {
  const pageSize = 500;
  let offset = 0;
  const keys = new Set();
  while (true) {
    const url = new URL(`${apiBase}/api/admin/tracks`);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Failed to list tracks (${r.status}): ${text}`);
    }
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      keys.add(trackDedupeKey(row.title, row.artist));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return keys;
}

/**
 * @param {Set<string>} initialKeys — e.g. from API
 * @returns {{ toUpload: typeof metas, skipped: Array<{ meta: (typeof metas)[0], reason: string }> }}
 */
function partitionByDedupe(metas, initialKeys) {
  const reserved = new Set(initialKeys);
  const toUpload = [];
  /** @type {Array<{ meta: (typeof metas)[0], reason: string }>} */
  const skipped = [];
  for (const m of metas) {
    const key = trackDedupeKey(m.title, m.artist);
    if (reserved.has(key)) {
      skipped.push({ meta: m, reason: "duplicate" });
      continue;
    }
    reserved.add(key);
    toUpload.push(m);
  }
  return { toUpload, skipped };
}

async function extractMeta(fp) {
  const buf = await readFile(fp);
  const mimeType = mimeForAudioPath(fp);
  let meta;
  try {
    meta = await parseBuffer(buf, { mimeType });
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
  form.append("workKind", meta.workKind ?? "original");
  form.append("kind", inferTrackVersionKindFromTitle(meta.title, meta.fp));

  const ext = path.extname(meta.fp) || ".mp3";
  const masterMime = mimeForAudioPath(meta.fp);
  form.append("master", new Blob([meta.buf], { type: masterMime }), `master${ext}`);

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

console.log(`Scanning ${dir} for audio files…`);
const files = await collectAudioFiles(dir);
console.log(`Found ${files.length} file(s).`);

if (files.length === 0) process.exit(0);

console.log(`Parsing ID3 tags…`);
const metas = await Promise.all(files.map(extractMeta));

if (dryRun) {
  console.log("\n── DRY RUN ──\n");
  let existingKeys = new Set();
  if (flags.email && flags.password) {
    console.log(`Logging in as ${flags.email} (checking duplicates against API)…`);
    try {
      const token = await login(flags.email, flags.password);
      existingKeys = await fetchExistingDedupeKeys(token);
      console.log(`Found ${existingKeys.size} unique title+artist pair(s) already in the catalog.\n`);
    } catch (err) {
      console.error(`Could not load existing tracks: ${err.message}`);
      process.exit(1);
    }
  }
  const { toUpload, skipped } = partitionByDedupe(metas, existingKeys);
  for (const m of metas) {
    const isDup = skipped.some((s) => s.meta === m);
    const tag = isDup ? "[duplicate — skip]" : "[upload]";
    console.log(
      `  ${tag}  ${m.title}  —  ${m.artist}  [${m.genre || "no genre"}]  ${m.releaseDate}  artwork:${m.artworkBuf ? "yes" : "no"}  ${path.basename(m.fp)}`,
    );
  }
  if (!flags.email || !flags.password) {
    console.log(`\n${metas.length} file(s). Sign in with --email/--password to see which would be skipped as duplicates.`);
  }
  console.log(`\nWould upload ${toUpload.length} track(s); would skip ${skipped.length} duplicate(s).`);
  process.exit(0);
}

if (!flags.email || !flags.password) {
  console.error("Error: --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD env vars) are required for upload.");
  process.exit(1);
}

console.log(`Logging in as ${flags.email}…`);
const token = await login(flags.email, flags.password);
console.log("Authenticated.");

console.log("Loading existing tracks for duplicate check…");
const existingKeys = await fetchExistingDedupeKeys(token);
const { toUpload, skipped } = partitionByDedupe(metas, existingKeys);
if (skipped.length > 0) {
  console.log(`\nSkipping ${skipped.length} duplicate(s) (already in catalog or repeated in this folder):`);
  for (const { meta: m } of skipped) {
    console.log(`  — ${m.title} — ${m.artist}  (${path.basename(m.fp)})`);
  }
  console.log("");
}

if (toUpload.length === 0) {
  console.log("Nothing new to upload.");
  process.exit(0);
}

let ok = 0;
let fail = 0;

await runBatch(toUpload, async (m, i) => {
  const label = `[${i + 1}/${toUpload.length}]`;
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

const skippedCount = skipped.length;
console.log(`\nDone: ${ok} uploaded, ${fail} failed, ${skippedCount} skipped as duplicate(s), out of ${metas.length} file(s).`);
process.exit(fail > 0 ? 1 : 0);
