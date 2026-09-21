/* META ADS: OS NÚMEROS DAS CAMPANHAS, DENTRO DO AW.
 *
 * Lê só do banco (ver useMetaAds.ts). O que a tela responde, nesta ordem:
 *
 *   1. Tem alguma coisa ERRADA agora?      o aviso no topo, quando houver
 *   2. Quanto gastei e o que voltou?        os quatro números grandes
 *   3. Como isso se distribuiu no tempo?    o gráfico dia a dia
 *   4. Em qual campanha?                    a tabela
 *
 * O aviso vem antes dos números de propósito. A razão de esta integração
 * existir apareceu no primeiro dia: a única campanha ativa da conta parou de
 * gastar em 16/09 e o Gerenciador dizia "Ativa". Um número total de 30 dias
 * esconde isso; um aviso não.
 *
 * MESMAS PEÇAS DO DASHBOARD (Tile, Painel, TooltipCaixa, cor do tema). Não é
 * economia: é para isto parecer parte do sistema, e não um painel da Meta
 * colado dentro dele.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Megaphone, RefreshCw, AlertTriangle, Wallet, Users, MousePointerClick, Target, Loader2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile, Painel, TooltipCaixa, Entra, fmtBRL, EASE } from "@/pages/dashboard/comum";
import { useCorPrimaria } from "@/hooks/useCorPrimaria";
import {
  useMetaCampanhas, useMetaDiario, useMetaUltimaRodada, useInvalidarMeta, sincronizarMeta,
} from "@/hooks/useMetaAds";
import {
  somar, ultimosDias, seriePorDia, ativaSemGastar, rotuloDoResultado, rotuloDoStatus, brl, inteiro,
} from "@/lib/metaAds";
import { cn } from "@/lib/utils";

const JANELAS = [7, 14, 30] as const;

const diaCurto = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const haQuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
};

export function MetaAds() {
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(7);
  const [sincronizando, setSincronizando] = useState(false);
  const { cor } = useCorPrimaria();
  const invalidar = useInvalidarMeta();

  const { data: campanhas = [], isLoading: carregandoCampanhas } = useMetaCampanhas();
  const { data: diario = [], isLoading: carregandoDiario } = useMetaDiario(30);
  const { data: rodada } = useMetaUltimaRodada();

  const naJanela = useMemo(() => ultimosDias(diario, janela), [diario, janela]);
  const totais = useMemo(() => somar(naJanela), [naJanela]);
  const serie = useMemo(() => seriePorDia(diario, janela), [diario, janela]);

  /* O rótulo dos resultados segue a campanha que mais gastou na janela: se a
     conta é de leads, diz "leads". Misturar objetivos numa conta só é raro,
     e quando acontece a tabela embaixo mostra cada uma com o seu. */
  const objetivoDominante = useMemo(() => {
    const gastoPor = new Map<string, number>();
    for (const d of naJanela) gastoPor.set(d.campanha_id, (gastoPor.get(d.campanha_id) ?? 0) + Number(d.gasto));
    const top = [...gastoPor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return campanhas.find((c) => c.id === top)?.objetivo ?? campanhas[0]?.objetivo ?? null;
  }, [naJanela, campanhas]);
  const rotulo = rotuloDoResultado(objetivoDominante);

  const paradas = useMemo(() => campanhas.filter((c) => ativaSemGastar(c, diario)), [campanhas, diario]);

  const atualizar = async (dias = 3) => {
    setSincronizando(true);
    try {
      const r = await sincronizarMeta(dias);
      invalidar();
      toast.success(`Atualizado: ${r.campanhas} campanhas, ${r.dias} dias de números.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSincronizando(false);
    }
  };

  const carregando = carregandoCampanhas || carregandoDiario;
  const semNada = !carregando && campanhas.length === 0;

  /* ── ainda não ligado ────────────────────────────────────────────────── */
  if (semNada) {
    return (
      <Entra>
        <div className="rounded-2xl border border-dashed border-white/[0.12] p-8 text-center max-w-xl mx-auto">
          <Megaphone className="h-6 w-6 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-medium mt-3">Ainda sem números da Meta</p>
          {rodada && !rodada.ok ? (
            <p className="text-[12.5px] text-amber-300/90 mt-2 leading-snug">
              A última tentativa falhou {haQuanto(rodada.rodada_em)}: {rodada.erro}
            </p>
          ) : (
            <p className="text-[12.5px] text-muted-foreground mt-2 leading-snug">
              Falta o token da conta de anúncios nos secrets do projeto (META_ACCESS_TOKEN e
              META_AD_ACCOUNT_ID). Com ele, a primeira carga traz os últimos 90 dias.
            </p>
          )}
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => atualizar(90)} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Puxar os últimos 90 dias
          </Button>
        </div>
      </Entra>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── cabeçalho da seção: janela e atualização ────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl bg-white/[0.03] border border-white/[0.07] p-1">
          {JANELAS.map((d) => (
            <button key={d} onClick={() => setJanela(d)}
              className="relative px-3 py-1.5 rounded-lg text-xs font-medium">
              {janela === d && (
                <motion.span layoutId="meta-janela" className="absolute inset-0 rounded-lg bg-primary/15"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }} />
              )}
              <span className={cn("relative z-10 transition-colors", janela === d ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                {d} dias
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          {rodada && (
            rodada.ok
              ? <span>atualizado {haQuanto(rodada.rodada_em)}</span>
              : <span className="text-amber-300/90 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> última descida falhou {haQuanto(rodada.rodada_em)}
                </span>
          )}
          <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => atualizar(3)} disabled={sincronizando}
            title="Buscar na Meta agora">
            <RefreshCw className={cn("h-3.5 w-3.5", sincronizando && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      {/* ── o aviso, antes dos números ─────────────────────────────────── */}
      {paradas.length > 0 && (
        <Entra>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 text-[12.5px] leading-snug">
              <p className="font-medium text-amber-200">
                {paradas.length === 1 ? "Campanha ativa sem gastar" : `${paradas.length} campanhas ativas sem gastar`}
              </p>
              <p className="text-amber-200/80 mt-0.5">
                {paradas.map((c) => c.nome).join(" · ")}
              </p>
              <p className="text-muted-foreground mt-1">
                Marcada como ativa na Meta, mas sem gasto nos últimos dois dias. Costuma ser saldo, cartão
                ou conjunto de anúncios pausado. O Gerenciador não avisa.
              </p>
            </div>
          </div>
        </Entra>
      )}

      {/* ── os quatro números ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile i={0} icone={Wallet} rotulo="Investido" valor={fmtBRL(totais.gasto)}
          sub={`nos últimos ${janela} dias`} />
        <Tile i={1} icone={Users} rotulo={rotulo} valor={inteiro(totais.resultados)}
          sub={totais.custoPorResultado != null ? `${brl(totais.custoPorResultado)} cada` : "nenhum no período"} />
        <Tile i={2} icone={MousePointerClick} rotulo="Cliques" valor={inteiro(totais.cliques)}
          sub={totais.ctr != null ? `CTR ${totais.ctr.toFixed(2).replace(".", ",")}%` : "sem impressões"} />
        <Tile i={3} icone={Target} rotulo="Alcance" valor={inteiro(totais.alcance)}
          sub={totais.cpm != null ? `CPM ${brl(totais.cpm)}` : `${inteiro(totais.impressoes)} impressões`} />
      </div>

      {/* ── o gráfico ──────────────────────────────────────────────────── */}
      <Painel i={4} titulo="Dia a dia" icone={Megaphone}
        descricao={`Investimento (barras) e ${rotulo} (linha), por dia.`}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="dia" tickFormatter={diaCurto} tickLine={false} axisLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
              <YAxis yAxisId="gasto" tickLine={false} axisLine={false} width={44}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => `R$${v}`} />
              <YAxis yAxisId="res" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={30}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip cursor={{ fill: cor(0.06) }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { dia: string; gasto: number; resultados: number; cliques: number };
                return <TooltipCaixa titulo={diaCurto(p.dia)} linhas={[
                  { cor: cor(0.6), valor: fmtBRL(p.gasto), nome: "investido" },
                  { cor: cor(), valor: p.resultados, nome: rotulo },
                  { valor: p.cliques, nome: "cliques" },
                ]} />;
              }} />
              <Bar yAxisId="gasto" dataKey="gasto" fill={cor(0.35)} barSize={janela > 14 ? 10 : 18} radius={[4, 4, 0, 0]}
                animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="res" type="monotone" dataKey="resultados" stroke={cor()} strokeWidth={2}
                dot={false} activeDot={{ r: 4 }} animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      {/* ── a tabela ───────────────────────────────────────────────────── */}
      <Painel i={5} titulo="Campanhas" descricao="Cada uma com o resultado do seu objetivo, na janela escolhida.">
        <div className="divide-y divide-white/[0.06]">
          {campanhas
            .map((c) => ({ c, t: somar(naJanela.filter((d) => d.campanha_id === c.id)) }))
            /* Quem gastou vem primeiro; entre as que não gastaram, ativas antes
               de pausadas, e arquivadas por último. */
            .sort((a, b) => b.t.gasto - a.t.gasto || ordem(a.c.status) - ordem(b.c.status))
            .map(({ c, t }) => {
              const ativa = c.status === "ACTIVE";
              const parada = paradas.some((p) => p.id === c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn("h-2 w-2 rounded-full shrink-0",
                    parada ? "bg-amber-400" : ativa ? "bg-primary" : "bg-white/20")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] truncate">{c.nome}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {rotuloDoStatus(c.status)}
                      {c.orcamento_diario ? ` · ${brl(c.orcamento_diario)}/dia` : ""}
                      {parada && <span className="text-amber-300/90"> · sem gasto há 2 dias</span>}
                    </span>
                  </span>
                  <span className="text-right shrink-0 tabular-nums">
                    <span className="block text-[13px]">{fmtBRL(t.gasto)}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {t.resultados > 0
                        ? `${inteiro(t.resultados)} ${rotuloDoResultado(c.objetivo)} · ${brl(t.custoPorResultado)}`
                        : t.gasto > 0 ? `sem ${rotuloDoResultado(c.objetivo)}` : "parada no período"}
                    </span>
                  </span>
                </div>
              );
            })}
        </div>
        <p className="text-[10.5px] text-muted-foreground/70 mt-3 leading-snug flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> Ligar e pausar campanha por aqui é o próximo passo; hoje isso é no Gerenciador.
        </p>
      </Painel>
    </div>
  );
}

const ordem = (s: string) => (s === "ACTIVE" ? 0 : s === "PAUSED" ? 1 : 2);
