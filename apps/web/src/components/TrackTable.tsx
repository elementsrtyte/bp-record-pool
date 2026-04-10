import type { TrackListItem, TrackVersionSummary } from "@bp/shared";
import { musicalKeyToCamelot, trackVersionDisplayLabel, trackWorkKindDisplayLabel } from "@bp/shared";
import { usePlayer } from "./PlayerContext";

export type TrackTableProps = {
  items: TrackListItem[];
  onPreview: (trackId: string, versionId: string | null, label: string) => void;
  onDownload?: (trackId: string, versionId: string | null) => void;
  numbered?: boolean;
};

function formatAdded(isoDate: string): string {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function defaultVersionForTrack(t: TrackListItem, vers: TrackVersionSummary[]): TrackVersionSummary | null {
  if (vers.length === 0) return null;
  if (t.defaultVersionId) {
    return vers.find((v) => v.id === t.defaultVersionId) ?? vers[0] ?? null;
  }
  return vers[0] ?? null;
}

function TrackRow({
  t,
  trackIndex,
  numbered,
  onPreview,
  onDownload,
}: {
  t: TrackListItem;
  trackIndex: number;
  numbered: boolean | undefined;
  onPreview: TrackTableProps["onPreview"];
  onDownload?: TrackTableProps["onDownload"];
}) {
  const vers = Array.isArray(t.versions) ? t.versions : [];
  const camelot = musicalKeyToCamelot(t.musicalKey);
  const defaultV = defaultVersionForTrack(t, vers);
  const previewVersionId = defaultV?.previewable ? defaultV.id : null;
  const previewLabel = defaultV
    ? `${t.title} — ${t.artist} (${trackVersionDisplayLabel(defaultV.kind)})`
    : `${t.title} — ${t.artist}`;
  const singleVersion = vers.length === 1 ? vers[0]! : null;
  const singleVersionDownloadLabel = singleVersion ? trackVersionDisplayLabel(singleVersion.kind) : null;
  const { activeTrackId, activeVersionId, isPlaying, togglePlayPause } = usePlayer();
  const isActivePreview =
    Boolean(previewVersionId) &&
    activeTrackId === t.id &&
    (activeVersionId ?? null) === (previewVersionId ?? null);
  const showPauseOnRow = isActivePreview && isPlaying;

  return (
    <tbody className="[&>tr]:border-b [&>tr]:border-border/80">
      <tr className="transition-colors hover:bg-muted/20">
        {numbered ? (
          <td className="px-3 py-2 align-top tabular-nums text-xs text-muted-foreground">{trackIndex + 1}</td>
        ) : null}
        <td className="max-w-0 overflow-hidden px-3 py-2 align-top">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-h-10 w-12 shrink-0 items-center justify-center sm:w-14">
              {previewVersionId ? (
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] text-foreground hover:border-primary hover:text-primary"
                  onClick={() =>
                    isActivePreview ? togglePlayPause() : onPreview(t.id, previewVersionId, previewLabel)
                  }
                  aria-label={showPauseOnRow ? `Pause preview: ${t.title}` : `Play preview: ${t.title}`}
                >
                  {showPauseOnRow ? "\u23F8" : "\u25B6"}
                </button>
              ) : vers.length === 0 ? (
                <span
                  className="max-w-[5rem] text-center text-[10px] leading-tight text-muted-foreground"
                  title="No audio versions in the database for this track"
                >
                  No audio
                </span>
              ) : (
                <div className="h-8 w-8 shrink-0" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {t.artworkUrl ? (
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                  <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-10 w-10 shrink-0 rounded border border-border bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 truncate font-medium text-foreground">{t.title}</span>
                  {t.workKind === "remix" ? (
                    <span className="shrink-0 rounded border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {trackWorkKindDisplayLabel("remix")}
                    </span>
                  ) : null}
                  {singleVersion && singleVersion.kind !== "standard" ? (
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {trackVersionDisplayLabel(singleVersion.kind)}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
              </div>
            </div>
          </div>
        </td>
        <td className="hidden px-2 py-2 align-top tabular-nums text-xs text-muted-foreground lg:table-cell">
          {t.bpm != null ? t.bpm : "—"}
        </td>
        <td className="hidden max-w-[5rem] truncate px-2 py-2 align-top text-xs tabular-nums text-muted-foreground xl:table-cell">
          {camelot ? (
            <span title={t.musicalKey ?? camelot} className="font-medium text-foreground">
              {camelot}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="hidden max-w-[7rem] truncate px-2 py-2 align-top text-xs sm:table-cell">
          {t.genre ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t.genre}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-2 py-2 align-top">
          {vers.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : vers.length === 1 && singleVersion ? (
            onDownload && singleVersion.downloadable ? (
              <button
                type="button"
                onClick={() => onDownload(t.id, singleVersion.id)}
                className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium leading-tight text-foreground transition-colors hover:border-primary hover:text-primary"
                title={`Download ${singleVersionDownloadLabel}`}
                aria-label={`Download ${singleVersionDownloadLabel}`}
              >
                <span className="truncate">{singleVersionDownloadLabel}</span>
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )
          ) : (
            <div className="flex max-w-[13rem] flex-wrap gap-1" aria-label="Download by version">
              {vers.map((v) => {
                const verLabel = trackVersionDisplayLabel(v.kind);
                if (onDownload && v.downloadable) {
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onDownload(t.id, v.id)}
                      className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-medium leading-tight text-foreground transition-colors hover:border-primary hover:text-primary"
                      title={`Download ${verLabel}`}
                      aria-label={`Download ${verLabel}`}
                    >
                      <span className="truncate">{verLabel}</span>
                    </button>
                  );
                }
                return (
                  <span
                    key={v.id}
                    className="inline-flex max-w-full items-center rounded-full border border-dashed border-border px-2 py-1 text-[9px] font-medium leading-tight text-muted-foreground"
                    title="Not available for download"
                  >
                    <span className="truncate">{verLabel}</span>
                  </span>
                );
              })}
            </div>
          )}
        </td>
        <td className="hidden px-3 py-2 align-top text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
          {formatAdded(t.createdAt)}
        </td>
      </tr>
    </tbody>
  );
}

export function TrackTable({ items, onPreview, onDownload, numbered }: TrackTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {numbered ? <th className="w-10 px-3 py-2.5 font-medium">#</th> : null}
            <th className="w-[40%] min-w-0 px-3 py-2.5 font-medium" scope="col">
              Track
            </th>
            <th className="hidden w-16 px-2 py-2.5 font-medium lg:table-cell">BPM</th>
            <th className="hidden w-20 px-2 py-2.5 font-medium xl:table-cell">Camelot</th>
            <th className="hidden w-28 px-2 py-2.5 font-medium sm:table-cell">Genre</th>
            <th className="w-28 px-2 py-2.5 font-medium">Download</th>
            <th className="hidden w-24 shrink-0 px-3 py-2.5 text-right font-medium sm:table-cell">Added</th>
          </tr>
        </thead>
        {items.map((t, trackIndex) => (
          <TrackRow
            key={t.id}
            t={t}
            trackIndex={trackIndex}
            numbered={numbered}
            onPreview={onPreview}
            onDownload={onDownload}
          />
        ))}
      </table>
    </div>
  );
}
