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
  { to: "/dashboard", fim: true, rotulo: "Geral", frase: "O que está em juízo, em dinheiro.", icone: Gavel },
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
      {/* SEM BRILHO DE FUNDO.
          Havia aqui um halo na cor do tema atrás do título. Ele competia com o
          número, que é a única coisa desta tela que a pessoa veio ver, e deixava
          o topo com aspecto de banner. Fundo liso: o que se destaca passa a ser
          a tipografia, e não a luz atrás dela. */}
      <header className="mb-10">
        {/* Altura reservada para a barra não pular quando o texto troca de
            painel, e margem PRÓPRIA em vez de min-h maior: se a frase quebrar em
            duas linhas no celular, o bloco cresce e o respiro continua lá. */}
        <div className="min-h-[3.75rem] mb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={ativa.to}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {/* O MESMO TÍTULO DE TODA ABA (o de CabecalhoDaPagina): tamanho,
                  peso e altura iguais aos de Processos, Clientes e o resto. O
                  título de vitrine que havia aqui fazia o painel parecer outro
                  sistema. Fica só a troca animada por painel, que as outras
                  abas não têm. */}
              <h1 className="font-display text-3xl font-medium tracking-tight leading-9 break-words">
                {ativa.rotulo}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {ativa.frase}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* A BARRA, NO FORMATO DE UM SEGMENTED CONTROL.
            Pílula inteira, sem borda dura, e o item ativo é uma pastilha clara
            que desliza (layoutId), não um fundo que acende em cada botão.

            O ativo perdeu a cor de marca de propósito: num controle de quatro
            itens, cor é ruído, e o contraste sozinho já diz onde a pessoa está.
            É também o que separa "premium" de "colorido". */}
        <nav
          aria-label="Painéis"
          className="inline-flex max-w-full overflow-x-auto scrollbar-thin rounded-full bg-white/[0.035] ring-1 ring-white/[0.06] p-1 gap-0.5"
        >
          {visiveis.map((a) => {
            const Icone = a.icone;
            const eAtiva = a.to === ativa.to;
            return (
              <NavLink
                key={a.to}
                to={a.to}
                end={a.fim}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.8125rem] whitespace-nowrap
                            tracking-[-0.006em] transition-colors duration-200
                            ${eAtiva ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground/90"}`}
              >
                {eAtiva && (
                  <motion.span
                    layoutId="aba-ativa"
                    className="absolute inset-0 rounded-full bg-white/[0.085] shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.07]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icone className={`relative h-[0.875rem] w-[0.875rem] transition-opacity duration-200 ${eAtiva ? "opacity-90" : "opacity-55"}`} />
                <span className={`relative ${eAtiva ? "font-medium" : ""}`}>{a.rotulo}</span>
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
