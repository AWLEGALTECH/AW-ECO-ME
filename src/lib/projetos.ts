import {
  Rocket, Target, Megaphone, Scale, Users, Wrench, TrendingUp, Sparkles,
  Building2, FileSpreadsheet, Globe, Brain, type LucideIcon,
} from "lucide-react";

// Paleta dos projetos. Chaves, não hex — o Tailwind precisa das classes
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

// Ícones oferecidos na criação. Poucos e reconhecíveis — lista longa vira
// indecisão, e o ícone só precisa distinguir um projeto do outro na grade.
export const ICONES: Record<string, LucideIcon> = {
  Rocket, Target, Megaphone, Scale, Users, Wrench, TrendingUp, Sparkles,
  Building2, FileSpreadsheet, Globe, Brain,
};
export const ICONES_LISTA = Object.keys(ICONES);
export const icone = (n?: string | null): LucideIcon => ICONES[n || ""] || Rocket;

// Templates de funil. Precisam bater com o CASE de fn_criar_projeto.
export const TEMPLATES = [
  { key: "simples",     nome: "Simples",     colunas: ["A fazer", "Fazendo", "Feito"],
    hint: "O básico que serve pra quase tudo." },
  { key: "campanha",    nome: "Campanha",    colunas: ["Ideia", "Produção", "No ar", "Medindo", "Encerrada"],
    hint: "Anúncio, conteúdo, lançamento — nasce como ideia e termina medido." },
  { key: "captacao",    nome: "Captação",    colunas: ["Lead", "Contato feito", "Reunião", "Proposta", "Fechado"],
    hint: "Funil comercial, do primeiro contato ao contrato." },
  { key: "implantacao", nome: "Implantação", colunas: ["Levantamento", "Em construção", "Homologação", "No ar"],
    hint: "Processo novo, sistema, mudança interna." },
] as const;

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
