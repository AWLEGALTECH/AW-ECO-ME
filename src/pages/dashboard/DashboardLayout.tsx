/* A CASCA DOS PAINÉIS: título, uma frase, e a barra para trocar de painel.
 *
 * O dashboard deixou de ser uma página comprida e virou quatro painéis, cada
 * um com uma pergunta: quanto está em juízo, quanto se ganha, contra quem e
 * sobre o quê, e como vai o comercial. A barra é o único elemento fixo; o
 * resto troca com a rota.
 *
 * O painel Comercial só aparece para quem tem o módulo de fechamentos. A rota
 * também é protegida (RequireModule), então esconder a aba é conforto, não
 * segurança.
 */
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Scale, ClipboardList, Handshake, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/lib/modules";
import { EASE } from "./comum";

interface Aba {
  to: string;
  fim?: boolean;
  rotulo: string;
  frase: string;
  icone: LucideIcon;
  modulo?: ModuleKey;
}

export const ABAS: Aba[] = [
  { to: "/dashboard", fim: true, rotulo: "Valores ajuizados", frase: "O que está em juízo, em dinheiro.", icone: Gavel },
  { to: "/dashboard/procedencia", rotulo: "Procedência", frase: "O que o DJEN diz sobre as sentenças de primeiro grau.", icone: Scale },
  { to: "/dashboard/materias", rotulo: "Matérias e ações", frase: "Contra quem, sobre o quê e em que fase.", icone: ClipboardList },
  { to: "/dashboard/comercial", rotulo: "Comercial", frase: "Fechamentos, ações e metas do time.", icone: Handshake, modulo: "fechamentos" },
];

export default function DashboardLayout() {
  const { pathname } = useLocation();
  const { modules, isAdmin } = useAuth();
  const visiveis = ABAS.filter((a) => !a.modulo || isAdmin || modules.includes(a.modulo));
  const ativa = [...ABAS].sort((a, b) => b.to.length - a.to.length).find((a) => a.fim ? pathname === a.to : pathname.startsWith(a.to)) ?? ABAS[0];

  useEffect(() => { document.title = `${ativa.rotulo} · AW ECO ME`; }, [ativa.rotulo]);

  return (
    <div className="relative">
      {/* Fundo: uma malha de pontos na cor do tema que se apaga para baixo, e
          um brilho no canto. É o que dá a sensação de instrumento, sem
          disputar com os números. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-[440px] -z-10 overflow-hidden">
        <div className="absolute inset-0 [background-image:radial-gradient(hsl(var(--primary)/0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_75%)]" />
        <div className="absolute -top-40 right-[-6rem] h-96 w-96 rounded-full bg-primary/[0.12] blur-3xl" />
      </div>

      <header className="space-y-5 mb-8">
        <div className="min-h-[3.75rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={ativa.to}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">{ativa.rotulo}</h1>
              <p className="text-sm text-muted-foreground mt-1">{ativa.frase}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* A barra. O indicador é um só elemento que desliza entre as abas
            (layoutId), e não um fundo que acende em cada uma. */}
        <nav aria-label="Painéis" className="inline-flex max-w-full overflow-x-auto scrollbar-thin rounded-2xl border border-border/70 bg-card/70 backdrop-blur p-1.5 gap-1">
          {visiveis.map((a) => {
            const Icone = a.icone;
            const eAtiva = a.to === ativa.to;
            return (
              <NavLink
                key={a.to}
                to={a.to}
                end={a.fim}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm whitespace-nowrap transition-colors
                            ${eAtiva ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {eAtiva && (
                  <motion.span
                    layoutId="aba-ativa"
                    className="absolute inset-0 rounded-xl bg-primary/[0.14] ring-1 ring-primary/30 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.6)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icone className={`relative h-4 w-4 ${eAtiva ? "text-primary" : ""}`} />
                <span className="relative">{a.rotulo}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={ativa.to}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
