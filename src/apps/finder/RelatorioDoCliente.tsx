/* O RELATÓRIO PARA O CLIENTE: o quanto ele já perdeu.
 *
 * É A ÚNICA TELA DO FINDER QUE É EXAGERADA DE PROPÓSITO. O alerta vermelho, o
 * número grande que pulsa, o dobro em verde: é o que se mostra ao cliente, e
 * o exagero é o ponto. Isso ficou igual.
 *
 * O que mudou é a COERÊNCIA COM O TEMA. A tela antiga tinha cores escritas à
 * mão (fundo quase preto nas dicas dos gráficos, lilás fixo, cinza-azulado
 * nos textos) e dependia de um filtro que invertia tudo nos temas claros; ao
 * passar o mouse num gráfico aparecia a cor de outro tema. Agora fundo, borda,
 * texto, eixos e dicas vêm do tema, e só o que é alerta de propósito
 * (vermelho, laranja, âmbar, verde) tem cor própria.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarDays, CheckCircle2, DollarSign, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell, PieChart, Pie,
} from "recharts";
import { cn } from "@/lib/utils";

const CURVA = [0.22, 1, 0.36, 1] as const;
/* As cores quentes do alerta, uma por posição no ranking (como antes). */
const QUENTES = ["#ef4444", "#f97316", "#fbbf24", "#f59e0b", "#dc2626", "#fb923c", "#eab308"];
const quente = (i: number) => QUENTES[i % QUENTES.length];

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const eixoBrl = (v: number) => `R$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`;

/* Eixos e grade dos gráficos no tom do tema. */
const EIXO = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const GRADE = "hsl(var(--border))";

const CARTAO = "rounded-2xl border border-white/[0.07] bg-white/[0.03]";
const TITULO = "text-[11px] font-medium uppercase tracking-[0.14em]";

interface Grupo { cat: { label: string; naoReembolsavel?: boolean }; items: { valor: number; data?: string }[] }

export function RelatorioDoCliente({ groups, meta, totalValor, totalOcorrencias }: {
  groups: Grupo[];
  meta: { clientName?: string; banco?: string; periodo?: string };
  totalValor: number;
  totalOcorrencias: number;
}) {
  const reemb = groups.filter((g) => !g.cat.naoReembolsavel);
  const itens = reemb.flatMap((g) => g.items);
  const porCategoria = reemb
    .map((g) => ({
      nome: g.cat.label,
      curto: g.cat.label.split(" ")[0],
      valor: parseFloat(g.items.reduce((s, i) => s + i.valor, 0).toFixed(2)),
      ocorrencias: g.items.length,
    }))
    .sort((a, b) => b.valor - a.valor);
  const mensal: Record<string, { chave: string; rotulo: string; valor: number }> = {};
  for (const it of itens) {
    const p = (it.data || "").split("/");
    if (p.length !== 3) continue;
    const chave = `${p[2]}-${p[1]}`;
    mensal[chave] ??= { chave, rotulo: `${p[1]}/${p[2]}`, valor: 0 };
    mensal[chave].valor = parseFloat((mensal[chave].valor + it.valor).toFixed(2));
  }
  const linhaDoTempo = Object.values(mensal).sort((a, b) => a.chave.localeCompare(b.chave));
  const media = itens.length ? totalValor / itens.length : 0;
  const rosca = groups
    .map((g) => ({ nome: g.cat.label, valor: parseFloat(g.items.reduce((s, i) => s + i.valor, 0).toFixed(2)) }))
    .sort((a, b) => b.valor - a.valor);
  const cliente = meta?.clientName || "CLIENTE";
  const banco = meta?.banco || "BANCO";
  const dobro = totalValor * 2;
  const top = porCategoria.slice(0, 8);
  const maior = top[0]?.valor || 1;

  return (
    <div className="mt-6 space-y-4">
      {/* ══════ O SOCO: quanto ele já perdeu ══════ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: CURVA }}
        className="relative overflow-hidden rounded-3xl border border-red-500/25 bg-gradient-to-br from-red-600/20 via-red-600/[0.06] to-transparent px-6 py-10 text-center">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-[80px]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className={cn(TITULO, "tracking-[0.2em] text-red-500")}>Alerta de cobranças irregulares</span>
          </span>
          <p className="mt-5 text-2xl font-bold tracking-tight sm:text-[1.6rem]">{cliente}</p>
          <p className="mt-1.5 text-base text-muted-foreground">já perdeu</p>
          <p className="finder-pulso mt-3 text-5xl font-black leading-none tracking-tighter text-red-500 sm:text-[3.5rem]">{brl(totalValor)}</p>
          <p className="mt-3 text-lg text-muted-foreground">para o <span className="font-bold text-red-400">{banco}</span></p>
          <p className="mt-6 text-[13px] text-muted-foreground">
            Em <span className="font-bold text-foreground">{totalOcorrencias}</span> cobranças irregulares identificadas
            {meta?.periodo && meta.periodo !== "—" && <> no período de <span className="font-semibold text-foreground">{meta.periodo}</span></>}
          </p>
          <div className="mt-5 inline-block rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-7 py-3.5">
            <p className={cn(TITULO, "text-[10px] tracking-[0.2em] text-emerald-400")}>Direito à restituição em dobro · Art. 42, CDC</p>
            <p className="mt-1.5 text-3xl font-black tracking-tight text-emerald-400">{brl(dobro)}</p>
          </div>
        </div>
      </motion.section>

      {/* ══════ OS CARTÕES DE IMPACTO ══════ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Impacto ordem={0} cor="#ef4444" rotulo="Total cobrado indevidamente" valor={brl(totalValor)} sub="descontado da conta sem autorização" icone={<DollarSign className="h-3.5 w-3.5" />} />
        <Impacto ordem={1} cor="#f97316" rotulo="Cobranças irregulares" valor={`${totalOcorrencias}`} sub="lançamentos identificados no extrato" icone={<TrendingUp className="h-3.5 w-3.5" />} />
        <Impacto ordem={2} cor="#fbbf24" rotulo="Média por lançamento" valor={brl(media)} sub={`sobre ${itens.length} descontos`} icone={<CalendarDays className="h-3.5 w-3.5" />} />
        <Impacto ordem={3} cor="#22c55e" rotulo="Restituição em dobro" valor={brl(dobro)} sub="seu direito (Art. 42, CDC)" icone={<CheckCircle2 className="h-3.5 w-3.5" />} />
      </div>

      {/* ══════ DE ONDE VÊM ══════ */}
      <section className={cn(CARTAO, "border-red-500/15 p-5 sm:p-6")}>
        <p className={cn(TITULO, "text-red-500")}>De onde vêm as cobranças irregulares</p>
        <div className="mt-4 space-y-3">
          {top.map((c, i) => {
            const pct = totalValor ? ((c.valor / totalValor) * 100).toFixed(1) : "0.0";
            return (
              <motion.div key={c.nome} className="flex items-center gap-3"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.05 * i }}>
                <span className="w-6 shrink-0 text-right text-xs font-bold text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{c.nome}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: quente(i) }}>{brl(c.valor)} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <motion.div className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${quente(i)}, ${quente(i + 1)})` }}
                      initial={{ width: 0 }} animate={{ width: `${Math.max((c.valor / maior) * 100, 2)}%` }}
                      transition={{ type: "spring", stiffness: 380, damping: 34, delay: 0.1 + 0.05 * i }} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ══════ OS GRÁFICOS ══════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <section className={cn(CARTAO, "p-5 sm:p-6")}>
          <p className={cn(TITULO, "text-muted-foreground")}>Valor por categoria (R$)</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porCategoria} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={GRADE} strokeOpacity={0.6} />
                <XAxis dataKey="curto" tick={EIXO} axisLine={false} tickLine={false} />
                <YAxis tick={{ ...EIXO, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={eixoBrl} width={52} />
                <Tooltip content={<Dica valor={(v) => brl(v)} />} cursor={{ fill: "rgba(239,68,68,0.06)" }} />
                <Bar dataKey="valor" radius={[5, 5, 0, 0]}>{porCategoria.map((_, i) => <Cell key={i} fill={quente(i)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={cn(CARTAO, "flex flex-col p-5 sm:p-6")}>
          <p className={cn(TITULO, "text-muted-foreground")}>Proporção por categoria</p>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={rosca} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                  {rosca.map((_, i) => <Cell key={i} fill={quente(i)} />)}
                </Pie>
                <Tooltip content={<Dica valor={(v) => brl(v)} nomeDoItem />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-auto space-y-1.5 pt-2">
            {rosca.map((d, i) => (
              <div key={d.nome} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: quente(i) }} />
                <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                <span className="font-bold tabular-nums" style={{ color: quente(i) }}>{brl(d.valor)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {linhaDoTempo.length > 1 && (
        <section className={cn(CARTAO, "p-5 sm:p-6")}>
          <p className={cn(TITULO, "text-muted-foreground")}>Evolução temporal dos descontos</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={linhaDoTempo}>
                <CartesianGrid stroke={GRADE} strokeOpacity={0.6} strokeDasharray="4 4" />
                <XAxis dataKey="rotulo" tick={{ ...EIXO, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ ...EIXO, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={eixoBrl} width={52} />
                <Tooltip content={<Dica valor={(v) => brl(v)} />} cursor={{ stroke: "rgba(239,68,68,0.25)", strokeWidth: 1 }} />
                <Line type="monotone" dataKey="valor" stroke="#ef4444" strokeWidth={2.5} dot={{ fill: "#ef4444", strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: "#f87171", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className={cn(CARTAO, "p-5 sm:p-6")}>
        <p className={cn(TITULO, "text-muted-foreground")}>Frequência de ocorrências por categoria</p>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={porCategoria} layout="vertical" barCategoryGap="25%">
              <CartesianGrid horizontal={false} stroke={GRADE} strokeOpacity={0.6} />
              <XAxis type="number" tick={{ ...EIXO, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="curto" tick={EIXO} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<Dica valor={(v) => `${v} lançamento${v !== 1 ? "s" : ""}`} />} cursor={{ fill: "rgba(239,68,68,0.05)" }} />
              <Bar dataKey="ocorrencias" radius={[0, 5, 5, 0]}>{porCategoria.map((_, i) => <Cell key={i} fill={quente(i)} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ══════ O RODAPÉ LEGAL ══════ */}
      <section className="rounded-2xl border border-white/[0.06] border-l-[3px] border-l-red-500/50 bg-white/[0.02] px-5 py-4 sm:px-6">
        <p className={cn(TITULO, "text-red-500")}>Fundamentação legal</p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground/85">Art. 42, CDC</strong>: o consumidor cobrado em quantia indevida tem direito à
          repetição do indébito, por valor igual ao dobro do que pagou em excesso, acrescido de correção monetária e juros legais.
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground/85">Art. 39, CDC</strong>: é vedado ao fornecedor de produtos ou serviços
          condicionar o fornecimento de produto ou serviço ao de outro produto ou serviço.
        </p>
      </section>
    </div>
  );
}

function Impacto({ ordem, cor, rotulo, valor, sub, icone }: {
  ordem: number; cor: string; rotulo: string; valor: string; sub: string; icone: ReactNode;
}) {
  return (
    <motion.div className={cn(CARTAO, "relative overflow-hidden p-4")}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.05 * ordem }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />
      <div className="flex items-center justify-between gap-2">
        <p className={cn(TITULO, "text-[10px] text-muted-foreground")}>{rotulo}</p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: cor, background: `${cor}1a` }}>{icone}</span>
      </div>
      <p className="mt-2.5 text-2xl font-extrabold leading-none tracking-tight tabular-nums" style={{ color: cor }}>{valor}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  );
}

/** A dica do gráfico, no fundo e na borda do tema (era um quadro quase preto fixo). */
function Dica({ active, payload, label, valor, nomeDoItem }: {
  active?: boolean; payload?: { value: number; name?: string; payload?: { fill?: string } }[]; label?: string;
  valor: (v: number) => string; nomeDoItem?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const titulo = nomeDoItem ? payload[0].name : label;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      {titulo && <p className="mb-1 text-xs font-medium text-muted-foreground">{titulo}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold tabular-nums text-red-500">{valor(Number(p.value))}</p>
      ))}
    </div>
  );
}
