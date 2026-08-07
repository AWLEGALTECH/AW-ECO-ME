import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { appConfig } from "@/config/app-config";
import { useTheme } from "@/hooks/useTheme";
import { LayoutDashboard, Users, Briefcase, Zap, PenSquare, FileSignature, ScanSearch, Workflow, UserCog, Activity, Newspaper, Target, Trophy, Bell, Eye, ListTodo, Ticket, Radar } from "lucide-react";
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

interface NavItem { title: string; url: string; icon: any; badgeKey?: string; module?: ModuleKey; beta?: boolean; alwaysVisible?: boolean }

const navItems: NavItem[] = [
  { title: "Dashboard",     url: "/dashboard",     icon: LayoutDashboard, module: "dashboard" },
  { title: "Clientes",      url: "/clientes",      icon: Users,           module: "clientes" },
  { title: "Pré-clientes",  url: "/pre-clientes",  icon: FileSignature,   module: "pre_clientes", badgeKey: "pendentes" },
  { title: "Esteira",       url: "/esteira",       icon: Workflow,        module: "esteira",      badgeKey: "esteira" },
  { title: "Publicações",   url: "/publicacoes",   icon: Newspaper,       module: "publicacoes",  badgeKey: "publicacoes" },
  { title: "Processos",     url: "/processos",     icon: Briefcase,       module: "processos" },
  { title: "Tarefas",       url: "/tarefas",       icon: ListTodo,        module: "processos" },
  { title: "Writer",        url: "/writer",        icon: PenSquare,       module: "writer" },
  { title: "Finder",        url: "/finder",        icon: ScanSearch,      module: "finder" },
  { title: "Prospecção",    url: "/prospeccao",    icon: Target,          module: "prospeccao",   badgeKey: "prospeccao", beta: true },
  { title: "Fechamentos",   url: "/fechamentos",   icon: Trophy,          module: "fechamentos",  beta: true },
  { title: "Tracker",       url: "/tracker",       icon: Eye,             module: "tracker",      beta: true },
  { title: "Chamados",      url: "/chamados",      icon: Ticket,          module: "chamados",     beta: true },
  { title: "Spy",           url: "/spy",           icon: Radar,           module: "spy",          beta: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { palette } = useTheme();
  const { modules, isAdmin } = useAuth();
  const isSei = palette === "sei";
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = navItems.filter(it => it.alwaysVisible || isAdmin || (it.module && modules.includes(it.module)));

  // Mobile: itens da "barra de sessões" maiores (alvo de toque, ícone e texto),
  // resetando pro compacto no desktop (md+). O menu vira Sheet abaixo de 768px,
  // exatamente o breakpoint do `md`, então os resets casam com a troca de layout.
  const itemMobile = "h-11 gap-3 [&>svg]:size-5 md:h-8 md:gap-2 md:[&>svg]:size-4";
  const labelMobile = "text-[15px] md:text-sm";

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
      const [tagged, vincAny, vincPendente, proto, pend] = await Promise.all([
        supabase.from("clientes").select("id" as any, { count: "exact", head: false })
          .eq("precisa_analise_extratos" as any, true),
        // Qualquer demanda downstream nao-cancelada — exclui tagged que ja
        // iniciou pipeline (inclui vinculada, artesanal, pronta, pendencia)
        // pra cliente nao contar 2x quando peca avancou.
        supabase.from("demandas" as any).select("cliente_id", { count: "exact", head: false })
          .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo", "pendencia_documental"])
          .neq("status", "cancelada"),
        // So vinculadas pendentes — contam pra coluna 2 da esteira
        supabase.from("demandas" as any).select("cliente_id", { count: "exact", head: false })
          .eq("etapa", "analise_vinculada").eq("status", "pendente"),
        supabase.from("demandas" as any).select("*", { count: "exact", head: true })
          .eq("etapa", "pronta_para_protocolo").eq("status", "pendente").is("protocolado_at", null),
        // Pendencias documentais abertas
        supabase.from("demandas" as any).select("*", { count: "exact", head: true })
          .eq("etapa", "pendencia_documental").eq("status", "pendente"),
      ]);
      // Aguardando = tagged - quem ja tem QUALQUER vinculada nao-cancelada
      const taggedIds = new Set((tagged.data || []).map((c: any) => c.id));
      const vincCliIds = new Set((vincAny.data || []).map((v: any) => v.cliente_id));
      let aguardando = 0;
      for (const id of taggedIds) if (!vincCliIds.has(id)) aguardando++;
      return aguardando + (vincPendente.count || 0) + (proto.count || 0) + (pend.count || 0);
    },
    refetchInterval: 30_000,
  });

  // Publicacoes nao-lidas dos ultimos 7 dias (mesma janela exibida na pagina)
  const { data: publicacoesCount } = useQuery({
    queryKey: ["publicacoes_nao_lidas_count"],
    queryFn: async () => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const limite = d.toISOString().slice(0, 10);
      const { count } = await supabase
        .from("publicacoes" as any)
        .select("*", { count: "exact", head: true })
        .eq("status_leitura", "nao_lida")
        .gte("data_disponibilizacao", limite);
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  // Leads aguardando primeiro contato — primeiro estagio do funil de
  // prospeccao. Outras etapas (em_cadencia, etc) tambem sao trabalho
  // pendente mas o sinal mais util pra um badge eh "voces tem N que
  // ninguem ainda mexeu".
  const { data: prospeccaoCount } = useQuery({
    queryKey: ["prospeccao_aguardando_count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("prospects" as any)
        .select("*", { count: "exact", head: true })
        .eq("estagio", "aguardando_contato")
        .eq("status", "ativo");
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  return (
    <Sidebar collapsible="icon" className="border-none bg-transparent h-full">
      <button
        onClick={() => navigate("/dashboard")}
        className={`sei-brand flex items-center h-16 md:h-14 shrink-0 border-b border-sidebar-border transition-colors hover:bg-sidebar-accent/40 ${collapsed ? "justify-center px-2" : "px-4 gap-3"}`}
      >
        <div className="flex h-9 w-9 md:h-8 md:w-8 items-center justify-center shrink-0">
          <img src="/aw-logo.png" alt="AW" className="h-8 w-8 md:h-7 md:w-7 object-contain" />
        </div>
        {!collapsed && (
          <div className="flex flex-col justify-center text-left">
            <span className="sei-brand-title font-medium text-base md:text-sm tracking-tight text-sidebar-foreground leading-none">
              {isSei && nomeBase ? (
                <>{nomeBase} <span className="sei-brand-accent">{nomeUltima}</span></>
              ) : appConfig.name}
            </span>
          </div>
        )}
      </button>

      <SidebarContent className="py-1 overflow-y-auto scrollbar-thin">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[11px] md:text-[9px] uppercase tracking-[0.18em] font-medium text-muted-foreground px-3 pt-3 pb-1 flex items-center gap-1.5">
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
                        (isActive
                          ? "bg-primary/15 text-primary rounded-xl mx-1"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors")
                        + " " + itemMobile
                      }
                    >
                      <NavLink to={item.url} end className="" activeClassName="">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className={`${labelMobile} flex-1 flex items-center justify-between gap-1`}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{item.title}</span>
                              {item.beta && (
                                <span className="shrink-0 text-[8px] uppercase font-semibold tracking-wide leading-none px-1 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">
                                  beta
                                </span>
                              )}
                            </span>
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
                            {item.badgeKey === "publicacoes" && (publicacoesCount ?? 0) > 0 && (
                              <span className="ml-2 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-medium">
                                {publicacoesCount}
                              </span>
                            )}
                            {item.badgeKey === "prospeccao" && (prospeccaoCount ?? 0) > 0 && (
                              <span className="ml-2 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {prospeccaoCount}
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
              <SidebarGroupLabel className="text-[11px] md:text-[9px] uppercase tracking-[0.18em] font-medium text-muted-foreground px-3 pt-3 pb-1 flex items-center gap-1.5">
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
                      (location.pathname.startsWith("/admin/usuarios")
                        ? "bg-primary/15 text-primary rounded-xl mx-1"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors")
                      + " " + itemMobile
                    }
                  >
                    <NavLink to="/admin/usuarios" end className="" activeClassName="">
                      <UserCog className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className={labelMobile}>Usuários</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Notificações"
                    className={
                      (location.pathname.startsWith("/admin/notificacoes")
                        ? "bg-primary/15 text-primary rounded-xl mx-1"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors")
                      + " " + itemMobile
                    }
                  >
                    <NavLink to="/admin/notificacoes" end className="" activeClassName="">
                      <Bell className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className={labelMobile}>Notificações</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Logs"
                    className={
                      (location.pathname.startsWith("/admin/logs")
                        ? "bg-primary/15 text-primary rounded-xl mx-1"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-xl mx-1 transition-colors")
                      + " " + itemMobile
                    }
                  >
                    <NavLink to="/admin/logs" end className="" activeClassName="">
                      <Activity className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className={labelMobile}>Logs</span>}
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
