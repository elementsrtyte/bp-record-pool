import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { verifySupabaseJwt, getBearer } from "../lib/auth.js";
import { isAdminUser } from "../lib/admin-auth.js";
import { ensureProfile } from "../lib/profile.js";
import { db } from "../db/client.js";
import { tracks, trackVersions, playlists, playlistTracks } from "../db/schema.js";
import {
  loadVersionsByTrackId,
  parseTrackVersionKind,
} from "../lib/trackVersions.js";
import { analyzeMasterAudio } from "../lib/audioAnalysis.js";
import { extractMp3PreviewClip, normalizeTrackAudioForStorage } from "../lib/audioEncode.js";
import { deleteObject, putObject, readObject } from "../lib/storage.js";
import { artworkUrlFromKey } from "./tracks.js";
import { generatePlaylistCoverPng } from "../lib/openaiPlaylistArt.js";
import { inferTrackVersionKindFromTitle, resolveTrackWorkKind } from "@bp/shared";
import {
  isStemSeparationEnabled,
  runOriginalTrackStemSeparation,
  runStemSeparationFromBuffer,
  type StemKind,
} from "../lib/stemSeparation.js";

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

  app.get("/tracks", async (request) => {
    const q = request.query as { limit?: string; offset?: string };
    const limitRaw = parseInt(q.limit ?? "200", 10);
    const offsetRaw = parseInt(q.offset ?? "0", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 10_000);
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

    const rows = await db
      .select()
      .from(tracks)
      .orderBy(desc(tracks.createdAt))
      .limit(limit)
      .offset(offset);
    const byTrack = await loadVersionsByTrackId(rows.map((t) => t.id));
    return rows.map((t) => {
      const vers = byTrack.get(t.id) ?? [];
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        bpm: t.bpm,
        musicalKey: t.musicalKey,
        workKind: t.workKind,
        releaseDate: t.releaseDate.toISOString().slice(0, 10),
        isDownloadable: t.isDownloadable,
        createdAt: t.createdAt.toISOString(),
        artworkUrl: artworkUrlFromKey(t.artworkKey),
        defaultVersionId: vers[0]?.id ?? null,
        versions: vers.map((v) => ({
          id: v.id,
          kind: v.kind,
          hasMaster: Boolean(v.masterKey),
          hasPreview: Boolean(v.previewKey),
        })),
      };
    });
  });

  app.get<{ Params: { id: string } }>("/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [t] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!t) {
      reply.code(404);
      return { error: "not_found" };
    }
    const byTrack = await loadVersionsByTrackId([id]);
    const vers = byTrack.get(id) ?? [];
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      bpm: t.bpm,
      musicalKey: t.musicalKey,
      workKind: t.workKind,
      releaseDate: t.releaseDate.toISOString().slice(0, 10),
      isDownloadable: t.isDownloadable,
      artworkUrl: artworkUrlFromKey(t.artworkKey),
      createdAt: t.createdAt.toISOString(),
      versions: vers.map((v) => ({
        id: v.id,
        kind: v.kind,
        hasMaster: Boolean(v.masterKey),
        hasPreview: Boolean(v.previewKey),
      })),
    };
  });

  app.post("/tracks", async (request, reply) => {
    const mp = await request.parts();
    let title = "";
    let artist = "";
    let releaseDate = "";
    let genre = "";
    let kindRaw = "standard";
    let workKindRaw = "original";
    let artworkBuf: Buffer | null = null;
    let artworkName = "artwork.jpg";
    let masterBuf: Buffer | null = null;
    let masterName = "master audio";
    for await (const part of mp) {
      if (part.type === "field") {
        const v = (part.value as string) ?? "";
        if (part.fieldname === "title") title = v;
        if (part.fieldname === "artist") artist = v;
        if (part.fieldname === "releaseDate") releaseDate = v;
        if (part.fieldname === "genre") genre = v;
        if (part.fieldname === "kind") kindRaw = v || "standard";
        if (part.fieldname === "workKind") workKindRaw = v || "original";
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

    let masterOut: Buffer;
    try {
      masterOut = await normalizeTrackAudioForStorage(masterBuf, masterName);
    } catch (e) {
      reply.code(400);
      return {
        error: "audio_processing_failed",
        detail: (e as Error).message,
      };
    }
    const masterMp3Name = `${path.basename(masterName, path.extname(masterName)) || "master"}.mp3`;
    const masterKey = keyFor("masters", masterMp3Name, ".mp3");
    await putObject(masterKey, masterOut, "audio/mpeg");

    let previewOut: Buffer;
    try {
      previewOut = await extractMp3PreviewClip(masterOut);
    } catch (e) {
      reply.code(400);
      return {
        error: "preview_generation_failed",
        detail: (e as Error).message,
      };
    }
    const previewMp3Name = `${path.basename(masterMp3Name, path.extname(masterMp3Name)) || "preview"}-preview.mp3`;
    const previewKey = keyFor("previews", previewMp3Name, ".mp3");
    await putObject(previewKey, previewOut, "audio/mpeg");

    const { bpm: analyzedBpm, musicalKey: analyzedKey } = await analyzeMasterAudio(
      masterOut,
      masterMp3Name,
    );

    const formKind = parseTrackVersionKind(kindRaw);
    const inferredKind = inferTrackVersionKindFromTitle(title.trim(), masterName);
    const kind = formKind !== "standard" ? formKind : inferredKind;
    const workKind = resolveTrackWorkKind(title.trim(), workKindRaw);

    const track = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tracks)
        .values({
          title,
          artist,
          genre: genre || null,
          bpm: analyzedBpm,
          musicalKey: analyzedKey,
          workKind,
          releaseDate: rd,
          artworkKey,
        })
        .returning();
      await tx.insert(trackVersions).values({
        trackId: t!.id,
        kind,
        masterKey,
        previewKey,
      });
      return t;
    });

    if (workKind === "original" && isStemSeparationEnabled()) {
      const tid = track!.id;
      const mp3Buf = masterOut;
      const mp3Name = masterMp3Name;
      const primaryKind = kind;
      setImmediate(() => {
        void runOriginalTrackStemSeparation(app.log, {
          trackId: tid,
          masterMp3: mp3Buf,
          masterMp3BaseName: mp3Name,
          primaryVersionKind: primaryKind,
        }).catch((err: unknown) => {
          app.log.error({ err, trackId: tid }, "stem_separation_job_failed");
        });
      });
    }

    reply.code(201);
    return { id: track!.id };
  });

  app.post<{ Params: { id: string } }>("/tracks/:id/versions", async (request, reply) => {
    const { id: trackId } = request.params;
    const [existing] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
    if (!existing) {
      reply.code(404);
      return { error: "not_found" };
    }

    const mp = await request.parts();
    let kindRaw = "standard";
    let masterBuf: Buffer | null = null;
    let masterName = "master audio";
    for await (const part of mp) {
      if (part.type === "field") {
        const v = (part.value as string) ?? "";
        if (part.fieldname === "kind") kindRaw = v || "standard";
      } else if (part.type === "file" && part.fieldname === "master") {
        const buf = await part.toBuffer();
        if (buf.length > 0) {
          masterBuf = buf;
          masterName = part.filename ?? masterName;
        }
      }
    }

    if (!masterBuf) {
      reply.code(400);
      return { error: "missing_fields", need: ["master"] };
    }

    const formKind = parseTrackVersionKind(kindRaw);
    const inferredKind = inferTrackVersionKindFromTitle(existing.title, masterName);
    const kind = formKind !== "standard" ? formKind : inferredKind;

    const existingKinds = await db
      .select({ kind: trackVersions.kind })
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId));
    if (existingKinds.some((r) => r.kind === kind)) {
      reply.code(409);
      return { error: "version_kind_exists", kind };
    }

    let masterOut: Buffer;
    try {
      masterOut = await normalizeTrackAudioForStorage(masterBuf, masterName);
    } catch (e) {
      reply.code(400);
      return {
        error: "audio_processing_failed",
        detail: (e as Error).message,
      };
    }
    const masterMp3Name = `${path.basename(masterName, path.extname(masterName)) || "master"}.mp3`;
    const masterKey = keyFor("masters", masterMp3Name, ".mp3");
    await putObject(masterKey, masterOut, "audio/mpeg");

    let previewOut: Buffer;
    try {
      previewOut = await extractMp3PreviewClip(masterOut);
    } catch (e) {
      reply.code(400);
      return {
        error: "preview_generation_failed",
        detail: (e as Error).message,
      };
    }
    const previewMp3Name = `${path.basename(masterMp3Name, path.extname(masterMp3Name)) || "preview"}-preview.mp3`;
    const previewKey = keyFor("previews", previewMp3Name, ".mp3");
    await putObject(previewKey, previewOut, "audio/mpeg");

    const [ver] = await db
      .insert(trackVersions)
      .values({ trackId, kind, masterKey, previewKey })
      .returning();

    reply.code(201);
    return { versionId: ver!.id };
  });

  app.patch<{ Params: { id: string } }>("/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [existing] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!existing) {
      reply.code(404);
      return { error: "not_found" };
    }

    const ct = request.headers["content-type"] ?? "";

    if (ct.includes("multipart/form-data")) {
      const mp = await request.parts();
      const update: Partial<typeof tracks.$inferInsert> = {};
      let artworkBuf: Buffer | null = null;
      let artworkFilename = "artwork.jpg";
      let patchWorkKindRaw: string | undefined;

      for await (const part of mp) {
        if (part.type === "field") {
          const v = (part.value as string) ?? "";
          if (part.fieldname === "title") update.title = v;
          if (part.fieldname === "artist") update.artist = v;
          if (part.fieldname === "genre") update.genre = v.trim() ? v : null;
          if (part.fieldname === "musicalKey") update.musicalKey = v.trim() ? v : null;
          if (part.fieldname === "releaseDate") {
            const rd = new Date(v);
            if (Number.isNaN(rd.getTime())) {
              reply.code(400);
              return { error: "bad_release_date" };
            }
            update.releaseDate = rd;
          }
          if (part.fieldname === "bpm") {
            if (!v.trim()) update.bpm = null;
            else {
              const n = parseInt(v, 10);
              if (!Number.isFinite(n)) {
                reply.code(400);
                return { error: "bad_bpm" };
              }
              update.bpm = n;
            }
          }
          if (part.fieldname === "isDownloadable") {
            update.isDownloadable = v === "1" || v === "true";
          }
          if (part.fieldname === "workKind") {
            patchWorkKindRaw = v;
          }
        } else if (part.type === "file" && part.fieldname === "artwork") {
          const buf = await part.toBuffer();
          if (buf.length > 0) {
            artworkBuf = buf;
            artworkFilename = part.filename ?? artworkFilename;
          }
        }
      }

      if (update.title !== undefined) {
        const s = typeof update.title === "string" ? update.title.trim() : "";
        if (!s) {
          reply.code(400);
          return { error: "bad_title" };
        }
        update.title = s;
      }
      if (update.artist !== undefined) {
        const s = typeof update.artist === "string" ? update.artist.trim() : "";
        if (!s) {
          reply.code(400);
          return { error: "bad_artist" };
        }
        update.artist = s;
      }

      if (update.title !== undefined || patchWorkKindRaw !== undefined) {
        const nextTitle = String(update.title ?? existing.title).trim();
        const explicit = patchWorkKindRaw !== undefined ? patchWorkKindRaw : existing.workKind;
        update.workKind = resolveTrackWorkKind(nextTitle, explicit);
      }

      if (artworkBuf) {
        if (existing.artworkKey) await deleteObject(existing.artworkKey);
        const key = keyFor("artwork", artworkFilename, ".jpg");
        const lower = artworkFilename.toLowerCase();
        const mime =
          lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
        await putObject(key, artworkBuf, mime);
        update.artworkKey = key;
      }

      if (Object.keys(update).length === 0) {
        reply.code(400);
        return { error: "no_fields" };
      }
      await db.update(tracks).set(update).where(eq(tracks.id, id));
      return { ok: true };
    }

    const body = request.body as {
      title?: string;
      artist?: string;
      genre?: string | null;
      bpm?: number | null;
      musicalKey?: string | null;
      releaseDate?: string;
      isDownloadable?: boolean;
      workKind?: string;
    };

    const update: Partial<typeof tracks.$inferInsert> = {};
    if (body.title !== undefined) {
      const s = String(body.title).trim();
      if (!s) {
        reply.code(400);
        return { error: "bad_title" };
      }
      update.title = s;
    }
    if (body.artist !== undefined) {
      const s = String(body.artist).trim();
      if (!s) {
        reply.code(400);
        return { error: "bad_artist" };
      }
      update.artist = s;
    }
    if (body.genre !== undefined) {
      update.genre = body.genre === null || body.genre === "" ? null : String(body.genre);
    }
    if (body.musicalKey !== undefined) {
      update.musicalKey =
        body.musicalKey === null || body.musicalKey === "" ? null : String(body.musicalKey);
    }
    if (body.bpm !== undefined) {
      if (body.bpm === null) update.bpm = null;
      else if (typeof body.bpm === "number" && Number.isFinite(body.bpm)) {
        update.bpm = Math.round(body.bpm);
      } else {
        reply.code(400);
        return { error: "bad_bpm" };
      }
    }
    if (body.releaseDate !== undefined) {
      const rd = new Date(body.releaseDate);
      if (Number.isNaN(rd.getTime())) {
        reply.code(400);
        return { error: "bad_release_date" };
      }
      update.releaseDate = rd;
    }
    if (body.isDownloadable !== undefined) {
      if (typeof body.isDownloadable !== "boolean") {
        reply.code(400);
        return { error: "bad_is_downloadable" };
      }
      update.isDownloadable = body.isDownloadable;
    }
    if (update.title !== undefined || body.workKind !== undefined) {
      const nextTitle = String(update.title ?? existing.title).trim();
      const explicit =
        body.workKind !== undefined ? String(body.workKind) : existing.workKind;
      update.workKind = resolveTrackWorkKind(nextTitle, explicit);
    }

    if (Object.keys(update).length === 0) {
      reply.code(400);
      return { error: "no_fields" };
    }
    await db.update(tracks).set(update).where(eq(tracks.id, id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/tracks/:id/generate-stems", async (request, reply) => {
    if (!isStemSeparationEnabled()) {
      reply.code(503);
      return {
        error: "stem_separation_disabled",
        detail:
          "Set STEM_SEPARATION_ENABLED or SPLEETER_ENABLED=true and install audio-separator (see README).",
      };
    }
    const { id: trackId } = request.params;
    const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
    if (!track) {
      reply.code(404);
      return { error: "not_found" };
    }

    const body = (request.body as { stems?: unknown; versionId?: string } | undefined) ?? {};
    let stems: StemKind[] = ["instrumental", "acapella"];
    if (Array.isArray(body.stems) && body.stems.length > 0) {
      const picked = body.stems.filter((s): s is StemKind => s === "instrumental" || s === "acapella");
      if (picked.length > 0) stems = picked;
    }

    const vers = await db
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId))
      .orderBy(asc(trackVersions.createdAt));

    const versionId = typeof body.versionId === "string" && body.versionId.trim() ? body.versionId.trim() : null;
    let source = versionId
      ? vers.find((v) => v.id === versionId)
      : vers.find((v) => v.masterKey && v.kind !== "instrumental" && v.kind !== "acapella") ??
        vers.find((v) => v.masterKey);

    if (!source?.masterKey) {
      reply.code(400);
      return {
        error: "no_suitable_master",
        detail: "Need a version with a master file. Pass versionId or upload a full mix first.",
      };
    }

    let masterBuf: Buffer;
    try {
      masterBuf = await readObject(source.masterKey);
    } catch (e) {
      reply.code(500);
      return { error: "master_read_failed", detail: (e as Error).message };
    }

    const baseFromKey = path.basename(source.masterKey);
    const masterMp3BaseName = baseFromKey.toLowerCase().endsWith(".mp3") ? baseFromKey : `${baseFromKey || "master"}.mp3`;

    try {
      const { created } = await runStemSeparationFromBuffer(app.log, {
        trackId,
        masterMp3: masterBuf,
        masterMp3BaseName,
        primaryVersionKind: source.kind,
        stems,
      });
      return { ok: true, created };
    } catch (e) {
      reply.code(500);
      return { error: "stem_separation_failed", detail: (e as Error).message };
    }
  });

  app.delete<{ Params: { id: string } }>("/tracks/:id", async (request, reply) => {
    const { id } = request.params;
    const [t] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    if (!t) {
      reply.code(404);
      return { error: "not_found" };
    }
    const vers = await db.select().from(trackVersions).where(eq(trackVersions.trackId, id));
    const keys = [
      t.artworkKey,
      ...vers.flatMap((v) => [v.previewKey, v.masterKey]),
    ].filter(Boolean) as string[];
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
      artworkUrl: artworkUrlFromKey(p.artworkKey ?? null),
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
    const ct = request.headers["content-type"] ?? "";

    const [existing] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!existing) {
      reply.code(404);
      return { error: "not_found" };
    }

    if (ct.includes("multipart/form-data")) {
      const mp = await request.parts();
      let title: string | undefined;
      let description: string | undefined;
      let artworkBuf: Buffer | null = null;
      let artworkFilename = "artwork.jpg";
      let removeArtwork = false;

      for await (const part of mp) {
        if (part.type === "field") {
          const v = (part.value as string) ?? "";
          if (part.fieldname === "title") title = v;
          if (part.fieldname === "description") description = v;
          if (part.fieldname === "removeArtwork" && (v === "1" || v === "true")) removeArtwork = true;
        } else if (part.type === "file" && part.fieldname === "artwork") {
          const buf = await part.toBuffer();
          if (buf.length > 0) {
            artworkBuf = buf;
            artworkFilename = part.filename ?? artworkFilename;
          }
        }
      }

      const update: Partial<typeof playlists.$inferInsert> = {};
      if (typeof title === "string") update.title = title;
      if (typeof description === "string") update.description = description || null;

      if (removeArtwork && existing.artworkKey) {
        await deleteObject(existing.artworkKey);
        update.artworkKey = null;
      }
      if (artworkBuf) {
        if (existing.artworkKey) await deleteObject(existing.artworkKey);
        const key = keyFor("artwork", artworkFilename, ".jpg");
        const lower = artworkFilename.toLowerCase();
        const mime =
          lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
        await putObject(key, artworkBuf, mime);
        update.artworkKey = key;
      }

      if (Object.keys(update).length === 0) {
        reply.code(400);
        return { error: "no_fields" };
      }
      await db.update(playlists).set(update).where(eq(playlists.id, id));
      return { ok: true };
    }

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

  app.post<{ Params: { id: string } }>("/playlists/:id/generate-artwork", async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { name?: string; description?: string };
    const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!pl) {
      reply.code(404);
      return { error: "not_found" };
    }
    const name =
      typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : pl.title;
    if (!name.trim()) {
      reply.code(400);
      return { error: "missing_name", need: "Set playlist title or pass { name } in JSON body." };
    }
    const descriptionFromBody =
      typeof body?.description === "string" ? body.description.trim() || null : undefined;
    const description =
      descriptionFromBody !== undefined ? descriptionFromBody : (pl.description?.trim() || null);

    let png: Buffer;
    try {
      const out = await generatePlaylistCoverPng(name, description);
      png = out.buffer;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("OPENAI_API_KEY")) {
        reply.code(503);
        return { error: "openai_not_configured", detail: msg };
      }
      reply.code(502);
      return { error: "openai_image_failed", detail: msg };
    }

    if (pl.artworkKey) await deleteObject(pl.artworkKey);
    const key = keyFor("artwork", `playlist-${id}-ai.png`, ".png");
    await putObject(key, png, "image/png");
    await db.update(playlists).set({ artworkKey: key }).where(eq(playlists.id, id));
    return { artworkUrl: artworkUrlFromKey(key) };
  });

  app.delete<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const { id } = request.params;
    const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!pl) {
      reply.code(404);
      return { error: "not_found" };
    }
    if (pl.artworkKey) await deleteObject(pl.artworkKey);
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
