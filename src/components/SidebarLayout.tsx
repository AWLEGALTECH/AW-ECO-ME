import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
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
import { SpyProgressBar } from "@/components/SpyProgressBar";

export function SidebarLayout() {
  const { user, loading, accessReady } = useAuth();
  const { palette } = useTheme();
  const isSei = palette === "sei";
  const location = useLocation();

  /* AS TELAS QUE SE COMPORTAM COMO APLICATIVO, e não como documento: elas
     ocupam exatamente a altura disponível e cuidam da própria rolagem por
     dentro. Uma lista, e não uma propriedade da página, porque quem decide se
     a moldura rola é a moldura — a página não tem como alcançá-la. */
  const telaDeAplicativo = location.pathname.startsWith("/atendimento");

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
          className="flex flex-col w-full overflow-hidden bg-background"
          style={{
            /* `100dvh` fica de reserva pro primeiro quadro, antes de a medida
               existir — e é o que vale no monitor, onde as duas são iguais. */
            height: "var(--app-altura, 100dvh)",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
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
                  <SidebarTrigger className={`h-10 w-10 md:h-7 md:w-7 [&_svg]:size-6 md:[&_svg]:size-4 ${isSei ? "text-white" : "text-muted-foreground hover:text-foreground transition-colors"}`} />
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
                {/* ── QUEM ROLA, E QUEM NÃO ──
                    A maioria das telas é documento: uma lista comprida que rola
                    dentro desta caixa, com respiro em volta. O Atendimento é o
                    contrário — é um APLICATIVO: cabeçalho parado, colunas com
                    rolagem própria, campo de digitar colado embaixo. Numa caixa
                    que rola, ele rolava junto, e o cartão do número e o
                    cabeçalho da conversa saíam pelo topo.

                    A tentação era a página se medir sozinha (`calc(100dvh -
                    5rem)`), e foi o que eu fiz — e estava errado por baixo: a
                    conta ignorava as áreas seguras do iPhone. Com entalhe em
                    cima e barra de gesto embaixo, a página ficava uns noventa
                    pixels mais alta que o buraco onde ela mora, e a caixa rolava
                    exatamente essa sobra. O jeito de não errar a conta é não
                    fazer conta: aqui a rolagem simplesmente não existe, e a
                    altura vem da cadeia de flex, que já desconta tudo. */}
                <div className={cn("flex-1 min-h-0 min-w-0 overflow-x-hidden",
                  telaDeAplicativo
                    /* `flex flex-col` pra página poder ser `flex-1`: altura em
                       porcentagem depende do pai ter altura definida, e um item
                       de flex nem sempre tem — `flex-1` não depende de nada. */
                    ? "overflow-hidden flex flex-col"
                    : "overflow-y-auto scrollbar-thin px-3 py-3 sm:px-6 sm:py-6")}>
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
        <SpyProgressBar />
      </SidebarProvider>
    </FinderSessionProvider>
  );
}
