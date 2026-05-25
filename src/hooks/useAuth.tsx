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
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  modules: ModuleKey[];   // admin sempre recebe todos
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  modules: [],
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  refreshAccess: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccess = async (userId: string) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, nome, email, avatar_url, role, approved")
      .eq("id", userId)
      .single();

    if (!prof) {
      setProfile(null);
      setModules([]);
      return null;
    }

    setProfile(prof as Profile);

    // Bloqueio: não aprovado → desloga
    if (!prof.approved) {
      toast.error("Cadastro aguardando aprovação do administrador.", { duration: 6000 });
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setModules([]);
      return null;
    }

    if (prof.role === "admin") {
      setModules(ALL_MODULE_KEYS);
    } else {
      const { data: rows } = await supabase
        .from("user_module_access")
        .select("module_key")
        .eq("user_id", userId);
      setModules(((rows || []).map(r => r.module_key) as ModuleKey[]));
    }

    return prof as Profile;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          setTimeout(() => loadAccess(currentUser.id), 0);
        } else {
          setProfile(null);
          setModules([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadAccess(currentUser.id);
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
    <AuthContext.Provider value={{ user, profile, modules, isAdmin, loading, signOut, refreshAccess }}>
      {!loading ? (
        children
      ) : (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
