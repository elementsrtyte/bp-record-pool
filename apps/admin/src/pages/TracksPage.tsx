import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  trackVersionDisplayLabel,
  trackWorkKindDisplayLabel,
  type TrackVersionKind,
  type TrackWorkKind,
} from "@bp/shared";
import { apiFetch, apiUrl } from "../lib/api";
import { usePlayer } from "../components/PlayerContext";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  genre: string | null;
  workKind?: TrackWorkKind;
  isDownloadable?: boolean;
  createdAt: string;
  artworkUrl: string | null;
  defaultVersionId: string | null;
  versions?: { id: string; kind: string; hasMaster: boolean; hasPreview: boolean }[];
};

function formatAdded(isoDate: string): string {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export function TracksPage() {
  const { play } = usePlayer();
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
    const data = (await r.json()) as Row[];
    setRows(
      data.map((x) => ({
        ...x,
        workKind: x.workKind ?? "original",
        artworkUrl: x.artworkUrl ?? null,
        defaultVersionId: x.defaultVersionId ?? null,
        versions: Array.isArray(x.versions) ? x.versions : [],
      })),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const playPreview = useCallback(
    async (r: Row) => {
      const withPreview = r.versions?.find((v) => v.hasPreview);
      const versionId = withPreview?.id ?? r.defaultVersionId ?? null;
      const q =
        versionId != null && versionId.length > 0
          ? `?versionId=${encodeURIComponent(versionId)}`
          : "";
      try {
        const res = await fetch(apiUrl(`/api/tracks/${r.id}/preview-url${q}`));
        if (!res.ok) return;
        const j = (await res.json()) as { url?: string };
        if (!j.url) return;
        const kindLabel = withPreview
          ? trackVersionDisplayLabel(withPreview.kind as TrackVersionKind)
          : "Mix";
        play(`${r.artist} – ${r.title} · ${kindLabel}`, j.url, r.id, versionId);
      } catch {
        /* ignore */
      }
    },
    [play],
  );

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

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="min-w-[min(100%,22rem)] px-3 py-2.5 font-medium md:min-w-[28rem]" scope="col">
                Track
              </th>
              <th className="hidden min-w-[6rem] max-w-[10rem] px-2 py-2.5 font-medium sm:table-cell" scope="col">
                Genre
              </th>
              <th className="hidden whitespace-nowrap px-2 py-2.5 font-medium md:table-cell" scope="col">
                Type
              </th>
              <th className="min-w-[7rem] px-2 py-2.5 font-medium" scope="col">
                Versions
              </th>
              <th className="hidden whitespace-nowrap px-2 py-2.5 font-medium sm:table-cell" scope="col">
                DL
              </th>
              <th className="hidden whitespace-nowrap px-3 py-2.5 text-right font-medium sm:table-cell" scope="col">
                Added
              </th>
              <th className="w-px whitespace-nowrap px-2 py-2.5 text-right font-medium" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vers = r.versions ?? [];
              const canPreview = vers.some((v) => v.hasPreview && v.hasMaster);
              const previewVersionId =
                vers.find((v) => v.hasPreview)?.id ?? r.defaultVersionId ?? null;

              return (
                <tr
                  key={r.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/20"
                >
                  <td className="max-w-0 overflow-hidden px-3 py-2 align-top">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex min-h-10 w-12 shrink-0 items-center justify-center sm:w-14">
                        {canPreview && previewVersionId ? (
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] text-foreground hover:border-primary hover:text-primary"
                            onClick={() => void playPreview(r)}
                            aria-label={`Open preview: ${r.title}`}
                          >
                            &#9654;
                          </button>
                        ) : vers.length === 0 ? (
                          <span
                            className="max-w-[4rem] text-center text-[10px] leading-tight text-muted-foreground"
                            title="No versions"
                          >
                            No audio
                          </span>
                        ) : (
                          <div className="h-8 w-8 shrink-0" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {r.artworkUrl ? (
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                            <img src={r.artworkUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded border border-border bg-muted" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{r.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{r.artist}</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden max-w-[7rem] truncate px-2 py-2 align-top text-xs sm:table-cell">
                    {r.genre ? (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {r.genre}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-2 py-2 align-top text-xs md:table-cell">
                    <span
                      className={
                        r.workKind === "remix"
                          ? "font-medium text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      {trackWorkKindDisplayLabel(r.workKind ?? "original")}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    {vers.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex max-w-[10rem] flex-wrap gap-1">
                        {vers.map((v) => {
                          const verLabel = trackVersionDisplayLabel(v.kind as TrackVersionKind);
                          return (
                            <span
                              key={v.id}
                              className="inline-flex max-w-full items-center rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium leading-tight text-muted-foreground"
                              title={verLabel}
                            >
                              <span className="truncate">{verLabel}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-2 py-2 align-top text-xs sm:table-cell">
                    {r.isDownloadable === false ? (
                      <span className="text-muted-foreground">Off</span>
                    ) : (
                      <span className="text-muted-foreground">On</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 align-top text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                    {formatAdded(r.createdAt)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        to={`/tracks/${r.id}`}
                        className="ui-control inline-flex h-8 cursor-pointer items-center justify-center rounded px-2.5 text-xs hover:bg-muted/50"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="ui-control inline-flex h-8 cursor-pointer items-center justify-center rounded px-2.5 text-xs text-destructive hover:opacity-90 disabled:opacity-50"
                        disabled={deletingId === r.id}
                        onClick={() => void removeTrack(r.id, r.title)}
                      >
                        {deletingId === r.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No tracks yet. Upload one.</p>
      ) : null}
    </div>
  );
}
