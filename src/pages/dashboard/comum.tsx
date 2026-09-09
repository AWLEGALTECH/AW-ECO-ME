/* AS PEÇAS QUE TODO PAINEL USA.
 *
 * Um dashboard partido em quatro abas só parece um produto se as quatro forem
 * feitas das mesmas peças: o mesmo cartão de número, o mesmo painel com
 * título, a mesma barra, a mesma entrada animada. Isto aqui é esse conjunto.
 *
 * Regras que valem para tudo:
 *   a cor do tema é a cor. Tons pastéis só quando é preciso sair dela.
 *   texto não veste cor de dado: rótulo, legenda e eixo são texto normal.
 *   nada menor que 12px que precise ser lido. Legenda pequena é para orientar,
 *   não para carregar informação.
 *   sem palavra solta em cima de seção. Título e, se precisar, uma frase.
 */
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import { useContador } from "@/hooks/useContador";
import type { LucideIcon } from "lucide-react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Cartão que reage ao mouse: sobe dois pixels e a borda acende na cor do tema. */
export const CARTAO_VIVO = "transition-all duration-300 hover:-translate-y-[2px] hover:border-primary/30";

/** Entrada suave e escalonada. `i` é a posição na fila. */
export function Entra({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE, delay: Math.min(i, 14) * 0.04 }}
    >
      {children}
    </motion.div>
  );
}

/** Valor em reais com os centavos menores, subindo até o valor. */
export function Money({ value, className, animado = true }: { value: number; className?: string; animado?: boolean }) {
  const mostrado = useContador(value, animado ? 900 : 0);
  const formatted = fmtBRL(mostrado);
  const idx = formatted.lastIndexOf(",");
  if (idx === -1) return <span className={className}>{formatted}</span>;
  return (
    <span className={className}>
      {formatted.slice(0, idx)}
      <span className="text-[0.55em] opacity-70 ml-0.5 align-baseline tabular-nums">{formatted.slice(idx)}</span>
    </span>
  );
}

/** Inteiro que sobe até o valor. */
export function Numero({ value, className }: { value: number; className?: string }) {
  const v = useContador(value);
  return <span className={className}>{Math.round(v).toLocaleString("pt-BR")}</span>;
}

/* Cartão de número. Rótulo em cima, valor grande, uma frase embaixo quando
   ela acrescenta algo. `tom` colore só o valor. */
export function Tile({ rotulo, valor, sub, tom, icone: Icone, i = 0, onClick, destaque = false }: {
  rotulo: string; valor: ReactNode; sub?: ReactNode; tom?: string; icone?: LucideIcon; i?: number;
  onClick?: () => void; destaque?: boolean;
}) {
  return (
    <Entra i={i} className="h-full">
      <SpotlightCard sutil onClick={onClick}
        className={`h-full ${CARTAO_VIVO} ${onClick ? "cursor-pointer" : ""} ${destaque ? "border-primary/25 bg-primary/[0.04]" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{rotulo}</p>
            <div className={`text-3xl font-normal font-display mt-2 leading-none ${tom ?? ""}`}>{valor}</div>
            {sub && <p className="text-xs text-muted-foreground/85 mt-2.5 leading-snug">{sub}</p>}
          </div>
          {Icone && (
            <span className="shrink-0 rounded-xl bg-primary/10 ring-1 ring-primary/15 p-2">
              <Icone className="h-4 w-4 text-primary/80" />
            </span>
          )}
        </div>
      </SpotlightCard>
    </Entra>
  );
}

/* Painel: um cartão com título, ícone na cor do tema, uma frase opcional e um
   espaço à direita para legenda ou controles. É o único jeito de um gráfico
   aparecer nos painéis. */
export function Painel({ titulo, descricao, icone: Icone, direita, children, className, i = 0 }: {
  titulo: string; descricao?: string; icone?: LucideIcon; direita?: ReactNode;
  children: ReactNode; className?: string; i?: number;
}) {
  return (
    <Entra i={i} className={className}>
      <Card className={`h-full ${CARTAO_VIVO}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-medium">
            {Icone && <Icone className="h-4 w-4 text-primary" />}
            <span>{titulo}</span>
            {direita && <span className="ml-auto font-normal">{direita}</span>}
          </CardTitle>
          {descricao && <p className="text-sm text-muted-foreground mt-1">{descricao}</p>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Entra>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-muted-foreground text-center py-8">{texto}</p>;
}

export function countBy<T>(items: T[], key: (i: T) => string | null | undefined): { name: string; value: number }[] {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const k = key(it);
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function sumBy<T>(items: T[], key: (i: T) => string | null | undefined, val: (i: T) => number): { name: string; value: number }[] {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const k = key(it);
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + (val(it) || 0));
  });
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/* Lista de barras na cor do tema: a barra cresce do zero na entrada e clareia
   no hover. `formato` decide como o valor aparece (quantidade ou reais). */
export function BarList({
  data, total, onItemClick, max = 10, emptyMessage = "Sem dados.", formato = "n",
}: {
  data: { name: string; value: number }[];
  total: number;
  onItemClick?: (name: string) => void;
  max?: number;
  emptyMessage?: string;
  formato?: "n" | "brl";
}) {
  const items = data.slice(0, max);
  const peak = items[0]?.value ?? 1;
  if (!items.length) return <Vazio texto={emptyMessage} />;
  return (
    <div className="space-y-1">
      {items.map((it, i) => {
        const pct = (it.value / peak) * 100;
        const share = total > 0 ? Math.round((it.value / total) * 100) : 0;
        return (
          <div
            key={it.name}
            className={`group relative overflow-hidden rounded-md px-2.5 py-2 transition-colors ${onItemClick ? "cursor-pointer hover:bg-primary/[0.06]" : ""}`}
            onClick={() => onItemClick?.(it.name)}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary/[0.14] group-hover:bg-primary/[0.22] transition-colors"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.05 + i * 0.03 }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="text-sm truncate" title={it.name}>{it.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formato === "brl" ? fmtBRL(it.value) : it.value}
                <span className="opacity-60 ml-1.5">{share}%</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Legenda para dois ou mais tipos. Sempre presente quando há mais de uma cor. */
export function Legenda({ itens }: { itens: Array<{ nome: string; cor: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((k) => (
        <span key={k.nome} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: k.cor }} />
          {k.nome}
        </span>
      ))}
    </div>
  );
}

/** Um tooltip para os gráficos do Recharts: valor forte, nome secundário, traço de cor. */
export function TooltipCaixa({ titulo, linhas }: { titulo: string; linhas: Array<{ cor?: string; valor: ReactNode; nome: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-foreground mb-1.5">{titulo}</div>
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          {l.cor && <span className="h-[2px] w-3 rounded-full" style={{ background: l.cor }} />}
          <span className="tabular-nums text-foreground">{l.valor}</span> {l.nome}
        </div>
      ))}
    </div>
  );
}

/** Cinza que recua: para o que não é conquista (perda, meta, restante). */
export const CINZA = "hsl(0 0% 44%)";
