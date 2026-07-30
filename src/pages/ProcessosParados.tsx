import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Loader2, MapPin, User, Clock, SquareArrowOutUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { diasSemMov, faixaDe, infoParados, type ParadoKey } from "@/lib/parados";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Processo {
  id: string;
  numero_processo: string;
  materia: string | null;
  data_ultimo_andamento: string | null;
  fase_processual: string | null;
  valor_causa: number | null;
  comarca_uf: string | null;
  clientes?: { nome: string } | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null) => {
  if (!d) return "sem data";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function ProcessosParados() {
  const { faixa } = useParams<{ faixa: string }>();
  const navigate = useNavigate();
  const key = (faixa ?? "mais") as ParadoKey;
  const info = infoParados(key);

  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = `${info.titulo} · AW ECO ME`; }, [info.titulo]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, numero_processo, materia, data_ultimo_andamento, fase_processual, valor_causa, comarca_uf, clientes(nome)");
      if (data) setProcessos(data as unknown as Processo[]);
      setLoading(false);
    })();
  }, []);

  const lista = useMemo(() => {
    const emMovimento = processos.filter((p) => p.fase_processual !== "ARQUIVADO" && p.fase_processual !== "SUSPENSO");
    let base: Processo[];
    if (key === "suspensos") base = processos.filter((p) => p.fase_processual === "SUSPENSO");
    else base = emMovimento.filter((p) => faixaDe(diasSemMov(p.data_ultimo_andamento)) === key);
    return base
      .map((p) => ({ p, dias: diasSemMov(p.data_ultimo_andamento) }))
      .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  }, [processos, key]);

  const resumo = useMemo(() => {
    const comData = lista.filter((x) => x.dias !== null);
    const soma = comData.reduce((s, x) => s + (x.dias ?? 0), 0);
    const valor = lista.reduce((s, x) => s + (Number(x.p.valor_causa) || 0), 0);
    return {
      media: comData.length ? Math.round(soma / comData.length) : 0,
      maisAntigo: comData.reduce((m, x) => Math.max(m, x.dias ?? 0), 0),
      valor,
    };
  }, [lista]);

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <Button variant="ghost" onClick={() => navigate("/processos")} className="gap-2 -ml-2 mb-2">
          <ArrowLeft className="h-4 w-4" /> Processos
        </Button>
        <h2 className="font-display text-3xl font-medium tracking-tight">{info.titulo}</h2>
        <p className="text-sm text-muted-foreground mt-1">{info.subtitulo}</p>
      </motion.div>

      {/* ── Resumo ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <SpotlightCard>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Processos</p>
          <p className="text-3xl font-semibold font-display mt-1 tabular-nums">{lista.length}</p>
        </SpotlightCard>
        {key !== "suspensos" && key !== "sem" && (
          <>
            <SpotlightCard>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Média parada</p>
              <p className="text-3xl font-semibold font-display mt-1 tabular-nums">{resumo.media}<span className="text-base text-muted-foreground ml-1">dias</span></p>
            </SpotlightCard>
            <SpotlightCard>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Mais antigo</p>
              <p className="text-3xl font-semibold font-display mt-1 tabular-nums">{resumo.maisAntigo}<span className="text-base text-muted-foreground ml-1">dias</span></p>
            </SpotlightCard>
          </>
        )}
        <SpotlightCard className={key !== "suspensos" && key !== "sem" ? "" : "col-span-1"}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor em causa</p>
          <p className="text-2xl font-semibold font-display mt-1 text-primary tabular-nums">{fmtBRL(resumo.valor)}</p>
        </SpotlightCard>
      </motion.div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-16 text-center text-muted-foreground">Nenhum processo nesta faixa.</div>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}>
          <Card className="divide-y divide-border/40 overflow-hidden">
            {lista.map(({ p, dias }, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 16) * 0.02 }}
                onClick={() => navigate(`/processos/${p.id}`)}
                className="group w-full flex items-center gap-4 p-4 text-left transition-colors hover:bg-primary/[0.04]"
              >
                <span className="h-12 w-12 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 grid place-items-center transition-transform duration-300 group-hover:scale-105">
                  <FileText className="h-5 w-5 text-primary" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{p.numero_processo}</span>
                    {p.fase_processual && <Badge variant="secondary" className="text-[10px]">{p.fase_processual}</Badge>}
                  </div>
                  <div className="flex items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1 min-w-0"><User className="h-3 w-3 shrink-0" /><span className="truncate">{p.clientes?.nome ?? "não vinculado"}</span></span>
                    {p.materia && <span className="truncate">{p.materia}</span>}
                    {p.comarca_uf && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{p.comarca_uf}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {dias !== null ? (
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-primary/70" /> {dias} dias
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground">sem data</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">últ. {fmtDate(p.data_ultimo_andamento)}</p>
                  <p className="text-xs text-emerald-400/90 mt-0.5 tabular-nums">{p.valor_causa != null ? fmtBRL(p.valor_causa) : ""}</p>
                </div>

                <SquareArrowOutUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
              </motion.button>
            ))}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
