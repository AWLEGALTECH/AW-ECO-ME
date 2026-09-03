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
// cadência de follow-up) mora em src/lib/tasksAtendimento.ts, testada.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MessageCircle, Search, Send, AlertTriangle, Check,
  Flame, Trophy, ChevronRight, Landmark, BadgeCheck, Sparkles, Inbox,
  PanelRightClose, PanelRightOpen, Wifi, RefreshCw, StickyNote,
  ListChecks, CalendarDays, Repeat, BellRing, ChevronLeft, CheckCircle2,
  ArrowLeftRight, ChevronsUpDown, Plus, ArrowRight, X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LEADS, LEMBRETES, ESTAGIOS, ORIGENS, PLACAR_MES, FUNIL_MES,
  INSTANCIAS, type Lead, type Origem, type Estagio, type Mensagem, type Instancia,
} from "@/lib/atendimentoMock";
import {
  followUpsDoDia, ordenarTasks, progressoTasks, proximaCobranca, ROTULO_TIPO,
  CADENCIA, type Task, type TipoTask,
} from "@/lib/tasksAtendimento";
import {
  useConversas, useMensagens, conversaParaLead, marcarLida, enviarWhatsapp, useInvalidarWa,
} from "@/hooks/useWhatsapp";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/* O "hoje" da maquete é fixo pra ela não mudar de comportamento amanhã e a
   gente perder a referência do que discutiu. Vira hojeISO() quando for real. */
const HOJE = "2026-09-02";

const somaDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const diasEntre = (de: string, ate: string) => {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86400000);
};
const fmtDiaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtDiaLongo = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

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
  const [lembretes, setLembretes] = useState<Task[]>(LEMBRETES);
  const [dia, setDia] = useState(HOJE);
  const [tipoTask, setTipoTask] = useState<"todas" | TipoTask>("todas");
  const [feitasFollowUp, setFeitasFollowUp] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [enviadas, setEnviadas] = useState<Record<string, Mensagem[]>>({});
  const [estagios, setEstagios] = useState<Record<string, Estagio>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [puladas, setPuladas] = useState<Record<string, Estagio[]>>({});
  const [origemDossie, setOrigemDossie] = useState<Record<string, "marketing" | "planilha" | "outros">>({});
  const [tarefasAbertas, setTarefasAbertas] = useState(true);

  const instancia = INSTANCIAS.find((i) => i.id === instanciaId) ?? INSTANCIAS[0];
  const { user } = useAuth();
  const invalidarWa = useInvalidarWa();

  /* ── A FONTE DOS DADOS ──
     Se a Evolution já está entregando, a tela usa o banco; enquanto não está,
     usa a maquete. Não é gambiarra: é o mesmo formato dos dois lados (a
     conversão mora em useWhatsapp.ts), e evita a tela vazia de "nenhuma
     conversa" enquanto o número não foi conectado. O selo do cabeçalho diz em
     qual dos dois modos ela está. */
  const { data: conversas = [] } = useConversas(instancia.nome);
  const aoVivo = conversas.length > 0;
  const { data: msgsDaAberta = [] } = useMensagens(aoVivo ? selecionadoId : null);

  const leadsBase: Lead[] = aoVivo
    ? conversas.map((c) => conversaParaLead(c, c.id === selecionadoId ? msgsDaAberta : []))
    : LEADS;
  const estagioDe = (l: Lead): Estagio => estagios[l.id] ?? l.estagio;
  const abrir = (id: string) => {
    setSelecionadoId(id);
    if (aoVivo) marcarLida(id).then(invalidarWa).catch(() => {});
  };
  const puladasDe = (l: Lead): Estagio[] => puladas[l.id] ?? [];
  /* A origem do dossiê é a do MARKETING (de que campanha veio), não o número
     que atendeu — este já está no card da instância. Nasce sugerida pelo canal
     de entrada e a atendente corrige quando souber. */
  const origemDossieDe = (l: Lead): "marketing" | "planilha" | "outros" =>
    origemDossie[l.id] ?? (l.origem === "planilha" ? "planilha" : l.origem === "pda" ? "marketing" : "outros");

  /* Avançar etapa, com a mesma regra da linha do tempo do processo: o que fica
     entre a atual e o destino vira PULADA — não some, e não vira concluída. */
  const avancarEtapa = (l: Lead, alvo: Estagio) => {
    const i = ESTAGIOS.findIndex((e) => e.chave === estagioDe(l));
    const j = ESTAGIOS.findIndex((e) => e.chave === alvo);
    if (j <= i) return;
    setEstagios((p) => ({ ...p, [l.id]: alvo }));
    setPuladas((p) => ({
      ...p,
      [l.id]: [...(p[l.id] ?? []), ...ESTAGIOS.slice(i + 1, j).map((e) => e.chave)],
    }));
  };

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leadsBase
      .filter((l) => origem === "todos" || l.origem === origem)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo))
      .sort((a, b) => {
        const ra = a.ultimaFoi === "lead" ? 0 : 1;
        const rb = b.ultimaFoi === "lead" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return b.horasSemResposta - a.horasSemResposta;
      });
  }, [origem, busca, leadsBase]);

  const lead = leadsBase.find((l) => l.id === selecionadoId) ?? lista[0] ?? leadsBase[0];
  const conversa = [...lead.conversa, ...(enviadas[lead.id] ?? [])];

  /* AS TASKS DO DIA ESCOLHIDO.
     Lembrete é dado: tem data própria. Follow-up é conta: a cadência lê o tempo
     parado do lead NAQUELE dia — por isso andar no calendário mostra quem vai
     precisar de cobrança amanhã, não só quem precisa hoje. */
  const tasksDoDia = useMemo(() => {
    const offset = diasEntre(HOJE, dia);
    const parados = leadsBase.map((l) => ({
      id: l.id,
      nome: l.nome,
      diasParado: l.diasParado + offset,
      followUpsFeitos: l.followUpsFeitos,
      ativo: l.estagio !== "fechado",
    }));
    const fu = followUpsDoDia(parados, dia)
      .map((t) => ({ ...t, feita: feitasFollowUp.includes(t.id) }));
    const lb = lembretes.filter((t) => t.data === dia);
    return ordenarTasks([...fu, ...lb]);
  }, [dia, lembretes, feitasFollowUp, leadsBase]);

  const tasksVisiveis = tasksDoDia.filter((t) => tipoTask === "todas" || t.tipo === tipoTask);
  const tasksDoLead = tasksDoDia.filter((t) => t.leadId === lead.id);
  const prog = progressoTasks(tasksDoDia);
  const abertasHoje = tasksDoDia.filter((t) => !t.feita).length;

  /* Dias com task, pro calendário marcar. O follow-up é recalculado dia a dia
     porque o tempo parado anda junto com a data. */
  const diasComTask = useMemo(() => {
    const set = new Set(lembretes.map((t) => t.data));
    for (let i = -7; i <= 21; i++) {
      const d = somaDias(HOJE, i);
      const parados = leadsBase.map((l) => ({
        id: l.id, nome: l.nome, diasParado: l.diasParado + i,
        followUpsFeitos: l.followUpsFeitos, ativo: l.estagio !== "fechado",
      }));
      if (followUpsDoDia(parados, d).length > 0) set.add(d);
    }
    return set;
  }, [lembretes, leadsBase]);

  const concluir = (id: string) => {
    if (id.startsWith("fu-")) {
      setFeitasFollowUp((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
      return;
    }
    setLembretes((prev) => prev.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t)));
  };

  const novoLembrete = () => {
    const titulo = window.prompt(`Lembrete sobre ${lead.nome}:`);
    if (!titulo?.trim()) return;
    setLembretes((p) => [...p, {
      id: `lb-${Date.now()}`, tipo: "lembrete", leadId: lead.id, lead: lead.nome,
      titulo: titulo.trim(), detalhe: "marcado agora", data: dia, feita: false,
    }]);
  };

  const enviar = async () => {
    const texto = rascunho.trim();
    if (!texto) return;
    if (aoVivo) {
      try {
        await enviarWhatsapp({ conversaId: lead.id, telefone: lead.telefone, texto, enviadoPor: user?.id ?? null });
        setRascunho("");
        invalidarWa();
      } catch (e) {
        // a mensagem NÃO é gravada quando a Evolution recusa: ver useWhatsapp.ts
        toast.error("Não consegui enviar: " + (e as Error).message);
      }
      return;
    }
    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setEnviadas((prev) => ({
      ...prev,
      [lead.id]: [...(prev[lead.id] ?? []), { de: "nos", texto, hora: agora }],
    }));
    setRascunho("");
    // responder resolve o follow-up daquele lead no dia — é a cobrança
    setFeitasFollowUp((p) => {
      const ids = tasksDoDia.filter((t) => t.tipo === "follow_up" && t.leadId === lead.id).map((t) => t.id);
      return [...new Set([...p, ...ids])];
    });
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
          {/* O selo diz de onde vêm os dados. Enquanto for maquete, quem abrir
              a tela sem contexto precisa saber que aquelas pessoas não existem. */}
          {aoVivo ? (
            <span className="flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[9.5px] uppercase tracking-[0.12em] bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ao vivo
            </span>
          ) : (
            <span className="rounded-full px-2 py-[3px] text-[9.5px] uppercase tracking-[0.12em] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25">
              maquete
            </span>
          )}
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
          <PainelFunil emRisco={abertasHoje} />
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
            <SpotlightCard sutil className="w-[15.5rem] shrink-0 flex flex-col min-h-0 p-0 overflow-hidden">
              <div className="px-2.5 pt-2.5 pb-2 flex flex-col gap-2 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12.5px] font-semibold flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" /> Caixa
                  </h2>
                  <span className="text-[10.5px] text-muted-foreground tabular-nums">{lista.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CHIPS_ORIGEM.map((c) => (
                    <button key={c.chave} onClick={() => setOrigem(c.chave)}
                      className={cn("rounded-full px-2 py-[2px] text-[10px] transition-colors ring-1",
                        origem === c.chave
                          ? "bg-white/[0.10] text-foreground ring-white/20"
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
                    <button key={l.id} onClick={() => abrir(l.id)}
                      className={cn("w-full text-left px-2.5 py-2 border-b border-white/[0.04] transition-colors flex gap-2 relative",
                        ativo ? "bg-white/[0.07]" : "hover:bg-white/[0.03]")}>
                      {ativo && <span className="absolute left-0 inset-y-0 w-[2px] bg-foreground/40" />}
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
                            <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-foreground/85 text-[9px] font-semibold text-background grid place-items-center">
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

            {/* ═══ conversa — só a conversa ═══ */}
            {/* Três profundidades de propósito: a caixa e as tasks no nível base, a
                conversa REBAIXADA (é a mesa onde os balões pousam, e escurecer o
                fundo faz eles existirem), o detalhe do cliente OPACO — superfície
                sólida, sem vidro, porque é ficha que se lê — e as tasks no vidro
                mais leve da bancada, que é a lista que muda o dia todo. Sem isso
                os quatro painéis eram a mesma superfície repetida e o olho não
                sabia onde estava. */}
            <SpotlightCard sutil className="flex-1 min-w-0 flex flex-col min-h-0 p-0 overflow-hidden bg-black/25">
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center gap-2.5 shrink-0">
                <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold bg-white/[0.05] ring-1 ring-white/10">
                  {iniciais(lead.nome)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{lead.nome}</p>
                  <p className="text-[10.5px] text-muted-foreground truncate">{lead.telefone}</p>
                </div>
              </div>

              {/* AS TASKS DO LEAD, ANTES DAS MENSAGENS.
                  Elas já existem na coluna da direita e dentro da etapa, mas
                  quem está conversando não olha pros lados — olha pra conversa.
                  A faixa põe o que ficou combinado com ESTA pessoa no caminho
                  do olho, logo abaixo do nome dela, e some quando não há nada. */}
              {tasksDoLead.length > 0 && (
                <div className="px-3 py-2 border-b border-white/[0.06] shrink-0 flex gap-2 overflow-x-auto scrollbar-thin">
                  {tasksDoLead.map((t) => {
                    const Ico = t.tipo === "follow_up" ? Repeat : BellRing;
                    return (
                      <div key={t.id}
                        className={cn("shrink-0 w-[13.5rem] rounded-xl border px-2.5 py-2 flex items-start gap-2",
                          t.feita ? "border-white/[0.05] bg-white/[0.015] opacity-60"
                                  : "border-white/[0.07] bg-white/[0.03]")}>
                        <span className="h-6 w-6 rounded-lg bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
                          <Ico className="h-3 w-3 text-primary" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground/70">
                            {ROTULO_TIPO[t.tipo]}
                          </span>
                          <span className={cn("block text-[11.5px] font-medium leading-tight truncate",
                            t.feita && "line-through")}>{t.titulo}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{t.detalhe}</span>
                        </span>
                        <button onClick={() => concluir(t.id)}
                          title={t.feita ? "Reabrir" : "Concluir"}
                          className={cn("shrink-0 transition-colors",
                            t.feita ? "text-emerald-400" : "text-muted-foreground/35 hover:text-emerald-400/70")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

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
                        : "self-end bg-white/[0.08] rounded-tr-sm ring-1 ring-white/[0.10]")}>
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
            </SpotlightCard>

            {/* ═══ detalhe do cliente ═══
                A coluna serve pra DEFINIR ETAPA. O dossiê vem antes porque é a
                referência que se consulta pra decidir a etapa; a jornada vem
                logo abaixo, no mesmo desenho e com as mesmas animações da linha
                do tempo dos processos — inclusive a lógica de abrir a etapa
                corrente, inserir task ali dentro e avançar. */}
            <SpotlightCard sutil className="hidden xl:flex w-[17rem] shrink-0 flex-col min-h-0 p-0 overflow-hidden bg-card backdrop-blur-none">
              <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
                <h2 className="text-[12.5px] font-semibold">Detalhe do cliente</h2>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {/* dossiê */}
                <div className="px-3 py-2.5 border-b border-white/[0.06] flex flex-col gap-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">Dossiê</p>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9.5px] text-muted-foreground/70">Origem</span>
                    <div className="flex gap-1">
                      {(["marketing", "planilha", "outros"] as const).map((o) => (
                        <button key={o}
                          onClick={() => setOrigemDossie((p) => ({ ...p, [lead.id]: o }))}
                          className={cn("rounded-full px-2 py-[2px] text-[10px] capitalize transition-colors ring-1",
                            origemDossieDe(lead) === o
                              ? "bg-white/[0.10] text-foreground ring-white/20"
                              : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground")}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Chegou em"
                    valor={`${fmtDiaLongo(lead.chegouEm)} · há ${diasEntre(lead.chegouEm, HOJE)} dia${diasEntre(lead.chegouEm, HOJE) === 1 ? "" : "s"}`} />
                  <Campo icone={<Landmark className="h-3 w-3" />} rotulo="Banco" valor={lead.dossie.banco} />
                  <Campo rotulo="Descontos"
                    valor={lead.dossie.descontos.length ? lead.dossie.descontos.join(", ") : null} />
                  <Campo rotulo="Perfil"
                    valor={lead.dossie.inss === null ? null
                      : `${lead.dossie.inss ? "INSS" : "não é INSS"}${lead.dossie.consignado ? ` · ${lead.dossie.consignado}` : ""}`} />
                </div>

                {/* jornada */}
                <div className="px-3 py-3 border-b border-white/[0.06]">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-2.5">Jornada</p>
                  <JornadaLead
                    atual={estagioDe(lead)}
                    puladas={puladasDe(lead)}
                    tasksDoLead={tasksDoLead}
                    onAvancar={(alvo) => avancarEtapa(lead, alvo)}
                    onNovaTask={novoLembrete}
                    onConcluirTask={concluir}
                  />
                </div>

                {/* anotações */}
                <div className="px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> Anotações
                  </p>
                  <Textarea
                    value={notas[lead.id] ?? lead.dossie.obs ?? ""}
                    onChange={(e) => setNotas((p) => ({ ...p, [lead.id]: e.target.value }))}
                    rows={4}
                    placeholder="O que ficou combinado, o que ela contou, o que conferir depois…"
                    className="text-[11.5px] resize-none" />
                </div>
              </div>
            </SpotlightCard>

            {/* ═══ Tasks — retrátil ═══
                Mesmo desenho da tela de Tarefas do jurídico: o quadradinho do
                ícone, título, subtítulo e chip do tipo. Lá os tipos são ação
                (raio) e monitoramento (olho); aqui são follow-up (o ciclo que
                volta sozinho) e lembrete (o sino que alguém marcou). */}
            <SpotlightCard sutil className={cn("shrink-0 flex flex-col min-h-0 p-0 overflow-hidden bg-white/[0.045] transition-[width] duration-200",
              tarefasAbertas ? "w-[16rem]" : "w-[2.75rem]")}>
              {tarefasAbertas ? (
                <>
                  <div className="px-3 pt-2.5 pb-2.5 border-b border-white/[0.06] flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[12.5px] font-semibold flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" /> Tasks
                      </h2>
                      <div className="flex items-center gap-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button title="Escolher o dia"
                              className={cn("flex items-center gap-1 rounded px-1.5 py-[2px] text-[10.5px] transition-colors",
                                dia === HOJE ? "text-muted-foreground hover:text-foreground"
                                             : "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/25")}>
                              <CalendarDays className="h-3.5 w-3.5" />
                              {dia === HOJE ? "Hoje" : fmtDiaCurto(dia)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-auto p-2">
                            <CalendarioTasks dia={dia} onEscolher={setDia} comTask={diasComTask} />
                          </PopoverContent>
                        </Popover>
                        <button onClick={() => setTarefasAbertas(false)} title="Recolher"
                          className="text-muted-foreground hover:text-foreground">
                          <PanelRightClose className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* barra de CONCLUSÃO do dia — quanto da lista saiu */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          className={cn("h-full rounded-full", prog.concluido ? "bg-emerald-400" : "bg-foreground/45")}
                          initial={false} animate={{ width: `${prog.pct}%` }}
                          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />
                      </div>
                      <span className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
                        {prog.feitas}/{prog.total}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      {([["todas", "Todas"], ["follow_up", "Follow-up"], ["lembrete", "Lembretes"]] as const).map(([k, rot]) => (
                        <button key={k} onClick={() => setTipoTask(k)}
                          className={cn("rounded-full px-2 py-[2px] text-[10px] transition-colors ring-1",
                            tipoTask === k
                              ? "bg-white/[0.10] text-foreground ring-white/20"
                              : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground")}>
                          {rot}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence>
                      {prog.concluido && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[10.5px] text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/25 rounded-md px-2 py-1">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                          Dia fechado.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1.5 flex flex-col gap-1.5">
                    {tasksVisiveis.length === 0 ? (
                      <p className="text-[11.5px] text-muted-foreground text-center py-6">
                        Nada pra {dia === HOJE ? "hoje" : "este dia"}.
                      </p>
                    ) : tasksVisiveis.map((t) => {
                      const Icone = t.tipo === "follow_up" ? Repeat : BellRing;
                      const fu = t.tipo === "follow_up";
                      return (
                        <div key={t.id}
                          className={cn(
                            "flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5",
                            "transition-colors hover:border-primary/40 hover:bg-white/[0.05]",
                            t.feita && "opacity-70",
                          )}>
                          {/* MESMA CABEÇA DO CARD DO JURÍDICO: o quadradinho do
                              ícone à esquerda e o estado à direita. Lá o desfecho
                              é um check que aparece quando concluiu; aqui ele
                              também É o botão que conclui — caixa de seleção não
                              existe em nenhum dos dois. */}
                          <div className="flex items-start justify-between gap-2">
                            <span className={cn("h-7 w-7 rounded-xl grid place-items-center shrink-0 ring-1",
                              fu ? "bg-primary/12 ring-primary/25 text-primary"
                                 : "bg-amber-400/10 ring-amber-400/25 text-amber-300")}>
                              <Icone className="h-3.5 w-3.5" />
                            </span>
                            <button onClick={() => concluir(t.id)}
                              title={t.feita ? "Reabrir" : "Concluir"}
                              className={cn("shrink-0 transition-colors",
                                t.feita ? "text-emerald-400"
                                        : "text-muted-foreground/35 hover:text-emerald-400/70")}>
                              <CheckCircle2 className="h-[18px] w-[18px]" />
                            </button>
                          </div>

                          <button onClick={() => abrir(t.leadId)} className="text-left">
                            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground mt-2">
                              {ROTULO_TIPO[t.tipo]}
                            </p>
                            <p className={cn("text-[12.5px] font-medium leading-tight mt-0.5 line-clamp-2",
                              t.feita && "line-through")}>
                              {t.titulo}
                            </p>
                            <p className="text-[10.5px] text-muted-foreground mt-0.5 line-clamp-2">{t.detalhe}</p>

                            <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1">
                              {t.feita ? (
                                <span className="inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[9.5px] font-medium ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3" /> Concluído
                                </span>
                              ) : (
                                <span className="inline-flex items-center self-start rounded-full px-2 py-0.5 text-[9.5px] font-medium ring-1 bg-white/[0.06] text-muted-foreground ring-white/[0.10]">
                                  {fu ? `${t.rodada}ª de ${CADENCIA.length}` : "Marcado por você"}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground truncate">{t.lead}</span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-2 border-t border-white/[0.06] shrink-0">
                    <Button size="sm" variant="outline" className="w-full h-8 text-[11px]" onClick={novoLembrete}>
                      <BellRing className="h-3.5 w-3.5 mr-1.5" /> Lembrar de {lead.nome.split(" ")[0]}
                    </Button>
                  </div>
                </>
              ) : (
                <button onClick={() => setTarefasAbertas(true)} title="Abrir as tasks do dia"
                  className="flex-1 flex flex-col items-center gap-3 py-3 hover:bg-white/[0.03] transition-colors">
                  <PanelRightOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  {abertasHoje > 0 && (
                    <span className="h-5 w-5 rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30 grid place-items-center text-[10px] font-semibold tabular-nums">
                      {abertasHoje}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {prog.feitas}/{prog.total}
                  </span>
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    Tasks
                  </span>
                </button>
              )}
            </SpotlightCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ── a jornada do lead ────────────────────────────────────────────────────
   Mesmo trilho da linha do tempo do processo, e de propósito: quem usa as duas
   telas não deveria ter que aprender duas gramáticas pra "onde isso está".
   Ponto cheio com check pra concluída, anel pulsando na atual, oco na pendente,
   e a partícula descendo pelo trecho vivo. Tudo na cor primária do tema — o
   verde de antes era uma cor a mais que não queria dizer nada.

   A ETAPA CORRENTE FICA ABERTA, como lá: é dentro dela que as tasks do lead
   aparecem e é dali que se insere uma nova. Avançar marca como PULADA o que
   ficou pelo caminho, em vez de fingir que foi concluído. */
function JornadaLead({ atual, puladas, tasksDoLead, onAvancar, onNovaTask, onConcluirTask }: {
  atual: Estagio;
  puladas: Estagio[];
  tasksDoLead: Task[];
  onAvancar: (alvo: Estagio) => void;
  onNovaTask: () => void;
  onConcluirTask: (id: string) => void;
}) {
  const iAtual = ESTAGIOS.findIndex((e) => e.chave === atual);
  const proxima = ESTAGIOS[iAtual + 1];

  return (
    <div>
      {ESTAGIOS.map((e, i) => {
        const last = i === ESTAGIOS.length - 1;
        const pulada = puladas.includes(e.chave);
        const concluida = i < iAtual && !pulada;
        const eAtual = i === iAtual;
        return (
          <div key={e.chave} className="grid grid-cols-[1.25rem_1fr] gap-x-2.5">
            {/* trilho */}
            <div className="relative flex justify-center">
              {!last && (
                eAtual ? (
                  <>
                    <div className="absolute top-4 bottom-0 w-px left-1/2 -translate-x-1/2 bg-primary/20" />
                    <div className="absolute top-4 bottom-0 w-1.5 left-1/2 -translate-x-1/2 overflow-hidden">
                      <span className="absolute inset-x-0 h-8 flow-down bg-gradient-to-b from-transparent via-primary/45 to-transparent" />
                    </div>
                  </>
                ) : (
                  <div className={cn("absolute top-4 bottom-0 w-px left-1/2 -translate-x-1/2",
                    concluida || pulada ? "bg-primary/50" : "bg-border")} />
                )
              )}
              {concluida ? (
                <span className="relative z-10 mt-0.5 h-3.5 w-3.5 rounded-full bg-primary grid place-items-center ring-4 ring-card">
                  <Check className="h-2 w-2 text-primary-foreground" strokeWidth={3} />
                </span>
              ) : eAtual ? (
                <span className="relative z-10 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-card ring-4 ring-card">
                  <span className="absolute -inset-px rounded-full border-2 border-primary animate-ping opacity-60" />
                </span>
              ) : pulada ? (
                <span title="Etapa pulada" className="relative z-10 mt-0.5 h-3.5 w-3.5 rounded-full bg-muted grid place-items-center ring-4 ring-card">
                  <X className="h-2 w-2 text-muted-foreground" strokeWidth={3} />
                </span>
              ) : (
                <span className="relative z-10 mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 bg-card ring-4 ring-card" />
              )}
            </div>

            {/* conteúdo */}
            <div className={cn(!last && "border-b border-border/40", last ? "pb-0.5" : "pb-3")}>
              <p className={cn("text-[12px] font-medium leading-tight",
                eAtual ? "text-foreground" : "text-muted-foreground",
                pulada && "line-through")}>
                {e.rotulo}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                {pulada ? "pulada" : eAtual ? e.descricao : concluida ? "concluída" : "—"}
              </p>

              {eAtual && (
                <motion.div className="mt-2 flex flex-col gap-1.5 overflow-hidden"
                  initial={false} animate={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                  {tasksDoLead.map((t) => {
                    const Ico = t.tipo === "follow_up" ? Repeat : BellRing;
                    return (
                      <div key={t.id}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                        <span className="h-5 w-5 rounded-md bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
                          <Ico className="h-3 w-3 text-primary" />
                        </span>
                        <span className={cn("text-[11px] font-medium truncate flex-1", t.feita && "line-through")}>
                          {t.titulo}
                        </span>
                        <button onClick={() => onConcluirTask(t.id)}
                          title={t.feita ? "Reabrir" : "Concluir"}
                          className={cn("shrink-0 transition-colors",
                            t.feita ? "text-primary" : "text-muted-foreground/35 hover:text-primary/70")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  <button onClick={onNovaTask}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/[0.04] py-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Adicionar task
                  </button>

                  {proxima && (
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] mt-0.5"
                      onClick={() => onAvancar(proxima.chave)}>
                      <ArrowRight className="h-3.5 w-3.5" /> Avançar etapa
                    </Button>
                  )}
                </motion.div>
              )}

              {/* Pular direto pra uma etapa lá na frente, como no processo: o
                  que fica no meio vira pulada. */}
              {!eAtual && i > iAtual && (
                <button onClick={() => onAvancar(e.chave)}
                  className="mt-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                  pular pra cá
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── o calendário das tasks ───────────────────────────────────────────────
   Grade do mês com bolinha nos dias que têm task. O follow-up é recalculado por
   dia, então andar pra frente mostra quem VAI precisar de cobrança — o que é
   metade da graça de ter cadência. */
function CalendarioTasks({ dia, onEscolher, comTask }: {
  dia: string; onEscolher: (d: string) => void; comTask: Set<string>;
}) {
  const [a, m] = dia.split("-").map(Number);
  const [mesVisto, setMesVisto] = useState({ ano: a, mes: m - 1 });
  const primeiro = new Date(mesVisto.ano, mesVisto.mes, 1);
  const inicio = new Date(mesVisto.ano, mesVisto.mes, 1 - primeiro.getDay());
  const dias: Date[] = [];
  for (let i = 0; i < 42; i++) dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const nomeMes = new Date(mesVisto.ano, mesVisto.mes, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="w-[15rem]">
      <div className="flex items-center justify-between mb-1.5">
        <button className="text-muted-foreground hover:text-foreground"
          onClick={() => setMesVisto((v) => v.mes === 0 ? { ano: v.ano - 1, mes: 11 } : { ...v, mes: v.mes - 1 })}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11.5px] font-medium first-letter:uppercase">{nomeMes}</span>
        <button className="text-muted-foreground hover:text-foreground"
          onClick={() => setMesVisto((v) => v.mes === 11 ? { ano: v.ano + 1, mes: 0 } : { ...v, mes: v.mes + 1 })}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="text-[9px] text-muted-foreground/60 py-0.5">{d}</span>
        ))}
        {dias.map((d) => {
          const k = iso(d);
          const doMes = d.getMonth() === mesVisto.mes;
          const sel = k === dia;
          return (
            <button key={k} onClick={() => onEscolher(k)}
              className={cn("relative h-7 rounded text-[11px] tabular-nums transition-colors",
                sel ? "bg-white/[0.10] text-foreground ring-1 ring-white/25"
                    : doMes ? "hover:bg-white/[0.06]" : "text-muted-foreground/30",
                k === HOJE && !sel && "ring-1 ring-white/15")}>
              {d.getDate()}
              {comTask.has(k) && (
                <span className={cn("absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full",
                  sel ? "bg-foreground" : "bg-muted-foreground/60")} />
              )}
            </button>
          );
        })}
      </div>
      <button onClick={() => onEscolher(HOJE)}
        className="w-full mt-1.5 rounded-md py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]">
        Voltar pra hoje
      </button>
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
   conexão mora no topo, e não escondido num menu de configuração.

   A TROCA NÃO É UM INTERRUPTOR. Segmentado só funciona com dois; o escritório
   pode conectar um terceiro número amanhã e aí o controle quebra. Aqui é botão
   que abre uma lista — cresce sozinha, e ainda cabe o status e o telefone de
   cada instância, que num segmentado não caberia. */
function CardInstancia({ instancia, todas, onTrocar }: {
  instancia: Instancia; todas: Instancia[]; onTrocar: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const on = instancia.status === "conectado";
  return (
    <SpotlightCard sutil className="shrink-0 rounded-xl p-3 flex items-center gap-3">
      {/* A FOTO DO PERFIL É IDENTIDADE, NÃO STATUS. Ela fica neutra: quem diz
          se o número está de pé é o selo ao lado do nome, e só ele. O mesmo
          recado em três lugares — anel colorido, pontinho na foto e selo —
          fazia o card inteiro parecer um alarme aceso. */}
      <div className="h-11 w-11 shrink-0 rounded-full grid place-items-center text-[13px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
        {instancia.avatar}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
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
          <span className="tabular-nums text-foreground/80">{instancia.naoLidas} não lidas</span>
        </div>
      </div>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 shrink-0 text-[11.5px]">
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" /> Trocar instância
            <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[17rem] p-1.5">
          <p className="px-2 py-1 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Números conectados
          </p>
          <div className="flex flex-col gap-0.5">
            {todas.map((i) => {
              const ativa = i.id === instancia.id;
              const iOn = i.status === "conectado";
              return (
                <button key={i.id}
                  onClick={() => { onTrocar(i.id); setAberto(false); }}
                  className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    ativa ? "bg-white/[0.07]" : "hover:bg-white/[0.05]")}>
                  <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-[10.5px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
                    {i.avatar}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium truncate">{i.nome}</span>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn("h-1 w-1 rounded-full", iOn ? "bg-emerald-400" : "bg-rose-400")} />
                      <span className="tabular-nums">{i.telefone}</span>
                      {i.naoLidas > 0 && (
                        <span className="text-foreground/70 tabular-nums">· {i.naoLidas} não lidas</span>
                      )}
                    </span>
                  </span>
                  {ativa && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
          {/* Onde entra o terceiro número. Fica visível e desligado pra dizer
              que a lista cresce — é justamente por isso que não é segmentado. */}
          <button disabled
            className="mt-1 w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground/50 cursor-not-allowed border-t border-white/[0.06] pt-2">
            <Plus className="h-3.5 w-3.5 shrink-0" /> Conectar outro número
          </button>
        </PopoverContent>
      </Popover>
    </SpotlightCard>
  );
}

/* ─────────────────────────── a aba do gestor ─────────────────────────── */
function PainelFunil({ emRisco }: { emRisco: number }) {
  const topo = FUNIL_MES[0].n;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-3">
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
        <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Em risco agora</p>
          <p className={cn("text-3xl font-semibold tabular-nums", emRisco > 0 ? "text-amber-300" : "text-emerald-400")}>
            {emRisco}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            pessoas esperando resposta ou sem próximo passo definido
          </p>
        </SpotlightCard>

        <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-2.5">
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

        <SpotlightCard sutil className="rounded-xl p-4">
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
