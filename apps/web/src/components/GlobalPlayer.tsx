import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlayer } from "./PlayerContext";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function GlobalPlayer() {
  const { title, url, stop } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const destroy = useCallback(() => {
    wsRef.current?.destroy();
    wsRef.current = null;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    if (!url || !containerRef.current) {
      destroy();
      return;
    }

    destroy();

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      height: 32,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      cursorWidth: 0,
      waveColor: "var(--muted-foreground)",
      progressColor: "var(--primary)",
      normalize: true,
      dragToSeek: true,
      hideScrollbar: true,
      autoplay: true,
    });

    ws.on("ready", () => {
      setDuration(ws.getDuration());
      setPlaying(true);
    });

    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [url]);

  function togglePlay() {
    wsRef.current?.playPause();
  }

  if (!url) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-3 py-3 shadow-md md:pl-[var(--pool-sidebar-w)]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 md:px-4">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs hover:bg-muted"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "\u23F8" : "\u25B6"}
        </button>

        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>

        <div ref={containerRef} className="min-w-0 flex-1 cursor-pointer" />

        <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {duration > 0 ? formatTime(duration) : "—"}
        </span>

        <div className="hidden min-w-0 max-w-[200px] sm:block">
          <div className="truncate text-xs font-medium">{title}</div>
        </div>

        <button
          type="button"
          onClick={stop}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-muted-foreground hover:text-foreground"
          aria-label="Close player"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
