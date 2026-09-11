/* PREFERÊNCIAS DO USUÁRIO, lidas e gravadas na conta.
 *
 * Uma linha em `preferencias_usuario` por pessoa: paleta e ordem do menu. O
 * provider carrega a linha quando a sessão aparece e expõe setters que gravam
 * por upsert. Quem consome (ThemeProvider, AppSidebar) não fala com o banco.
 *
 * `carregado` distingue "ainda não sei" de "sei que não tem nada": o tema só
 * deve sobrescrever a cópia do navegador quando a resposta do servidor chegou.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { paletaValida, mesmaOrdem, fundoOuPadrao, type Paleta, type Fundo } from "@/lib/preferencias";

interface Preferencias {
  carregado: boolean;
  paleta: Paleta | null;
  ordemMenu: string[] | null;
  /** a textura de fundo da conversa; nunca nulo, porque a tela sempre desenha algo */
  fundoConversa: Fundo;
  setPaleta: (p: Paleta) => void;
  setOrdemMenu: (ordem: string[] | null) => void;
  setFundoConversa: (f: Fundo) => void;
}

const Ctx = createContext<Preferencias>({
  carregado: false, paleta: null, ordemMenu: null, fundoConversa: "solido",
  setPaleta: () => {}, setOrdemMenu: () => {}, setFundoConversa: () => {},
});

export const usePreferencias = () => useContext(Ctx);

interface Linha { paleta: string | null; ordem_menu: string[] | null; fundo_conversa: string | null }

export function PreferenciasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [carregado, setCarregado] = useState(false);
  const [paleta, setPaletaState] = useState<Paleta | null>(null);
  const [ordemMenu, setOrdemState] = useState<string[] | null>(null);
  const [fundoConversa, setFundoState] = useState<Fundo>("solido");
  const uidRef = useRef(uid);
  uidRef.current = uid;

  useEffect(() => {
    setCarregado(false);
    setPaletaState(null);
    setOrdemState(null);
    setFundoState("solido");
    if (!uid) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("preferencias_usuario" as never)
        .select("paleta, ordem_menu, fundo_conversa")
        .eq("user_id", uid)
        .maybeSingle();
      if (!vivo) return;
      if (!error && data) {
        const l = data as unknown as Linha;
        setPaletaState(paletaValida(l.paleta) ? l.paleta : null);
        setOrdemState(Array.isArray(l.ordem_menu) ? l.ordem_menu : null);
        setFundoState(fundoOuPadrao(l.fundo_conversa));
      }
      setCarregado(true);
    })();
    return () => { vivo = false; };
  }, [uid]);

  const gravar = useCallback(async (campos: Partial<Linha>) => {
    const id = uidRef.current;
    if (!id) return;
    const { error } = await supabase
      .from("preferencias_usuario" as never)
      .upsert({ user_id: id, ...campos } as never, { onConflict: "user_id" });
    if (error) console.warn("[preferencias] não gravou:", error.message);
  }, []);

  const setPaleta = useCallback((p: Paleta) => {
    setPaletaState((atual) => {
      if (atual !== p) void gravar({ paleta: p });
      return p;
    });
  }, [gravar]);

  const setOrdemMenu = useCallback((ordem: string[] | null) => {
    setOrdemState((atual) => {
      if (!mesmaOrdem(atual, ordem)) void gravar({ ordem_menu: ordem });
      return ordem;
    });
  }, [gravar]);

  const setFundoConversa = useCallback((f: Fundo) => {
    setFundoState((atual) => {
      if (atual !== f) void gravar({ fundo_conversa: f });
      return f;
    });
  }, [gravar]);

  const valor = useMemo(
    () => ({ carregado, paleta, ordemMenu, fundoConversa, setPaleta, setOrdemMenu, setFundoConversa }),
    [carregado, paleta, ordemMenu, fundoConversa, setPaleta, setOrdemMenu, setFundoConversa]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
