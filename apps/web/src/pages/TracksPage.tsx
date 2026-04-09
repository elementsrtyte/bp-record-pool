import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrackListItem } from "@bp/shared";
import { TrackTable } from "../components/TrackTable";
import { useShellSearch } from "../components/ShellSearchContext";
import { usePlayer } from "../components/PlayerContext";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

function matchesQuery(t: TrackListItem, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    t.title.toLowerCase().includes(s) ||
    t.artist.toLowerCase().includes(s) ||
    (t.genre?.toLowerCase().includes(s) ?? false)
  );
}

export function TracksPage() {
  const { play } = usePlayer();
  const { query } = useShellSearch();
  const [items, setItems] = useState<TrackListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/tracks`);
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as TrackListItem[];
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError("Could not load tracks.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of items) {
      if (t.genre?.trim()) set.add(t.genre.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (t) =>
          matchesQuery(t, query) &&
          (genreFilter === "all" || (t.genre?.trim() === genreFilter)),
      ),
    [items, query, genreFilter],
  );

  const onPreview = useCallback(
    async (trackId: string, label: string) => {
      const r = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/tracks/${trackId}/preview-url`,
      );
      if (!r.ok) return;
      const j = (await r.json()) as { url: string };
      play(label, j.url);
    },
    [play],
  );

  const onDownload = useCallback(async (trackId: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      window.location.href = "/account";
      return;
    }
    const r = await apiFetch(`/api/downloads/${trackId}`, { method: "POST", token });
    if (r.status === 403) {
      alert("Active subscription required.");
      return;
    }
    if (!r.ok) return;
    const j = (await r.json()) as { url: string };
    window.open(j.url, "_blank");
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">New tracks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Latest additions to the pool.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Genre</span>
            <select
              className="ui-control h-9 min-h-9 py-0 text-xs"
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
            >
              <option value="all">All genres</option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <TrackTable items={filtered} onPreview={onPreview} onDownload={onDownload} />

      {filtered.length === 0 && items.length > 0 ? (
        <p className="text-sm text-muted-foreground">No tracks match your filters.</p>
      ) : null}
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No tracks yet.</p>
      ) : null}
    </div>
  );
}
