import decode from "audio-decode";
import FFT from "fft.js";
import { parseBuffer } from "music-metadata";

export type AudioAnalysisResult = {
  bpm: number | null;
  musicalKey: string | null;
};

/** Krumhansl–Schmuckler key profiles (C as reference). */
const MAJOR_KS = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_KS = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function mimeFromFilename(filename: string): string {
  const e = filename.toLowerCase();
  if (e.endsWith(".wav")) return "audio/wav";
  if (e.endsWith(".flac")) return "audio/flac";
  if (e.endsWith(".m4a") || e.endsWith(".mp4")) return "audio/mp4";
  return "audio/mpeg";
}

function normalizeTagBpm(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n >= 60 && n <= 200) return n;
    return null;
  }
  if (typeof raw === "string") {
    const n = Math.round(parseFloat(raw.replace(",", ".")));
    if (Number.isFinite(n) && n >= 60 && n <= 200) return n;
  }
  return null;
}

function normalizeTagKey(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.length > 64 ? s.slice(0, 64) : s;
}

function toMono(channelData: Float32Array[], sampleRate: number, maxSeconds: number): Float32Array {
  const len0 = channelData[0]?.length ?? 0;
  const maxSamples = Math.min(len0, Math.floor(sampleRate * maxSeconds));
  if (maxSamples <= 0) return new Float32Array(0);
  if (channelData.length === 1) return channelData[0].subarray(0, maxSamples);
  const mono = new Float32Array(maxSamples);
  for (let i = 0; i < maxSamples; i++) {
    let s = 0;
    for (let c = 0; c < channelData.length; c++) s += channelData[c][i]!;
    mono[i] = s / channelData.length;
  }
  return mono;
}

function smoothMovingAvg(data: Float32Array, win: number): Float32Array {
  if (data.length === 0 || win < 2) return data;
  const out = new Float32Array(data.length);
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    acc += data[i]!;
    if (i >= win) acc -= data[i - win]!;
    out[i] = i >= win - 1 ? acc / win : acc / (i + 1);
  }
  return out;
}

function estimateBpm(mono: Float32Array, sampleRate: number): number | null {
  if (mono.length < sampleRate * 2) return null;

  const hop = 512;
  const nFrames = Math.floor((mono.length - hop) / hop);
  if (nFrames < 32) return null;

  const energy = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let s = 0;
    const start = f * hop;
    for (let j = 0; j < hop; j++) {
      const v = mono[start + j]!;
      s += v * v;
    }
    energy[f] = Math.sqrt(s / hop);
  }

  const sm = smoothMovingAvg(energy, 5);
  let peak = 0;
  for (let i = 0; i < sm.length; i++) if (sm[i]! > peak) peak = sm[i]!;
  if (peak < 1e-8) return null;
  const norm = new Float32Array(sm.length);
  for (let i = 0; i < sm.length; i++) norm[i] = sm[i]! / peak;

  const minDistFrames = Math.max(2, Math.floor(0.18 * sampleRate / hop));
  let threshold = 0.92;
  let peaks: number[] = [];
  while (peaks.length < 12 && threshold >= 0.32) {
    peaks = [];
    for (let i = 0; i < norm.length; i++) {
      if (norm[i]! > threshold) {
        peaks.push(i);
        i += minDistFrames;
      }
    }
    threshold -= 0.05;
  }
  if (peaks.length < 12) return null;

  type IntervalCount = { interval: number; count: number };
  const intervalMap = new Map<number, number>();
  for (let p = 0; p < peaks.length; p++) {
    for (let k = 1; k <= Math.min(12, peaks.length - p - 1); k++) {
      const interval = (peaks[p + k]! - peaks[p]!) * hop;
      if (interval <= 0) continue;
      intervalMap.set(interval, (intervalMap.get(interval) ?? 0) + 1);
    }
  }

  type TempoCount = { tempo: number; count: number };
  const tempoCounts: TempoCount[] = [];
  for (const [intervalSamples, count] of intervalMap) {
    if (intervalSamples <= 0) continue;
    let t = 60 / (intervalSamples / sampleRate);
    while (t < 88) t *= 2;
    while (t > 185) t /= 2;
    const tempo = Math.round(t);
    if (tempo < 60 || tempo > 200) continue;
    const found = tempoCounts.find((x) => x.tempo === tempo);
    if (found) found.count += count;
    else tempoCounts.push({ tempo, count });
  }
  if (tempoCounts.length === 0) return null;
  tempoCounts.sort((a, b) => b.count - a.count);
  return tempoCounts[0]!.tempo;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den < 1e-10) return 0;
  return num / den;
}

function rotateTemplate(tpl: number[], tonic: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(tpl[(i - tonic + 12) % 12]!);
  }
  return out;
}

function estimateKey(mono: Float32Array, sampleRate: number): string | null {
  const n = 4096;
  if (mono.length < n * 2) return null;
  if ((n & (n - 1)) !== 0) throw new Error("FFT size must be power of two");

  const hop = 2048;
  const fft = new FFT(n);
  const realIn = new Array<number>(n);
  const window = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }

  const chromaAccum = new Float32Array(12);
  let frames = 0;
  const outComplex = fft.createComplexArray();

  for (let start = 0; start + n <= mono.length; start += hop) {
    for (let i = 0; i < n; i++) {
      realIn[i] = mono[start + i]! * window[i]!;
    }
    fft.realTransform(outComplex, realIn);
    for (let k = 1; k < n / 2; k++) {
      const re = outComplex[2 * k]!;
      const im = outComplex[2 * k + 1]!;
      const mag = Math.sqrt(re * re + im * im);
      if (mag < 1e-10) continue;
      const f = (k * sampleRate) / n;
      if (f < 55 || f > 5000) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      if (!Number.isFinite(midi)) continue;
      const lower = Math.floor(midi);
      const frac = midi - lower;
      const pc1 = ((lower % 12) + 12) % 12;
      const pc2 = (pc1 + 1) % 12;
      chromaAccum[pc1] += mag * (1 - frac);
      chromaAccum[pc2] += mag * frac;
    }
    frames++;
    if (frames >= 400) break;
  }
  if (frames < 4) return null;

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chromaAccum[i]!;
  if (sum < 1e-10) return null;
  const chroma: number[] = [];
  for (let i = 0; i < 12; i++) chroma.push(chromaAccum[i]! / sum);

  let best = { score: -2, label: "" };
  for (let tonic = 0; tonic < 12; tonic++) {
    const maj = rotateTemplate(MAJOR_KS, tonic);
    const cMaj = pearson(chroma, maj);
    if (cMaj > best.score) {
      best = { score: cMaj, label: `${NOTE_NAMES[tonic]} Maj` };
    }
    const minTpl = rotateTemplate(MINOR_KS, tonic);
    const cMin = pearson(chroma, minTpl);
    if (cMin > best.score) {
      best = { score: cMin, label: `${NOTE_NAMES[tonic]} Min` };
    }
  }
  if (best.score < 0.15) return null;
  return best.label;
}

/**
 * Reads ID3/other tags when present, then decodes audio and estimates BPM/key for missing fields.
 */
export async function analyzeMasterAudio(buffer: Buffer, filenameHint: string): Promise<AudioAnalysisResult> {
  let tagBpm: number | null = null;
  let tagKey: string | null = null;

  try {
    const meta = await parseBuffer(buffer, { mimeType: mimeFromFilename(filenameHint) }, {
      duration: false,
    });
    tagBpm = normalizeTagBpm(meta.common.bpm);
    tagKey = normalizeTagKey(meta.common.key);
  } catch {
    /* ignore bad tag parse */
  }

  let estBpm: number | null = null;
  let estKey: string | null = null;

  if (tagBpm == null || tagKey == null) {
    try {
      const { channelData, sampleRate } = await decode(buffer);
      if (sampleRate > 0 && channelData.length > 0) {
        if (tagBpm == null) {
          const mono = toMono(channelData, sampleRate, 120);
          estBpm = estimateBpm(mono, sampleRate);
        }
        if (tagKey == null) {
          const monoKey = toMono(channelData, sampleRate, 90);
          estKey = estimateKey(monoKey, sampleRate);
        }
      }
    } catch {
      /* decode / analysis failed (wrong format, etc.) */
    }
  }

  return {
    bpm: tagBpm ?? estBpm,
    musicalKey: tagKey ?? estKey,
  };
}
