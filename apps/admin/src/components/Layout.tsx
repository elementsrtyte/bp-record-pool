import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GlobalPlayer } from "./GlobalPlayer";
import { usePlayer } from "./PlayerContext";

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    setUserEmail(null);
    navigate("/login");
  }

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserEmail(session?.user.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const { url: playerUrl } = usePlayer();
  const playerOpen = Boolean(playerUrl);

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-medium">Record Pool Admin</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {navLink("/tracks", "Tracks")}
            {navLink("/upload", "Upload")}
            {navLink("/playlists", "Playlists")}
            {userEmail ? (
              <span className="flex min-w-0 max-w-full items-center gap-3">
                <span className="max-w-[14rem] truncate text-muted-foreground" title={userEmail}>
                  {userEmail}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </span>
            ) : (
              <Link to="/login" className="text-muted-foreground">
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full max-w-7xl px-4 py-8 ${playerOpen ? "pb-28" : ""}`}>
        {children}
      </main>
      <GlobalPlayer />
    </div>
  );
}
