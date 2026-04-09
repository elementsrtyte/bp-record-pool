import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function LoginPage() {
  const nav = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
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
    else nav("/tracks");
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-base">Admin sign in</h1>
      <p className="text-sm text-muted-foreground">
        Sign in with the same email as <code className="text-xs">ADMIN_EMAIL</code> in your API env (or a user
        with <code className="text-xs">profiles.role = admin</code> if that variable is unset).
      </p>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1">
          <span>Email</span>
          <input name="email" type="email" required className="ui-control w-full" />
        </label>
        <label className="block space-y-1">
          <span>Password</span>
          <input name="password" type="password" required className="ui-control w-full" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="ui-control w-full cursor-pointer bg-primary text-primary-foreground"
        >
          Sign in
        </button>
      </form>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
