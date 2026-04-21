"use client";

import { Toast } from "@heroui/react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ─── Theme context (replaces next-themes — no <script> in component tree) ────

type Theme = "light" | "dark";

type ThemeContextValue = {
  resolvedTheme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeCtx = createContext<ThemeContextValue>({
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeCtx);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  // useState lazy initializer runs only on the client, after hydration.
  // Reading localStorage here (instead of in useEffect) means the dark class
  // is applied in the same React commit that mounts the tree, avoiding a
  // second paint. suppressHydrationWarning on <html> covers the class mismatch
  // between the SSR-rendered "light" and the client-detected theme.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const stored = localStorage.getItem("nuba-theme") as Theme | null;
      const resolved = stored === "dark" || stored === "light" ? stored : "light";
      if (resolved === "dark") document.documentElement.classList.add("dark");
      return resolved;
    } catch {
      return "light";
    }
  });

  // Keep in sync with changes made in other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "nuba-theme" && (e.newValue === "dark" || e.newValue === "light")) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    try {
      localStorage.setItem("nuba-theme", t);
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  return <ThemeCtx.Provider value={{ resolvedTheme: theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

// ─── App Providers ─────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toast.Provider placement="bottom end" />
    </ThemeProvider>
  );
}
