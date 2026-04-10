import { Link, useNavigate } from "react-router-dom";
import { useShellSearch } from "../components/ShellSearchContext";

const genres = ["House", "Hip hop", "R&B", "Latin", "Electronic", "Open format"];

function IconFeed({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v12m0 0 4-4m-4 4-4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h2l2-6 4 12 3-9 2 3h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { setQuery } = useShellSearch();

  function goTracksWithSearch(term: string) {
    setQuery(term);
    void navigate("/tracks");
  }

  return (
    <div className="space-y-14 md:space-y-20">
      <section className="relative -mx-3 overflow-hidden rounded-2xl border border-border md:-mx-6">
        <div className="grid min-h-0 md:min-h-[min(82vh,42rem)] md:grid-cols-2">
          <div className="flex flex-col justify-center bg-background px-6 py-14 sm:px-8 md:px-10 md:py-20 lg:px-14 lg:py-24">
            <div className="max-w-md space-y-10">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                DJ record pool
              </p>
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
                The catalog built for{" "}
                <span className="text-primary">club-ready sets</span>
              </h1>
              <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                Stream previews, grab masters, and stay current with a curated feed—minimal noise, maximum
                time on the decks.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
                <Link
                  to="/tracks"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground hover:opacity-95"
                >
                  Browse new tracks
                </Link>
                <Link
                  to="/account"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-7 text-sm font-medium text-foreground hover:bg-muted/30"
                >
                  Start membership
                </Link>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Downloads included with membership.{" "}
                <Link to="/account" className="text-foreground underline-offset-4 hover:underline">
                  Billing
                </Link>
              </p>
            </div>
          </div>

          <div className="relative min-h-[13rem] border-t border-border md:min-h-0 md:border-t-0 md:border-l md:border-border">
            <img
              src="/hero-dj.png"
              alt="DJ with headphones at a mixer in a warm, refined lounge"
              className="absolute inset-0 h-full w-full object-cover object-[center_22%]"
              width={1920}
              height={1080}
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>
      </section>

      <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {["Curated drops", "In-browser preview", "Member downloads", "Stripe billing"].join(" · ")}
      </p>

      <section className="grid gap-4 border-y border-border py-10 sm:grid-cols-3">
        {[
          { k: "Feed", v: "High-signal new music", d: "Less noise, more releases worth your time." },
          { k: "Quality", v: "Lossless-ready files", d: "Masters sized for real-world DJ workflows." },
          { k: "Speed", v: "Preview in seconds", d: "Hear it in the app before you commit a download." },
        ].map((s) => (
          <div key={s.k} className="text-center sm:text-left">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{s.k}</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{s.v}</div>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-8 max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Everything in one workflow</h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Pool-style tools without leaving the tab you already have open for prep.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Always-on new music",
              body: "A single list that stays fresh as tracks land—sorted for quick scanning.",
              Icon: IconFeed,
            },
            {
              title: "Play before you download",
              body: "Inline previews so you can vibe-check a tune before it hits your crate.",
              Icon: IconPlay,
            },
            {
              title: "Downloads for members",
              body: "Unlock masters with subscription billing—same account, same library.",
              Icon: IconDownload,
            },
            {
              title: "Organized by DJ metadata",
              body: "BPM, key, and versions surfaced where you need them in the table.",
              Icon: IconWave,
            },
          ].map(({ title, body, Icon }) => (
            <div
              key={title}
              className="group flex gap-4 rounded-xl border border-border bg-card/80 p-5 transition-colors hover:border-primary/35 hover:bg-card"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="scroll-mt-8">
        <div className="mx-auto mb-8 max-w-2xl space-y-2 text-center">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Pricing</h2>
          <p className="text-sm text-muted-foreground md:text-base">
            One simple membership. Cancel anytime from your account.
          </p>
        </div>
        <div className="mx-auto max-w-md">
          <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card px-6 py-8 shadow-[0_0_0_1px_rgba(234,88,12,0.12)_inset] md:px-8 md:py-10">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-2xl"
              aria-hidden
            />
            <div className="relative space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Membership</p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">$9.99</span>
                  <span className="text-sm font-medium text-muted-foreground">/ month</span>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {[
                  "Full catalog previews in the app",
                  "Member downloads included",
                  "Secure billing with Stripe",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-0.5 text-primary" aria-hidden>
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/account"
                className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-95"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/25 px-5 py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Dig by genre</h2>
            <p className="max-w-lg text-sm text-muted-foreground md:text-base">
              Jump to new tracks with the shell search prefilled—pick a pocket and start crate-building.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => goTracksWithSearch(g)}
              className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
            >
              {g}
            </button>
          ))}
          <Link
            to="/tracks"
            className="inline-flex items-center rounded-full border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            All genres →
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-background px-6 py-10 md:px-10 md:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(234,88,12,0.35),transparent_55%)]" aria-hidden />
        <div className="relative max-w-2xl space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ready when you are</h2>
          <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
            Create an account, skim the catalog, and turn on membership when you want downloads. Billing and
            receipts stay in one place on Account.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Link
              to="/account"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground hover:opacity-95"
            >
              Open account
            </Link>
            <Link
              to="/tracks"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background/70 px-7 text-sm font-medium backdrop-blur hover:bg-background"
            >
              Preview the catalog
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
