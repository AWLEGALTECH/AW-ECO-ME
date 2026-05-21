import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { UserPanel } from "@/components/UserPanel";
import { useAuth } from "@/hooks/useAuth";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";

export function SidebarLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Guard de sessão: se a sessão expirou enquanto o user estava em uma rota
  // protegida, redireciona pra "/" (que mostra a tela de login). Antes,
  // queries quebravam silenciosamente em 401 e o user via "erros aleatórios"
  // até descobrir que o login venceu — agora a transição é explícita.
  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user) hadUserRef.current = true;
    else if (hadUserRef.current && !loading) {
      // só toasta se o user EXISTIA antes (= expiração real, não mount inicial)
      toast.error("Sessão expirada. Faça login novamente.", { duration: 6000 });
    }
  }, [user, loading]);

  if (loading) {
    // AuthProvider já mostra um spinner global durante o boot — aqui é só
    // pra evitar piscar pra Auth antes do session check terminar.
    return null;
  }
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return (
    <SidebarProvider>
      {/* Full-screen deep space canvas */}
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        {/* Ambient light orbs in background */}
        <div className="mesh-blob mesh-blob-1 pointer-events-none" />
        <div className="mesh-blob mesh-blob-2 pointer-events-none" />
        <div className="mesh-blob mesh-blob-3 pointer-events-none" />

        {/* Floating sidebar – margin + rounded corners to "detach" it from screen edge */}
        <div className="relative z-20 flex flex-col p-3 shrink-0">
          <div className="h-full rounded-2xl overflow-hidden glass-sidebar border border-white/[0.06]">
            <AppSidebar />
          </div>
        </div>

        {/* Main content column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 z-10 overflow-hidden">
          {/* Glassy topbar header */}
          <header className="h-14 flex items-center justify-between px-4 shrink-0 z-30
            glass-card border-b border-white/[0.06] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            {location.pathname.startsWith("/clientes") ? <GlobalSearch /> : <div />}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden md:inline font-mono">
                {user?.email}
              </span>
              <UserPanel />
            </div>
          </header>

          {/* Page content – overflow-y-auto for normal pages (Dashboard, Financeiro, etc.)
              relative allows Atendimento to position absolute and escape the scroll. */}
          <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-3 sm:px-6 sm:py-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
