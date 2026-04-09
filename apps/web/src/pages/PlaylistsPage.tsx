import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlaylistListItem } from "@bp/shared";

export function PlaylistsPage() {
  const [items, setItems] = useState<PlaylistListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/playlists`);
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as PlaylistListItem[];
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError("Could not load playlists.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-balance">Playlists</h1>
        <p className="mt-2 text-sm text-muted-foreground">Curated collections.</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              to={`/playlists/${p.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-sm font-medium group-hover:text-primary">{p.title}</div>
                {p.description ? (
                  <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No playlists yet.</p>
      ) : null}
    </div>
  );
}
