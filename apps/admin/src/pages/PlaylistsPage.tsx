import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

type Row = { id: string; title: string; description: string | null; createdAt: string };

export function PlaylistsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function getToken() {
    let { data: session } = await supabase.auth.getSession();
    let token = session.session?.access_token;
    if (!token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token;
    }
    return token;
  }

  async function load() {
    const token = await getToken();
    if (!token) {
      setError("Sign in required.");
      return;
    }
    const r = await apiFetch("/api/admin/playlists", { token });
    if (!r.ok) {
      setError("Could not load playlists.");
      return;
    }
    setError(null);
    setRows((await r.json()) as Row[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    const token = await getToken();
    if (!token) {
      setError("Sign in required.");
      setBusy(false);
      return;
    }
    const r = await apiFetch("/api/admin/playlists", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setBusy(false);
    if (!r.ok) {
      setError("Create failed.");
      return;
    }
    setNewTitle("");
    void load();
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete playlist "${title}"?`)) return;
    const token = await getToken();
    if (!token) return;
    await apiFetch(`/api/admin/playlists/${id}`, { method: "DELETE", token });
    void load();
  }

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-base">Playlists</h1>
      <form className="flex gap-2" onSubmit={createPlaylist}>
        <input
          className="ui-control flex-1"
          placeholder="New playlist title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" disabled={busy} className="ui-control cursor-pointer bg-secondary text-secondary-foreground text-xs px-3">
          Create
        </button>
      </form>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <Link to={`/playlists/${p.id}`} className="font-medium hover:text-primary">{p.title}</Link>
            <button
              type="button"
              className="ui-control shrink-0 cursor-pointer text-xs text-destructive hover:opacity-90"
              onClick={() => void remove(p.id, p.title)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No playlists yet.</p>
      ) : null}
    </div>
  );
}
