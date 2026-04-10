import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GlobalPlayer } from "./GlobalPlayer";
import { usePlayer } from "./PlayerContext";
import { useShellSearch } from "./ShellSearchContext";
import { supabase } from "../lib/supabase";

type NavItemProps = { to: string; label: string; end?: boolean; onNavigate?: () => void };

function SidebarLink({ to, label, end, onNavigate }: NavItemProps) {
  const loc = useLocation();
  const active = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center border-l-2 py-2 pl-3 pr-2 text-sm transition-colors ${
        active
          ? "border-primary bg-white/[0.06] font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { url } = usePlayer();
  const playerOpen = Boolean(url);
  const { query, setQuery } = useShellSearch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const closeMobile = () => setMobileNavOpen(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setSignedIn(Boolean(session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSignedIn(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[var(--pool-sidebar-w)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4 md:h-auto md:block md:border-0 md:px-3 md:pt-6 md:pb-4">
          <Link
            to="/"
            className="font-semibold tracking-tight text-foreground"
            onClick={closeMobile}
          >
            Blueprint Pool
          </Link>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-white/10 md:hidden"
            aria-label="Close menu"
            onClick={closeMobile}
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-2 pb-8 pt-2 md:px-2 md:pt-0">
          <div>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Browse
            </div>
            <div className="space-y-0.5">
              <SidebarLink to="/" label="Home" end onNavigate={closeMobile} />
              <SidebarLink to="/tracks" label="New tracks" onNavigate={closeMobile} />
              <SidebarLink to="/playlists" label="Playlists" onNavigate={closeMobile} />
            </div>
          </div>
          <div>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your library
            </div>
            <div className="space-y-0.5">
              <SidebarLink to="/account" label="Account & billing" onNavigate={closeMobile} />
            </div>
          </div>
        </nav>
      </aside>

      <div
        className={`min-h-screen md:pl-[var(--pool-sidebar-w)] ${playerOpen ? "pb-28" : ""}`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur-md md:h-16 md:gap-4 md:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <span className="text-lg leading-none">☰</span>
          </button>

          <div className="relative min-w-0 flex-1 md:mx-auto md:max-w-xl">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            >
              ⌕
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists, tracks, playlists…"
              className="ui-control h-9 w-full rounded-full border-border bg-input-background py-0 pl-9 pr-3 text-sm md:h-10"
              aria-label="Search"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {signedIn ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex cursor-pointer items-center justify-center rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              >
                Sign out
              </button>
            ) : null}
            <Link
              to="/account"
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95 sm:px-4 sm:text-sm"
            >
              Subscribe
            </Link>
          </div>
        </header>

        <main className="px-3 py-5 md:px-6 md:py-6">{children}</main>
      </div>

      <GlobalPlayer />
    </div>
  );
}
