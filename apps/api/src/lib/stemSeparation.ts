import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, constants, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { TrackVersionKind } from "@bp/shared";
import { db } from "../db/client.js";
import { trackVersions } from "../db/schema.js";
import { normalizeTrackAudioForStorage, extractMp3PreviewClip } from "./audioEncode.js";
import { putObject } from "./storage.js";

const execFileAsync = promisify(execFile);

export type StemKind = "instrumental" | "acapella";

function truthyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * When true, original uploads spawn a background job using [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) (2-stem: vocals + instrumental).
 *
 * Any of these may be set: `STEM_SEPARATION_ENABLED`, `AUDIO_SEPARATOR_ENABLED`, or legacy `SPLEETER_ENABLED`.
 */
export function isStemSeparationEnabled(): boolean {
  return (
    truthyEnv(process.env.STEM_SEPARATION_ENABLED) ||
    truthyEnv(process.env.AUDIO_SEPARATOR_ENABLED) ||
    truthyEnv(process.env.SPLEETER_ENABLED)
  );
}

function stemSeparationPython(): string | undefined {
  return (
    process.env.AUDIO_SEPARATOR_PYTHON?.trim() ||
    process.env.SPLEETER_PYTHON?.trim() ||
    undefined
  );
}

function stemSeparationTimeoutMs(): number {
  const raw =
    process.env.STEM_SEPARATION_TIMEOUT_MS?.trim() || process.env.SPLEETER_TIMEOUT_MS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 60_000) return n;
  return 25 * 60 * 1000;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runAudioSeparator2Stems(inputPath: string, outputDir: string): Promise<void> {
  const timeout = stemSeparationTimeoutMs();
  const py = stemSeparationPython();
  const customNames = JSON.stringify({ Vocals: "vocals", Instrumental: "instrumental" });

  const cliArgs: string[] = [];
  const model = process.env.AUDIO_SEPARATOR_MODEL?.trim();
  if (model) {
    cliArgs.push("-m", model);
  }
  const modelDir = process.env.AUDIO_SEPARATOR_MODEL_DIR?.trim();
  if (modelDir) {
    cliArgs.push("--model_file_dir", modelDir);
  }
  const chunkRaw = process.env.AUDIO_SEPARATOR_CHUNK_DURATION?.trim();
  if (chunkRaw) {
    const n = parseInt(chunkRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      cliArgs.push("--chunk_duration", String(n));
    }
  }
  cliArgs.push(
    inputPath,
    "--output_dir",
    outputDir,
    "--output_format",
    "WAV",
    "--custom_output_names",
    customNames,
  );

  const execOpts = {
    maxBuffer: 64 * 1024 * 1024,
    timeout,
    env: { ...process.env },
  };

  const exe =
    py != null
      ? path.join(path.dirname(py), process.platform === "win32" ? "audio-separator.exe" : "audio-separator")
      : "audio-separator";
  await execFileAsync(exe, cliArgs, execOpts);
}

async function resolveInstrumentalVocalsPaths(outputDir: string): Promise<{
  vocals: string;
  instrumental: string;
}> {
  const vocalExact = path.join(outputDir, "vocals.wav");
  const instExact = path.join(outputDir, "instrumental.wav");
  if ((await pathExists(vocalExact)) && (await pathExists(instExact))) {
    return { vocals: vocalExact, instrumental: instExact };
  }

  const names = await readdir(outputDir);
  const full = names.map((f) => path.join(outputDir, f));
  const vocalFile = full.find((p) => {
    const b = path.basename(p).toLowerCase();
    if (b.includes("instrumental") || b.includes("accompaniment")) return false;
    return b.includes("vocal");
  });
  const instFile = full.find((p) => {
    const b = path.basename(p).toLowerCase();
    return b.includes("instrumental") || b.includes("accompaniment");
  });
  if (!vocalFile || !instFile) {
    throw new Error("stem_separation_no_output_files");
  }
  return { vocals: vocalFile, instrumental: instFile };
}

function storageKeyFor(prefix: string, filename: string, fallbackExt: string): string {
  const ext = path.extname(filename) || fallbackExt;
  return `${prefix}/${randomUUID()}${ext}`;
}

/**
 * Run 2-stem separation on a normalized master MP3 buffer, then add **instrumental** and/or **acapella**
 * `track_versions` when missing. Idempotent per kind.
 *
 * @param stems - If set, only consider these stems (still skips if row exists or primary kind conflicts).
 */
export async function runStemSeparationFromBuffer(
  log: FastifyBaseLogger,
  opts: {
    trackId: string;
    masterMp3: Buffer;
    masterMp3BaseName: string;
    primaryVersionKind: TrackVersionKind;
    stems?: StemKind[];
  },
): Promise<{ created: TrackVersionKind[] }> {
  const { trackId, masterMp3, masterMp3BaseName, primaryVersionKind } = opts;
  const stemFilter = opts.stems && opts.stems.length > 0 ? new Set<StemKind>(opts.stems) : null;

  const workspace = await mkdtemp(path.join(os.tmpdir(), "bp-stem-"));
  const inputPath = path.join(workspace, "master.mp3");
  const outDir = path.join(workspace, "out");
  const created: TrackVersionKind[] = [];

  try {
    await writeFile(inputPath, masterMp3);
    log.info({ trackId }, "stem_separation_start");
    await runAudioSeparator2Stems(inputPath, outDir);
    const { vocals, instrumental } = await resolveInstrumentalVocalsPaths(outDir);

    const planned: { path: string; kind: TrackVersionKind; stemLabel: string }[] = [];
    if (primaryVersionKind !== "instrumental") {
      planned.push({ path: instrumental, kind: "instrumental", stemLabel: "instrumental" });
    }
    if (primaryVersionKind !== "acapella") {
      planned.push({ path: vocals, kind: "acapella", stemLabel: "acapella" });
    }

    const filtered = stemFilter ? planned.filter((p) => stemFilter.has(p.kind as StemKind)) : planned;

    const existing = await db
      .select({ kind: trackVersions.kind })
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId));
    const have = new Set(existing.map((r) => r.kind));

    const baseStem = path.basename(masterMp3BaseName, path.extname(masterMp3BaseName)) || "master";

    for (const item of filtered) {
      if (have.has(item.kind)) {
        log.info({ trackId, kind: item.kind }, "stem_separation_skip_version_exists");
        continue;
      }
      const wavBuf = await readFile(item.path);
      const mp3 = await normalizeTrackAudioForStorage(wavBuf, `${item.stemLabel}.wav`);
      const preview = await extractMp3PreviewClip(mp3);
      const masterKey = storageKeyFor("masters", `${baseStem}-${item.stemLabel}.mp3`, ".mp3");
      const previewKey = storageKeyFor("previews", `${baseStem}-${item.stemLabel}-preview.mp3`, ".mp3");
      await putObject(masterKey, mp3, "audio/mpeg");
      await putObject(previewKey, preview, "audio/mpeg");
      await db.insert(trackVersions).values({
        trackId,
        kind: item.kind,
        masterKey,
        previewKey,
      });
      have.add(item.kind);
      created.push(item.kind);
      log.info({ trackId, kind: item.kind }, "stem_separation_stem_version_created");
    }
    log.info({ trackId, created }, "stem_separation_done");
    return { created };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** For **original** catalog tracks on upload: same as {@link runStemSeparationFromBuffer} with both stems. */
export async function runOriginalTrackStemSeparation(
  log: FastifyBaseLogger,
  opts: {
    trackId: string;
    masterMp3: Buffer;
    masterMp3BaseName: string;
    primaryVersionKind: TrackVersionKind;
  },
): Promise<void> {
  await runStemSeparationFromBuffer(log, opts);
}
