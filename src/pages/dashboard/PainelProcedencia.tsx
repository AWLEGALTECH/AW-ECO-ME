/* PROCEDÊNCIA EM PRIMEIRO GRAU: quanto se ganha, lido do DJEN.
 *
 * A cor é a do tema e a derrota é cinza. Ganho cheio na cor do tema, ganho
 * parcial na mesma cor com transparência, perda em cinza neutro. O olho vai
 * pro que foi conquistado, e a taxa é um fato, não um julgamento: não muda de
 * cor conforme o resultado.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Gavel, Trophy, PauseCircle, ClipboardList, Handshake, CalendarClock, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCorPrimaria } from "@/hooks/useCorPrimaria";
import {
  resumo as resumirDesfechos, porMateria, porRequerido, porMes,
  type LinhaDesfecho, type FaixaDesfecho, type MesDesfecho,
} from "@/lib/procedencia";
import { Entra, Tile, Painel, Numero, Legenda, Vazio, TooltipCaixa, CINZA, EASE, fmtBRL } from "./comum";

const NOME = { procedente: "Procedente", parcial: "Parcialmente procedente", improcedente: "Improcedente" } as const;

function BarraDesfecho({ f, pico, cor, i }: { f: FaixaDesfecho; pico: number; cor: (a?: number) => string; i: number }) {
  const largura = pico > 0 ? (f.decididos / pico) * 100 : 0;
  const ordem: Array<[number, string, string]> = [
    [f.procedentes, cor(), NOME.procedente],
    [f.parciais, cor(0.45), NOME.parcial],
    [f.improcedentes, CINZA, NOME.improcedente],
  ];
  let ultimo = -1;
  for (let k = ordem.length - 1; k >= 0; k--) if (ordem[k][0] > 0) { ultimo = k; break; }
  return (
    <div className="group relative flex items-center gap-3 py-1.5 rounded-md px-1 transition-colors hover:bg-primary/[0.05]">
      <span className="w-40 sm:w-56 shrink-0 text-sm truncate" title={f.nome}>{f.nome}</span>
      <div className="flex-1 min-w-0">
        <motion.div className="flex gap-[2px] transition-[filter] duration-300 group-hover:brightness-110"
          initial={{ width: 0 }} animate={{ width: `${largura}%` }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.05 }} style={{ minWidth: 6 }}>
          {ordem.map(([n, tinta, nome], k) => n > 0 ? (
            <div key={nome} title={`${nome}: ${n}`} className={`h-5 ${k === ultimo ? "rounded-r-[4px]" : ""}`}
                 style={{ flex: `${n} 0 0`, background: tinta, minWidth: 3 }} />
          ) : null)}
        </motion.div>
      </div>
      <span className="w-14 text-right text-sm tabular-nums">{f.taxa == null ? "sem dado" : `${f.taxa}%`}</span>
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{f.decididos}</span>
      <div className="pointer-events-none absolute left-40 sm:left-56 -top-1 -translate-y-full z-10 hidden group-hover:block">
        <TooltipCaixa titulo={f.nome} linhas={ordem.map(([n, tinta, nome]) => ({ cor: tinta, valor: n, nome: nome.toLowerCase() }))} />
      </div>
    </div>
  );
}

function Tabela({ linhas, rotulo }: { linhas: FaixaDesfecho[]; rotulo: string }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-xs text-primary/90 hover:text-primary hover:underline select-none transition-colors">Ver como tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/50 text-xs">
              <th className="py-2 pr-3 font-normal">{rotulo}</th>
              <th className="py-2 px-2 font-normal text-right">Procedente</th>
              <th className="py-2 px-2 font-normal text-right">Parcial</th>
              <th className="py-2 px-2 font-normal text-right">Improcedente</th>
              <th className="py-2 px-2 font-normal text-right">Decididos</th>
              <th className="py-2 pl-2 font-normal text-right">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((f) => (
              <tr key={f.nome} className="border-b border-border/30 hover:bg-primary/[0.04] transition-colors">
                <td className="py-2 pr-3 truncate max-w-[16rem]" title={f.nome}>{f.nome}</td>
                <td className="py-2 px-2 text-right tabular-nums">{f.procedentes}</td>
                <td className="py-2 px-2 text-right tabular-nums">{f.parciais}</td>
                <td className="py-2 px-2 text-right tabular-nums">{f.improcedentes}</td>
                <td className="py-2 px-2 text-right tabular-nums">{f.decididos}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{f.taxa == null ? "sem dado" : `${f.taxa}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function PainelProcedencia() {
  const { cor } = useCorPrimaria();
  const [linhas, setLinhas] = useState<LinhaDesfecho[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: r }] = await Promise.all([
        supabase.from("vw_desfecho_processo" as never)
          .select("materia, requeridos, fase_processual, desfecho, dt_desfecho, executado, valor_sentenca, no_tracker"),
        supabase.from("requeridos_catalogo" as never).select("chave, nome"),
      ]);
      if (d) setLinhas(d as unknown as LinhaDesfecho[]);
      if (r) setNomes(Object.fromEntries((r as unknown as { chave: string; nome: string }[]).map((x) => [x.chave, x.nome])));
    })();
  }, []);

  const p = useMemo(() => resumirDesfechos(linhas), [linhas]);
  const materias = useMemo(() => porMateria(linhas, 3), [linhas]);
  const reus = useMemo(() => porRequerido(linhas, nomes, 8), [linhas, nomes]);
  const meses = useMemo(() => porMes(linhas), [linhas]);
  const pico = materias[0]?.decididos ?? 1;
  const suspJuros = useMemo(() => linhas.filter((l) => l.desfecho === "em_andamento" && l.fase_processual === "SUSPENSO" && l.materia === "JUROS E ENCARGOS INDEVIDOS").length, [linhas]);
  const legenda = [{ nome: NOME.procedente, cor: cor() }, { nome: NOME.parcial, cor: cor(0.45) }, { nome: NOME.improcedente, cor: CINZA }];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Tile i={0} rotulo="Decididos no mérito" valor={<Numero value={p.decididos} />} sub={`de ${p.total} processos`} icone={Gavel} />
        <Tile i={1} rotulo="Procedência" destaque tom="text-primary"
              valor={p.taxa == null ? "sem dado" : <><Numero value={p.taxa} />%</>}
              sub={`${p.ganhos} ganhos em ${p.decididos} decididos`} />
        <Tile i={2} rotulo="Ganhos" valor={<Numero value={p.ganhos} />} tom="text-primary" icone={Trophy}
              sub={`${p.procedentes} totais e ${p.parciais} parciais`} />
        <Tile i={3} rotulo="Perdidos" valor={<Numero value={p.improcedentes} />} tom="text-foreground/75" sub="Improcedentes" />
        <Tile i={4} rotulo="Fora da taxa" valor={<Numero value={p.acordos + p.semMerito + p.pagosSemSentenca} />}
              sub={`${p.semMerito} sem mérito, ${p.pagosSemSentenca} pagos sem sentença, ${p.acordos} acordos`} />
        <Tile i={5} rotulo="Suspensos" valor={<Numero value={p.suspensos} />} icone={PauseCircle}
              sub={suspJuros > 0 ? `${suspJuros} de juros e encargos aguardam o IRDR` : "Aguardando decisão do juízo"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Painel i={6} titulo="Por matéria" icone={ClipboardList} className="lg:col-span-3"
                descricao="O comprimento é quantos foram decididos; a cor, como foi."
                direita={<Legenda itens={legenda} />}>
          {materias.length === 0 ? <Vazio texto="Nenhuma decisão de mérito encontrada." /> : (
            <>
              <div className="space-y-0.5">
                {materias.map((f, i) => <BarraDesfecho key={f.nome} f={f} pico={pico} cor={cor} i={i} />)}
              </div>
              <p className="text-xs text-muted-foreground mt-4">Matérias com menos de três decisões somam em OUTRAS.</p>
              <Tabela linhas={materias} rotulo="Matéria" />
            </>
          )}
        </Painel>

        <Painel i={7} titulo="Por requerido" icone={Handshake} className="lg:col-span-2" descricao="Litisconsórcio conta o processo em cada réu.">
          {reus.length === 0 ? <Vazio texto="Sem decisões." /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50 text-xs">
                  <th className="py-2 pr-2 font-normal">Requerido</th>
                  <th className="py-2 px-1 font-normal text-right">Ganhos</th>
                  <th className="py-2 px-1 font-normal text-right">Perdas</th>
                  <th className="py-2 pl-1 font-normal text-right">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {reus.map((f) => (
                  <tr key={f.nome} className="border-b border-border/30 hover:bg-primary/[0.04] transition-colors">
                    <td className="py-2.5 pr-2 truncate max-w-[12rem]" title={f.nome}>{f.nome}</td>
                    <td className="py-2.5 px-1 text-right tabular-nums text-primary/90">{f.procedentes + f.parciais}</td>
                    <td className="py-2.5 px-1 text-right tabular-nums text-muted-foreground">{f.improcedentes}</td>
                    <td className="py-2.5 pl-1 text-right tabular-nums">{f.taxa == null ? "sem dado" : `${f.taxa}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Painel>
      </div>

      <Painel i={8} titulo="Decisões por mês" icone={CalendarClock} descricao="O número em cima de cada mês é a taxa daquele mês."
              direita={<Legenda itens={[{ nome: "Ganhos", cor: cor() }, { nome: "Perdidos", cor: CINZA }]} />}>
        {meses.length === 0 ? <Vazio texto="Sem decisões datadas." /> : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={meses} margin={{ top: 24, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: cor(0.06) }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const m = payload[0].payload as MesDesfecho;
                  return <TooltipCaixa titulo={m.rotulo} linhas={[
                    { cor: cor(), valor: m.ganhos, nome: "ganhos" }, { cor: CINZA, valor: m.perdidos, nome: "perdidos" },
                    { valor: m.taxa == null ? "sem dado" : `${m.taxa}%`, nome: "de procedência" }]} />;
                }} />
                <Bar dataKey="ganhos" stackId="d" fill={cor()} barSize={20} stroke="hsl(var(--card))" strokeWidth={2} animationDuration={700} animationEasing="ease-out" />
                <Bar dataKey="perdidos" stackId="d" fill={CINZA} barSize={20} radius={[4, 4, 0, 0]} stroke="hsl(var(--card))" strokeWidth={2} animationDuration={700} animationEasing="ease-out">
                  <LabelList dataKey="taxa" position="top" offset={6} formatter={(v: number | null) => (v == null ? "" : `${v}%`)}
                             style={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Painel>

      <Entra i={9}>
        <details className="group rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          <summary className="flex items-center gap-2 cursor-pointer select-none text-foreground/90">
            <Info className="h-4 w-4 text-primary/70" /> Como este número é calculado
          </summary>
          <div className="mt-3 space-y-2 pl-6">
            <p>É a procedência em primeiro grau. Para cada processo vale a última decisão publicada no DJEN. Ganho é procedente ou parcialmente procedente; perdido é improcedente.</p>
            <p>Acordos, extinções sem mérito e pagamentos sem sentença ficam fora do cálculo. Os acórdãos encontrados negaram provimento e mantiveram a sentença, então o resultado de primeiro grau é também o atual.</p>
            <p>
              {p.executados > 0 && <>{p.executados} vitórias já foram extintas por pagamento. </>}
              {p.valorGanho > 0 && <>Valor sentenciado registrado no Tracker: {fmtBRL(p.valorGanho)}. </>}
              {p.ganhosForaDoTracker > 0 && <>O DJEN encontra {p.ganhosForaDoTracker} vitórias que ainda não estão no Tracker.</>}
            </p>
          </div>
        </details>
      </Entra>
    </div>
  );
}
