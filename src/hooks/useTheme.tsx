import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface ThemeContextType {
  mode: "light" | "dark";
  setMode: (m: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// Roxo fixo — paleta única do sistema.
const PURPLE_LIGHT = { primary: "270 60% 50%", primaryFg: "0 0% 98%" };
const PURPLE_DARK  = { primary: "270 60% 60%", primaryFg: "0 0% 98%" };

function applyTheme(mode: "light" | "dark") {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  const c = mode === "dark" ? PURPLE_DARK : PURPLE_LIGHT;
  root.style.setProperty("--primary", c.primary);
  root.style.setProperty("--ring", c.primary);
  root.style.setProperty("--accent", c.primary);
  root.style.setProperty("--primary-foreground", c.primaryFg);
  root.style.setProperty("--accent-foreground", c.primaryFg);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<"light" | "dark">("dark");

  useEffect(() => {
    applyTheme("dark");
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("theme_mode")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const m = (data.theme_mode as "light" | "dark") || "dark";
          setModeState(m);
          applyTheme(m);
        }
      });
  }, [user]);

  const setMode = useCallback(
    (m: "light" | "dark") => {
      setModeState(m);
      applyTheme(m);
      if (user) {
        supabase.from("profiles").update({ theme_mode: m }).eq("user_id", user.id);
      }
    },
    [user]
  );

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
