import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { PlaylistDetail, TrackListItem } from "@bp/shared";
import { musicalKeyToCamelot } from "@bp/shared";
import { TrackTable } from "../components/TrackTable";
import { useShellSearch } from "../components/ShellSearchContext";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { usePlayer } from "../components/PlayerContext";

function matchesQuery(t: TrackListItem, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    t.title.toLowerCase().includes(s) ||
    t.artist.toLowerCase().includes(s) ||
    (t.genre?.toLowerCase().includes(s) ?? false) ||
    (t.musicalKey?.toLowerCase().includes(s) ?? false) ||
    (musicalKeyToCamelot(t.musicalKey)?.toLowerCase().includes(s) ?? false) ||
    (t.bpm != null && String(t.bpm).includes(s))
  );
}

export function PlaylistPage() {
  const { id } = useParams();
  const { query } = useShellSearch();
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

  const filteredTracks = useMemo(() => {
    if (!playlist) return [];
    return playlist.tracks.filter((t) => matchesQuery(t, query));
  }, [playlist, query]);

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
  if (!playlist) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{playlist.title}</h1>
        {playlist.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{playlist.description}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
        </p>
      </header>

      <TrackTable
        items={filteredTracks}
        onPreview={onPreview}
        onDownload={onDownload}
        numbered
      />

      {playlist.tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">This playlist is empty.</p>
      ) : null}
      {filteredTracks.length === 0 && playlist.tracks.length > 0 ? (
        <p className="text-sm text-muted-foreground">No tracks match your search.</p>
      ) : null}
    </div>
  );
}
