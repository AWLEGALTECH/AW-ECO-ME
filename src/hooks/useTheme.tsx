/* TEMA (paleta de cores).
 *
 * A escolha mora na CONTA (`preferencias_usuario`, via usePreferencias). O
 * localStorage continua existindo por um motivo só: pintar a primeira tela na
 * cor certa antes da resposta do servidor chegar, sem piscar. Quando a resposta
 * chega, o servidor vence. Limpar cookies, trocar de máquina ou de navegador
 * não muda mais a cor do sistema.
 *
 * O finder (iframe) lê a mesma chave do localStorage e escuta o postMessage,
 * então a cópia local também o mantém sincronizado.
 */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { usePreferencias } from "@/hooks/usePreferencias";
import { paletaValida, type Paleta } from "@/lib/preferencias";

export type Palette = Paleta;

interface ThemeContextType {
  palette: Palette;
  setPalette: (p: Palette) => void;
  // Mantido por compat: modo claro/escuro nao e mais usado, sempre dark.
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
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return paletaValida(v) ? v : "default";
  } catch { return "default"; }
}

function guardarNoNavegador(p: Palette) {
  try { window.localStorage.setItem(STORAGE_KEY, p); } catch { /* modo privado */ }
}

function applyPalette(p: Palette) {
  const root = document.documentElement;
  if (p === "default") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", p);
  }
  // SEI eh light mode (fundo branco, sidebar branca); as outras continuam dark.
  root.classList.toggle("dark", p !== "sei");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefs = usePreferencias();
  const [palette, setPaletteState] = useState<Palette>(() => readStoredPalette());

  useEffect(() => {
    applyPalette(palette);
    // Notifica iframes (writer/finder) que ja podem estar abertos
    try {
      document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) => {
        f.contentWindow?.postMessage({ type: "aw-theme:palette", palette }, window.location.origin);
      });
    } catch { /* iframe de outra origem */ }
  }, [palette]);

  // A resposta do servidor chegou: ela manda. Se a conta ainda não tem paleta
  // gravada e o navegador tinha uma escolha, a escolha sobe para a conta (é a
  // migração de quem escolheu a cor antes disto existir).
  useEffect(() => {
    if (!prefs.carregado) return;
    if (prefs.paleta) {
      if (prefs.paleta !== palette) {
        setPaletteState(prefs.paleta);
        guardarNoNavegador(prefs.paleta);
      }
    } else if (palette !== "default") {
      prefs.setPaleta(palette);
    }
    // `palette` de propósito fora das dependências: este efeito reage ao
    // servidor, não ao clique (o clique já grava nos dois lugares).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.carregado, prefs.paleta]);

  const setPalette = useCallback((p: Palette) => {
    setPaletteState(p);
    guardarNoNavegador(p);
    prefs.setPaleta(p);
  }, [prefs]);

  // No-op pra compat com chamadas antigas a setMode
  const setMode = useCallback((_m: "dark") => {}, []);

  return (
    <ThemeContext.Provider value={{ palette, setPalette, mode: "dark", setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
