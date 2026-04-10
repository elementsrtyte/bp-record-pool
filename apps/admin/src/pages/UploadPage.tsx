import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TRACK_VERSION_KINDS,
  TRACK_WORK_KINDS,
  trackVersionDisplayLabel,
  trackWorkKindDisplayLabel,
} from "@bp/shared";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

const TRACK_ADJECTIVES = [
  "Neon",
  "Late",
  "Dry",
  "Soft",
  "Raw",
  "Deep",
  "Blue",
  "Sparse",
  "Dusty",
  "Warm",
] as const;

const TRACK_NOUNS = [
  "Session",
  "Groove",
  "Ref",
  "Cut",
  "Pass",
  "Loop",
  "Bridge",
  "Room",
  "Tape",
  "Line",
] as const;

function randomTitle(): string {
  const a = TRACK_ADJECTIVES[Math.floor(Math.random() * TRACK_ADJECTIVES.length)];
  const b = TRACK_NOUNS[Math.floor(Math.random() * TRACK_NOUNS.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${a} ${b} ${n}`;
}

/** Prefilled in `import.meta.env.DEV` only — keeps uploads fast while testing */
const devDefaults = import.meta.env.DEV
  ? {
      artist: "Test Artist",
      releaseDate: new Date().toISOString().slice(0, 10),
      genre: "House",
    }
  : null;

export function UploadPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null);
  const d = devDefaults;
  const defaultTitle = useMemo(() => (d ? randomTitle() : undefined), [formKey, d]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setLastUploadedId(null);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      setMessage("Sign in first.");
      setBusy(false);
      nav("/login");
      return;
    }
    const form = e.target as HTMLFormElement;
    const post = (t: string) =>
      apiFetch("/api/admin/tracks", {
        method: "POST",
        token: t,
        body: new FormData(form),
      });
    let r = await post(token);
    if (r.status === 401) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const t2 = refreshed.session?.access_token;
      if (t2) r = await post(t2);
    }
    setBusy(false);
    if (r.status === 401) {
      setMessage(
        "Unauthorized — set SUPABASE_JWT_SECRET in .env.local to JWT_SECRET from `supabase status -o env`. See API log [api] Auth env.",
      );
      return;
    }
    if (r.status === 403) {
      setMessage("Forbidden — check ADMIN_EMAIL or profiles.role = admin.");
      return;
    }
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMessage(j.error ?? "Upload failed.");
      return;
    }
    const created = (await r.json().catch(() => ({}))) as { id?: string };
    setLastUploadedId(typeof created.id === "string" ? created.id : null);
    setMessage("Uploaded.");
    setFormKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-base">Upload track</h1>
      {d ? (
        <p className="text-xs text-muted-foreground">
          Dev defaults are filled in — change or keep them; title is random each visit and after each upload. Only
          audio/artwork files are required to select each time.
        </p>
      ) : null}
      <form key={formKey} className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1">
          <span>Title</span>
          <input
            name="title"
            required
            className="ui-control w-full"
            defaultValue={defaultTitle}
          />
        </label>
        <label className="block space-y-1">
          <span>Artist</span>
          <input
            name="artist"
            required
            className="ui-control w-full"
            defaultValue={d?.artist}
          />
        </label>
        <label className="block space-y-1">
          <span>Release date</span>
          <input
            name="releaseDate"
            type="date"
            required
            className="ui-control w-full"
            defaultValue={d?.releaseDate}
          />
        </label>
        <label className="block space-y-1">
          <span>Genre</span>
          <input name="genre" className="ui-control w-full" defaultValue={d?.genre} />
        </label>
        <label className="block space-y-1">
          <span>Track type</span>
          <select name="workKind" className="ui-control w-full" defaultValue="original">
            {TRACK_WORK_KINDS.map((k) => (
              <option key={k} value={k}>
                {trackWorkKindDisplayLabel(k)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            Original production vs. remix—separate from version tags (clean, radio, etc.). The server will set{" "}
            <strong>Remix</strong> automatically if the title contains words like <em>remix</em>, <em>edit</em>, or{" "}
            <em>re-drum</em> / <em>redrum</em>. If stem separation is enabled on the API, <strong>Original</strong> uploads
            also get instrumental and acapella in the background.
          </span>
        </label>
        <label className="block space-y-1">
          <span>Version kind</span>
          <select name="kind" className="ui-control w-full" defaultValue="standard">
            {TRACK_VERSION_KINDS.map((k) => (
              <option key={k} value={k}>
                {trackVersionDisplayLabel(k)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            Leave as <strong>Standard</strong> to auto-detect from the title or file name (e.g. “(Clean)”, “Radio
            Edit”, “Instrumental” in tags or pool-style names). Pick another kind here to force it.
          </span>
        </label>
        <label className="block space-y-1">
          <span>Artwork (jpg/png)</span>
          <input name="artwork" type="file" accept="image/*" className="text-sm" />
        </label>
        <label className="block space-y-1">
          <span>Master audio</span>
          <input name="master" type="file" accept="audio/*" required className="text-sm" />
          <span className="block text-xs text-muted-foreground">
            A 60-second MP3 preview is generated automatically from the start of the master.
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="ui-control w-full cursor-pointer bg-secondary text-secondary-foreground"
        >
          Upload
        </button>
      </form>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
