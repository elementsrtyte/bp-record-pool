import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlayer } from "./PlayerContext";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function GlobalPlayer() {
  const { title, url, stop, isPlaying, setIsPlaying, registerPlayPause } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const destroy = useCallback(() => {
    wsRef.current?.destroy();
    wsRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [setIsPlaying]);

  useEffect(() => {
    if (!url || !containerRef.current) {
      registerPlayPause(null);
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
      waveColor: "#c8c8c8",
      progressColor: "#ea580c",
      normalize: true,
      dragToSeek: true,
      hideScrollbar: true,
      autoplay: true,
    });

    registerPlayPause(() => {
      ws.playPause();
    });

    ws.on("ready", () => {
      setDuration(ws.getDuration());
      setIsPlaying(true);
    });

    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    wsRef.current = ws;

    return () => {
      registerPlayPause(null);
      ws.destroy();
      wsRef.current = null;
    };
  }, [url, destroy, registerPlayPause, setIsPlaying]);

  function togglePlay() {
    wsRef.current?.playPause();
  }

  if (!url) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-3 py-3 shadow-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs hover:bg-muted"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>

        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>

        <div ref={containerRef} className="min-w-0 flex-1 cursor-pointer" />

        <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {duration > 0 ? formatTime(duration) : "—"}
        </span>

        <div className="hidden min-w-0 max-w-[220px] sm:block">
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
