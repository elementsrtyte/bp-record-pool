import "./env.js";
import { mkdirSync } from "node:fs";
import path from "node:path";
import fastify from "fastify";
import { logAuthEnvSummary } from "./lib/auth.js";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { getLocalUploadRoot } from "./lib/storage.js";
import { adminRoutes } from "./routes/admin.js";
import { billingRoutes } from "./routes/billing.js";
import { downloadsRoutes } from "./routes/downloads.js";
import { tracksRoutes } from "./routes/tracks.js";
import { playlistsRoutes } from "./routes/playlists.js";
import { stripeWebhookRoutes } from "./routes/stripe-webhook.js";

logAuthEnvSummary();

const port = Number(process.env.PORT ?? 3000);
const uploadRoot = getLocalUploadRoot();
mkdirSync(uploadRoot, { recursive: true });

const app = fastify({ logger: true });

const webOrigin = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
const adminOrigin = process.env.PUBLIC_ADMIN_URL ?? "http://localhost:5174";
const extra = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

await app.register(cors, {
  origin: [webOrigin, adminOrigin, ...extra],
  credentials: true,
});

await app.register(multipart, {
  limits: { fileSize: 80 * 1024 * 1024 },
});

await app.register(staticFiles, {
  root: path.resolve(uploadRoot),
  prefix: "/files/",
  decorateReply: false,
  acceptRanges: false,
});

await app.register(stripeWebhookRoutes, { prefix: "/webhooks" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(tracksRoutes);
await app.register(playlistsRoutes);
await app.register(billingRoutes);
await app.register(downloadsRoutes);

app.get("/health", async () => ({ ok: true }));

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
