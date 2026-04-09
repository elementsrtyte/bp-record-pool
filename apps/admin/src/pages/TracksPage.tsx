import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  genre: string | null;
  createdAt: string;
};

export function TracksPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    let { data: session } = await supabase.auth.getSession();
    let token = session.session?.access_token;
    if (!token) {
      setError("Sign in required.");
      setRows([]);
      return;
    }
    let r = await apiFetch("/api/admin/tracks", { token });
    if (r.status === 401) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token;
      if (token) r = await apiFetch("/api/admin/tracks", { token });
    }
    if (r.status === 401) {
      setError("Unauthorized — check SUPABASE_JWT_SECRET in .env.local.");
      setRows([]);
      return;
    }
    if (r.status === 403) {
      setError("Forbidden — check ADMIN_EMAIL or profiles.role = admin.");
      setRows([]);
      return;
    }
    if (!r.ok) {
      setError("Could not load.");
      return;
    }
    setError(null);
    setRows((await r.json()) as Row[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function removeTrack(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? Files will be removed; this cannot be undone.`)) return;
    let { data: session } = await supabase.auth.getSession();
    let token = session.session?.access_token;
    if (!token) {
      setError("Sign in required.");
      return;
    }
    setDeletingId(id);
    let r: Response | undefined;
    try {
      r = await apiFetch(`/api/admin/tracks/${id}`, { method: "DELETE", token });
      if (r.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
        if (token) r = await apiFetch(`/api/admin/tracks/${id}`, { method: "DELETE", token });
      }
    } finally {
      setDeletingId(null);
    }
    if (!r || !r.ok) {
      setError("Delete failed.");
      return;
    }
    setError(null);
    void load();
  }

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-base">Tracks</h1>
        <button type="button" className="ui-control cursor-pointer text-xs" onClick={load}>
          Refresh
        </button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-muted-foreground">
                {r.artist} · {r.releaseDate}
                {r.genre ? ` · ${r.genre}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="ui-control shrink-0 cursor-pointer text-xs text-destructive hover:opacity-90"
              disabled={deletingId === r.id}
              onClick={() => void removeTrack(r.id, r.title)}
            >
              {deletingId === r.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No tracks yet. Upload one.</p>
      ) : null}
    </div>
  );
}
