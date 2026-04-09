import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={loc.pathname.startsWith(to) ? "text-primary" : "text-muted-foreground"}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-medium">Record Pool Admin</span>
          <nav className="flex gap-4 text-sm">
            {navLink("/tracks", "Tracks")}
            {navLink("/upload", "Upload")}
            {navLink("/playlists", "Playlists")}
            <Link to="/login" className="text-muted-foreground">
              Login
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
