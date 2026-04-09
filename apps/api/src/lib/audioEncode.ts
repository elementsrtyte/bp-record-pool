import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

function staticFfmpegPath(): string | null {
  try {
    const p = require("ffmpeg-static") as string | null;
    return typeof p === "string" && p.length > 0 ? p : null;
  } catch {
    return null;
  }
}

function staticFfprobePath(): string | null {
  try {
    const mod = require("ffprobe-static") as { path?: string };
    return typeof mod?.path === "string" ? mod.path : null;
  } catch {
    return null;
  }
}

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  bit_rate?: string;
};

type FfprobeOut = {
  streams?: FfprobeStream[];
  format?: { bit_rate?: string; format_name?: string };
};

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH ?? staticFfmpegPath() ?? "ffmpeg";
}

function ffprobeBin(): string {
  return process.env.FFPROBE_PATH ?? staticFfprobePath() ?? "ffprobe";
}

function isLosslessAudioCodec(codec: string | undefined): boolean {
  if (!codec) return false;
  if (codec === "flac" || codec === "alac" || codec === "truehd" || codec === "tta") return true;
  if (codec.startsWith("pcm_")) return true;
  return false;
}

function parseBitrateBps(stream: FfprobeStream | undefined, format: FfprobeOut["format"]): number | null {
  const s = stream?.bit_rate;
  if (s && /^\d+$/.test(s)) return parseInt(s, 10);
  const f = format?.bit_rate;
  if (f && /^\d+$/.test(f)) return parseInt(f, 10);
  return null;
}

async function ffprobeJson(filePath: string): Promise<FfprobeOut> {
  const { stdout } = await execFileAsync(ffprobeBin(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  return JSON.parse(stdout) as FfprobeOut;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync(ffmpegBin(), args, { maxBuffer: 64 * 1024 * 1024 });
}

/** Clamp MP3 CBR target: keep source quality cap, never invent bits above 320. */
function mp3EncodeBitrateKbps(detectedBps: number | null): string {
  if (detectedBps == null || detectedBps <= 0) return "192";
  const kbps = Math.round(detectedBps / 1000);
  const clamped = Math.min(Math.max(kbps, 96), 320);
  return `${clamped}k`;
}

/**
 * Produces an **MP3** master suitable for storage:
 * - **MP3** input: stream **copy** (keeps 128/192/320/VBR as-is; no upscaling).
 * - **Lossless** input (WAV, FLAC, PCM, …): **320 kbps** CBR MP3.
 * - **Other lossy** (AAC, Opus, …): transcode to MP3 at **min(detected, 320)** kbps (default 192 if unknown).
 */
export async function normalizeTrackAudioForStorage(input: Buffer, originalFilename: string): Promise<Buffer> {
  const ext = path.extname(originalFilename) || ".audio";
  const dir = await mkdtemp(path.join(os.tmpdir(), "bp-master-"));
  const inPath = path.join(dir, `in${ext}`);
  const outPath = path.join(dir, "out.mp3");

  try {
    await writeFile(inPath, input);
    const meta = await ffprobeJson(inPath);
    const audio = meta.streams?.find((s) => s.codec_type === "audio");
    const codec = audio?.codec_name?.toLowerCase();
    const br = parseBitrateBps(audio, meta.format);

    if (codec === "mp3" || codec === "mp2") {
      try {
        await runFfmpeg(["-y", "-i", inPath, "-vn", "-c:a", "copy", outPath]);
      } catch {
        const rate = mp3EncodeBitrateKbps(br);
        await runFfmpeg([
          "-y",
          "-i",
          inPath,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-b:a",
          rate,
          outPath,
        ]);
      }
    } else if (isLosslessAudioCodec(codec)) {
      await runFfmpeg(["-y", "-i", inPath, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", outPath]);
    } else {
      const rate = mp3EncodeBitrateKbps(br);
      await runFfmpeg([
        "-y",
        "-i",
        inPath,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        rate,
        outPath,
      ]);
    }

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** First N seconds of an MP3 master for streaming preview (shorter files pass through unchanged). */
export const PREVIEW_CLIP_SECONDS = 60;

/**
 * Build a preview MP3 from an already-normalized master MP3 buffer (first {@link PREVIEW_CLIP_SECONDS}s).
 * Tries stream copy, then re-encodes at 192k if copy fails.
 */
export async function extractMp3PreviewClip(normalizedMasterMp3: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bp-preview-"));
  const inPath = path.join(dir, "master.mp3");
  const outPath = path.join(dir, "preview.mp3");
  const dur = String(PREVIEW_CLIP_SECONDS);

  try {
    await writeFile(inPath, normalizedMasterMp3);
    try {
      await runFfmpeg(["-y", "-i", inPath, "-t", dur, "-vn", "-c:a", "copy", outPath]);
    } catch {
      await runFfmpeg([
        "-y",
        "-i",
        inPath,
        "-t",
        dur,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        outPath,
      ]);
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
