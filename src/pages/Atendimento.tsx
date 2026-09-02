// ATENDIMENTO — a bancada de quem cuida do lead antes de ele virar cliente.
//
// MAQUETE. Os dados são inventados (src/lib/atendimentoMock.ts) e nada aqui é
// gravado: a tela se comporta como se o WhatsApp já estivesse plugado pra gente
// discutir o formato antes de construir o backend. O selo no topo diz isso pra
// quem abrir sem saber.
//
// O ARRANJO, e por que ele é assim:
//
//   ┌─ caixa ─┬────── conversa + dossiê ──────┬─ missões ─┐
//
// As três colunas ficam à vista ao mesmo tempo porque o objetivo do módulo é
// NÃO PERDER LEAD. Se a lista do dia sumisse quando a atendente abre uma
// conversa, ela voltaria a depender da memória exatamente no momento em que
// está ocupada — que é quando o lead afunda.
//
// A coluna da direita é uma fila com ordem de culpa, não uma lista de tarefas:
// quem falou com a gente e não foi respondido vem antes de tudo. A conta de
// pontos e sequência mora em src/lib/missoes.ts, testada.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MessageCircle, Search, Send, AlertTriangle, Check, Phone, FileText,
  Flame, Trophy, ChevronRight, Landmark, BadgeCheck, Sparkles, Radio, Inbox,
} from "lucide-react";
import {
  LEADS, MISSOES, ESTAGIOS, ORIGENS, SEQUENCIA_DIAS, PLACAR_MES, FUNIL_MES,
  type Lead, type Origem, type Estagio, type Mensagem,
} from "@/lib/atendimentoMock";
import {
  ordenarMissoes, progressoDoDia, patenteDaSequencia, emRisco, PONTOS,
  ROTULO_MISSAO, type Missao,
} from "@/lib/missoes";

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const CHIPS_ORIGEM: { chave: "todos" | Origem; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "pda", rotulo: "PDA" },
  { chave: "escritorio", rotulo: "Escritório" },
  { chave: "planilha", rotulo: "Landing" },
  { chave: "indicacao", rotulo: "Indicação" },
];

export default function AtendimentoPage() {
  const [aba, setAba] = useState<"atendimento" | "funil">("atendimento");
  const [origem, setOrigem] = useState<"todos" | Origem>("todos");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string>(LEADS[0].id);
  const [missoes, setMissoes] = useState<Missao[]>(MISSOES);
  const [rascunho, setRascunho] = useState("");
  // mensagens digitadas na maquete: vivem só nesta sessão, pra tela responder
  const [enviadas, setEnviadas] = useState<Record<string, Mensagem[]>>({});
  const [estagios, setEstagios] = useState<Record<string, Estagio>>({});

  const estagioDe = (l: Lead): Estagio => estagios[l.id] ?? l.estagio;

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return LEADS
      .filter((l) => origem === "todos" || l.origem === origem)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo))
      .sort((a, b) => {
        // sem resposta primeiro, e dentro disso a espera mais longa
        const ra = a.ultimaFoi === "lead" ? 0 : 1;
        const rb = b.ultimaFoi === "lead" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return b.horasSemResposta - a.horasSemResposta;
      });
  }, [origem, busca]);

  const lead = LEADS.find((l) => l.id === selecionadoId) ?? lista[0] ?? LEADS[0];
  const conversa = [...lead.conversa, ...(enviadas[lead.id] ?? [])];

  const fila = ordenarMissoes(missoes);
  const prog = progressoDoDia(missoes);
  const patente = patenteDaSequencia(SEQUENCIA_DIAS);
  const emRiscoAbertas = missoes.filter((m) => !m.feita && emRisco(m)).length;

  const concluir = (id: string) =>
    setMissoes((prev) => prev.map((m) => (m.id === id ? { ...m, feita: !m.feita } : m)));

  const enviar = () => {
    const texto = rascunho.trim();
    if (!texto) return;
    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setEnviadas((prev) => ({
      ...prev,
      [lead.id]: [...(prev[lead.id] ?? []), { de: "nos", texto, hora: agora }],
    }));
    setRascunho("");
    // responder mata a missão de "sem resposta" daquele lead — é o gesto que a
    // fila está cobrando, então ela some sozinha
    setMissoes((prev) =>
      prev.map((m) => (m.leadId === lead.id && m.tipo === "sem_resposta" ? { ...m, feita: true } : m)));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-medium">Atendimento</h1>
          <span className="rounded-full px-2 py-[3px] text-[10px] uppercase tracking-[0.12em] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25">
            maquete · dados de exemplo
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
          {([["atendimento", "Atendimento", Inbox], ["funil", "Funil", Trophy]] as const).map(([k, rot, Ico]) => (
            <button key={k} onClick={() => setAba(k)}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors",
                aba === k ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Ico className="h-3.5 w-3.5" /> {rot}
            </button>
          ))}
        </div>
      </div>

      {aba === "funil" ? (
        <PainelFunil emRisco={emRiscoAbertas} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_18rem] h-[calc(100dvh-11rem)] min-h-[36rem]">

          {/* ───────────────────── caixa de entrada ───────────────────── */}
          <SpotlightCard className="flex flex-col min-h-0 p-0 overflow-hidden">
            <div className="p-3 pb-2 flex flex-col gap-2 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-emerald-400" /> Caixa
                </h2>
                <span className="text-[11px] text-muted-foreground tabular-nums">{lista.length}</span>
              </div>
              {/* O seletor de número. Cada porta de entrada é um chip; PDA e
                  escritório são os dois números de verdade, landing e indicação
                  chegam por um deles mas contam separado na origem. */}
              <div className="flex flex-wrap gap-1">
                {CHIPS_ORIGEM.map((c) => (
                  <button key={c.chave} onClick={() => setOrigem(c.chave)}
                    className={cn("rounded-full px-2 py-[3px] text-[10.5px] transition-colors ring-1",
                      origem === c.chave
                        ? "bg-emerald-400/12 text-emerald-300 ring-emerald-400/30"
                        : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground")}>
                    {c.rotulo}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="nome ou telefone" className="h-8 pl-7 text-[12.5px]" />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
              {lista.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground text-center py-8">Nenhuma conversa aqui.</p>
              ) : lista.map((l) => {
                const semResposta = l.ultimaFoi === "lead";
                const ativo = l.id === lead.id;
                return (
                  <button key={l.id} onClick={() => setSelecionadoId(l.id)}
                    className={cn("w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors flex gap-2.5",
                      ativo ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}>
                    <span className={cn("h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold ring-1",
                      semResposta ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                                  : "bg-white/[0.05] text-muted-foreground ring-white/10")}>
                      {iniciais(l.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[12.5px] font-medium truncate flex-1">{l.nome}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{l.ultimaHora}</span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
                        {semResposta && <AlertTriangle className="inline h-3 w-3 text-amber-300 mr-1 -mt-px" />}
                        {(l.conversa[l.conversa.length - 1]?.texto ?? "").slice(0, 44)}
                      </span>
                      <span className="flex items-center gap-1 mt-1">
                        <span className="rounded px-1.5 py-[1px] text-[9.5px] bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
                          {ESTAGIOS.find((e) => e.chave === estagioDe(l))?.rotulo}
                        </span>
                        <span className="text-[9.5px] text-muted-foreground/70">{ORIGENS[l.origem].curto}</span>
                        {l.naoLidas > 0 && (
                          <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-emerald-400 text-[9.5px] font-semibold text-emerald-950 grid place-items-center">
                            {l.naoLidas}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </SpotlightCard>

          {/* ───────────────────── conversa + dossiê ───────────────────── */}
          <SpotlightCard className="flex flex-col min-h-0 p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-[12px] font-semibold bg-white/[0.05] text-foreground ring-1 ring-white/10">
                {iniciais(lead.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold truncate">{lead.nome}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Radio className="h-3 w-3" />
                  {ORIGENS[lead.origem].rotulo} · {lead.telefone}
                </p>
              </div>
              {lead.ultimaFoi === "lead" && (
                <span className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25">
                  <AlertTriangle className="h-3 w-3" /> sem resposta há {lead.horasSemResposta}h
                </span>
              )}
            </div>

            {/* Os cinco estágios como régua clicável: mudar de estágio é o gesto
                mais frequente depois de responder, e não pode estar escondido
                num select. */}
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-1 overflow-x-auto scrollbar-thin">
              {ESTAGIOS.map((e, i) => {
                const atualIdx = ESTAGIOS.findIndex((x) => x.chave === estagioDe(lead));
                const passou = i <= atualIdx;
                return (
                  <button key={e.chave} title={e.descricao}
                    onClick={() => setEstagios((p) => ({ ...p, [lead.id]: e.chave }))}
                    className={cn("flex items-center gap-1.5 shrink-0 rounded-full pl-1.5 pr-2.5 py-1 text-[11px] transition-colors",
                      i === atualIdx ? "bg-emerald-400/12 text-emerald-300 ring-1 ring-emerald-400/30"
                        : passou ? "text-muted-foreground hover:text-foreground"
                                 : "text-muted-foreground/50 hover:text-foreground")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      passou ? "bg-emerald-400" : "bg-white/20")} />
                    {e.rotulo}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-2">
              {conversa.map((msg, i) => (
                <div key={i} className="flex flex-col gap-2">
                  {msg.dia && (
                    <div className="self-center rounded-full px-2.5 py-[2px] text-[10px] text-muted-foreground bg-white/[0.04] ring-1 ring-white/[0.06] my-1">
                      {msg.dia}
                    </div>
                  )}
                  <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug",
                    msg.de === "lead"
                      ? "self-start bg-white/[0.05] rounded-tl-sm"
                      : "self-end bg-emerald-400/12 text-foreground rounded-tr-sm ring-1 ring-emerald-400/15")}>
                    {msg.texto}
                    <span className="block text-[9.5px] text-muted-foreground/70 mt-1 text-right tabular-nums">{msg.hora}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── dossiê: o que o escritório escolheu ver ── */}
            <div className="px-4 py-2.5 border-t border-white/[0.06] grid gap-x-5 gap-y-1.5 sm:grid-cols-3 text-[11.5px]">
              <div className="flex flex-col">
                <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70 flex items-center gap-1">
                  <Landmark className="h-3 w-3" /> Banco
                </span>
                <span className={cn(lead.dossie.banco ? "" : "text-muted-foreground/50")}>
                  {lead.dossie.banco ?? "não perguntado"}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">Descontos</span>
                <span className={cn("truncate", lead.dossie.descontos.length ? "" : "text-muted-foreground/50")}>
                  {lead.dossie.descontos.length ? lead.dossie.descontos.join(", ") : "não perguntado"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">Perfil</span>
                <span className={cn(lead.dossie.inss === null ? "text-muted-foreground/50" : "")}>
                  {lead.dossie.inss === null ? "não perguntado"
                    : `${lead.dossie.inss ? "INSS" : "não é INSS"}${lead.dossie.consignado ? ` · ${lead.dossie.consignado}` : ""}`}
                </span>
              </div>
              {lead.dossie.obs && (
                <p className="sm:col-span-3 text-[11px] text-muted-foreground border-t border-white/[0.05] pt-1.5">
                  {lead.dossie.obs}
                </p>
              )}
            </div>

            <div className="px-3 py-2.5 border-t border-white/[0.06] flex items-center gap-2">
              <Input value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder={`Responder ${lead.nome.split(" ")[0]}…`} className="h-9 text-[12.5px]" />
              <Button size="sm" className="h-9 shrink-0" onClick={enviar} disabled={!rascunho.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </SpotlightCard>

          {/* ───────────────────── missões do dia ───────────────────── */}
          <SpotlightCard className="flex flex-col min-h-0 p-0 overflow-hidden">
            <div className="p-3 border-b border-white/[0.06] flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Hoje</h2>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {prog.feitas} de {prog.total}
                </span>
              </div>

              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", prog.zerado ? "bg-emerald-400" : "bg-emerald-400/70")}
                  initial={false}
                  animate={{ width: `${prog.pct}%` }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="tabular-nums font-semibold">{prog.pontos}</span>
                  <span className="text-muted-foreground">/ {prog.pontosPossiveis} pts</span>
                </span>
                <span className="flex items-center gap-1 ml-auto" title={`${SEQUENCIA_DIAS} dias sem deixar ninguém sem resposta`}>
                  <Flame className={cn("h-3.5 w-3.5", SEQUENCIA_DIAS > 0 ? "text-orange-400" : "text-muted-foreground")} />
                  <span className="tabular-nums font-semibold">{SEQUENCIA_DIAS}</span>
                  <span className="text-muted-foreground">dias</span>
                </span>
              </div>

              <p className="text-[10.5px] text-muted-foreground">
                {patente.rotulo}
                {patente.faltam !== null && ` · faltam ${patente.faltam} pra ${patente.proxima}`}
              </p>

              <AnimatePresence>
                {prog.zerado && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/25 rounded-md px-2 py-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                    Ninguém está esperando resposta.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 flex flex-col gap-1.5">
              {fila.map((m) => {
                const risco = emRisco(m) && !m.feita;
                return (
                  <div key={m.id}
                    className={cn("rounded-lg border px-2.5 py-2 transition-colors",
                      m.feita ? "border-white/[0.05] bg-white/[0.015] opacity-55"
                        : risco ? "border-amber-400/25 bg-amber-400/[0.05]"
                                : "border-white/[0.06] bg-white/[0.02]")}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => concluir(m.id)}
                        title={m.feita ? "Desmarcar" : "Marcar como feita"}
                        className={cn("mt-[1px] h-4 w-4 shrink-0 rounded grid place-items-center ring-1 transition-colors",
                          m.feita ? "bg-emerald-400 ring-emerald-400 text-emerald-950"
                                  : "ring-white/20 hover:ring-emerald-400/60")}>
                        {m.feita && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <button onClick={() => setSelecionadoId(m.leadId)} className="min-w-0 flex-1 text-left">
                        <p className={cn("text-[12px] font-medium leading-tight flex items-center gap-1",
                          m.feita && "line-through")}>
                          {risco && <AlertTriangle className="h-3 w-3 text-amber-300 shrink-0" />}
                          {ROTULO_MISSAO[m.tipo]}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{m.lead}</p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">{m.detalhe}</p>
                      </button>
                      <span className="text-[9.5px] text-muted-foreground/60 tabular-nums shrink-0 mt-[2px]">
                        +{PONTOS[m.tipo]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2 border-t border-white/[0.06] flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-[11.5px]">
                <Phone className="h-3.5 w-3.5 mr-1" /> Ligar
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-[11.5px]">
                <FileText className="h-3.5 w-3.5 mr-1" /> Pedir extrato
              </Button>
            </div>
          </SpotlightCard>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── a aba do gestor ─────────────────────────── */
/* Mesma página, aba separada: o Dr. Matheus precisa do funil e do placar sem
   atravessar a bancada de trabalho da atendente. */
function PainelFunil({ emRisco }: { emRisco: number }) {
  const topo = FUNIL_MES[0].n;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <SpotlightCard className="p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Funil do mês</h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            De cada 100 que chegam, quantos sobrevivem a cada passo. Hoje as três primeiras
            linhas não existem em lugar nenhum — é isso que o módulo passa a medir.
          </p>
        </div>
        <div className="flex flex-col gap-2 mt-1">
          {FUNIL_MES.map((f, i) => {
            const anterior = i === 0 ? null : FUNIL_MES[i - 1].n;
            const passagem = anterior ? Math.round((f.n / anterior) * 100) : 100;
            return (
              <div key={f.estagio} className="flex items-center gap-3">
                <span className="w-[9.5rem] shrink-0 text-[12px] text-muted-foreground">{f.rotulo}</span>
                <span className="flex-1 h-6 rounded bg-white/[0.04] overflow-hidden">
                  <span className="block h-full bg-emerald-400/25 border-r-2 border-emerald-400"
                    style={{ width: `${Math.round((f.n / topo) * 100)}%` }} />
                </span>
                <span className="w-10 text-right text-[13px] font-semibold tabular-nums">{f.n}</span>
                <span className={cn("w-12 text-right text-[11px] tabular-nums",
                  passagem < 50 ? "text-amber-300" : "text-muted-foreground")}>
                  {i === 0 ? "" : `${passagem}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px] text-muted-foreground border-t border-white/[0.06] pt-2.5">
          A maior queda é de <span className="text-amber-300">triados para extrato recebido (44%)</span> —
          o gargalo que a gente já suspeitava, agora com número.
        </p>
      </SpotlightCard>

      <div className="flex flex-col gap-3">
        <SpotlightCard className="p-4 flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Em risco agora</p>
          <p className={cn("text-3xl font-semibold tabular-nums", emRisco > 0 ? "text-amber-300" : "text-emerald-400")}>
            {emRisco}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            pessoas esperando resposta ou sem próximo passo definido
          </p>
        </SpotlightCard>

        <SpotlightCard className="p-4 flex flex-col gap-2.5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Placar do mês</p>
          {PLACAR_MES.map((p, i) => (
            <div key={p.pessoa} className="flex items-center gap-2.5">
              <span className={cn("h-6 w-6 rounded-full grid place-items-center text-[11px] font-semibold",
                i === 0 ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30" : "bg-white/[0.05] text-muted-foreground")}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">{p.pessoa}</span>
                <span className="block text-[10.5px] text-muted-foreground">
                  {p.leads} leads · {p.fechados} fechados
                </span>
              </span>
              <span className="text-[13px] font-semibold tabular-nums">{p.pontos}</span>
            </div>
          ))}
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Por origem</p>
          {(Object.keys(ORIGENS) as Origem[]).map((o) => {
            const n = LEADS.filter((l) => l.origem === o).length;
            return (
              <div key={o} className="flex items-center justify-between py-1 text-[12px]">
                <span className="text-muted-foreground">{ORIGENS[o].rotulo}</span>
                <span className="tabular-nums">{n}</span>
              </div>
            );
          })}
          <p className="text-[10.5px] text-muted-foreground/70 mt-2 flex items-center gap-1">
            <ChevronRight className="h-3 w-3" /> amarrar com o custo por lead do Meta Ads
          </p>
        </SpotlightCard>
      </div>
    </div>
  );
}
