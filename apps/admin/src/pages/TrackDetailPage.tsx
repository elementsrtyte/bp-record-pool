import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  musicalKeyToCamelot,
  TRACK_VERSION_KINDS,
  trackVersionDisplayLabel,
  type TrackVersionKind,
} from "@bp/shared";
import { apiFetch } from "../lib/api";
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
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addKind, setAddKind] = useState<TrackVersionKind>("clean");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addingVer, setAddingVer] = useState(false);

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
    setArtworkFile(null);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, [id]);

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
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {track.versions.map((v) => (
              <li key={v.id}>
                {trackVersionDisplayLabel(v.kind as TrackVersionKind)} · master {v.hasMaster ? "✓" : "—"} ·
                preview {v.hasPreview ? "✓" : "—"}
              </li>
            ))}
          </ul>
          <p className="mt-1">Uploaded {new Date(track.createdAt).toLocaleString()}</p>
          {camelot ? <p>· analyzed key {camelot}</p> : null}
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
