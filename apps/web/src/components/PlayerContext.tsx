import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  title: string | null;
  url: string | null;
  play: (title: string, url: string) => void;
  stop: () => void;
};

const PlayerContext = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const play = useCallback((t: string, u: string) => {
    setTitle(t);
    setUrl(u);
  }, []);

  const stop = useCallback(() => {
    setTitle(null);
    setUrl(null);
  }, []);

  const value = useMemo(() => ({ title, url, play, stop }), [title, url, play, stop]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const c = useContext(PlayerContext);
  if (!c) throw new Error("PlayerProvider missing");
  return c;
}
