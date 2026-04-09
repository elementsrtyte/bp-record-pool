import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { profiles } from "../db/schema.js";
import type { AuthUser } from "./auth.js";

export async function ensureProfile(user: AuthUser) {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (existing[0]) return existing[0];
  const email = user.email ?? `${user.id}@users.invalid`;
  await db.insert(profiles).values({
    id: user.id,
    email,
    role: "member",
  });
  const [row] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  return row!;
}
