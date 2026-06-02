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
import Processos from "./pages/Processos";
import ProcessoDetail from "./pages/ProcessoDetail";
import Writer from "./pages/Writer";
import Finder from "./pages/Finder";
import PreClientes from "./pages/PreClientes";
import Esteira from "./pages/Esteira";
import Publicacoes from "./pages/Publicacoes";
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
    persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: "v1" }}
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
                  <Route path="/clientes/:id" element={<ClienteDetail />} />
                </Route>
                <Route element={<RequireModule module="processos" />}>
                  <Route path="/processos" element={<Processos />} />
                  <Route path="/processos/:id" element={<ProcessoDetail />} />
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
                <Route element={<RequireModule adminOnly />}>
                  <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                  <Route path="/admin/logs" element={<AdminLogs />} />
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
