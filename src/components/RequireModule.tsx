import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/lib/modules";

interface Props {
  module?: ModuleKey;
  adminOnly?: boolean;
}

export function RequireModule({ module, adminOnly = false }: Props) {
  const { modules, isAdmin, loading, accessReady } = useAuth();

  // Aguarda tanto a sessão quanto o profile/modules carregarem antes de
  // decidir. Sem isso, o guard redireciona durante o intervalo entre
  // user-detectado e profile-carregado, criando loop com Index.
  if (loading || !accessReady) return null;

  if (adminOnly) {
    return isAdmin ? <Outlet /> : <Navigate to="/dashboard" replace />;
  }

  if (module && !isAdmin && !modules.includes(module)) {
    const fallback = modules[0];
    // IMPORTANTE: sem NENHUM módulo, NÃO redirecionar pra "/". Isso criava um
    // loop / ↔ /dashboard que estourava o replaceState do Safari e travava o
    // app (tela "Algo travou ao carregar"). Aqui mostramos uma tela
    // recuperável — normalmente é falha transitória de carga no mobile.
    if (!fallback) return <SemModulos />;
    return <Navigate to={`/${fallback.replace(/_/g, "-")}`} replace />;
  }

  return <Outlet />;
}

function SemModulos() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8">
        <h1 className="text-lg font-semibold text-foreground">Não conseguimos carregar seu acesso</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Geralmente é uma falha momentânea de conexão. Recarregue a página. Se continuar,
          fale com o administrador pra confirmar seus módulos liberados.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition"
          >
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
