import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Ctx = { query: string; setQuery: (q: string) => void };

const ShellSearchContext = createContext<Ctx | null>(null);

export function ShellSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <ShellSearchContext.Provider value={value}>{children}</ShellSearchContext.Provider>;
}

export function useShellSearch() {
  const ctx = useContext(ShellSearchContext);
  if (!ctx) throw new Error("useShellSearch must be used inside ShellSearchProvider");
  return ctx;
}
