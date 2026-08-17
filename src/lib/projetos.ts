import {
  Filter, Megaphone, Target, UserPlus, Handshake, Instagram,
  DollarSign, Banknote, Receipt, PiggyBank, CreditCard, TrendingUp,
  Scale, Gavel, FileSignature, FileText, Landmark, ShieldCheck,
  Users, GraduationCap, Workflow, Wrench, Building2, Phone,
  Rocket, Video, Palette, Bot, Brain, Globe, BarChart3, Lightbulb,
  type LucideIcon,
} from "lucide-react";

// Paleta dos projetos. Chaves, não hex: o Tailwind precisa das classes
// escritas por extenso pra não perdê-las no purge.
export const PALETA = {
  primary: { rotulo: "Tema",   chip: "bg-primary/15 text-primary ring-primary/30",             barra: "bg-primary",       ponto: "bg-primary",       texto: "text-primary",       anel: "ring-primary/30",       borda: "border-primary/30",       suave: "bg-primary/[0.07]" },
  emerald: { rotulo: "Verde",  chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", barra: "bg-emerald-500",   ponto: "bg-emerald-400",   texto: "text-emerald-400",   anel: "ring-emerald-500/30",   borda: "border-emerald-500/30",   suave: "bg-emerald-500/[0.07]" },
  amber:   { rotulo: "Âmbar",  chip: "bg-amber-400/15 text-amber-400 ring-amber-400/30",       barra: "bg-amber-400",     ponto: "bg-amber-400",     texto: "text-amber-400",     anel: "ring-amber-400/30",     borda: "border-amber-400/30",     suave: "bg-amber-400/[0.07]" },
  rose:    { rotulo: "Rosa",   chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30",          barra: "bg-rose-500",      ponto: "bg-rose-400",      texto: "text-rose-400",      anel: "ring-rose-500/30",      borda: "border-rose-500/30",      suave: "bg-rose-500/[0.07]" },
  sky:     { rotulo: "Azul",   chip: "bg-sky-500/15 text-sky-400 ring-sky-500/30",             barra: "bg-sky-500",       ponto: "bg-sky-400",       texto: "text-sky-400",       anel: "ring-sky-500/30",       borda: "border-sky-500/30",       suave: "bg-sky-500/[0.07]" },
  violet:  { rotulo: "Roxo",   chip: "bg-violet-500/15 text-violet-400 ring-violet-500/30",    barra: "bg-violet-500",    ponto: "bg-violet-400",    texto: "text-violet-400",    anel: "ring-violet-500/30",    borda: "border-violet-500/30",    suave: "bg-violet-500/[0.07]" },
  muted:   { rotulo: "Neutro", chip: "bg-white/[0.06] text-muted-foreground ring-white/10",    barra: "bg-muted-foreground/50", ponto: "bg-muted-foreground/60", texto: "text-muted-foreground", anel: "ring-white/10", borda: "border-white/10", suave: "bg-white/[0.03]" },
} as const;

export type CorKey = keyof typeof PALETA;
export const CORES = Object.keys(PALETA) as CorKey[];
export const paleta = (c?: string | null) => PALETA[(c as CorKey) in PALETA ? (c as CorKey) : "primary"];

// Ícones dos projetos, agrupados por assunto e com nome. Um ícone genérico não
// diz nada na grade: o que se procura é o funil, o dinheiro, a equipe. Cada um
// carrega o rótulo que aparece no hover e embaixo do seletor.
export interface IconeOpt { key: string; Icon: LucideIcon; rotulo: string }

export const GRUPOS_ICONES: { grupo: string; itens: IconeOpt[] }[] = [
  {
    grupo: "Comercial",
    itens: [
      { key: "Filter",     Icon: Filter,     rotulo: "Funil" },
      { key: "Megaphone",  Icon: Megaphone,  rotulo: "Campanha" },
      { key: "Target",     Icon: Target,     rotulo: "Meta" },
      { key: "UserPlus",   Icon: UserPlus,   rotulo: "Captação" },
      { key: "Handshake",  Icon: Handshake,  rotulo: "Parceria" },
      { key: "Instagram",  Icon: Instagram,  rotulo: "Redes sociais" },
    ],
  },
  {
    grupo: "Dinheiro",
    itens: [
      { key: "DollarSign", Icon: DollarSign, rotulo: "Dinheiro" },
      { key: "Banknote",   Icon: Banknote,   rotulo: "Faturamento" },
      { key: "Receipt",    Icon: Receipt,    rotulo: "Cobrança" },
      { key: "PiggyBank",  Icon: PiggyBank,  rotulo: "Economia" },
      { key: "CreditCard", Icon: CreditCard, rotulo: "Pagamento" },
      { key: "TrendingUp", Icon: TrendingUp, rotulo: "Crescimento" },
    ],
  },
  {
    grupo: "Jurídico",
    itens: [
      { key: "Scale",         Icon: Scale,         rotulo: "Jurídico" },
      { key: "Gavel",         Icon: Gavel,         rotulo: "Audiência" },
      { key: "FileSignature", Icon: FileSignature, rotulo: "Contrato" },
      { key: "FileText",      Icon: FileText,      rotulo: "Peça" },
      { key: "Landmark",      Icon: Landmark,      rotulo: "Tribunal" },
      { key: "ShieldCheck",   Icon: ShieldCheck,   rotulo: "Compliance" },
    ],
  },
  {
    grupo: "Time e operação",
    itens: [
      { key: "Users",         Icon: Users,         rotulo: "Equipe" },
      { key: "GraduationCap", Icon: GraduationCap, rotulo: "Treinamento" },
      { key: "Workflow",      Icon: Workflow,      rotulo: "Processo interno" },
      { key: "Wrench",        Icon: Wrench,        rotulo: "Manutenção" },
      { key: "Building2",     Icon: Building2,     rotulo: "Escritório" },
      { key: "Phone",         Icon: Phone,         rotulo: "Atendimento" },
    ],
  },
  {
    grupo: "Produto e conteúdo",
    itens: [
      { key: "Rocket",    Icon: Rocket,    rotulo: "Lançamento" },
      { key: "Video",     Icon: Video,     rotulo: "Vídeo" },
      { key: "Palette",   Icon: Palette,   rotulo: "Design" },
      { key: "Bot",       Icon: Bot,       rotulo: "Automação" },
      { key: "Brain",     Icon: Brain,     rotulo: "Inteligência" },
      { key: "Globe",     Icon: Globe,     rotulo: "Site" },
      { key: "BarChart3", Icon: BarChart3, rotulo: "Dados" },
      { key: "Lightbulb", Icon: Lightbulb, rotulo: "Ideia" },
    ],
  },
];

// Mapa achatado pra resolver o ícone salvo no banco.
export const ICONES: Record<string, LucideIcon> = Object.fromEntries(
  GRUPOS_ICONES.flatMap((g) => g.itens.map((i) => [i.key, i.Icon])),
);
export const ICONES_LISTA = Object.keys(ICONES);
export const icone = (n?: string | null): LucideIcon => ICONES[n || ""] || Rocket;
export const rotuloIcone = (n?: string | null): string =>
  GRUPOS_ICONES.flatMap((g) => g.itens).find((i) => i.key === n)?.rotulo || "Ícone";

// Sugestões de cor pras colunas que o usuário cria. A ordem é a que o
// construtor usa ao adicionar linhas novas: neutro no começo, verde no fim.
export const CORES_COLUNA: CorKey[] = ["muted", "primary", "sky", "amber", "violet", "rose", "emerald"];

export const PRIORIDADES = {
  alta:   { rotulo: "Alta",   chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30" },
  normal: { rotulo: "Normal", chip: "bg-white/[0.05] text-muted-foreground ring-white/10" },
  baixa:  { rotulo: "Baixa",  chip: "bg-white/[0.03] text-muted-foreground/70 ring-white/[0.06]" },
} as const;
export type Prioridade = keyof typeof PRIORIDADES;

const hojeISO = () => new Date().toISOString().slice(0, 10);

// Quanto falta / há quanto venceu, com a cor da urgência. Mesma escala da
// central de prazos do Dashboard, pra leitura ser a mesma em toda a app.
export function urgenciaPrazo(prazo?: string | null) {
  if (!prazo) return null;
  const dias = Math.round(
    (new Date(`${prazo}T00:00:00`).getTime() - new Date(`${hojeISO()}T00:00:00`).getTime()) / 86400000,
  );
  if (dias < 0)   return { dias, label: `${Math.abs(dias)}d atrasado`, chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30" };
  if (dias === 0) return { dias, label: "hoje",                        chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30" };
  if (dias <= 3)  return { dias, label: `${dias}d`,                    chip: "bg-orange-500/15 text-orange-400 ring-orange-500/30" };
  if (dias <= 7)  return { dias, label: `${dias}d`,                    chip: "bg-amber-500/15 text-amber-400 ring-amber-500/30" };
  return            { dias, label: `${dias}d`,                    chip: "bg-white/[0.05] text-muted-foreground ring-white/10" };
}

export const fmtDataCurta = (d?: string | null) =>
  !d ? null : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${d}T00:00:00`));
