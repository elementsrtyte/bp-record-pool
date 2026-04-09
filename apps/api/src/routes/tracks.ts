import type { FastifyPluginAsync } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tracks } from "../db/schema.js";
import { filesUrlPath, signedGetUrl } from "../lib/storage.js";

export function artworkUrlFromKey(key: string | null): string | null {
  if (!key) return null;
  const base = process.env.PUBLIC_ASSET_BASE_URL ?? process.env.API_PUBLIC_URL ?? "";
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/files/${filesUrlPath(key)}`;
}

export const tracksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/tracks", async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 20), 50);
    const rows = await db
      .select()
      .from(tracks)
      .orderBy(desc(tracks.createdAt))
      .limit(limit);
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      releaseDate: t.releaseDate.toISOString().slice(0, 10),
      artworkUrl: artworkUrlFromKey(t.artworkKey),
      previewable: Boolean(t.previewKey || t.masterKey),
      createdAt: t.createdAt.toISOString(),
    }));
  });

  app.get<{ Params: { id: string } }>("/api/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!row) {
      reply.code(404);
      return { error: "not_found" };
    }
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      genre: row.genre,
      releaseDate: row.releaseDate.toISOString().slice(0, 10),
      artworkUrl: artworkUrlFromKey(row.artworkKey),
      previewable: Boolean(row.previewKey || row.masterKey),
      hasPreview: Boolean(row.previewKey || row.masterKey),
      isDownloadable: row.isDownloadable,
      createdAt: row.createdAt.toISOString(),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/tracks/:id/preview-url",
    async (request, reply) => {
      const { id } = request.params;
      const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
      const streamKey = row?.previewKey ?? row?.masterKey;
      if (!streamKey) {
        reply.code(404);
        return { error: "no_preview" };
      }
      const url = await signedGetUrl(streamKey);
      return { url };
    },
  );
};
