import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { SidebarLayout } from "@/components/SidebarLayout";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import ClienteDetail from "./pages/ClienteDetail";
import ClientesArquivados from "./pages/ClientesArquivados";
import Processos from "./pages/Processos";
import ProcessosParados from "./pages/ProcessosParados";
import ProcessoDetail from "./pages/ProcessoDetail";
import Tarefas from "./pages/Tarefas";
import Writer from "./pages/Writer";
import Finder from "./pages/Finder";
import PreClientes from "./pages/PreClientes";
import Esteira from "./pages/Esteira";
import Publicacoes from "./pages/Publicacoes";
import Fechamentos from "./pages/Fechamentos";
import Balance from "./pages/Balance";
import Tracker from "./pages/Tracker";
import Chamados from "./pages/Chamados";
import Projetos from "./pages/Projetos";
import Spy from "./pages/Spy";
import Sheets from "./pages/Sheets";
import Marketing from "./pages/Marketing";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminLogs from "./pages/AdminLogs";
import NotFound from "./pages/NotFound";
import { RequireModule } from "@/components/RequireModule";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "aw-eco-me-query-cache-v1",
  throttleTime: 1000,
});

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: "v5-socio-11-campos" }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route element={<SidebarLayout />}>
                <Route element={<RequireModule module="dashboard" />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                </Route>
                <Route element={<RequireModule module="clientes" />}>
                  <Route path="/clientes" element={<Clientes />} />
                  {/* Antes da rota com :id — senão "arquivados" seria lido como
                      um id de cliente. */}
                  <Route path="/clientes/arquivados" element={<ClientesArquivados />} />
                  <Route path="/clientes/:id" element={<ClienteDetail />} />
                </Route>
                <Route element={<RequireModule module="processos" />}>
                  <Route path="/processos" element={<Processos />} />
                  <Route path="/processos/parados/:faixa" element={<ProcessosParados />} />
                  <Route path="/processos/:id" element={<ProcessoDetail />} />
                  <Route path="/tarefas" element={<Tarefas />} />
                </Route>
                <Route element={<RequireModule module="writer" />}>
                  <Route path="/writer" element={<Writer />} />
                </Route>
                <Route element={<RequireModule module="finder" />}>
                  <Route path="/finder" element={<Finder />} />
                </Route>
                <Route element={<RequireModule module="pre_clientes" />}>
                  <Route path="/pre-clientes" element={<PreClientes />} />
                </Route>
                <Route element={<RequireModule module="esteira" />}>
                  <Route path="/esteira" element={<Esteira />} />
                </Route>
                <Route element={<RequireModule module="publicacoes" />}>
                  <Route path="/publicacoes" element={<PageErrorBoundary pageName="Publicações"><Publicacoes /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="fechamentos" />}>
                  <Route path="/fechamentos" element={<PageErrorBoundary pageName="Fechamentos"><Fechamentos /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="balance" />}>
                  <Route path="/balance" element={<PageErrorBoundary pageName="Balance"><Balance /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="tracker" />}>
                  <Route path="/tracker" element={<PageErrorBoundary pageName="Tracker"><Tracker /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="projetos" />}>
                  <Route path="/projetos" element={<PageErrorBoundary pageName="Projetos"><Projetos /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="chamados" />}>
                  <Route path="/chamados" element={<PageErrorBoundary pageName="Chamados"><Chamados /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="spy" />}>
                  <Route path="/spy" element={<PageErrorBoundary pageName="Spy"><Spy /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="sheets" />}>
                  <Route path="/sheets" element={<PageErrorBoundary pageName="Sheets"><Sheets /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule module="marketing" />}>
                  <Route path="/marketing" element={<PageErrorBoundary pageName="Marketing"><Marketing /></PageErrorBoundary>} />
                </Route>
                <Route element={<RequireModule adminOnly />}>
                  <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                  <Route path="/admin/logs" element={<AdminLogs />} />
                  {/* A central virou aba dentro de Usuários. A rota antiga
                      continua respondendo, pra não quebrar link salvo. */}
                  <Route path="/admin/notificacoes" element={<Navigate to="/admin/usuarios" replace />} />
                </Route>
                <Route path="/home" element={<Navigate to="/dashboard" replace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
