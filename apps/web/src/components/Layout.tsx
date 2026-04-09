import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { GlobalPlayer } from "./GlobalPlayer";
import { usePlayer } from "./PlayerContext";

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { url } = usePlayer();
  const playerOpen = Boolean(url);
  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={loc.pathname.startsWith(to) ? "text-primary" : "text-muted-foreground hover:text-foreground"}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-medium text-foreground">
            Blueprint Record Pool
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link
              to="/"
              className={loc.pathname === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}
            >
              Home
            </Link>
            {navLink("/tracks", "New tracks")}
            {navLink("/playlists", "Playlists")}
            {navLink("/account", "Account")}
          </nav>
        </div>
      </header>
      <main className={`mx-auto max-w-6xl px-4 py-8 ${playerOpen ? "pb-24" : ""}`}>{children}</main>
      <GlobalPlayer />
    </div>
  );
}
