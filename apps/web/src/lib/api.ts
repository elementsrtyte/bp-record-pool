const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function apiUrl(path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const { token, headers, ...rest } = options;
  const h = new Headers(headers);
  if (token) h.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(path), { ...rest, headers: h });
}
