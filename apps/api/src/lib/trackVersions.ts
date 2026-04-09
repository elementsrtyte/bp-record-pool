import { asc, and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { trackVersions } from "../db/schema.js";
import { trackVersionKindSchema, type TrackVersionKind, type TrackVersionSummary } from "@bp/shared";

export type { TrackVersionKind };

export function parseTrackVersionKind(raw: string | undefined | null): TrackVersionKind {
  const s = (raw ?? "standard").trim().toLowerCase();
  const r = trackVersionKindSchema.safeParse(s);
  return r.success ? r.data : "standard";
}

/** Fallback when `versionId` / `kind` not supplied: earliest-created version. */
export async function getDefaultVersionForTrack(trackId: string) {
  const [row] = await db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.trackId, trackId))
    .orderBy(asc(trackVersions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function resolveVersionForTrack(
  trackId: string,
  opts: { versionId?: string | undefined; kind?: string | undefined },
) {
  if (opts.versionId) {
    const [v] = await db
      .select()
      .from(trackVersions)
      .where(and(eq(trackVersions.id, opts.versionId), eq(trackVersions.trackId, trackId)))
      .limit(1);
    if (v) return v;
    /* Invalid or stale versionId (e.g. old bookmark): fall back to default. */
  }
  if (opts.kind) {
    const kind = parseTrackVersionKind(opts.kind);
    const [v] = await db
      .select()
      .from(trackVersions)
      .where(and(eq(trackVersions.trackId, trackId), eq(trackVersions.kind, kind)))
      .limit(1);
    return v ?? null;
  }
  return getDefaultVersionForTrack(trackId);
}

export function versionFlagsForRow(
  previewKey: string,
  masterKey: string,
  parentDownloadable: boolean,
): { previewable: boolean; downloadable: boolean } {
  return {
    previewable: Boolean(previewKey && masterKey),
    downloadable: parentDownloadable && Boolean(masterKey),
  };
}

export type TrackVersionRow = typeof trackVersions.$inferSelect;

/** Versions per track, each track’s rows ordered by `created_at` ascending. */
export async function loadVersionsByTrackId(trackIds: string[]) {
  const m = new Map<string, TrackVersionRow[]>();
  if (trackIds.length === 0) return m;
  const rows = await db
    .select()
    .from(trackVersions)
    .where(inArray(trackVersions.trackId, trackIds))
    .orderBy(asc(trackVersions.createdAt));
  for (const r of rows) {
    const arr = m.get(r.trackId) ?? [];
    arr.push(r);
    m.set(r.trackId, arr);
  }
  return m;
}

export function toVersionSummaries(
  versions: TrackVersionRow[],
  parentDownloadable: boolean,
): TrackVersionSummary[] {
  return versions.map((v) => ({
    id: v.id,
    kind: trackVersionKindSchema.parse(v.kind),
    ...versionFlagsForRow(v.previewKey, v.masterKey, parentDownloadable),
  }));
}

export function defaultVersionIdFromList(versions: TrackVersionRow[]): string | null {
  return versions[0]?.id ?? null;
}
