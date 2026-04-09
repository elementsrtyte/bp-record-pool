import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { verifySupabaseJwt, getBearer } from "../lib/auth.js";
import { ensureProfile } from "../lib/profile.js";
import { db } from "../db/client.js";
import { subscriptions, tracks } from "../db/schema.js";
import { signedGetUrl } from "../lib/storage.js";

function isActiveStatus(status: string | null | undefined) {
  if (!status) return false;
  return status === "active" || status === "trialing";
}

export const downloadsRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { trackId: string } }>(
    "/api/downloads/:trackId",
    async (request, reply) => {
      const user = await verifySupabaseJwt(getBearer(request));
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      await ensureProfile(user);
      const subs = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id));
      const ok = subs.some((s) => isActiveStatus(s.status));
      if (!ok) {
        reply.code(403);
        return { error: "subscription_required" };
      }

      const { trackId } = request.params;
      const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
      if (!track?.isDownloadable || !track.masterKey) {
        reply.code(404);
        return { error: "not_found" };
      }
      const url = await signedGetUrl(track.masterKey, 600);
      return { url, filename: `${track.title}.bin` };
    },
  );
};
