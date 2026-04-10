import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  musicalKeyToCamelot,
  TRACK_VERSION_KINDS,
  TRACK_WORK_KINDS,
  trackVersionDisplayLabel,
  trackWorkKindDisplayLabel,
  type TrackVersionKind,
  type TrackWorkKind,
} from "@bp/shared";
import { apiFetch, apiUrl } from "../lib/api";
import { usePlayer } from "../components/PlayerContext";
import { supabase } from "../lib/supabase";

type VersionRow = {
  id: string;
  kind: string;
  hasMaster: boolean;
  hasPreview: boolean;
};

type TrackDetail = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  workKind: TrackWorkKind;
  releaseDate: string;
  isDownloadable: boolean;
  artworkUrl: string | null;
  createdAt: string;
  versions: VersionRow[];
};

export function TrackDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [isDownloadable, setIsDownloadable] = useState(true);
  const [workKind, setWorkKind] = useState<TrackWorkKind>("original");
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addKind, setAddKind] = useState<TrackVersionKind>("clean");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addingVer, setAddingVer] = useState(false);
  const [stemJob, setStemJob] = useState<null | "instrumental" | "acapella" | "both">(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const { play, activeTrackId, activeVersionId } = usePlayer();

  const artworkPreviewUrl = useMemo(
    () => (artworkFile ? URL.createObjectURL(artworkFile) : null),
    [artworkFile],
  );
  useEffect(() => {
    return () => {
      if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
    };
  }, [artworkPreviewUrl]);

  async function getToken() {
    let { data: session } = await supabase.auth.getSession();
    let token = session.session?.access_token;
    if (!token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token;
    }
    return token;
  }

  async function load() {
    const token = await getToken();
    if (!token || !id) {
      setError("Sign in required.");
      return;
    }
    const r = await apiFetch(`/api/admin/tracks/${id}`, { token });
    if (r.status === 401) {
      setError("Unauthorized.");
      return;
    }
    if (r.status === 404) {
      setError("Track not found.");
      setTrack(null);
      return;
    }
    if (!r.ok) {
      setError("Could not load track.");
      return;
    }
    const t = (await r.json()) as TrackDetail;
    setTrack(t);
    setTitle(t.title);
    setArtist(t.artist);
    setGenre(t.genre ?? "");
    setMusicalKey(t.musicalKey ?? "");
    setBpm(t.bpm != null ? String(t.bpm) : "");
    setReleaseDate(t.releaseDate);
    setIsDownloadable(t.isDownloadable);
    setWorkKind(t.workKind ?? "original");
    setArtworkFile(null);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    setPreviewLoadingId(null);
  }, [id]);

  const loadPreview = useCallback(
    async (versionId: string) => {
      if (!id) return;
      setPreviewLoadingId(versionId);
      try {
        const q = `?versionId=${encodeURIComponent(versionId)}`;
        const r = await fetch(apiUrl(`/api/tracks/${id}/preview-url${q}`));
        if (!r.ok) {
          setPreviewLoadingId(null);
          const errBody = (await r.json().catch(() => ({}))) as { error?: string };
          setError(
            errBody.error === "no_preview"
              ? "No audio file for this version."
              : errBody.error === "not_found"
                ? "Version not found."
                : `Could not load playback URL (${r.status}).`,
          );
          return;
        }
        const j = (await r.json()) as { url?: string };
        if (!j.url) {
          setPreviewLoadingId(null);
          setError("No playback URL returned.");
          return;
        }
        const kindLabel = trackVersionDisplayLabel(
          (track?.versions.find((x) => x.id === versionId)?.kind ?? "standard") as TrackVersionKind,
        );
        const line = `${artist.trim() || "—"} – ${title.trim() || "—"} · ${kindLabel}`;
        play(line, j.url, id, versionId);
        setPreviewLoadingId(null);
        setError(null);
      } catch {
        setPreviewLoadingId(null);
        setError(
          "Playback request failed (check VITE_API_URL / API is running / use the same host as PUBLIC_ADMIN_URL, e.g. localhost vs 127.0.0.1).",
        );
      }
    },
    [id, play, artist, title, track?.versions],
  );

  async function addVersion() {
    const token = await getToken();
    if (!token || !id || !addFile) return;
    setAddingVer(true);
    setError(null);
    const form = new FormData();
    form.append("kind", addKind);
    form.append("master", addFile, addFile.name);
    const r = await apiFetch(`/api/admin/tracks/${id}/versions`, {
      method: "POST",
      token,
      body: form,
    });
    setAddingVer(false);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string; kind?: string };
      setError(j.error === "version_kind_exists" ? `Already have a ${j.kind} version.` : (j.error ?? `Upload failed (${r.status}).`));
      return;
    }
    setAddFile(null);
    await load();
  }

  async function generateStems(mode: "instrumental" | "acapella" | "both") {
    const token = await getToken();
    if (!token || !id) return;
    const stems = mode === "both" ? (["instrumental", "acapella"] as const) : ([mode] as const);
    setStemJob(mode);
    setError(null);
    const r = await apiFetch(`/api/admin/tracks/${id}/generate-stems`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stems: [...stems] }),
    });
    setStemJob(null);
    if (r.status === 503) {
      setError(
        "Stem separation is not enabled on the API (set STEM_SEPARATION_ENABLED or SPLEETER_ENABLED and install python-audio-separator).",
      );
      return;
    }
    if (r.status === 400) {
      const j = (await r.json().catch(() => ({}))) as { detail?: string; error?: string };
      setError(j.detail ?? j.error ?? "Cannot generate stems for this track.");
      return;
    }
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { detail?: string; error?: string };
      setError(j.detail ?? j.error ?? `Stem generation failed (${r.status}).`);
      return;
    }
    setError(null);
    await load();
  }

  async function save() {
    const token = await getToken();
    if (!token || !id) return;
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.append("title", title.trim());
    form.append("artist", artist.trim());
    form.append("genre", genre.trim());
    form.append("musicalKey", musicalKey.trim());
    form.append("releaseDate", releaseDate);
    form.append("bpm", bpm.trim());
    form.append("isDownloadable", isDownloadable ? "1" : "0");
    form.append("workKind", workKind);
    if (artworkFile) form.append("artwork", artworkFile, artworkFile.name);

    const r = await apiFetch(`/api/admin/tracks/${id}`, {
      method: "PATCH",
      token,
      body: form,
    });
    setSaving(false);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Save failed (${r.status}).`);
      return;
    }
    navigate("/tracks");
  }

  if (error && !track) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error}</p>
        <Link to="/tracks" className="text-sm text-primary hover:underline">
          ← Back to tracks
        </Link>
      </div>
    );
  }

  if (!track) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const camelot = musicalKeyToCamelot(musicalKey.trim() || null);
  const hasMasterVersion = track.versions.some((v) => v.hasMaster);
  const hasInstrumental = track.versions.some((v) => v.kind === "instrumental");
  const hasAcapella = track.versions.some((v) => v.kind === "acapella");
  const mastersWithAudio = track.versions.filter((v) => v.hasMaster);
  const stemSourceIsOnlyInstOrAcapella =
    mastersWithAudio.length > 0 &&
    mastersWithAudio.every((v) => v.kind === "instrumental" || v.kind === "acapella");
  const canSuggestInstrumental = hasMasterVersion && !hasInstrumental;
  const canSuggestAcapella = hasMasterVersion && !hasAcapella;
  const stemBusy = stemJob !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/tracks" className="text-sm text-muted-foreground hover:text-foreground">
          ← Tracks
        </Link>
      </div>
      <h1 className="text-base">Edit track</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-6 md:grid-cols-[auto,1fr]">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Artwork</div>
          {artworkPreviewUrl ? (
            <img
              src={artworkPreviewUrl}
              alt=""
              className="h-36 w-36 rounded-md border border-border object-cover"
            />
          ) : track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt=""
              className="h-36 w-36 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
              No artwork
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="max-w-[12rem] text-xs file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1"
            onChange={(e) => setArtworkFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-3">
          <input
            className="ui-control w-full"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="ui-control w-full"
            placeholder="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <input
            className="ui-control w-full"
            placeholder="Genre (optional)"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <input
              type="date"
              className="ui-control min-w-[10rem]"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
            <input
              className="ui-control w-24"
              placeholder="BPM"
              inputMode="numeric"
              value={bpm}
              onChange={(e) => setBpm(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="ui-control min-w-[8rem] flex-1"
              placeholder="Key (e.g. A Min)"
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Track type</span>
            <select
              className="ui-control w-full max-w-xs"
              value={workKind}
              onChange={(e) => setWorkKind(e.target.value as TrackWorkKind)}
            >
              {TRACK_WORK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {trackWorkKindDisplayLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDownloadable}
              onChange={(e) => setIsDownloadable(e.target.checked)}
            />
            Downloadable for subscribers
          </label>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground">
        <div>
          <span className="text-foreground">Versions</span>
          <ul className="mt-2 space-y-2">
            {track.versions.map((v) => {
              const label = trackVersionDisplayLabel(v.kind as TrackVersionKind);
              const canListen = v.hasMaster;
              const isActive = activeTrackId === id && activeVersionId === v.id;
              return (
                <li
                  key={v.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-2 ${
                    isActive ? "border-primary/50 bg-primary/5" : "border-border/80 bg-background/30"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="ml-2 text-muted-foreground">
                      master {v.hasMaster ? "✓" : "—"} · preview {v.hasPreview ? "✓" : "—"}
                    </span>
                  </div>
                  {canListen ? (
                    <button
                      type="button"
                      disabled={previewLoadingId === v.id}
                      className="ui-control shrink-0 cursor-pointer px-3 py-1 text-[11px] disabled:opacity-50"
                      onClick={() => void loadPreview(v.id)}
                    >
                      {previewLoadingId === v.id
                        ? "Loading…"
                        : isActive
                          ? "Play again"
                          : "Listen"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-muted-foreground">No master</span>
                  )}
                </li>
              );
            })}
          </ul>
          {track.versions.some((v) => v.hasMaster) ? (
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              Press <strong>Listen</strong> to load the preview in the <strong>fixed player at the bottom</strong> (same
              wavesurfer bar as the consumer catalog).
            </p>
          ) : null}
          <p className="mt-3">Uploaded {new Date(track.createdAt).toLocaleString()}</p>
          {camelot ? <p>· analyzed key {camelot}</p> : null}
        </div>
        <div className="border-t border-border pt-2">
          <div className="text-foreground">Stem separation</div>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed">
            Generate instrumental and/or acapella from the main mix using{" "}
            <a
              href="https://github.com/nomadkaraoke/python-audio-separator"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              python-audio-separator
            </a>{" "}
            (requires <code className="rounded bg-muted px-0.5">STEM_SEPARATION_ENABLED</code> or{" "}
            <code className="rounded bg-muted px-0.5">SPLEETER_ENABLED</code> on the API). Uses the earliest full mix
            version when available; otherwise the first version with a master. This can take several minutes.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={stemBusy || !canSuggestInstrumental}
              className="ui-control cursor-pointer bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50"
              title={
                !hasMasterVersion
                  ? "Upload a version with a master first"
                  : hasInstrumental
                    ? "Instrumental version already exists"
                    : undefined
              }
              onClick={() => void generateStems("instrumental")}
            >
              {stemJob === "instrumental" ? "Working…" : "Add instrumental"}
            </button>
            <button
              type="button"
              disabled={stemBusy || !canSuggestAcapella}
              className="ui-control cursor-pointer bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50"
              title={
                !hasMasterVersion
                  ? "Upload a version with a master first"
                  : hasAcapella
                    ? "Acapella version already exists"
                    : undefined
              }
              onClick={() => void generateStems("acapella")}
            >
              {stemJob === "acapella" ? "Working…" : "Add acapella"}
            </button>
            <button
              type="button"
              disabled={stemBusy || !(canSuggestInstrumental || canSuggestAcapella)}
              className="ui-control cursor-pointer bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50"
              title={
                !hasMasterVersion
                  ? "Upload a version with a master first"
                  : !canSuggestInstrumental && !canSuggestAcapella
                    ? "Both stems already exist"
                    : undefined
              }
              onClick={() => void generateStems("both")}
            >
              {stemJob === "both" ? "Working…" : "Add both"}
            </button>
          </div>
          {stemSourceIsOnlyInstOrAcapella ? (
            <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">
              Only instrumental/acapella masters found—separation works best from a full mix. Upload a standard mix
              first if results are poor.
            </p>
          ) : null}
        </div>
        <div className="border-t border-border pt-2">
          <div className="text-foreground">Add version</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">Kind</span>
              <select
                className="ui-control text-xs"
                value={addKind}
                onChange={(e) => setAddKind(e.target.value as TrackVersionKind)}
              >
                {TRACK_VERSION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {trackVersionDisplayLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">Master audio</span>
              <input
                type="file"
                accept="audio/*"
                className="max-w-[14rem] text-xs file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1"
                onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={addingVer || !addFile}
              className="ui-control cursor-pointer bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50"
              onClick={() => void addVersion()}
            >
              {addingVer ? "Uploading…" : "Upload version"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving || !title.trim() || !artist.trim()}
          className="ui-control cursor-pointer bg-secondary px-4 py-2 text-xs text-secondary-foreground"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save track"}
        </button>
        <Link to="/tracks" className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </div>
  );
}
