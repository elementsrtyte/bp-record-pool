import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Monorepo root (contains shared `.env.local`). */
const monorepoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, "");
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  const apiUrl = env.VITE_API_URL || env.API_PUBLIC_URL || "http://localhost:3000";

  return {
    envDir: monorepoRoot,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnon),
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl.replace(/\/$/, "")),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
    },
  };
});
