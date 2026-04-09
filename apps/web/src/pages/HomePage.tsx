import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="space-y-16">
      <section className="space-y-4">
        <h1 className="text-balance">New music for working DJs</h1>
        <p className="max-w-2xl text-muted-foreground">
          Blueprint Record Pool is a subscription service for DJ-friendly releases: stream previews, download
          masters, and stay ahead with a curated new-releases feed—similar in spirit to professional pools you
          already know.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/tracks"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Browse new tracks
          </Link>
          <Link
            to="/account"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium"
          >
            Subscribe / Sign in
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Always fresh",
            body: "A focused feed of new drops—high signal, updated as releases land.",
          },
          {
            title: "Stream before you grab",
            body: "Preview tracks in the browser before committing a download.",
          },
          {
            title: "Member downloads",
            body: "Full-quality downloads are included with an active membership (Stripe billing).",
          },
        ].map((x) => (
          <div key={x.title} className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-base">{x.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{x.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-muted/40 p-6">
        <h2 className="text-base">How it works</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Create an account with Supabase Auth.</li>
          <li>Open the New tracks feed and preview tracks.</li>
          <li>Subscribe with Stripe to unlock downloads and manage billing from your account page.</li>
        </ol>
      </section>
    </div>
  );
}
