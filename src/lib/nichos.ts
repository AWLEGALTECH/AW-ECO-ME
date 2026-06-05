// Mapa de keywords -> icone Lucide pra ilustrar o nicho do lead.
// Match case-insensitive, sem acento, por substring — entao "Clinica
// medica", "medico ortopedista", "consultorio medico" todos batem em
// "medic" e usam o icone de estetoscopio.

import {
  Stethoscope, Smile, Sparkles, Brain, Activity, Apple, PawPrint,
  Scale, Calculator, Home, UtensilsCrossed, ShoppingBag, Scissors,
  Dumbbell, GraduationCap, Hammer, Laptop, Briefcase, Camera, Car,
  Plane, HeartHandshake, Baby, Palette, Music, Wrench, Building2,
  Flower2, Pill, Eye, Target, type LucideIcon,
} from "lucide-react";

interface NichoDef {
  keys: string[];
  Icon: LucideIcon;
  cor: string;       // classe text-* tailwind
  bgCor: string;     // classe bg-*/15 tailwind, pra avatar
  label: string;     // rotulo canonico (opcional, fallback)
}

const NICHOS: NichoDef[] = [
  { keys: ["medic", "clinic medic", "consult medic", "ortoped", "cardiolog", "pediatr", "ginecol"], Icon: Stethoscope, cor: "text-rose-400",     bgCor: "bg-rose-500/15",     label: "Médico" },
  { keys: ["odont", "dent"],                                                                          Icon: Smile,        cor: "text-sky-300",       bgCor: "bg-sky-500/15",      label: "Odontologia" },
  { keys: ["estet", "harmoniz", "skincare", "beleza facial"],                                          Icon: Sparkles,     cor: "text-pink-400",      bgCor: "bg-pink-500/15",     label: "Estética" },
  { keys: ["psic", "terap"],                                                                          Icon: Brain,        cor: "text-violet-400",    bgCor: "bg-violet-500/15",   label: "Psicologia" },
  { keys: ["fisio"],                                                                                  Icon: Activity,     cor: "text-emerald-400",   bgCor: "bg-emerald-500/15",  label: "Fisioterapia" },
  { keys: ["nutri"],                                                                                  Icon: Apple,        cor: "text-lime-400",      bgCor: "bg-lime-500/15",     label: "Nutrição" },
  { keys: ["oftalmo", "oculo", "otica"],                                                              Icon: Eye,          cor: "text-cyan-300",      bgCor: "bg-cyan-500/15",     label: "Oftalmologia" },
  { keys: ["farmac", "drogar"],                                                                       Icon: Pill,         cor: "text-red-400",       bgCor: "bg-red-500/15",      label: "Farmácia" },
  { keys: ["pet", "vet", "anima"],                                                                    Icon: PawPrint,     cor: "text-amber-500",     bgCor: "bg-amber-500/15",    label: "Pet / Veterinário" },
  { keys: ["advoc", "advog", "juridic", "advocacia"],                                                  Icon: Scale,        cor: "text-amber-400",     bgCor: "bg-amber-500/15",    label: "Advocacia" },
  { keys: ["contab", "contador"],                                                                     Icon: Calculator,   cor: "text-cyan-400",      bgCor: "bg-cyan-500/15",     label: "Contabilidade" },
  { keys: ["imobil", "corretor", "imovel"],                                                           Icon: Home,         cor: "text-orange-400",    bgCor: "bg-orange-500/15",   label: "Imobiliária" },
  { keys: ["restaurant", "bar ", "lanchonet", "bistro", "pizz", "burguer", "burger", "hamburg"],     Icon: UtensilsCrossed, cor: "text-orange-300", bgCor: "bg-orange-500/15",   label: "Gastronomia" },
  { keys: ["loja", "varejo", "comercio", "boutique"],                                                 Icon: ShoppingBag,  cor: "text-fuchsia-400",   bgCor: "bg-fuchsia-500/15",  label: "Varejo" },
  { keys: ["salao", "cabel", "barbear", "barbe"],                                                     Icon: Scissors,     cor: "text-pink-300",      bgCor: "bg-pink-500/15",     label: "Salão / Barbearia" },
  { keys: ["academ", "person", "fitness", "musculac", "crossfit", "pilates"],                         Icon: Dumbbell,     cor: "text-red-400",       bgCor: "bg-red-500/15",      label: "Fitness" },
  { keys: ["escol", "educac", "curso", "professor", "ensino"],                                        Icon: GraduationCap, cor: "text-sky-400",      bgCor: "bg-sky-500/15",      label: "Educação" },
  { keys: ["construc", "engenharia", "engenheir", "arquitet", "reform", "obra"],                      Icon: Hammer,       cor: "text-stone-400",     bgCor: "bg-stone-500/15",    label: "Construção" },
  { keys: ["tecno", "software", "desenv", "startup", "saas"],                                         Icon: Laptop,       cor: "text-indigo-400",    bgCor: "bg-indigo-500/15",   label: "Tecnologia" },
  { keys: ["consult", "agencia", "marketing", "publicid"],                                            Icon: Briefcase,    cor: "text-zinc-300",      bgCor: "bg-zinc-500/15",     label: "Consultoria" },
  { keys: ["foto", "filmag", "videoma"],                                                              Icon: Camera,       cor: "text-purple-400",    bgCor: "bg-purple-500/15",   label: "Fotografia" },
  { keys: ["auto", "mecani", "oficina", "carro", "veicul"],                                           Icon: Car,          cor: "text-slate-300",     bgCor: "bg-slate-500/15",    label: "Automotivo" },
  { keys: ["turismo", "agencia de viagem", "viage", "hotel", "pousad"],                              Icon: Plane,        cor: "text-blue-400",      bgCor: "bg-blue-500/15",     label: "Turismo" },
  { keys: ["assist", "ong", "social"],                                                                Icon: HeartHandshake, cor: "text-rose-300",    bgCor: "bg-rose-500/15",     label: "Social" },
  { keys: ["infanti", "bebe", "creche", "berc"],                                                      Icon: Baby,         cor: "text-pink-200",      bgCor: "bg-pink-500/15",     label: "Infantil" },
  { keys: ["arte", "design", "design grafi", "tatu"],                                                Icon: Palette,      cor: "text-teal-300",      bgCor: "bg-teal-500/15",     label: "Arte / Design" },
  { keys: ["musica", "musico", "banda", "estudio"],                                                  Icon: Music,        cor: "text-purple-300",    bgCor: "bg-purple-500/15",   label: "Música" },
  { keys: ["servico", "encanador", "eletricista", "manutenc"],                                       Icon: Wrench,       cor: "text-yellow-400",    bgCor: "bg-yellow-500/15",   label: "Serviços" },
  { keys: ["empresa", "industria", "fabric"],                                                        Icon: Building2,    cor: "text-gray-300",      bgCor: "bg-gray-500/15",     label: "Indústria" },
  { keys: ["floricul", "flores", "jardim", "jardinagem", "paisag"],                                  Icon: Flower2,      cor: "text-green-300",     bgCor: "bg-green-500/15",    label: "Floricultura / Jardim" },
];

function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface NichoIcone {
  Icon: LucideIcon;
  cor: string;
  bgCor: string;
}

export function iconePorNicho(nicho: string | null | undefined): NichoIcone {
  if (!nicho) return { Icon: Target, cor: "text-muted-foreground", bgCor: "bg-muted/30" };
  const norm = normalizar(nicho);
  for (const n of NICHOS) {
    if (n.keys.some(k => norm.includes(k))) {
      return { Icon: n.Icon, cor: n.cor, bgCor: n.bgCor };
    }
  }
  return { Icon: Briefcase, cor: "text-muted-foreground", bgCor: "bg-muted/30" };
}

// Lista de sugestoes pra autocomplete simples no form de inserção.
export const NICHOS_SUGERIDOS: string[] = NICHOS.map(n => n.label).sort();
