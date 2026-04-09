import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { profiles, subscriptions } from "../db/schema.js";

const secret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeKey = process.env.STRIPE_SECRET_KEY;

function stripe(): Stripe | null {
  if (!stripeKey) return null;
  return new Stripe(stripeKey);
}

async function resolveCustomerUserId(
  customerId: string,
): Promise<{ userId: string } | null> {
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.stripeCustomerId, customerId))
    .limit(1);
  if (row) return { userId: row.id };
  return null;
}

/** Register with `{ prefix: '/webhooks' }` — owns JSON body as raw Buffer for signature verify. */
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    function (_req, body, done) {
      done(null, body);
    },
  );

  app.post("/stripe", async (request, reply) => {
    if (!secret || !stripe()) {
      reply.code(503);
      return { error: "stripe_not_configured" };
    }
    const sig = request.headers["stripe-signature"];
    if (typeof sig !== "string") {
      reply.code(400);
      return { error: "missing_signature" };
    }
    const rawBody = request.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      reply.code(400);
      return { error: "bad_body" };
    }
    let event: Stripe.Event;
    try {
      event = stripe()!.webhooks.constructEvent(rawBody, sig, secret);
    } catch {
      reply.code(400);
      return { error: "invalid_signature" };
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          if (!customerId) break;
          const resolved = await resolveCustomerUserId(customerId);
          if (!resolved) break;
          const status = sub.status;
          const currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null;
          const existing = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, sub.id))
            .limit(1);
          if (existing[0]) {
            await db
              .update(subscriptions)
              .set({
                status,
                currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, existing[0].id));
          } else if (event.type !== "customer.subscription.deleted") {
            await db.insert(subscriptions).values({
              userId: resolved.userId,
              stripeSubscriptionId: sub.id,
              status,
              currentPeriodEnd,
              cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            });
          }
          break;
        }
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.client_reference_id;
          if (uid && typeof uid === "string" && session.customer) {
            const c =
              typeof session.customer === "string"
                ? session.customer
                : session.customer.id;
            await db
              .update(profiles)
              .set({ stripeCustomerId: c })
              .where(eq(profiles.id, uid));
          }
          break;
        }
        default:
          break;
      }
    } catch (e) {
      request.log.error(e);
      reply.code(500);
      return { error: "handler_failed" };
    }
    return { received: true };
  });
};
