import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

if (!url || !anon) {
  throw new Error(
    "Supabase client env missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_*) in the repo root .env / .env.local — see README.",
  );
}

export const supabase = createClient(url, anon);
