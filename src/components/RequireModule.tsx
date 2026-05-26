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
    return <Navigate to={fallback ? `/${fallback.replace("_", "-")}` : "/"} replace />;
  }

  return <Outlet />;
}
