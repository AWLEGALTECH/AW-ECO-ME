import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/lib/modules";

interface Props {
  module?: ModuleKey;
  adminOnly?: boolean;
}

export function RequireModule({ module, adminOnly = false }: Props) {
  const { modules, isAdmin, loading } = useAuth();
  if (loading) return null;

  if (adminOnly) {
    return isAdmin ? <Outlet /> : <Navigate to="/dashboard" replace />;
  }

  if (module && !isAdmin && !modules.includes(module)) {
    // fallback: tenta jogar pro primeiro módulo permitido; se não tem nenhum, /
    const fallback = modules[0];
    return <Navigate to={fallback ? `/${fallback.replace("_", "-")}` : "/"} replace />;
  }

  return <Outlet />;
}
