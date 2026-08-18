import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

// Same key index.html's blocking inline script reads before React ever
// loads — the two must agree, or the no-flash guarantee breaks.
const STORAGE_KEY = "sopt-theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.) — same as "system".
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    preference === "system" ? getSystemTheme() : preference,
  );

  // useLayoutEffect, not useEffect: the inline script in index.html
  // already applied the right attribute before React loaded, so this
  // is mostly a no-op re-confirmation in practice — but synchronous,
  // pre-paint application is the correct guarantee to hold regardless
  // of that script existing, not something to rely on it alone for.
  useLayoutEffect(() => {
    const applied = preference === "system" ? getSystemTheme() : preference;
    setResolvedTheme(applied);

    const root = document.documentElement;
    if (preference === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", preference);
    }
  }, [preference]);

  // While "system" is active, react to the OS preference changing
  // without a reload — a plain useState read on mount wouldn't notice
  // a live OS-level flip on its own.
  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      setResolvedTheme(mql.matches ? "dark" : "light");
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [preference]);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme still works for the rest of this session via React state
      // even if it can't persist across a reload.
    }
  }

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return context;
}
