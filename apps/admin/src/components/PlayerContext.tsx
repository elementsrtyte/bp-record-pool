import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  title: string | null;
  url: string | null;
  activeTrackId: string | null;
  activeVersionId: string | null;
  isPlaying: boolean;
  play: (title: string, url: string, trackId: string, versionId: string | null) => void;
  stop: () => void;
  togglePlayPause: () => void;
  setIsPlaying: (playing: boolean) => void;
  registerPlayPause: (fn: (() => void) | null) => void;
};

const PlayerContext = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playPauseRef = useRef<(() => void) | null>(null);

  const registerPlayPause = useCallback((fn: (() => void) | null) => {
    playPauseRef.current = fn;
  }, []);

  const play = useCallback(
    (t: string, u: string, trackId: string, versionId: string | null) => {
      setTitle(t);
      setUrl(u);
      setActiveTrackId(trackId);
      setActiveVersionId(versionId);
      setIsPlaying(false);
    },
    [],
  );

  const stop = useCallback(() => {
    setTitle(null);
    setUrl(null);
    setActiveTrackId(null);
    setActiveVersionId(null);
    setIsPlaying(false);
    playPauseRef.current = null;
  }, []);

  const togglePlayPause = useCallback(() => {
    playPauseRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      title,
      url,
      activeTrackId,
      activeVersionId,
      isPlaying,
      play,
      stop,
      togglePlayPause,
      setIsPlaying,
      registerPlayPause,
    }),
    [title, url, activeTrackId, activeVersionId, isPlaying, play, stop, togglePlayPause, registerPlayPause],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const c = useContext(PlayerContext);
  if (!c) throw new Error("PlayerProvider missing");
  return c;
}
