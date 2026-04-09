import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

export function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email: (e.target as HTMLFormElement).email.value,
      password: (e.target as HTMLFormElement).password.value,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setMessage("Check your email to confirm, then sign in.");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = e.target as HTMLFormElement;
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.value,
      password: form.password.value,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setMessage("Signed in.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setEmail(null);
  }

  async function checkout() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      setMessage("Sign in first.");
      return;
    }
    setBusy(true);
    const r = await apiFetch("/api/billing/checkout-session", { method: "POST", token });
    setBusy(false);
    if (!r.ok) {
      setMessage("Could not start checkout.");
      return;
    }
    const j = (await r.json()) as { url: string | null };
    if (j.url) window.location.href = j.url;
  }

  async function portal() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    setBusy(true);
    const r = await apiFetch("/api/billing/portal-session", { method: "POST", token });
    setBusy(false);
    if (!r.ok) return;
    const j = (await r.json()) as { url: string | null };
    if (j.url) window.location.href = j.url;
  }

  if (email) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-balance">Account</h1>
        <p className="text-sm text-muted-foreground">Signed in as {email}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            className="ui-control flex h-9 cursor-pointer items-center justify-center bg-primary text-primary-foreground hover:opacity-90"
            onClick={checkout}
          >
            Subscribe
          </button>
          <button
            type="button"
            disabled={busy}
            className="ui-control flex h-9 cursor-pointer items-center justify-center hover:bg-muted"
            onClick={portal}
          >
            Manage billing
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-lg gap-8 md:grid-cols-2">
      <div>
        <h2 className="text-base">Sign in</h2>
        <form className="mt-4 space-y-3" onSubmit={signIn}>
          <label className="block space-y-1">
            <span>Email</span>
            <input name="email" type="email" required className="ui-control w-full" />
          </label>
          <label className="block space-y-1">
            <span>Password</span>
            <input name="password" type="password" required className="ui-control w-full" />
          </label>
          <button type="submit" disabled={busy} className="ui-control w-full cursor-pointer bg-primary text-primary-foreground">
            Sign in
          </button>
        </form>
      </div>
      <div>
        <h2 className="text-base">Create account</h2>
        <form className="mt-4 space-y-3" onSubmit={signUp}>
          <label className="block space-y-1">
            <span>Email</span>
            <input name="email" type="email" required className="ui-control w-full" />
          </label>
          <label className="block space-y-1">
            <span>Password</span>
            <input name="password" type="password" required className="ui-control w-full" />
          </label>
          <button type="submit" disabled={busy} className="ui-control w-full cursor-pointer border border-border bg-card">
            Sign up
          </button>
        </form>
      </div>
      {message ? <p className="col-span-full text-sm">{message}</p> : null}
    </div>
  );
}
