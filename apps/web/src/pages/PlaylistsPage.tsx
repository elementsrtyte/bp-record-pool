import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PlaylistListItem } from "@bp/shared";
import { useShellSearch } from "../components/ShellSearchContext";

export function PlaylistsPage() {
  const { query } = useShellSearch();
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

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const s = query.toLowerCase();
    return items.filter(
      (p) =>
        p.title.toLowerCase().includes(s) ||
        (p.description?.toLowerCase().includes(s) ?? false),
    );
  }, [items, query]);

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Playlists</h1>
        <p className="mt-1 text-sm text-muted-foreground">Curated collections.</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {filtered.map((p) => (
          <li key={p.id}>
            <Link
              to={`/playlists/${p.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition hover:bg-muted/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border bg-muted text-lg text-muted-foreground group-hover:border-primary/40">
                ♪
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="truncate font-medium text-foreground group-hover:text-primary">{p.title}</div>
                {p.description ? (
                  <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                ) : null}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && items.length > 0 ? (
        <p className="text-sm text-muted-foreground">No playlists match your search.</p>
      ) : null}
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No playlists yet.</p>
      ) : null}
    </div>
  );
}
