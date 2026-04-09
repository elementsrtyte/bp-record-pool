import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrackListItem } from "@bp/shared";
import { musicalKeyToCamelot } from "@bp/shared";
import { TrackTable } from "../components/TrackTable";
import { useShellSearch } from "../components/ShellSearchContext";
import { usePlayer } from "../components/PlayerContext";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 25;

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

type TracksListResponse = {
  tracks: TrackListItem[];
  total: number;
  limit: number;
  offset: number;
};

export function TracksPage() {
  const { play } = usePlayer();
  const { query } = useShellSearch();
  const [items, setItems] = useState<TrackListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string>("all");

  useEffect(() => {
    setPage(1);
  }, [query, genreFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const offset = (page - 1) * PAGE_SIZE;
        const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
        const r = await fetch(`${base}/api/tracks?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as TracksListResponse;
        if (!Array.isArray(body.tracks)) throw new Error("invalid_response");
        const data = body.tracks.map((t) => ({
          ...t,
          versions: Array.isArray(t.versions) ? t.versions : [],
          defaultVersionId: t.defaultVersionId ?? null,
        }));
        if (!cancelled) {
          setItems(data);
          setTotal(typeof body.total === "number" ? body.total : data.length);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load tracks.");
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

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
          (genreFilter === "all" || t.genre?.trim() === genreFilter),
      ),
    [items, query, genreFilter],
  );

  const tracksMissingVersions = useMemo(
    () => items.filter((t) => (t.versions?.length ?? 0) === 0).length,
    [items],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const onPreview = useCallback(
    async (trackId: string, versionId: string | null, label: string) => {
      const q =
        versionId != null && versionId.length > 0
          ? `?versionId=${encodeURIComponent(versionId)}`
          : "";
      const r = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/tracks/${trackId}/preview-url${q}`,
      );
      if (!r.ok) return;
      const j = (await r.json()) as { url: string };
      play(label, j.url, trackId, versionId);
    },
    [play],
  );

  const onDownload = useCallback(async (trackId: string, versionId: string | null) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      window.location.href = "/account";
      return;
    }
    const q =
      versionId != null && versionId.length > 0
        ? `?versionId=${encodeURIComponent(versionId)}`
        : "";
    const r = await apiFetch(`/api/downloads/${trackId}${q}`, { method: "POST", token });
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

      {tracksMissingVersions > 0 ? (
        <div
          className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2 text-sm text-foreground dark:border-amber-400/40 dark:bg-amber-400/10"
          role="status"
        >
          <strong className="tabular-nums">{tracksMissingVersions}</strong> track
          {tracksMissingVersions === 1 ? "" : "s"} in this list have{" "}
          <strong>no audio versions</strong> stored, so previews and downloads cannot run. This often happens if{" "}
          <code className="rounded bg-muted px-1 py-px text-xs">track_versions</code> was never populated—for
          example after <code className="rounded bg-muted px-1 py-px text-xs">db:push</code> removed{" "}
          <code className="rounded bg-muted px-1 py-px text-xs">master_key</code> from{" "}
          <code className="rounded bg-muted px-1 py-px text-xs">tracks</code> without running{" "}
          <code className="rounded bg-muted px-1 py-px text-xs">pnpm migrate-track-versions</code> first. If the
          old columns are already gone, restore the database from a backup or re-upload those tracks.
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <TrackTable items={filtered} onPreview={onPreview} onDownload={onDownload} />
      )}

      {total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs tabular-nums text-muted-foreground">
            {rangeStart === 0 ? (
              "No tracks"
            ) : (
              <>
                <span className="text-foreground">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of <span className="text-foreground">{total}</span>
              </>
            )}
            {loading ? <span className="ml-2 italic">Loading…</span> : null}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="ui-control h-9 cursor-pointer px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="min-w-[5rem] text-center text-xs tabular-nums text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="ui-control h-9 cursor-pointer px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 && items.length > 0 ? (
        <p className="text-sm text-muted-foreground">No tracks match your filters.</p>
      ) : null}
      {!loading && items.length === 0 && total === 0 ? (
        <p className="text-sm text-muted-foreground">No tracks yet.</p>
      ) : null}
    </div>
  );
}
