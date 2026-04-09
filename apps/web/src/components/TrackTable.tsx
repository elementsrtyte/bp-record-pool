import { useCallback, useState } from "react";
import type { TrackListItem, TrackVersionSummary } from "@bp/shared";
import { musicalKeyToCamelot, trackVersionDisplayLabel } from "@bp/shared";

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

function VersionExpandedRow({
  t,
  v,
  onPreview,
  onDownload,
}: {
  t: TrackListItem;
  v: TrackVersionSummary;
  onPreview: TrackTableProps["onPreview"];
  onDownload?: TrackTableProps["onDownload"];
}) {
  const camelot = musicalKeyToCamelot(t.musicalKey);
  const labelKind = trackVersionDisplayLabel(v.kind);
  const label = `${t.title} — ${t.artist} (${labelKind})`;

  return (
    <div className="border-b border-border/50 py-2.5 pl-4 last:border-b-0 sm:py-2 sm:pl-3">
      <div className="space-y-2 sm:hidden">
        <div className="flex items-center gap-2">
          {v.previewable ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[9px] text-foreground hover:border-primary hover:text-primary"
              onClick={() => onPreview(t.id, v.id, label)}
              aria-label={`Play preview: ${t.title} (${labelKind})`}
            >
              &#9654;
            </button>
          ) : (
            <div className="h-7 w-7 shrink-0" />
          )}
          <span className="text-xs font-medium text-foreground">{labelKind}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-9 text-[10px] text-muted-foreground">
          <span>BPM {t.bpm ?? "—"}</span>
          <span>{camelot ?? t.musicalKey ?? "—"}</span>
          {t.genre ? <span>{t.genre}</span> : null}
          <span>{formatAdded(t.createdAt)}</span>
          {onDownload && v.downloadable ? (
            <button
              type="button"
              onClick={() => onDownload(t.id, v.id)}
              className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase text-foreground"
            >
              MP3
            </button>
          ) : null}
        </div>
      </div>

      <div className="hidden sm:grid sm:grid-cols-[2rem,minmax(0,1fr),3rem,3.5rem,5.5rem,auto,4.5rem] sm:items-center sm:gap-x-2">
        <span aria-hidden className="block w-2 shrink-0" />
        <div className="flex min-w-0 items-center gap-2">
          {v.previewable ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[9px] text-foreground hover:border-primary hover:text-primary"
              onClick={() => onPreview(t.id, v.id, label)}
              aria-label={`Play preview: ${t.title} (${labelKind})`}
            >
              &#9654;
            </button>
          ) : (
            <div className="h-7 w-7 shrink-0" />
          )}
          <span className="truncate text-xs font-medium text-foreground">{labelKind}</span>
        </div>
        <div className="text-right tabular-nums text-xs text-muted-foreground">{t.bpm ?? "—"}</div>
        <div className="truncate text-xs tabular-nums text-muted-foreground">
          {camelot ? (
            <span title={t.musicalKey ?? camelot} className="font-medium text-foreground">
              {camelot}
            </span>
          ) : (
            "—"
          )}
        </div>
        <div className="truncate">
          {t.genre ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t.genre}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <div>
          {onDownload && v.downloadable ? (
            <button
              type="button"
              onClick={() => onDownload(t.id, v.id)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground hover:border-primary hover:text-primary"
            >
              MP3
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <div className="text-right text-xs tabular-nums text-muted-foreground">{formatAdded(t.createdAt)}</div>
      </div>
    </div>
  );
}

function MultiVersionAccordion({
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
  const vers = t.versions;
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const camelot = musicalKeyToCamelot(t.musicalKey);
  const defaultV = vers[0];
  const versionIdForApi = defaultV?.id ?? t.defaultVersionId;
  const canPreviewParent = defaultV?.previewable ?? t.previewable;
  const colSpan = numbered ? 7 : 6;
  const parentPreviewLabel = defaultV
    ? `${t.title} — ${t.artist} (${trackVersionDisplayLabel(defaultV.kind)})`
    : `${t.title} — ${t.artist}`;

  return (
    <tbody className="[&>tr]:border-b [&>tr]:border-border/80">
      <tr className="transition-colors hover:bg-muted/15">
        {numbered ? (
          <td className="px-3 py-2 align-top tabular-nums text-xs text-muted-foreground">{trackIndex + 1}</td>
        ) : null}
        <td className="max-w-0 overflow-hidden px-3 py-2 align-top">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-h-10 w-12 shrink-0 items-center justify-center sm:w-14">
              {canPreviewParent && versionIdForApi ? (
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] text-foreground hover:border-primary hover:text-primary"
                  onClick={() => onPreview(t.id, versionIdForApi, parentPreviewLabel)}
                  aria-label={`Play preview: ${t.title} (default version)`}
                >
                  &#9654;
                </button>
              ) : (
                <div className="h-8 w-8 shrink-0" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <button
                type="button"
                onClick={toggle}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground"
                aria-expanded={open}
                aria-controls={`track-versions-${t.id}`}
                title={open ? "Collapse versions" : `Show ${vers.length} versions`}
              >
                <span
                  className="inline-block transition-transform duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                  aria-hidden
                >
                  &#9660;
                </span>
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {t.artworkUrl ? (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded border border-border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{vers.length} versions</div>
                </div>
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
          <div className="flex max-w-[11rem] flex-wrap gap-1" aria-label="Versions">
            {vers.map((v) => {
              const verLabel = trackVersionDisplayLabel(v.kind);
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
        </td>
        <td className="hidden px-3 py-2 align-top text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
          {formatAdded(t.createdAt)}
        </td>
      </tr>
      <tr className="border-b border-border/80">
        <td colSpan={colSpan} className="p-0 align-top">
          <div
            id={`track-versions-${t.id}`}
            className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
            style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-t border-border/60 bg-muted/20 px-2 pb-1 pt-0 sm:px-3">
                <div className="hidden border-b border-border/40 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[2rem,minmax(0,1fr),3rem,3.5rem,5.5rem,auto,4.5rem] sm:gap-x-2">
                  <span aria-hidden />
                  <span>Version</span>
                  <span className="text-right">BPM</span>
                  <span>Key</span>
                  <span>Genre</span>
                  <span className="text-center">MP3</span>
                  <span className="text-right">Added</span>
                </div>
                {vers.map((v) => (
                  <VersionExpandedRow key={v.id} t={t} v={v} onPreview={onPreview} onDownload={onDownload} />
                ))}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function SingleTrackRow({
  t,
  trackIndex,
  numbered,
  version,
  onPreview,
  onDownload,
}: {
  t: TrackListItem;
  trackIndex: number;
  numbered: boolean | undefined;
  version: TrackVersionSummary | null;
  onPreview: TrackTableProps["onPreview"];
  onDownload?: TrackTableProps["onDownload"];
}) {
  const camelot = musicalKeyToCamelot(t.musicalKey);
  const versionIdForApi = version?.id ?? t.defaultVersionId;
  const canPreview = version ? version.previewable : t.previewable;
  const canDownload = version ? version.downloadable : t.versions.some((v) => v.downloadable);
  const previewVersionId = canPreview ? versionIdForApi : null;
  const labelKind = version ? trackVersionDisplayLabel(version.kind) : "Standard";
  const label = `${t.title} — ${t.artist}${version ? ` (${labelKind})` : ""}`;

  return (
    <tbody className="[&>tr]:border-b [&>tr]:border-border/80">
      <tr className="transition-colors hover:bg-muted/20">
        {numbered ? (
          <td className="px-3 py-2 align-top tabular-nums text-xs text-muted-foreground">{trackIndex + 1}</td>
        ) : null}
        <td className="max-w-0 overflow-hidden px-3 py-2 align-top">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-h-10 w-12 shrink-0 items-center justify-center sm:w-14">
              {canPreview && previewVersionId ? (
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] text-foreground hover:border-primary hover:text-primary"
                  onClick={() => onPreview(t.id, previewVersionId, label)}
                  aria-label={`Play preview: ${t.title}`}
                >
                  &#9654;
                </button>
              ) : (t.versions?.length ?? 0) === 0 ? (
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
                  {version ? (
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {trackVersionDisplayLabel(version.kind)}
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
          {onDownload && canDownload && versionIdForApi ? (
            <button
              type="button"
              onClick={() => onDownload(t.id, versionIdForApi)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground hover:border-primary hover:text-primary"
            >
              MP3
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
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
        {items.map((t, trackIndex) => {
          const vers = Array.isArray(t.versions) ? t.versions : [];
          if (vers.length > 1) {
            return (
              <MultiVersionAccordion
                key={t.id}
                t={t}
                trackIndex={trackIndex}
                numbered={numbered}
                onPreview={onPreview}
                onDownload={onDownload}
              />
            );
          }
          const singleVersion = vers.length === 1 ? vers[0]! : null;
          return (
            <SingleTrackRow
              key={t.id}
              t={t}
              trackIndex={trackIndex}
              numbered={numbered}
              version={singleVersion}
              onPreview={onPreview}
              onDownload={onDownload}
            />
          );
        })}
      </table>
    </div>
  );
}
