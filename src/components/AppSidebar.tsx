/* MENU LATERAL.
 *
 * A lista de módulos é a mesma para todo mundo; a ORDEM é de cada um. O botão
 * "Reorganizar" no fim da lista abre o modo de arrastar, e a ordem escolhida
 * vai para a conta (preferencias_usuario), não para o navegador. Módulo que a
 * pessoa ganhar depois entra no lugar padrão dele; módulo que perder some sem
 * bagunçar o resto (ordenarPorPreferencia).
 *
 * O item ativo é um único indicador que desliza entre os itens (layoutId),
 * translúcido na cor do tema, como a barra do dashboard. O ícone responde ao
 * mouse com um leve crescimento; nada pisca, nada gira.
 */
import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { appConfig } from "@/config/app-config";
import { useTheme } from "@/hooks/useTheme";
import { usePreferencias } from "@/hooks/usePreferencias";
import { ordenarPorPreferencia } from "@/lib/preferencias";
import {
  LayoutDashboard, Users, Briefcase, Zap, PenSquare, FileSignature, ScanSearch, Workflow, UserCog, Activity, Newspaper,
  Trophy, Eye, ListTodo, Ticket, BarChart3, FileSpreadsheet, KanbanSquare, Megaphone, Wallet, MessagesSquare,
  ArrowUpDown, GripVertical, Check, RotateCcw, type LucideIcon,
} from "lucide-react";
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

interface NavItem { title: string; url: string; icon: LucideIcon; badgeKey?: string; module?: ModuleKey; beta?: boolean; alwaysVisible?: boolean }

const navItems: NavItem[] = [
  { title: "Dashboard",     url: "/dashboard",     icon: LayoutDashboard, module: "dashboard" },
  { title: "Clientes",      url: "/clientes",      icon: Users,           module: "clientes" },
  { title: "Atendimento",   url: "/atendimento",   icon: MessagesSquare,  module: "atendimento",  beta: true },
  { title: "Pré-clientes",  url: "/pre-clientes",  icon: FileSignature,   module: "pre_clientes", badgeKey: "pendentes" },
  { title: "Esteira",       url: "/esteira",       icon: Workflow,        module: "esteira",      badgeKey: "esteira" },
  { title: "Publicações",   url: "/publicacoes",   icon: Newspaper,       module: "publicacoes",  badgeKey: "publicacoes" },
  { title: "Processos",     url: "/processos",     icon: Briefcase,       module: "processos" },
  { title: "Tarefas",       url: "/tarefas",       icon: ListTodo,        module: "processos" },
  { title: "Writer",        url: "/writer",        icon: PenSquare,       module: "writer" },
  { title: "Finder",        url: "/finder",        icon: ScanSearch,      module: "finder" },
  { title: "Fechamentos",   url: "/fechamentos",   icon: Trophy,          module: "fechamentos",  beta: true },
  { title: "Wallet",        url: "/wallet",        icon: Wallet,          module: "balance",      beta: true },
  { title: "Tracker",       url: "/tracker",       icon: BarChart3,       module: "tracker",      beta: true },
  { title: "Projetos",      url: "/projetos",      icon: KanbanSquare,    module: "projetos",     beta: true },
  { title: "Chamados",      url: "/chamados",      icon: Ticket,          module: "chamados" },
  { title: "Spy",           url: "/spy",           icon: Eye,             module: "spy",          beta: true },
  { title: "Sheets",        url: "/sheets",        icon: FileSpreadsheet, module: "sheets",       beta: true },
  { title: "Marketing",     url: "/marketing",     icon: Megaphone,       module: "marketing",    beta: true },
];

const adminItems: NavItem[] = [
  { title: "Usuários", url: "/admin/usuarios", icon: UserCog },
  { title: "Logs",     url: "/admin/logs",     icon: Activity },
];

// Mobile: itens maiores (alvo de toque), voltando ao compacto no desktop (md+).
// O menu vira Sheet abaixo de 768px, exatamente o breakpoint do `md`.
const ITEM = "relative group/item rounded-xl mx-1 h-11 gap-3 [&>svg]:size-5 md:h-8 md:gap-2 md:[&>svg]:size-4 transition-colors duration-200";
const ROTULO = "text-[15px] md:text-sm";

/** Ícone que responde ao mouse: cresce um pouco e sobe um fio. */
function Icone({ icon: I, ativo }: { icon: LucideIcon; ativo: boolean }) {
  return (
    <I className={`relative shrink-0 transition-transform duration-200 ease-out group-hover/item:scale-110 group-hover/item:-translate-y-px
                   ${ativo ? "text-primary" : ""}`} />
  );
}

/** O indicador do item ativo: um só, desliza entre os itens. */
function Indicador() {
  return (
    <motion.span
      layoutId="menu-ativo"
      className="absolute inset-0 rounded-xl bg-primary/[0.10] ring-1 ring-primary/20"
      transition={{ type: "spring", stiffness: 480, damping: 38 }}
    />
  );
}

function Badge({ n, tom = "primario" }: { n: number | undefined; tom?: "primario" | "ambar" }) {
  if (!n) return null;
  return (
    <span className={`ml-2 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-medium
                      ${tom === "ambar" ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}`}>
      {n}
    </span>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const { palette } = useTheme();
  const { modules, isAdmin } = useAuth();
  const { ordemMenu, setOrdemMenu } = usePreferencias();
  const isSei = palette === "sei";
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const visiveis = navItems.filter(it => it.alwaysVisible || isAdmin || (it.module && modules.includes(it.module)));
  const itens = ordenarPorPreferencia(visiveis, ordemMenu, (it) => it.url);

  // Modo de reorganizar: a lista vira um rascunho arrastável; "Concluir" grava.
  const [reordenando, setReordenando] = useState(false);
  const [rascunho, setRascunho] = useState<NavItem[]>([]);
  useEffect(() => { if (collapsed) setReordenando(false); }, [collapsed]);
  const abrirReordenacao = () => { setRascunho(itens); setReordenando(true); };
  const concluir = () => { setOrdemMenu(rascunho.map((it) => it.url)); setReordenando(false); };
  const restaurarPadrao = () => { setOrdemMenu(null); setReordenando(false); };

  const ativo = (url: string) => location.pathname === url || location.pathname.startsWith(url + "/");

  // Pra marca no SEI, destaca a ultima palavra em verde (#91bb24)
  // espelhando o "!" verde-lima do logo "sei!".
  const marcaPartes = appConfig.marca.trim().split(/\s+/);
  const marcaBase = marcaPartes.slice(0, -1).join(" ");
  const marcaUltima = marcaPartes[marcaPartes.length - 1] || "";

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
        // Arquivado não conta: ele não aparece na coluna, então também não pode
        // aparecer no número que anuncia a coluna.
        supabase.from("clientes").select("id" as any, { count: "exact", head: false })
          .eq("precisa_analise_extratos" as any, true)
          .is("arquivado_em" as any, null),
        // Qualquer demanda downstream nao-cancelada: exclui tagged que ja
        // iniciou pipeline (inclui vinculada, artesanal, pronta, pendencia)
        // pra cliente nao contar 2x quando peca avancou.
        supabase.from("demandas" as any).select("cliente_id", { count: "exact", head: false })
          .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo", "pendencia_documental"])
          .neq("status", "cancelada"),
        // So vinculadas pendentes, que contam pra coluna 2 da esteira
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

  const badgeDe = (item: NavItem) => {
    if (item.badgeKey === "pendentes") return <Badge n={pendentesCount} />;
    if (item.badgeKey === "esteira") return <Badge n={esteiraCount} />;
    if (item.badgeKey === "publicacoes") return <Badge n={publicacoesCount} tom="ambar" />;
    return null;
  };

  const conteudoDoItem = (item: NavItem) => (
    <span className={`${ROTULO} relative flex-1 flex items-center justify-between gap-1 transition-transform duration-200 group-hover/item:translate-x-0.5`}>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="truncate">{item.title}</span>
        {item.beta && (
          <span className="shrink-0 text-[8px] uppercase font-semibold tracking-wide leading-none px-1 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">
            beta
          </span>
        )}
      </span>
      {badgeDe(item)}
    </span>
  );

  const itemDeMenu = (item: NavItem) => {
    const eAtivo = ativo(item.url);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          tooltip={item.title}
          className={`${ITEM} ${eAtivo ? "text-primary hover:bg-transparent" : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"}`}
        >
          <NavLink to={item.url} end className="" activeClassName="">
            {eAtivo && <Indicador />}
            <Icone icon={item.icon} ativo={eAtivo} />
            {!collapsed && conteudoDoItem(item)}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

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
              {isSei && marcaBase ? (
                <>{marcaBase} <span className="sei-brand-accent">{marcaUltima}</span></>
              ) : appConfig.marca}
            </span>
          </div>
        )}
      </button>

      <SidebarContent className="py-1 overflow-y-auto scrollbar-thin">
        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            <AnimatePresence mode="wait" initial={false}>
              {reordenando ? (
                <motion.div key="reordenando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <p className="px-3 pb-2 text-[11px] leading-snug text-muted-foreground">
                    Arraste os itens para a ordem que preferir. Fica salvo na sua conta.
                  </p>
                  <Reorder.Group as="div" axis="y" values={rascunho} onReorder={setRascunho} className="flex flex-col gap-0.5">
                    {rascunho.map((item) => (
                      <Reorder.Item
                        as="div"
                        key={item.url}
                        value={item}
                        whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px -8px hsl(var(--primary) / 0.35)" }}
                        className={`${ITEM} flex items-center px-2 select-none cursor-grab active:cursor-grabbing bg-sidebar-accent/40 ring-1 ring-sidebar-border/60`}
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                        <item.icon className="h-4 w-4 shrink-0 text-sidebar-foreground/80" />
                        <span className={`${ROTULO} truncate text-sidebar-foreground`}>{item.title}</span>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                  <div className="flex items-center gap-1 px-2 pt-2">
                    <button onClick={concluir}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium bg-primary/[0.12] text-primary ring-1 ring-primary/20 hover:bg-primary/[0.18] transition-colors">
                      <Check className="h-3.5 w-3.5" /> Concluir
                    </button>
                    <button onClick={restaurarPadrao} title="Voltar à ordem padrão do sistema"
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/70 transition-colors">
                      <RotateCcw className="h-3.5 w-3.5" /> Padrão
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <SidebarMenu>
                    {itens.map(itemDeMenu)}
                  </SidebarMenu>
                  {!collapsed && (
                    <button
                      onClick={abrirReordenacao}
                      className="group/reorg mt-1.5 mx-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
                      title="Arraste os módulos para a ordem que preferir"
                    >
                      <ArrowUpDown className="h-3 w-3 transition-transform duration-200 group-hover/reorg:-translate-y-px" />
                      Reorganizar
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
                {adminItems.map(itemDeMenu)}
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
