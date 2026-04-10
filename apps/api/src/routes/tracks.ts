import type { FastifyPluginAsync } from "fastify";
import { and, count, desc, eq, gte, isNotNull, lte, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { tracks, trackVersions } from "../db/schema.js";
import { filesUrlPath, signedGetUrl } from "../lib/storage.js";
import {
  defaultVersionIdFromList,
  loadVersionsByTrackId,
  resolveVersionForTrack,
  toVersionSummaries,
} from "../lib/trackVersions.js";

export function artworkUrlFromKey(key: string | null): string | null {
  if (!key) return null;
  const base = process.env.PUBLIC_ASSET_BASE_URL ?? process.env.API_PUBLIC_URL ?? "";
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/files/${filesUrlPath(key)}`;
}

async function mapTracksToListItems(rows: (typeof tracks.$inferSelect)[]) {
  const byTrack = await loadVersionsByTrackId(rows.map((t) => t.id));
  return rows.map((t) => {
    const vers = byTrack.get(t.id) ?? [];
    const summaries = toVersionSummaries(vers, t.isDownloadable);
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      workKind: t.workKind,
      releaseDate: t.releaseDate.toISOString().slice(0, 10),
      artworkUrl: artworkUrlFromKey(t.artworkKey),
      previewable: summaries.some((s) => s.previewable),
      createdAt: t.createdAt.toISOString(),
      versions: summaries,
      defaultVersionId: defaultVersionIdFromList(vers),
    };
  });
}

export const tracksRoutes: FastifyPluginAsync = async (app) => {
  /** Old web bundles and bookmarks still call these; same data as /api/tracks, response shape matches the pre–track-only API. */
  app.get("/api/releases", async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 20), 50);
    const rows = await db
      .select()
      .from(tracks)
      .orderBy(desc(tracks.createdAt))
      .limit(limit);
    const payload = await mapTracksToListItems(rows);
    return payload.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      label: null as string | null,
      releaseDate: t.releaseDate,
      genre: t.genre,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      workKind: t.workKind,
      artworkUrl: t.artworkUrl,
      previewable: t.previewable,
      versions: t.versions,
      defaultVersionId: t.defaultVersionId,
      /** Legacy field: parent track id for `/api/tracks/:id/preview-url` (default version). */
      previewTrackId: t.previewable ? t.id : null,
      createdAt: t.createdAt,
    }));
  });

  app.get<{ Params: { id: string } }>("/api/releases/:id", async (request, reply) => {
    const { id } = request.params;
    const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    const byTrack = await loadVersionsByTrackId([id]);
    const vers = byTrack.get(id) ?? [];
    const summaries = toVersionSummaries(vers, row.isDownloadable);
    const anyPreview = summaries.some((s) => s.previewable);
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      label: null,
      releaseDate: row.releaseDate.toISOString().slice(0, 10),
      genre: row.genre,
      artworkUrl: artworkUrlFromKey(row.artworkKey),
      createdAt: row.createdAt.toISOString(),
      tracks: [
        {
          id: row.id,
          title: row.title,
          trackNumber: 1 as number | null,
          durationSeconds: null as number | null,
          hasPreview: anyPreview,
        },
      ],
    };
  });

  app.get("/api/tracks", async (request) => {
    const q = request.query as {
      limit?: string;
      offset?: string;
      workKind?: string;
      bpmMin?: string;
      bpmMax?: string;
    };
    const limitRaw = Number(q.limit ?? 25);
    const offsetRaw = Number(q.offset ?? 0);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 25, 1), 100);
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

    const conditions: SQL[] = [];

    const work = q.workKind?.trim().toLowerCase();
    if (work === "original" || work === "remix") {
      conditions.push(eq(tracks.workKind, work));
    }

    const bpmMinN = q.bpmMin != null && q.bpmMin.trim() !== "" ? Number(q.bpmMin) : NaN;
    const bpmMaxN = q.bpmMax != null && q.bpmMax.trim() !== "" ? Number(q.bpmMax) : NaN;
    const hasBpmMin = Number.isFinite(bpmMinN);
    const hasBpmMax = Number.isFinite(bpmMaxN);
    if (hasBpmMin || hasBpmMax) {
      conditions.push(isNotNull(tracks.bpm));
      if (hasBpmMin) conditions.push(gte(tracks.bpm, Math.round(bpmMinN)));
      if (hasBpmMax) conditions.push(lte(tracks.bpm, Math.round(bpmMaxN)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = whereClause
      ? await db.select({ n: count() }).from(tracks).where(whereClause)
      : await db.select({ n: count() }).from(tracks);
    const total = Number(totalRow?.n ?? 0);

    const rows = whereClause
      ? await db
          .select()
          .from(tracks)
          .where(whereClause)
          .orderBy(desc(tracks.createdAt))
          .limit(limit)
          .offset(offset)
      : await db.select().from(tracks).orderBy(desc(tracks.createdAt)).limit(limit).offset(offset);

    const trackList = await mapTracksToListItems(rows);
    return {
      tracks: trackList,
      total,
      limit,
      offset,
    };
  });

  app.get<{ Params: { id: string } }>("/api/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    const byTrack = await loadVersionsByTrackId([id]);
    const vers = byTrack.get(id) ?? [];
    const summaries = toVersionSummaries(vers, row.isDownloadable);
    const anyPreview = summaries.some((s) => s.previewable);
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      genre: row.genre,
      bpm: row.bpm,
      musicalKey: row.musicalKey,
      workKind: row.workKind,
      releaseDate: row.releaseDate.toISOString().slice(0, 10),
      artworkUrl: artworkUrlFromKey(row.artworkKey),
      previewable: anyPreview,
      hasPreview: anyPreview,
      isDownloadable: row.isDownloadable,
      createdAt: row.createdAt.toISOString(),
      versions: summaries,
      defaultVersionId: defaultVersionIdFromList(vers),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id/preview-url",
    async (request, reply) => {
      const { id } = request.params;
      const q = request.query as { versionId?: string; kind?: string };
      const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      const ver = await resolveVersionForTrack(id, {
        versionId: q.versionId,
        kind: q.kind,
      });
      const streamKey = ver?.previewKey || ver?.masterKey;
      if (!streamKey) {
        reply.code(404);
        return { error: "no_preview" };
      }
      const url = await signedGetUrl(streamKey);
      return { url };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/track-versions/:id/preview-url",
    async (request, reply) => {
      const { id: versionId } = request.params;
      const [ver] = await db
        .select()
        .from(trackVersions)
        .where(eq(trackVersions.id, versionId))
        .limit(1);
      if (!ver) {
        reply.code(404);
        return { error: "not_found" };
      }
      const streamKey = ver.previewKey || ver.masterKey;
      if (!streamKey) {
        reply.code(404);
        return { error: "no_preview" };
      }
      const url = await signedGetUrl(streamKey);
      return { url };
    },
  );
};
