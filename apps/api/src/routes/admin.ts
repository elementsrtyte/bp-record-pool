import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { verifySupabaseJwt, getBearer } from "../lib/auth.js";
import { isAdminUser } from "../lib/admin-auth.js";
import { ensureProfile } from "../lib/profile.js";
import { db } from "../db/client.js";
import { tracks, playlists, playlistTracks } from "../db/schema.js";
import { analyzeMasterAudio } from "../lib/audioAnalysis.js";
import { deleteObject, putObject } from "../lib/storage.js";

function keyFor(prefix: string, filename: string, fallbackExt: string) {
  const ext = path.extname(filename) || fallbackExt;
  return `${prefix}/${randomUUID()}${ext}`;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request, reply) => {
    const user = await verifySupabaseJwt(getBearer(request));
    if (!user) {
      reply.code(401);
      return reply.send({ error: "unauthorized" });
    }
    const profile = await ensureProfile(user);
    if (!isAdminUser(user, profile)) {
      reply.code(403);
      return reply.send({ error: "forbidden" });
    }
  });

  // ── Tracks ──

  app.get("/tracks", async () => {
    const rows = await db
      .select()
      .from(tracks)
      .orderBy(desc(tracks.createdAt))
      .limit(200);
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      releaseDate: t.releaseDate.toISOString().slice(0, 10),
      createdAt: t.createdAt.toISOString(),
    }));
  });

  app.post("/tracks", async (request, reply) => {
    const mp = await request.parts();
    let title = "";
    let artist = "";
    let releaseDate = "";
    let genre = "";
    let artworkBuf: Buffer | null = null;
    let artworkName = "artwork.jpg";
    let masterBuf: Buffer | null = null;
    let masterName = "master audio";
    let previewBuf: Buffer | null = null;
    let previewName = "preview audio";

    for await (const part of mp) {
      if (part.type === "field") {
        const v = (part.value as string) ?? "";
        if (part.fieldname === "title") title = v;
        if (part.fieldname === "artist") artist = v;
        if (part.fieldname === "releaseDate") releaseDate = v;
        if (part.fieldname === "genre") genre = v;
      } else if (part.type === "file") {
        const buf = await part.toBuffer();
        if (buf.length === 0) continue;
        if (part.fieldname === "artwork") {
          artworkBuf = buf;
          artworkName = part.filename ?? artworkName;
        }
        if (part.fieldname === "master") {
          masterBuf = buf;
          masterName = part.filename ?? masterName;
        }
        if (part.fieldname === "preview") {
          previewBuf = buf;
          previewName = part.filename ?? previewName;
        }
      }
    }

    if (!title || !artist || !releaseDate || !masterBuf) {
      reply.code(400);
      return { error: "missing_fields", need: ["title", "artist", "releaseDate", "master"] };
    }
    const rd = new Date(releaseDate);
    if (Number.isNaN(rd.getTime())) {
      reply.code(400);
      return { error: "bad_release_date" };
    }

    let artworkKey: string | null = null;
    if (artworkBuf) {
      artworkKey = keyFor("artwork", artworkName, ".jpg");
      await putObject(
        artworkKey,
        artworkBuf,
        artworkName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      );
    }
    const masterKey = keyFor("masters", masterName, ".mp3");
    await putObject(masterKey, masterBuf, "audio/mpeg");

    let previewKey: string | null = null;
    if (previewBuf) {
      previewKey = keyFor("previews", previewName, ".mp3");
      await putObject(previewKey, previewBuf, "audio/mpeg");
    }

    const { bpm: analyzedBpm, musicalKey: analyzedKey } = await analyzeMasterAudio(masterBuf, masterName);

    const [track] = await db
      .insert(tracks)
      .values({
        title,
        artist,
        genre: genre || null,
        bpm: analyzedBpm,
        musicalKey: analyzedKey,
        releaseDate: rd,
        artworkKey,
        previewKey,
        masterKey,
      })
      .returning();

    reply.code(201);
    return { id: track!.id };
  });

  app.delete<{ Params: { id: string } }>("/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [t] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!t) {
      reply.code(404);
      return { error: "not_found" };
    }
    const keys = [t.artworkKey, t.previewKey, t.masterKey].filter(Boolean) as string[];
    await Promise.all(keys.map((k) => deleteObject(k)));
    await db.delete(tracks).where(eq(tracks.id, id));
    return { ok: true };
  });

  // ── Playlists ──

  app.get("/playlists", async () => {
    const rows = await db.select().from(playlists).orderBy(playlists.createdAt);
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    }));
  });

  app.post("/playlists", async (request, reply) => {
    const body = request.body as { title?: string; description?: string };
    if (!body?.title) {
      reply.code(400);
      return { error: "missing_title" };
    }
    const [pl] = await db
      .insert(playlists)
      .values({ title: body.title, description: body.description || null })
      .returning();
    reply.code(201);
    return { id: pl!.id };
  });

  app.patch<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { title?: string; description?: string };
    const update: Partial<typeof playlists.$inferInsert> = {};
    if (typeof body?.title === "string") update.title = body.title;
    if (typeof body?.description === "string") update.description = body.description || null;
    if (Object.keys(update).length === 0) {
      reply.code(400);
      return { error: "no_fields" };
    }
    await db.update(playlists).set(update).where(eq(playlists.id, id));
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const { id } = request.params;
    const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!pl) {
      reply.code(404);
      return { error: "not_found" };
    }
    await db.delete(playlists).where(eq(playlists.id, id));
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/playlists/:id/tracks", async (request) => {
    const { id } = request.params;
    const rows = await db
      .select({ id: tracks.id, title: tracks.title, artist: tracks.artist, position: playlistTracks.position })
      .from(playlistTracks)
      .innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
      .where(eq(playlistTracks.playlistId, id))
      .orderBy(asc(playlistTracks.position));
    return rows;
  });

  app.put<{ Params: { id: string } }>("/playlists/:id/tracks", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { trackIds?: string[] };
    if (!Array.isArray(body?.trackIds)) {
      reply.code(400);
      return { error: "trackIds_required" };
    }
    const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!pl) {
      reply.code(404);
      return { error: "not_found" };
    }
    await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
    if (body.trackIds.length > 0) {
      const seen = new Set<string>();
      const values = body.trackIds
        .filter((tid) => {
          if (seen.has(tid)) return false;
          seen.add(tid);
          return true;
        })
        .map((tid, i) => ({ playlistId: id, trackId: tid, position: i }));
      await db.insert(playlistTracks).values(values);
    }
    return { ok: true };
  });
};
