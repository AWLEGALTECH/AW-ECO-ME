/* COMERCIAL: fechamentos, ações e metas do time.
 *
 * A unidade é a AÇÃO (rubrica fechada), porque é nela que a meta é contada.
 * O mês navega com as setas; tudo no painel obedece ao mês escolhido, menos
 * a série de doze meses, que dá o contexto.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Target, FileSignature, Users, Layers, TrendingUp, AlertCircle, CalendarClock } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCorPrimaria } from "@/hooks/useCorPrimaria";
import { hojeISO } from "@/lib/hoje";
import { rotuloDoMes } from "@/lib/procedencia";
import {
  porMesComercial, resumoComercial, porResponsavel, rubricasMaisFechadas, mesVizinho, mesDe,
  type FechamentoLinha, type RegraMesLinha, type ContratoLinha, type MesComercial,
} from "@/lib/comercial";
import { Tile, Painel, Numero, BarList, Legenda, Vazio, TooltipCaixa, CINZA } from "./comum";

export default function PainelComercial() {
  const { cor } = useCorPrimaria();
  const [fs, setFs] = useState<FechamentoLinha[]>([]);
  const [regras, setRegras] = useState<RegraMesLinha[]>([]);
  const [contratos, setContratos] = useState<ContratoLinha[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [mes, setMes] = useState(() => mesDe(hojeISO()));

  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: r }, { data: c }, { data: p }, { data: m }] = await Promise.all([
        supabase.from("fechamentos" as never).select("data, competencia, rubricas, responsavel, user_id, pendencia"),
        supabase.from("fechamentos_meses" as never).select("mes, meta_geral"),
        supabase.from("contratos" as never).select("data_assinatura, status"),
        supabase.from("profiles").select("id, nome"),
        supabase.from("materias_catalogo" as never).select("chave, rotulo"),
      ]);
      if (f) setFs(f as unknown as FechamentoLinha[]);
      if (r) setRegras(r as unknown as RegraMesLinha[]);
      if (c) setContratos(c as unknown as ContratoLinha[]);
      if (p) setNomes(Object.fromEntries((p as { id: string; nome: string | null }[]).map((x) => [x.id, x.nome ?? "Sem nome"])));
      if (m) setRotulos(Object.fromEntries((m as unknown as { chave: string; rotulo: string }[]).map((x) => [x.chave, x.rotulo])));
    })();
  }, []);

  const r = useMemo(() => resumoComercial(fs, contratos, regras, mes), [fs, contratos, regras, mes]);
  const serie = useMemo(() => porMesComercial(fs, contratos, regras, mes, 12), [fs, contratos, regras, mes]);
  const pessoas = useMemo(() => porResponsavel(fs, mes, nomes), [fs, mes, nomes]);
  const rubricas = useMemo(() => rubricasMaisFechadas(fs.filter((f) => serie.some((s) => s.mes === f.competencia)), rotulos, 12), [fs, serie, rotulos]);
  const totalAcoesPessoas = pessoas.reduce((s, p) => s + p.acoes, 0);
  const totalRubricas = rubricas.reduce((s, x) => s + x.n, 0);
  const hojeMes = mesDe(hojeISO());

  const navegador = (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1">
      <button onClick={() => setMes(mesVizinho(mes, -1))} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors" aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 text-sm capitalize tabular-nums min-w-[4.5rem] text-center">{rotuloDoMes(mes)}</span>
      <button onClick={() => setMes(mesVizinho(mes, 1))} disabled={mes >= hojeMes}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Mês seguinte">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  const medidor = r.meta ? (
    <span className="block">
      <span className="block text-xs text-muted-foreground/85 mb-1.5">{r.acoes} de {r.meta} ações da meta</span>
      <span className="block h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
        <span className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, r.pctMeta ?? 0)}%` }} />
      </span>
    </span>
  ) : "Sem meta cadastrada para o mês";

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{navegador}</div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Tile i={0} rotulo="Ações no mês" destaque tom="text-primary" icone={Target}
              valor={r.pctMeta == null ? <Numero value={r.acoes} /> : <><Numero value={r.pctMeta} />%</>} sub={medidor} />
        <Tile i={1} rotulo="Fechamentos" valor={<Numero value={r.fechamentos} />} icone={FileSignature}
              sub={r.acoesPorFechamento != null ? `${r.acoesPorFechamento} ações por fechamento` : "Nenhum fechamento no mês"} />
        <Tile i={2} rotulo="Contra o mês anterior" icone={TrendingUp}
              valor={r.variacao == null ? "sem base" : <>{r.variacao > 0 ? "+" : ""}<Numero value={r.variacao} />%</>}
              tom={r.variacao == null ? undefined : r.variacao >= 0 ? "text-primary" : "text-foreground/75"}
              sub={`${r.acoesMesAnterior} ações no mês anterior`} />
        <Tile i={3} rotulo="Contratos no mês" valor={<Numero value={r.contratosNoMes} />} sub="Assinados no período" />
        <Tile i={4} rotulo="Contratos ativos" valor={<Numero value={r.contratosAtivos} />} sub="Na base inteira" />
        <Tile i={5} rotulo="Pendentes" valor={<Numero value={r.pendentes} />} icone={AlertCircle}
              sub={r.pendentes > 0 ? "Fechamentos com pendência no mês" : "Nenhuma pendência no mês"} />
      </div>

      <Painel i={6} titulo="Ações por mês" icone={CalendarClock} descricao="Doze meses. A linha é a meta cadastrada em cada mês."
              direita={<Legenda itens={[{ nome: "Ações", cor: cor() }, { nome: "Meta", cor: CINZA }]} />}>
        {serie.every((s) => s.acoes === 0) ? <Vazio texto="Nenhuma ação nos últimos doze meses." /> : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: cor(0.06) }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const m = payload[0].payload as MesComercial;
                  return <TooltipCaixa titulo={m.rotulo} linhas={[
                    { cor: cor(), valor: m.acoes, nome: "ações" },
                    { valor: m.fechamentos, nome: "fechamentos" },
                    { cor: CINZA, valor: m.meta ?? "sem meta", nome: "de meta" },
                    { valor: m.contratos, nome: "contratos assinados" }]} />;
                }} />
                <Bar dataKey="acoes" fill={cor()} barSize={20} radius={[4, 4, 0, 0]} animationDuration={700} animationEasing="ease-out"
                     className={mes ? "" : ""} />
                <Line type="monotone" dataKey="meta" stroke={CINZA} strokeWidth={2} dot={{ r: 3, fill: CINZA, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                      connectNulls={false} animationDuration={700} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Painel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel i={7} titulo={`Quem fechou em ${rotuloDoMes(mes)}`} icone={Users} descricao="Ações por pessoa, pelo perfil de quem lançou.">
          <BarList data={pessoas.map((p) => ({ name: p.nome, value: p.acoes }))} total={totalAcoesPessoas || 1} max={8} emptyMessage="Ninguém fechou neste mês." />
        </Painel>
        <Painel i={8} titulo="Rubricas mais fechadas" icone={Layers} descricao="Nos últimos doze meses.">
          <BarList data={rubricas.map((x) => ({ name: x.nome, value: x.n }))} total={totalRubricas || 1} max={12} emptyMessage="Sem rubricas no período." />
        </Painel>
      </div>

      <Painel i={9} titulo="Contratos assinados por mês" icone={FileSignature} descricao="Pela data de assinatura.">
        {serie.every((s) => s.contratos === 0) ? <Vazio texto="Nenhum contrato assinado nos últimos doze meses." /> : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: cor(0.06) }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const m = payload[0].payload as MesComercial;
                  return <TooltipCaixa titulo={m.rotulo} linhas={[{ cor: cor(0.6), valor: m.contratos, nome: "contratos" }]} />;
                }} />
                <Bar dataKey="contratos" fill={cor(0.6)} barSize={20} radius={[4, 4, 0, 0]} animationDuration={700} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Painel>
    </div>
  );
}
