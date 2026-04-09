import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";

/** Trim and strip one layer of ASCII quotes (common .env copy-paste mistake). */
function trimEnv(value: string | undefined): string | undefined {
  let s = value?.trim();
  if (!s) return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s || undefined;
}

function supabaseUrl(): string | undefined {
  const u = trimEnv(process.env.SUPABASE_URL);
  return u ? u.replace(/\/$/, "") : undefined;
}

function serviceRoleKey(): string | undefined {
  return trimEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SERVICE_ROLE_KEY,
  );
}

function jwtSecret(): string | undefined {
  return trimEnv(process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET);
}

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const base = supabaseUrl();
  if (!base) return null;
  const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", base);
  if (!jwks) jwks = createRemoteJWKSet(jwksUrl);
  return jwks;
}

export type AuthUser = { id: string; email: string | null };

function payloadToUser(payload: import("jose").JWTPayload): AuthUser | null {
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) return null;
  const email =
    typeof payload.email === "string"
      ? payload.email
      : typeof (payload as { user_metadata?: { email?: string } }).user_metadata?.email ===
          "string"
        ? (payload as { user_metadata: { email: string } }).user_metadata.email
        : null;
  return { id: sub, email };
}

/**
 * Verifies Supabase user access tokens (Bearer).
 *
 * **Local Supabase:** user sessions are **HS256** signed with **`JWT_SECRET`** from
 * `supabase status -o env` → put in **`SUPABASE_JWT_SECRET`** (or `JWT_SECRET`). This runs **first**
 * so admin works even when **`auth.getUser` + `sb_secret_…` keys misbehaves**.
 *
 * Then **`auth.getUser`** with service_role / secret key, then JWKS.
 */
export async function verifySupabaseJwt(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token?.startsWith("Bearer ")) return null;
  const raw = token.slice("Bearer ".length).trim();
  if (!raw) return null;

  const secret = jwtSecret();
  if (secret) {
    try {
      const { payload: p } = await jwtVerify(raw, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
      });
      const user = payloadToUser(p);
      if (user) return user;
    } catch {
      /* try other methods */
    }
  }

  const admin = getAdminClient();
  if (admin) {
    const { data, error } = await admin.auth.getUser(raw);
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email ?? null };
    }
  }

  const ks = getJwks();
  if (ks) {
    try {
      const { payload: p } = await jwtVerify(raw, ks);
      return payloadToUser(p);
    } catch {
      return null;
    }
  }

  return null;
}

export function getBearer(request: FastifyRequest): string | undefined {
  const h = request.headers.authorization;
  return typeof h === "string" ? h : undefined;
}

/** Dev-only diagnostics: call after env is loaded. */
export function logAuthEnvSummary() {
  if (process.env.NODE_ENV === "production") return;
  const url = supabaseUrl();
  const sr = serviceRoleKey();
  const jwt = jwtSecret();
  console.log(
    "[api] Auth env:",
    "SUPABASE_URL=",
    url ? "set" : "MISSING",
    "| service key=",
    sr ? `set (len=${sr.length}, prefix=${sr.slice(0, 12)}…)` : "missing",
    "| JWT secret (SUPABASE_JWT_SECRET or JWT_SECRET)=",
    jwt ? `set (len=${jwt.length})` : "MISSING — add from: supabase status -o env",
  );
}
