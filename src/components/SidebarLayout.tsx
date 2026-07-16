import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { UserPanel } from "@/components/UserPanel";
import { NotificacaoBell } from "@/components/NotificacaoBell";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { FinderSessionProvider } from "@/hooks/useFinderSession";
import { PersistentFinderHost } from "@/components/PersistentFinderHost";
import { FinderPill } from "@/components/FinderPill";

export function SidebarLayout() {
  const { user, loading, accessReady } = useAuth();
  const { palette } = useTheme();
  const isSei = palette === "sei";
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

  if (loading || (user && !accessReady)) {
    // AuthProvider já mostra um spinner global durante o boot — aqui é só
    // pra evitar piscar pra Auth antes do session check terminar, e pra
    // não renderizar a sidebar antes de saber quais módulos mostrar.
    return null;
  }
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return (
    <FinderSessionProvider>
      <SidebarProvider>
        {/* Full-screen deep space canvas.
            iOS PWA (adicionado à tela inicial) usa status bar translúcida que
            sobrepõe o topo — o botão da sidebar ficava embaixo do relógio.
            Respeitamos a safe area no topo/base (com border-box a altura segue
            100dvh, só a área útil encolhe, sem overflow). */}
        <div
          className="flex flex-col h-dvh w-full overflow-hidden bg-background"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Faixa do topo no SEI — azul escuro #155f9b com texto branco
              (replica o "CONSELHO FEDERAL DE MEDICINA" do SEI real). */}
          {isSei && (
            <div
              className="shrink-0 h-5 flex items-center px-3 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ background: "#155f9b", color: "white" }}
            >
              AW LEGALTECH
            </div>
          )}

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Ambient light orbs in background — escondidos no SEI via CSS */}
            <div className="mesh-blob mesh-blob-1 pointer-events-none" />
            <div className="mesh-blob mesh-blob-2 pointer-events-none" />
            <div className="mesh-blob mesh-blob-3 pointer-events-none" />

            {/* Sidebar wrapper — sem padding/borderradius no SEI pra encostar
                na borda como o sistema do governo faz. */}
            <div className={`relative z-20 flex flex-col shrink-0 ${isSei ? "" : "p-3"}`}>
              <div className={`h-full overflow-hidden ${isSei ? "border-r border-sidebar-border" : "rounded-2xl glass-sidebar border border-sidebar-border"}`}>
                <AppSidebar />
              </div>
            </div>

            {/* Main content column */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 z-10 overflow-hidden">
              {/* Topbar — fica cyan no SEI via override CSS scoped */}
              <header className={`h-14 flex items-center justify-between px-4 shrink-0 z-30 ${isSei ? "" : "glass-card border-b border-sidebar-border backdrop-blur-xl"}`}>
                <div className="flex items-center gap-2">
                  <SidebarTrigger className={isSei ? "text-white" : "text-muted-foreground hover:text-foreground transition-colors"} />
                </div>
                <div />
                <div className="flex items-center gap-2">
                  <span className={`text-xs hidden md:inline font-mono ${isSei ? "text-white" : "text-muted-foreground"}`}>
                    {user?.email}
                  </span>
                  <NotificacaoBell />
                  <UserPanel />
                </div>
              </header>

              <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col relative">
                <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-3 sm:px-6 sm:py-6">
                  <Outlet />
                </div>
                {/* Iframe persistente do Finder — sobreposto ao Outlet quando
                    rota /finder, off-screen quando em outras rotas (mas vivo). */}
                <PersistentFinderHost />
              </main>
            </div>
          </div>
        </div>
        {/* Pill fixa no topo da janela quando ha sessao Finder ativa e
            o user nao esta em /finder. */}
        <FinderPill />
      </SidebarProvider>
    </FinderSessionProvider>
  );
}
