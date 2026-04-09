/**
 * Camelot Easy Mix wheel (Mixed‑in‑Key style): **A** = minor, **B** = major; numbers **1–12**.
 * Maps a musical key string (or a code already in Camelot form) to a display code like `8A` or `12B`.
 */

/** Tonic pitch class C=0 … B=11 */
const NOTE_SEMI: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

/** Major tonics by pitch class → Camelot (B) */
const MAJOR_PC_TO_CAMELOT: readonly string[] = [
  "8B",
  "3B",
  "10B",
  "5B",
  "12B",
  "7B",
  "2B",
  "9B",
  "4B",
  "11B",
  "6B",
  "1B",
];

/** Minor tonics by pitch class → Camelot (A) */
const MINOR_PC_TO_CAMELOT: readonly string[] = [
  "5A",
  "12A",
  "7A",
  "2A",
  "9A",
  "4A",
  "11A",
  "6A",
  "1A",
  "8A",
  "3A",
  "10A",
];

function normalizeCamelotCode(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s*([ABab])$/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  if (n < 1 || n > 12) return null;
  return `${n}${m[2]!.toUpperCase()}`;
}

/** Note letter optional #/b; returns key for NOTE_SEMI */
function parseNoteToken(tok: string): string | null {
  const t = tok.trim();
  const m = t.match(/^([A-Ga-g])([#b]?)$/);
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  const acc = m[2] ?? "";
  const k = acc ? `${letter}${acc}` : letter;
  if (k in NOTE_SEMI) return k;
  if (letter in NOTE_SEMI && acc === "") return letter;
  return null;
}

function parseSpelledKey(input: string): { pc: number; minor: boolean } | null {
  const s = input.trim();
  if (!s) return null;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const note = parseNoteToken(words[0]!);
    if (!note) return null;
    const pc = NOTE_SEMI[note]!;
    const modeWord = words.slice(1).join(" ").toLowerCase();
    const minor =
      /^m(in(or)?)?$/i.test(modeWord) ||
      modeWord === "minor" ||
      modeWord.startsWith("min");
    const major =
      modeWord === "maj" ||
      modeWord === "major" ||
      modeWord.startsWith("maj") ||
      /^M$/i.test(modeWord);
    if (minor && !major) return { pc, minor: true };
    if (major && !minor) return { pc, minor: false };
    if (minor) return { pc, minor: true };
    if (major) return { pc, minor: false };
    return null;
  }

  if (/^([A-Ga-g][#b]?)m$/i.test(s)) {
    const m = s.match(/^([A-Ga-g][#b]?)m$/i)!;
    const note = parseNoteToken(m[1]!);
    if (note == null) return null;
    return { pc: NOTE_SEMI[note]!, minor: true };
  }

  const gluedMaj = s.match(/^([A-Ga-g][#b]?)(?:maj|major)$/i);
  if (gluedMaj) {
    const note = parseNoteToken(gluedMaj[1]!);
    if (note == null) return null;
    return { pc: NOTE_SEMI[note]!, minor: false };
  }

  const gluedMin = s.match(/^([A-Ga-g][#b]?)(?:min|minor)$/i);
  if (gluedMin) {
    const note = parseNoteToken(gluedMin[1]!);
    if (note == null) return null;
    return { pc: NOTE_SEMI[note]!, minor: true };
  }

  const majOne = s.match(/^([A-Ga-g][#b]?)$/i);
  if (majOne && !/m$/i.test(majOne[0]!)) {
    const note = parseNoteToken(majOne[1]!);
    if (note == null) return null;
    return { pc: NOTE_SEMI[note]!, minor: false };
  }

  return null;
}

/**
 * Returns Camelot code (`1A`–`12B`) or `null` if the string cannot be interpreted.
 */
export function musicalKeyToCamelot(key: string | null | undefined): string | null {
  if (key == null || typeof key !== "string") return null;
  const trimmed = key.trim();
  if (!trimmed) return null;

  const direct = normalizeCamelotCode(trimmed);
  if (direct) return direct;

  const parsed = parseSpelledKey(trimmed);
  if (!parsed) return null;
  return parsed.minor ? MINOR_PC_TO_CAMELOT[parsed.pc]! : MAJOR_PC_TO_CAMELOT[parsed.pc]!;
}
