import type { FastifyPluginAsync } from "fastify";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { playlists, playlistTracks, tracks } from "../db/schema.js";
import { artworkUrlFromKey } from "./tracks.js";

export const playlistsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/playlists", async () => {
    const rows = await db
      .select({
        id: playlists.id,
        title: playlists.title,
        description: playlists.description,
        createdAt: playlists.createdAt,
        trackCount: sql<number>`count(${playlistTracks.id})::int`,
      })
      .from(playlists)
      .leftJoin(playlistTracks, eq(playlistTracks.playlistId, playlists.id))
      .groupBy(playlists.id)
      .orderBy(playlists.createdAt);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      trackCount: r.trackCount,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.get<{ Params: { id: string } }>("/api/playlists/:id", async (request, reply) => {
    const { id } = request.params;
    const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!pl) {
      reply.code(404);
      return { error: "not_found" };
    }

    const items = await db
      .select({
        position: playlistTracks.position,
        id: tracks.id,
        title: tracks.title,
        artist: tracks.artist,
        genre: tracks.genre,
        releaseDate: tracks.releaseDate,
        artworkKey: tracks.artworkKey,
        previewKey: tracks.previewKey,
        masterKey: tracks.masterKey,
        createdAt: tracks.createdAt,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
      .where(eq(playlistTracks.playlistId, id))
      .orderBy(asc(playlistTracks.position));

    return {
      id: pl.id,
      title: pl.title,
      description: pl.description,
      trackCount: items.length,
      createdAt: pl.createdAt.toISOString(),
      tracks: items.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        releaseDate: t.releaseDate.toISOString().slice(0, 10),
        artworkUrl: artworkUrlFromKey(t.artworkKey),
        previewable: Boolean(t.previewKey || t.masterKey),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });
};
