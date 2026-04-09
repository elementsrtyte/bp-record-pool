import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

type Track = { id: string; title: string; artist: string; position: number };
type AllTrack = { id: string; title: string; artist: string; genre: string | null; releaseDate: string };
type PlRow = {
  id: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  createdAt: string;
};

export function PlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [removeArtwork, setRemoveArtwork] = useState(false);
  const artworkPreviewUrl = useMemo(
    () => (artworkFile ? URL.createObjectURL(artworkFile) : null),
    [artworkFile],
  );
  useEffect(() => {
    return () => {
      if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
    };
  }, [artworkPreviewUrl]);
  const [currentTracks, setCurrentTracks] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<AllTrack[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingArt, setGeneratingArt] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    if (!token || !id) return;
    const [plRes, tracksRes, allRes] = await Promise.all([
      apiFetch(`/api/admin/playlists`, { token }),
      apiFetch(`/api/admin/playlists/${id}/tracks`, { token }),
      apiFetch(`/api/admin/tracks`, { token }),
    ]);
    if (plRes.ok) {
      const playlists = (await plRes.json()) as PlRow[];
      const pl = playlists.find((p) => p.id === id);
      if (pl) {
        setTitle(pl.title);
        setDescription(pl.description ?? "");
        setArtworkUrl(pl.artworkUrl ?? null);
        setArtworkFile(null);
        setRemoveArtwork(false);
      }
    }
    if (tracksRes.ok) setCurrentTracks((await tracksRes.json()) as Track[]);
    if (allRes.ok) setAllTracks((await allRes.json()) as AllTrack[]);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function save() {
    const token = await getToken();
    if (!token || !id) return;
    setSaving(true);
    setMessage(null);
    const form = new FormData();
    form.append("title", title);
    form.append("description", description || "");
    if (removeArtwork) form.append("removeArtwork", "1");
    if (artworkFile) form.append("artwork", artworkFile, artworkFile.name);
    const patchRes = await apiFetch(`/api/admin/playlists/${id}`, {
      method: "PATCH",
      token,
      body: form,
    });
    if (!patchRes.ok) {
      setSaving(false);
      setMessage(`Save failed (${patchRes.status}).`);
      return;
    }
    const putRes = await apiFetch(`/api/admin/playlists/${id}/tracks`, {
      method: "PUT",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: currentTracks.map((t) => t.id) }),
    });
    setSaving(false);
    if (!putRes.ok) {
      setMessage(`Playlist saved but track order failed (${putRes.status}).`);
      await load();
      return;
    }
    navigate("/playlists");
  }

  async function generateArtwork() {
    const token = await getToken();
    if (!token || !id) return;
    const name = title.trim();
    if (!name) {
      setMessage("Set a playlist title before generating cover art.");
      return;
    }
    setGeneratingArt(true);
    setMessage(null);
    try {
      const r = await apiFetch(`/api/admin/playlists/${id}/generate-artwork`, {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await r.json()) as { artworkUrl?: string; error?: string; detail?: string };
      if (!r.ok) {
        setMessage(j.detail ?? j.error ?? `Generate failed (${r.status})`);
        return;
      }
      if (j.artworkUrl) {
        setArtworkUrl(j.artworkUrl);
        setArtworkFile(null);
        setRemoveArtwork(false);
        setMessage("Cover generated and stored. Save playlist if you changed title, tracks, or description.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setGeneratingArt(false);
    }
  }

  function addTrack(t: AllTrack) {
    if (currentTracks.some((c) => c.id === t.id)) return;
    setCurrentTracks((prev) => [
      ...prev,
      { id: t.id, title: t.title, artist: t.artist, position: prev.length },
    ]);
  }

  function removeTrack(trackId: string) {
    setCurrentTracks((prev) => prev.filter((t) => t.id !== trackId));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setCurrentTracks((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    setCurrentTracks((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  const currentIds = new Set(currentTracks.map((t) => t.id));
  const available = allTracks.filter(
    (t) => !currentIds.has(t.id) && (!search || `${t.title} ${t.artist}`.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-base">Edit playlist</h1>
        <input
          className="ui-control w-full"
          placeholder="Playlist title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="ui-control w-full"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="space-y-2">
          <div className="text-sm font-medium">Cover image</div>
          <div className="flex flex-wrap items-start gap-4">
            {artworkPreviewUrl ? (
              <img
                src={artworkPreviewUrl}
                alt=""
                className="h-24 w-24 rounded-md border border-border object-cover"
              />
            ) : artworkUrl && !removeArtwork ? (
              <img src={artworkUrl} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving || generatingArt || !title.trim()}
                className="ui-control w-fit cursor-pointer border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                title="Uses OpenAI Images (server-side). Set OPENAI_API_KEY on the API."
                onClick={() => void generateArtwork()}
              >
                {generatingArt ? "Generating…" : "Generate cover (OpenAI)"}
              </button>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="max-w-xs text-xs file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setArtworkFile(f ?? null);
                  if (f) setRemoveArtwork(false);
                }}
              />
              {(artworkUrl || artworkFile) && !artworkFile ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={removeArtwork}
                    onChange={(e) => {
                      setRemoveArtwork(e.target.checked);
                      if (e.target.checked) setArtworkFile(null);
                    }}
                  />
                  Remove cover on save
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Current tracks ({currentTracks.length})</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {currentTracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex-1 truncate">{t.title} — {t.artist}</span>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveUp(i)}>&#9650;</button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveDown(i)}>&#9660;</button>
              <button type="button" className="text-xs text-destructive hover:opacity-80" onClick={() => removeTrack(t.id)}>&#10005;</button>
            </li>
          ))}
          {currentTracks.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No tracks added yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Add tracks</h2>
        <input
          className="ui-control w-full"
          placeholder="Search tracks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card text-sm">
          {available.slice(0, 50).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="truncate">{t.title} — {t.artist}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-primary hover:opacity-80"
                onClick={() => addTrack(t)}
              >
                + Add
              </button>
            </li>
          ))}
          {available.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No tracks available.</li>
          ) : null}
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          className="ui-control cursor-pointer bg-secondary text-secondary-foreground text-xs px-4 py-2"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save playlist"}
        </button>
        {message ? <span className="text-sm">{message}</span> : null}
      </div>
    </div>
  );
}
