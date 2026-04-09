import { useEffect, useState } from "react";
import type { TrackListItem } from "@bp/shared";
import { usePlayer } from "../components/PlayerContext";

export function TracksPage() {
  const { play } = usePlayer();
  const [items, setItems] = useState<TrackListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function preview(trackId: string, label: string) {
    const r = await fetch(
      `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/tracks/${trackId}/preview-url`,
    );
    if (!r.ok) return;
    const j = (await r.json()) as { url: string };
    play(label, j.url);
  }

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

  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-balance">New tracks</h1>
        <p className="mt-2 text-sm text-muted-foreground">Latest additions to the pool.</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-2 px-4 py-3">
            {t.previewable ? (
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs hover:bg-muted"
                onClick={() => preview(t.id, `${t.title} — ${t.artist}`)}
                aria-label={`Preview ${t.title}`}
              >
                &#9654;
              </button>
            ) : (
              <div className="h-8 w-8 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
            </div>
            {t.genre ? (
              <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
                {t.genre}
              </span>
            ) : null}
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
              {t.releaseDate}
            </span>
          </li>
        ))}
      </ul>
      {items.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No tracks yet.</p>
      ) : null}
    </div>
  );
}
