import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type ThemeColor = "blue" | "green" | "red" | "purple" | "gold";

interface ThemeContextType {
  mode: "light" | "dark";
  color: ThemeColor;
  setMode: (m: "light" | "dark") => void;
  setColor: (c: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  color: "blue",
  setMode: () => {},
  setColor: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const COLOR_MAP: Record<ThemeColor, { primary: string; ring: string }> = {
  blue: { primary: "210 70% 50%", ring: "210 70% 50%" },
  green: { primary: "142 71% 45%", ring: "142 71% 45%" },
  red: { primary: "0 72% 51%", ring: "0 72% 51%" },
  purple: { primary: "270 60% 50%", ring: "270 60% 50%" },
  gold: { primary: "38 92% 50%", ring: "38 92% 50%" },
};

const DARK_COLOR_MAP: Record<ThemeColor, { primary: string; primaryFg: string }> = {
  blue: { primary: "210 70% 60%", primaryFg: "0 0% 8%" },
  green: { primary: "142 71% 55%", primaryFg: "0 0% 8%" },
  red: { primary: "0 72% 60%", primaryFg: "0 0% 98%" },
  purple: { primary: "270 60% 60%", primaryFg: "0 0% 98%" },
  gold: { primary: "38 92% 60%", primaryFg: "0 0% 8%" },
};

function applyTheme(mode: "light" | "dark", color: ThemeColor) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  if (color !== "blue") {
    const c = mode === "dark" ? DARK_COLOR_MAP[color] : COLOR_MAP[color];
    root.style.setProperty("--primary", c.primary);
    root.style.setProperty("--ring", COLOR_MAP[color].ring);
    if (mode === "dark" && "primaryFg" in c) {
      root.style.setProperty("--primary-foreground", (c as any).primaryFg);
    }
  } else {
    // Reset to defaults
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--primary-foreground");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<"light" | "dark">("light");
  const [color, setColorState] = useState<ThemeColor>("blue");

  // Load from profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("theme_mode, theme_color")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const m = (data.theme_mode as "light" | "dark") || "light";
          const c = (data.theme_color as ThemeColor) || "blue";
          setModeState(m);
          setColorState(c);
          applyTheme(m, c);
        }
      });
  }, [user]);

  const saveToProfile = useCallback(
    async (updates: { theme_mode?: string; theme_color?: string }) => {
      if (!user) return;
      await supabase.from("profiles").update(updates).eq("user_id", user.id);
    },
    [user]
  );

  const setMode = useCallback(
    (m: "light" | "dark") => {
      setModeState(m);
      applyTheme(m, color);
      saveToProfile({ theme_mode: m });
    },
    [color, saveToProfile]
  );

  const setColor = useCallback(
    (c: ThemeColor) => {
      setColorState(c);
      applyTheme(mode, c);
      saveToProfile({ theme_color: c });
    },
    [mode, saveToProfile]
  );

  return (
    <ThemeContext.Provider value={{ mode, color, setMode, setColor }}>
      {children}
    </ThemeContext.Provider>
  );
}