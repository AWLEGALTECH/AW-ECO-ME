// ATENDIMENTO — a bancada de quem cuida do lead antes de ele virar cliente.
//
// MAQUETE. Os dados são inventados (src/lib/atendimentoMock.ts) e nada aqui é
// gravado: a tela se comporta como se o WhatsApp já estivesse plugado pra gente
// discutir o formato antes de construir o backend.
//
// O ARRANJO:
//
//   ┌──────────── instância conectada ────────────┐
//   ├─ caixa ─┬─ conversa ─┬─ detalhe ─┬ hoje ▸ ──┤
//
// UM PAINEL SÓ, NÃO QUATRO CARTÕES. As colunas dividem borda em vez de flutuar
// separadas com respiro entre elas: cartão solto pede margem, sombra e canto
// arredondado em cada um, e o olho passa a ler quatro objetos em vez de uma
// bancada. Aqui a divisão é uma linha de 1px, e a bancada ocupa a janela.
//
// A quarta coluna existe porque tudo que descreve o LEAD (etapa, espera, banco,
// descontos, perfil, anotação) estava espremido embaixo do campo de digitar —
// lugar de quem escreve, não de quem consulta. Separado, o meio fica só com a
// conversa e a leitura de cada coisa acontece onde ela é procurada.
//
// A coluna de missões recolhe: em tela apertada ela vira uma faixa fina com o
// placar, e volta inteira com um clique. A fila em si (ordem de culpa, pontos,
// sequência) mora em src/lib/missoes.ts, testada.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MessageCircle, Search, Send, AlertTriangle, Check, Phone, FileText,
  Flame, Trophy, ChevronRight, Landmark, BadgeCheck, Sparkles, Inbox,
  PanelRightClose, PanelRightOpen, Wifi, RefreshCw, StickyNote, Clock,
} from "lucide-react";
import {
  LEADS, MISSOES, ESTAGIOS, ORIGENS, SEQUENCIA_DIAS, PLACAR_MES, FUNIL_MES,
  INSTANCIAS, type Lead, type Origem, type Estagio, type Mensagem, type Instancia,
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
  const [instanciaId, setInstanciaId] = useState(INSTANCIAS[0].id);
  const [origem, setOrigem] = useState<"todos" | Origem>("todos");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string>(LEADS[0].id);
  const [missoes, setMissoes] = useState<Missao[]>(MISSOES);
  const [rascunho, setRascunho] = useState("");
  const [enviadas, setEnviadas] = useState<Record<string, Mensagem[]>>({});
  const [estagios, setEstagios] = useState<Record<string, Estagio>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [tarefasAbertas, setTarefasAbertas] = useState(true);

  const instancia = INSTANCIAS.find((i) => i.id === instanciaId) ?? INSTANCIAS[0];
  const estagioDe = (l: Lead): Estagio => estagios[l.id] ?? l.estagio;

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return LEADS
      .filter((l) => origem === "todos" || l.origem === origem)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo))
      .sort((a, b) => {
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
    setMissoes((prev) =>
      prev.map((m) => (m.leadId === lead.id && m.tipo === "sem_resposta" ? { ...m, feita: true } : m)));
  };

  /* A bancada cancela o respiro que o layout dá a todas as páginas e reaplica
     um menor: numa tela de trabalho, margem larga em volta é espaço que sai da
     conversa. Header do app tem 3,5rem; com py-3 aqui a conta fecha em 5rem. */
  return (
    <div className="flex flex-col gap-2 -mx-3 -my-3 sm:-mx-6 sm:-my-6 px-3 py-3 sm:px-4
                    h-[calc(100dvh-5rem)] min-h-[40rem]">

      {/* ── título e abas ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-2xl font-medium leading-none">Atendimento</h1>
          <span className="rounded-full px-2 py-[3px] text-[9.5px] uppercase tracking-[0.12em] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25">
            maquete
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
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <PainelFunil emRisco={emRiscoAbertas} />
        </div>
      ) : (
        <>
          <CardInstancia
            instancia={instancia}
            todas={INSTANCIAS}
            onTrocar={setInstanciaId}
          />

          {/* ── a bancada: quatro painéis, perto mas cada um o seu ──
              Colar tudo numa caixa só apagava a divisão de trabalho: a caixa,
              a conversa, o cliente e o dia são quatro coisas diferentes. Um gap
              curto mantém cada uma como objeto próprio sem espalhar a tela. */}
          <div className="flex-1 min-h-0 flex gap-2">

            {/* ═══ caixa ═══ */}
            <div className="w-[15.5rem] shrink-0 flex flex-col min-h-0 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div className="px-2.5 pt-2.5 pb-2 flex flex-col gap-2 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12.5px] font-semibold flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-emerald-400" /> Caixa
                  </h2>
                  <span className="text-[10.5px] text-muted-foreground tabular-nums">{lista.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CHIPS_ORIGEM.map((c) => (
                    <button key={c.chave} onClick={() => setOrigem(c.chave)}
                      className={cn("rounded-full px-2 py-[2px] text-[10px] transition-colors ring-1",
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
                    placeholder="nome ou telefone" className="h-7 pl-7 text-[12px]" />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {lista.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">Nenhuma conversa aqui.</p>
                ) : lista.map((l) => {
                  const semResposta = l.ultimaFoi === "lead";
                  const ativo = l.id === lead.id;
                  return (
                    <button key={l.id} onClick={() => setSelecionadoId(l.id)}
                      className={cn("w-full text-left px-2.5 py-2 border-b border-white/[0.04] transition-colors flex gap-2 relative",
                        ativo ? "bg-white/[0.07]" : "hover:bg-white/[0.03]")}>
                      {ativo && <span className="absolute left-0 inset-y-0 w-[2px] bg-emerald-400" />}
                      <span className={cn("h-7 w-7 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold ring-1",
                        semResposta ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                                    : "bg-white/[0.05] text-muted-foreground ring-white/10")}>
                        {iniciais(l.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[12px] font-medium truncate flex-1">{l.nome}</span>
                          <span className="text-[9.5px] text-muted-foreground shrink-0">{l.ultimaHora}</span>
                        </span>
                        <span className="block text-[10.5px] text-muted-foreground truncate mt-0.5">
                          {semResposta && <AlertTriangle className="inline h-3 w-3 text-amber-300 mr-1 -mt-px" />}
                          {(l.conversa[l.conversa.length - 1]?.texto ?? "").slice(0, 40)}
                        </span>
                        <span className="flex items-center gap-1 mt-1">
                          <span className="rounded px-1.5 py-[1px] text-[9px] bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
                            {ESTAGIOS.find((e) => e.chave === estagioDe(l))?.rotulo}
                          </span>
                          <span className="text-[9px] text-muted-foreground/70">{ORIGENS[l.origem].curto}</span>
                          {l.naoLidas > 0 && (
                            <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-emerald-400 text-[9px] font-semibold text-emerald-950 grid place-items-center">
                              {l.naoLidas}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ conversa — só a conversa ═══ */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center gap-2.5 shrink-0">
                <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold bg-white/[0.05] ring-1 ring-white/10">
                  {iniciais(lead.nome)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{lead.nome}</p>
                  <p className="text-[10.5px] text-muted-foreground truncate">{lead.telefone}</p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-2">
                {conversa.map((msg, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    {msg.dia && (
                      <div className="self-center rounded-full px-2.5 py-[2px] text-[10px] text-muted-foreground bg-white/[0.04] ring-1 ring-white/[0.06] my-1">
                        {msg.dia}
                      </div>
                    )}
                    <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug",
                      msg.de === "lead"
                        ? "self-start bg-white/[0.05] rounded-tl-sm"
                        : "self-end bg-emerald-400/12 rounded-tr-sm ring-1 ring-emerald-400/15")}>
                      {msg.texto}
                      <span className="block text-[9.5px] text-muted-foreground/70 mt-1 text-right tabular-nums">{msg.hora}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-3 py-2.5 border-t border-white/[0.06] flex items-center gap-2 shrink-0">
                <Input value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder={`Responder ${lead.nome.split(" ")[0]}…`} className="h-9 text-[12.5px]" />
                <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={enviar} disabled={!rascunho.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ═══ detalhe do cliente ═══ */}
            <div className="hidden xl:flex w-[16.5rem] shrink-0 flex-col min-h-0 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
                <h2 className="text-[12.5px] font-semibold">Detalhe do cliente</h2>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {/* situação */}
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex flex-col gap-1.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">Situação</p>
                  <div className="flex items-center gap-1.5 text-[11.5px]">
                    <span className="text-muted-foreground">{ORIGENS[lead.origem].rotulo}</span>
                  </div>
                  {lead.ultimaFoi === "lead" ? (
                    <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      sem resposta há {lead.horasSemResposta}h
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.07]">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      a bola está com ele
                    </span>
                  )}
                </div>

                {/* etapa */}
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex flex-col gap-1">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-0.5">Etapa</p>
                  {ESTAGIOS.map((e, i) => {
                    const atualIdx = ESTAGIOS.findIndex((x) => x.chave === estagioDe(lead));
                    const atual = i === atualIdx;
                    const passou = i < atualIdx;
                    return (
                      <button key={e.chave} title={e.descricao}
                        onClick={() => setEstagios((p) => ({ ...p, [lead.id]: e.chave }))}
                        className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px] text-left transition-colors",
                          atual ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25"
                                : "hover:bg-white/[0.04] text-muted-foreground")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0",
                          atual ? "bg-emerald-400" : passou ? "bg-emerald-400/45" : "bg-white/15")} />
                        {e.rotulo}
                      </button>
                    );
                  })}
                </div>

                {/* dossiê */}
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex flex-col gap-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">Dossiê</p>
                  <Campo icone={<Landmark className="h-3 w-3" />} rotulo="Banco" valor={lead.dossie.banco} />
                  <Campo rotulo="Descontos"
                    valor={lead.dossie.descontos.length ? lead.dossie.descontos.join(", ") : null} />
                  <Campo rotulo="Perfil"
                    valor={lead.dossie.inss === null ? null
                      : `${lead.dossie.inss ? "INSS" : "não é INSS"}${lead.dossie.consignado ? ` · ${lead.dossie.consignado}` : ""}`} />
                </div>

                {/* anotações */}
                <div className="px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> Anotações
                  </p>
                  <Textarea
                    value={notas[lead.id] ?? lead.dossie.obs ?? ""}
                    onChange={(e) => setNotas((p) => ({ ...p, [lead.id]: e.target.value }))}
                    rows={5}
                    placeholder="O que ficou combinado, o que ela contou, o que conferir depois…"
                    className="text-[11.5px] resize-none" />
                </div>
              </div>

              <div className="p-2 border-t border-white/[0.06] flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px]">
                  <Phone className="h-3.5 w-3.5 mr-1" /> Ligar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px]">
                  <FileText className="h-3.5 w-3.5 mr-1" /> Extrato
                </Button>
              </div>
            </div>

            {/* ═══ missões — retrátil ═══ */}
            <div className={cn("shrink-0 flex flex-col min-h-0 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden transition-[width] duration-200",
              tarefasAbertas ? "w-[15.5rem]" : "w-[2.75rem]")}>
              {tarefasAbertas ? (
                <>
                  <div className="px-3 pt-2.5 pb-2.5 border-b border-white/[0.06] flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[12.5px] font-semibold">Hoje</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] text-muted-foreground tabular-nums">
                          {prog.feitas}/{prog.total}
                        </span>
                        <button onClick={() => setTarefasAbertas(false)} title="Recolher"
                          className="text-muted-foreground hover:text-foreground">
                          <PanelRightClose className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", prog.zerado ? "bg-emerald-400" : "bg-emerald-400/70")}
                        initial={false} animate={{ width: `${prog.pct}%` }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />
                    </div>

                    <div className="flex items-center gap-3 text-[10.5px]">
                      <span className="flex items-center gap-1 text-amber-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="tabular-nums font-semibold">{prog.pontos}</span>
                        <span className="text-muted-foreground">/ {prog.pontosPossiveis}</span>
                      </span>
                      <span className="flex items-center gap-1 ml-auto"
                        title={`${SEQUENCIA_DIAS} dias sem deixar ninguém sem resposta`}>
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                        <span className="tabular-nums font-semibold">{SEQUENCIA_DIAS}</span>
                        <span className="text-muted-foreground">dias</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {patente.rotulo}
                      {patente.faltam !== null && ` · faltam ${patente.faltam} pra ${patente.proxima}`}
                    </p>

                    <AnimatePresence>
                      {prog.zerado && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[10.5px] text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/25 rounded-md px-2 py-1">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                          Ninguém está esperando resposta.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1.5 flex flex-col gap-1.5">
                    {fila.map((m) => {
                      const risco = emRisco(m) && !m.feita;
                      return (
                        <div key={m.id}
                          className={cn("rounded-lg border px-2 py-1.5 transition-colors",
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
                              <p className={cn("text-[11.5px] font-medium leading-tight flex items-center gap-1",
                                m.feita && "line-through")}>
                                {risco && <AlertTriangle className="h-3 w-3 text-amber-300 shrink-0" />}
                                {ROTULO_MISSAO[m.tipo]}
                              </p>
                              <p className="text-[10.5px] text-muted-foreground truncate">{m.lead}</p>
                              <p className="text-[9.5px] text-muted-foreground/70 truncate">{m.detalhe}</p>
                            </button>
                            <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0 mt-[2px]">
                              +{PONTOS[m.tipo]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Recolhida: uma faixa que ainda cobra. Sumir de vez faria a
                   coluna virar gaveta que ninguém reabre. */
                <button onClick={() => setTarefasAbertas(true)} title="Abrir missões do dia"
                  className="flex-1 flex flex-col items-center gap-3 py-3 hover:bg-white/[0.03] transition-colors">
                  <PanelRightOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  {emRiscoAbertas > 0 && (
                    <span className="h-5 w-5 rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30 grid place-items-center text-[10px] font-semibold tabular-nums">
                      {emRiscoAbertas}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {prog.feitas}/{prog.total}
                  </span>
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    Hoje
                  </span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── um campo do dossiê: valor vazio DIZ que está vazio ───────────────────
   "não perguntado" é informação; espaço em branco é só espaço em branco, e a
   atendente não consegue distinguir o que ninguém perguntou do que a pessoa
   não soube responder. */
function Campo({ rotulo, valor, icone }: { rotulo: string; valor: string | null; icone?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] text-muted-foreground/70 flex items-center gap-1">{icone}{rotulo}</span>
      <span className={cn("text-[11.5px] break-words", valor ? "" : "text-muted-foreground/45 italic")}>
        {valor ?? "não perguntado"}
      </span>
    </div>
  );
}

/* ── o card da instância ──────────────────────────────────────────────────
   Antes de qualquer conversa, a pergunta é "qual número está falando". Quando
   a Evolution cai, tudo abaixo deste card fica mentindo — por isso o estado da
   conexão mora no topo, e não escondido num menu de configuração. */
function CardInstancia({ instancia, todas, onTrocar }: {
  instancia: Instancia; todas: Instancia[]; onTrocar: (id: string) => void;
}) {
  const on = instancia.status === "conectado";
  return (
    <div className="shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 flex items-center gap-3">
      {/* a foto do perfil abre a linha: é a cara do número que está falando */}
      <div className="relative shrink-0">
        <div className={cn("h-11 w-11 rounded-full grid place-items-center text-[13px] font-semibold ring-2",
          on ? "bg-emerald-400/12 text-emerald-300 ring-emerald-400/30" : "bg-white/[0.05] text-muted-foreground ring-white/10")}>
          {instancia.avatar}
        </div>
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background",
          on ? "bg-emerald-400" : "bg-rose-400")} />
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0",
            on ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60" : "bg-rose-400")} />
          <span className="text-[13px] font-semibold truncate">{instancia.nome}</span>
          <span className={cn("rounded-full px-1.5 py-[1px] text-[9.5px] ring-1 shrink-0",
            on ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25"
               : "bg-rose-400/10 text-rose-300 ring-rose-400/25")}>
            {on ? "conectado" : "desconectado"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground">
          <span className="tabular-nums">{instancia.telefone}</span>
          <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />{instancia.gateway}</span>
          <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" />sincronizado {instancia.sincronizadoEm}</span>
          <span className="tabular-nums">{instancia.conversas} conversas</span>
          <span className="tabular-nums text-emerald-300">{instancia.naoLidas} não lidas</span>
        </div>
      </div>

      {/* troca de instância: são dois números, e a atendente fala pelos dois */}
      <div className="hidden sm:flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5 shrink-0">
        {todas.map((i) => (
          <button key={i.id} onClick={() => onTrocar(i.id)}
            className={cn("rounded-md px-2.5 py-1 text-[11px] transition-colors",
              i.id === instancia.id ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {i.curto}
          </button>
        ))}
      </div>

    </div>
  );
}

/* ─────────────────────────── a aba do gestor ─────────────────────────── */
function PainelFunil({ emRisco }: { emRisco: number }) {
  const topo = FUNIL_MES[0].n;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 flex flex-col gap-3">
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
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Em risco agora</p>
          <p className={cn("text-3xl font-semibold tabular-nums", emRisco > 0 ? "text-amber-300" : "text-emerald-400")}>
            {emRisco}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            pessoas esperando resposta ou sem próximo passo definido
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 flex flex-col gap-2.5">
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
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
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
        </div>
      </div>
    </div>
  );
}
