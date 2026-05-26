import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { appConfig } from "@/config/app-config";
import { useTheme } from "@/hooks/useTheme";
import { LayoutDashboard, Users, Briefcase, Scale, Zap, PenSquare, FileSignature, ScanSearch, Workflow, UserCog } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/lib/modules";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem { title: string; url: string; icon: any; badgeKey?: string; module: ModuleKey }

const navItems: NavItem[] = [
  { title: "Dashboard",     url: "/dashboard",     icon: LayoutDashboard, module: "dashboard" },
  { title: "Clientes",      url: "/clientes",      icon: Users,           module: "clientes" },
  { title: "Pré-clientes",  url: "/pre-clientes",  icon: FileSignature,   module: "pre_clientes", badgeKey: "pendentes" },
  { title: "Esteira",       url: "/esteira",       icon: Workflow,        module: "esteira",      badgeKey: "esteira" },
  { title: "Processos",     url: "/processos",     icon: Briefcase,       module: "processos" },
  { title: "Writer",        url: "/writer",        icon: PenSquare,       module: "writer" },
  { title: "Finder",        url: "/finder",        icon: ScanSearch,      module: "finder" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { palette } = useTheme();
  const { modules, isAdmin } = useAuth();
  const isSei = palette === "sei";
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = navItems.filter(it => isAdmin || modules.includes(it.module));

  // Pra "AW ECO ME" no SEI, destaca a ultima palavra em verde (#91bb24)
  // espelhando o "!" verde-lima do logo "sei!".
  const nomePartes = appConfig.name.trim().split(/\s+/);
  const nomeBase = nomePartes.slice(0, -1).join(" ");
  const nomeUltima = nomePartes[nomePartes.length - 1] || "";

  // Badge: contagem de pre-clientes aguardando assinatura (atualiza a cada 30s)
  const { data: pendentesCount } = useQuery({
    queryKey: ["pre_clientes_pendentes_count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("pre_clientes")
        .select("*", { count: "exact", head: true })
        .eq("status", "aguardando_assinatura");
      return count || 0;
    },
    refetchInterval: 30_000,
  });

  // Badge: contagem agregada da esteira pre-protocolo:
  // - clientes com tag de analise aguardando (sem nenhuma vinculada pendente)
  // - analises vinculadas pendentes (peca ainda nao finalizada)
  // - pecas prontas pendentes (sem protocolo)
  //
  // status='pendente' = ainda em producao na esteira.
  // status='concluida' = ja saiu da esteira (peca gerada / protocolada) -> NAO conta.
  const { data: esteiraCount } = useQuery({
    queryKey: ["esteira_count"],
    queryFn: async () => {
      const [tagged, vincAny, vincPendente, proto] = await Promise.all([
        supabase.from("clientes").select("id" as any, { count: "exact", head: false })
          .eq("precisa_analise_extratos" as any, true),
        // Qualquer vinculada nao-cancelada — exclui tagged que ja iniciou pipeline
        supabase.from("demandas" as any).select("cliente_id", { count: "exact", head: false })
          .eq("etapa", "analise_vinculada").neq("status", "cancelada"),
        // So vinculadas pendentes — contam pra coluna 2 da esteira
        supabase.from("demandas" as any).select("cliente_id", { count: "exact", head: false })
          .eq("etapa", "analise_vinculada").eq("status", "pendente"),
        supabase.from("demandas" as any).select("*", { count: "exact", head: true })
          .eq("etapa", "pronta_para_protocolo").eq("status", "pendente").is("protocolado_at", null),
      ]);
      // Aguardando = tagged - quem ja tem QUALQUER vinculada nao-cancelada
      const taggedIds = new Set((tagged.data || []).map((c: any) => c.id));
      const vincCliIds = new Set((vincAny.data || []).map((v: any) => v.cliente_id));
      let aguardando = 0;
      for (const id of taggedIds) if (!vincCliIds.has(id)) aguardando++;
      return aguardando + (vincPendente.count || 0) + (proto.count || 0);
    },
    refetchInterval: 30_000,
  });

  return (
    <Sidebar collapsible="icon" className="border-none bg-transparent h-full">
      <button
        onClick={() => navigate("/dashboard")}
        className={`sei-brand flex items-center h-14 shrink-0 border-b border-sidebar-border transition-colors hover:bg-sidebar-accent/40 ${collapsed ? "justify-center px-2" : "px-4 gap-3"}`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30 shrink-0">
          <Scale className="h-4 w-4 text-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col justify-center text-left">
            <span className="sei-brand-title font-medium text-sm tracking-tight text-sidebar-foreground leading-none">
              {isSei && nomeBase ? (
                <>{nomeBase} <span className="sei-brand-accent">{nomeUltima}</span></>
              ) : appConfig.name}
            </span>
            <span className="sei-brand-tag text-[9px] text-sidebar-foreground/60 uppercase tracking-[0.15em] leading-none mt-1">{appConfig.tagline}</span>
          </div>
        )}
      </button>

      <SidebarContent className="py-1 overflow-y-auto scrollbar-thin">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.18em] font-medium text-muted-foreground px-3 pt-3 pb-1 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary opacity-80" />
              AW System
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      className={
                        isActive
                          ? "bg-primary/15 text-primary rounded-xl mx-1"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors"
                      }
                    >
                      <NavLink to={item.url} end className="" activeClassName="">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className="text-sm flex-1 flex items-center justify-between">
                            {item.title}
                            {item.badgeKey === "pendentes" && (pendentesCount ?? 0) > 0 && (
                              <span className="ml-2 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {pendentesCount}
                              </span>
                            )}
                            {item.badgeKey === "esteira" && (esteiraCount ?? 0) > 0 && (
                              <span className="ml-2 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {esteiraCount}
                              </span>
                            )}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.18em] font-medium text-muted-foreground px-3 pt-3 pb-1 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 opacity-80" />
                Administração
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Usuários"
                    className={
                      location.pathname.startsWith("/admin/usuarios")
                        ? "bg-primary/15 text-primary rounded-xl mx-1"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors"
                    }
                  >
                    <NavLink to="/admin/usuarios" end className="" activeClassName="">
                      <UserCog className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">Usuários</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {isSei && (
        <div className="sei-stripes shrink-0">
          <div />
          <div />
        </div>
      )}

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-primary/60 shrink-0" />
            <p className="text-[9px] text-muted-foreground tracking-widest uppercase">
              {appConfig.name} v0.1
            </p>
          </div>
        ) : (
          <Zap className="h-3 w-3 text-primary/50 mx-auto" />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
