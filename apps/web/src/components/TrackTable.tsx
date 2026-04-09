import type { TrackListItem } from "@bp/shared";
import { musicalKeyToCamelot } from "@bp/shared";

export type TrackTableProps = {
  items: TrackListItem[];
  onPreview: (trackId: string, label: string) => void;
  onDownload?: (trackId: string) => void;
  /** If true, show row index in first column */
  numbered?: boolean;
};

function formatAdded(isoDate: string): string {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export function TrackTable({ items, onPreview, onDownload, numbered }: TrackTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {numbered ? <th className="w-10 px-3 py-2.5 font-medium">#</th> : null}
            <th className="w-12 px-1 py-2.5 font-medium" aria-label="Preview" />
            <th className="min-w-[200px] px-3 py-2.5 font-medium">Title</th>
            <th className="hidden w-16 px-2 py-2.5 font-medium lg:table-cell">BPM</th>
            <th className="hidden w-20 px-2 py-2.5 font-medium xl:table-cell">Camelot</th>
            <th className="hidden w-28 px-2 py-2.5 font-medium sm:table-cell">Genre</th>
            <th className="w-28 px-2 py-2.5 font-medium">Download</th>
            <th className="hidden w-24 shrink-0 px-3 py-2.5 text-right font-medium sm:table-cell">Added</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t, i) => {
            const camelot = musicalKeyToCamelot(t.musicalKey);
            return (
              <tr
                key={t.id}
                className="border-b border-border/80 transition-colors hover:bg-muted/20"
              >
                {numbered ? (
                  <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">{i + 1}</td>
                ) : null}
                <td className="px-1 py-2">
                  {t.previewable ? (
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-[10px] text-foreground hover:border-primary hover:text-primary"
                      onClick={() => onPreview(t.id, `${t.title} — ${t.artist}`)}
                      aria-label={`Play preview: ${t.title}`}
                    >
                      &#9654;
                    </button>
                  ) : (
                    <div className="h-8 w-8" />
                  )}
                </td>
                <td className="max-w-0 px-3 py-2">
                  <div className="flex items-center gap-3">
                    {t.artworkUrl ? (
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                        <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded border border-border bg-muted" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{t.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-2 py-2 tabular-nums text-xs text-muted-foreground lg:table-cell">
                  {t.bpm != null ? t.bpm : "—"}
                </td>
                <td className="hidden max-w-[5rem] truncate px-2 py-2 text-xs tabular-nums text-muted-foreground xl:table-cell">
                  {camelot ? (
                    <span title={t.musicalKey ?? camelot} className="font-medium text-foreground">
                      {camelot}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="hidden max-w-[7rem] truncate px-2 py-2 text-xs sm:table-cell">
                  {t.genre ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {t.genre}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {onDownload ? (
                    <button
                      type="button"
                      onClick={() => onDownload(t.id)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground hover:border-primary hover:text-primary"
                    >
                      MP3
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="hidden px-3 py-2 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                  {formatAdded(t.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
