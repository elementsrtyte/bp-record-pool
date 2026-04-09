import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import { verifySupabaseJwt, getBearer } from "../lib/auth.js";
import { ensureProfile } from "../lib/profile.js";
import { db } from "../db/client.js";
import { profiles } from "../db/schema.js";
import { eq } from "drizzle-orm";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const webUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";

function stripe(): Stripe | null {
  if (!stripeSecret) return null;
  return new Stripe(stripeSecret);
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/billing/checkout-session", async (request, reply) => {
    const user = await verifySupabaseJwt(getBearer(request));
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }
    const s = stripe();
    if (!s || !priceId) {
      reply.code(503);
      return { error: "stripe_not_configured" };
    }
    const profile = await ensureProfile(user);
    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const customer = await s.customers.create({
        email: profile.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await db
        .update(profiles)
        .set({ stripeCustomerId: customerId })
        .where(eq(profiles.id, profile.id));
    }
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webUrl}/account?checkout=success`,
      cancel_url: `${webUrl}/account?checkout=cancel`,
      client_reference_id: user.id,
    });
    return { url: session.url };
  });

  app.post("/api/billing/portal-session", async (request, reply) => {
    const user = await verifySupabaseJwt(getBearer(request));
    if (!user) {
      reply.code(401);
      return { error: "unauthorized" };
    }
    const s = stripe();
    if (!s) {
      reply.code(503);
      return { error: "stripe_not_configured" };
    }
    const profile = await ensureProfile(user);
    if (!profile.stripeCustomerId) {
      reply.code(400);
      return { error: "no_customer" };
    }
    const session = await s.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${webUrl}/account`,
    });
    return { url: session.url };
  });
};
