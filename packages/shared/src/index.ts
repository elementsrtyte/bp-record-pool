import { z } from "zod";

export { musicalKeyToCamelot } from "./camelot.js";

// ── Tracks ──

export const TRACK_VERSION_KINDS = [
  "standard",
  "clean",
  "dirty",
  "intro",
  "radio",
  "instrumental",
  "extended",
  "acapella",
] as const;

export const trackVersionKindSchema = z.enum(TRACK_VERSION_KINDS);
export type TrackVersionKind = z.infer<typeof trackVersionKindSchema>;

/** Original production vs. remix — set manually at upload; default original. */
export const TRACK_WORK_KINDS = ["original", "remix"] as const;
export const trackWorkKindSchema = z.enum(TRACK_WORK_KINDS);
export type TrackWorkKind = z.infer<typeof trackWorkKindSchema>;

export function trackWorkKindDisplayLabel(kind: TrackWorkKind): string {
  return kind === "remix" ? "Remix" : "Original";
}

export function parseTrackWorkKind(input: string | undefined | null): TrackWorkKind {
  const v = String(input ?? "original").trim().toLowerCase();
  return v === "remix" ? "remix" : "original";
}

/**
 * Title cues that imply a remix-style work (original vs remix). Add patterns here as the list grows.
 * Uses word boundaries where appropriate; runs on the full NFKC-normalized title.
 */
export const TRACK_REMIX_TITLE_REGEXES: readonly RegExp[] = [
  /\bremix\b/i,
  /\bedit\b/i,
  /\bre-?drum\b/i,
  /\bredrum\b/i,
];

/** True if the track title matches any {@link TRACK_REMIX_TITLE_REGEXES} pattern. */
export function inferTrackWorkKindFromTitle(title: string): TrackWorkKind {
  const s = title.normalize("NFKC");
  for (const re of TRACK_REMIX_TITLE_REGEXES) {
    if (re.test(s)) return "remix";
  }
  return "original";
}

/**
 * Final work kind: title hints force **remix** when matched; otherwise uses the explicit
 * choice (form field or existing row).
 */
export function resolveTrackWorkKind(
  title: string,
  explicit: TrackWorkKind | string | undefined | null,
): TrackWorkKind {
  if (inferTrackWorkKindFromTitle(title) === "remix") return "remix";
  return parseTrackWorkKind(explicit);
}

/** Short badge labels for catalog UI (collapsed row). */
export function trackVersionKindAbbrev(kind: TrackVersionKind): string {
  const map: Record<TrackVersionKind, string> = {
    standard: "ST",
    clean: "CL",
    dirty: "DT",
    intro: "IN",
    radio: "RD",
    instrumental: "INS",
    extended: "EX",
    acapella: "ACA",
  };
  return map[kind] ?? kind.slice(0, 2).toUpperCase();
}

export function trackVersionDisplayLabel(kind: TrackVersionKind): string {
  const map: Record<TrackVersionKind, string> = {
    standard: "Standard",
    clean: "Clean",
    dirty: "Dirty",
    intro: "Intro",
    radio: "Radio",
    instrumental: "Instrumental",
    extended: "Extended",
    acapella: "Acapella",
  };
  return map[kind];
}

function fileStem(filePath: string): string {
  if (!filePath) return "";
  const norm = filePath.replace(/\\/g, "/");
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Guess `kind` from title and/or audio filename (tags, pool-style suffixes, stems).
 * Conservative on the full title (e.g. avoids treating “Radio …” in a song name as Radio Edit).
 * Bracket / parenthetical segments are checked first: `(Clean)`, `[Instrumental]`, etc.
 */
export function inferTrackVersionKindFromTitle(
  title: string,
  filenameHint?: string,
): TrackVersionKind {
  const stem = fileStem(filenameHint ?? "");
  const blob = [title ?? "", stem].filter((s) => String(s).trim().length > 0).join("\n");

  const matchParenBlob = (s: string): TrackVersionKind | null => {
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

export const trackVersionSummarySchema = z.object({
  id: z.string().uuid(),
  kind: trackVersionKindSchema,
  previewable: z.boolean(),
  downloadable: z.boolean(),
});

export type TrackVersionSummary = z.infer<typeof trackVersionSummarySchema>;

export const trackListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artist: z.string(),
  genre: z.string().nullable(),
  bpm: z.number().int().nullable(),
  musicalKey: z.string().nullable(),
  workKind: trackWorkKindSchema,
  releaseDate: z.string(),
  artworkUrl: z.string().nullable(),
  /** True if any version has a preview. */
  previewable: z.boolean(),
  createdAt: z.string(),
  versions: z.array(trackVersionSummarySchema),
  /** Earliest version id (API fallback for preview/download). */
  defaultVersionId: z.string().uuid().nullable(),
});

export type TrackListItem = z.infer<typeof trackListItemSchema>;

export const trackDetailSchema = trackListItemSchema.extend({
  hasPreview: z.boolean(),
  isDownloadable: z.boolean(),
});

export type TrackDetail = z.infer<typeof trackDetailSchema>;

// ── Playlists ──

export const playlistListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  artworkUrl: z.string().nullable(),
  trackCount: z.number().int(),
  createdAt: z.string(),
});

export type PlaylistListItem = z.infer<typeof playlistListItemSchema>;

export const playlistDetailSchema = playlistListItemSchema.extend({
  tracks: z.array(trackListItemSchema),
});

export type PlaylistDetail = z.infer<typeof playlistDetailSchema>;
