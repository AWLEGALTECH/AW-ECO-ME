import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { ALL_MODULE_KEYS, type ModuleKey } from "@/lib/modules";

interface Profile {
  id: string;
  nome: string | null;
  email: string | null;
  avatar_url: string | null;
  role: "admin" | "user";
  approved: boolean;
  ver_fechamentos_geral?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  modules: ModuleKey[];   // admin sempre recebe todos
  isAdmin: boolean;
  loading: boolean;
  accessReady: boolean;   // true depois que loadAccess rodou ao menos 1x
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  modules: [],
  isAdmin: false,
  loading: true,
  accessReady: false,
  signOut: async () => {},
  refreshAccess: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessReady, setAccessReady] = useState(false);

  const loadAccess = async (userId: string, tentativa = 0): Promise<Profile | null> => {
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, nome, email, avatar_url, role, approved, ver_fechamentos_geral")
      .eq("id", userId)
      .single();

    // Falha de rede/servidor (NÃO "0 linhas"): tenta de novo. Sem isso, uma
    // falha transitória no boot (comum no mobile) deixava modules=[], e o
    // RequireModule redirecionava em loop (/ ↔ /dashboard), estourando o
    // limite de replaceState do Safari e travando o app.
    if (error && error.code !== "PGRST116" && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 700 * (tentativa + 1)));
      return loadAccess(userId, tentativa + 1);
    }

    if (!prof) {
      setProfile(null);
      setModules([]);
      setAccessReady(true);
      return null;
    }

    // Bloqueio: não aprovado → desloga
    if (!prof.approved) {
      toast.error("Cadastro aguardando aprovação do administrador.", { duration: 6000 });
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setModules([]);
      setAccessReady(true);
      return null;
    }

    // Carrega modules ANTES de marcar accessReady, pra guards não verem
    // (profile=ok, modules=[]) num intervalo intermediário.
    let nextModules: ModuleKey[];
    if (prof.role === "admin") {
      nextModules = ALL_MODULE_KEYS;
    } else {
      const { data: rows, error: errMods } = await supabase
        .from("user_module_access")
        .select("module_key")
        .eq("user_id", userId);
      // Falha ao ler os módulos: tenta de novo antes de assumir vazio (que
      // levaria ao loop de redirecionamento).
      if (errMods && tentativa < 3) {
        await new Promise((r) => setTimeout(r, 700 * (tentativa + 1)));
        return loadAccess(userId, tentativa + 1);
      }
      nextModules = ((rows || []).map(r => r.module_key) as ModuleKey[]);
    }

    setProfile(prof as Profile);
    setModules(nextModules);
    setAccessReady(true);
    return prof as Profile;
  };

  useEffect(() => {
    // Evita disparar loadAccess 2x pro mesmo uid quando getSession e o
    // INITIAL_SESSION do onAuthStateChange ambos resolvem no boot.
    let lastLoadedUid: string | null = null;

    const ensureLoaded = (uid: string) => {
      if (lastLoadedUid === uid) return;
      lastLoadedUid = uid;
      loadAccess(uid);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          ensureLoaded(currentUser.id);
        } else {
          lastLoadedUid = null;
          setProfile(null);
          setModules([]);
          setAccessReady(true);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        ensureLoaded(currentUser.id);
      } else {
        setAccessReady(true);
      }
      setLoading(false);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // ── Presença ──────────────────────────────────────────────────────────────
  // "Último acesso" era deduzido da renovação do token, que acontece de hora em
  // hora: quem estava trabalhando naquele instante aparecia sumido há 47
  // minutos, e o número andava aos saltos. Deduzir presença de um evento
  // horário não se conserta afinando a conta — o dado não existe na
  // granularidade certa. Então o app carimba.
  //
  // Efeito separado, e não junto do de sessão, porque ele depende do usuário já
  // resolvido: chamar de dentro daquele exigiria referenciar a função antes da
  // declaração dela.
  //
  // Só com a aba VISÍVEL: aba esquecida aberta a noite toda diria que a pessoa
  // trabalhou a noite toda.
  useEffect(() => {
    if (!user) return;
    const PULSO = 3 * 60 * 1000;
    let ultimo = 0;
    const marcar = () => {
      if (document.visibilityState !== "visible") return;
      const agora = Date.now();
      if (agora - ultimo < PULSO) return;
      ultimo = agora;
      supabase.rpc("fn_marcar_presenca" as never).then(() => {}, () => {});
    };
    marcar();
    const relogio = window.setInterval(marcar, PULSO);
    document.addEventListener("visibilitychange", marcar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", marcar);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setModules([]);
  };

  const refreshAccess = async () => {
    if (user) await loadAccess(user.id);
  };

  const isAdmin = profile?.role === "admin" && profile?.approved === true;

  return (
    <AuthContext.Provider value={{ user, profile, modules, isAdmin, loading, accessReady, signOut, refreshAccess }}>
      {!loading ? (
        children
      ) : (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
