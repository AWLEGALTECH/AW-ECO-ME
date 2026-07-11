import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

export type Palette = "default" | "midnight-blue" | "vermelho" | "space-gray" | "sei";

interface ThemeContextType {
  palette: Palette;
  setPalette: (p: Palette) => void;
  // Mantido por compat — modo claro/escuro nao e mais usado, sempre dark.
  mode: "dark";
  setMode: (m: "dark") => void;
}

const ThemeContext = createContext<ThemeContextType>({
  palette: "default",
  setPalette: () => {},
  mode: "dark",
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "aw-theme-palette";

function readStoredPalette(): Palette {
  if (typeof window === "undefined") return "default";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "midnight-blue" || v === "vermelho" || v === "space-gray" || v === "sei") return v;
  return "default";
}

function applyPalette(p: Palette) {
  const root = document.documentElement;
  if (p === "default") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", p);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<Palette>(() => readStoredPalette());

  useEffect(() => {
    // SEI eh light mode (fundo branco, sidebar branca) — todas as outras
    // paletas continuam dark.
    if (palette === "sei") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    applyPalette(palette);
  }, [palette]);

  const setPalette = useCallback((p: Palette) => {
    setPaletteState(p);
    window.localStorage.setItem(STORAGE_KEY, p);
    applyPalette(p);
    // Notifica iframes (writer/finder) que ja podem estar abertos
    try {
      const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
      iframes.forEach((f) => {
        f.contentWindow?.postMessage({ type: "aw-theme:palette", palette: p }, window.location.origin);
      });
    } catch {}
  }, []);

  // No-op pra compat com chamadas antigas a setMode
  const setMode = useCallback((_m: "dark") => {}, []);

  return (
    <ThemeContext.Provider value={{ palette, setPalette, mode: "dark", setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
