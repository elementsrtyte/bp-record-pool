import type { AuthUser } from "./auth.js";

type ProfileLike = { email: string; role: string };

/**
 * If `ADMIN_EMAIL` is set, only that address (case-insensitive) may use `/api/admin/*`.
 * Otherwise falls back to `profiles.role === "admin"`.
 */
export function isAdminUser(user: AuthUser, profile: ProfileLike): boolean {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const email = (user.email ?? profile.email ?? "").trim().toLowerCase();
  if (configured) {
    return Boolean(email) && email === configured;
  }
  return profile.role === "admin";
}
