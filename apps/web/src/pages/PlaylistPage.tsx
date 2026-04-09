import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PlaylistDetail } from "@bp/shared";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { usePlayer } from "../components/PlayerContext";

export function PlaylistPage() {
  const { id } = useParams();
  const { play } = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/playlists/${id}`,
        );
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as PlaylistDetail;
        if (!cancelled) setPlaylist(data);
      } catch {
        if (!cancelled) setError("Could not load playlist.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function preview(trackId: string, label: string) {
    const r = await fetch(
      `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/tracks/${trackId}/preview-url`,
    );
    if (!r.ok) return;
    const j = (await r.json()) as { url: string };
    play(label, j.url);
  }

  async function download(trackId: string) {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      window.location.href = "/account";
      return;
    }
    const r = await apiFetch(`/api/downloads/${trackId}`, {
      method: "POST",
      token,
    });
    if (r.status === 403) {
      alert("Active subscription required.");
      return;
    }
    if (!r.ok) return;
    const j = (await r.json()) as { url: string };
    window.open(j.url, "_blank");
  }

  if (error) return <p className="text-destructive">{error}</p>;
  if (!playlist) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-balance">{playlist.title}</h1>
        {playlist.description ? (
          <p className="mt-2 text-muted-foreground">{playlist.description}</p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
        </p>
      </header>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {playlist.tracks.map((t, i) => (
          <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
            {t.previewable ? (
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] hover:bg-muted"
                onClick={() => preview(t.id, `${t.title} — ${t.artist}`)}
                aria-label={`Preview ${t.title}`}
              >
                &#9654;
              </button>
            ) : (
              <div className="h-7 w-7 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="truncate font-medium">{t.title}</div>
              <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
            </div>
            {t.genre ? (
              <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
                {t.genre}
              </span>
            ) : null}
            <button
              type="button"
              className="hidden shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 sm:inline-block"
              onClick={() => download(t.id)}
            >
              Download
            </button>
          </li>
        ))}
      </ul>
      {playlist.tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">This playlist is empty.</p>
      ) : null}
    </div>
  );
}
