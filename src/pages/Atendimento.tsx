// ATENDIMENTO — a bancada de quem cuida do lead antes de ele virar cliente.
//
// MAQUETE. Os dados são inventados (src/lib/atendimentoMock.ts) e nada aqui é
// gravado: a tela se comporta como se o WhatsApp já estivesse plugado pra gente
// discutir o formato antes de construir o backend.
//
// O ARRANJO:
//
//   ┌──────── instância(s) conectada(s) ────────┐
//   ├─ caixa ──┬───── conversa ─────┬─ detalhe ──┤
//
// UM PAINEL SÓ, NÃO TRÊS CARTÕES. As colunas dividem borda em vez de flutuar
// separadas com respiro entre elas: cartão solto pede margem, sombra e canto
// arredondado em cada um, e o olho passa a ler três objetos em vez de uma
// bancada. Aqui a divisão é uma linha de 1px, e a bancada ocupa a janela.
//
// A terceira coluna existe porque tudo que descreve o LEAD (etapa, espera,
// banco, descontos, perfil, nota) estava espremido embaixo do campo de digitar
// — lugar de quem escreve, não de quem consulta. Separado, o meio fica só com a
// conversa e a leitura de cada coisa acontece onde ela é procurada.
//
// ERAM QUATRO. A quarta era o Daily: a coluna do dia, com placar, filtro de
// tipo e calendário. Ela saiu porque tudo que mostrava ganhou casa melhor — a
// cobrança do lead está na ficha dele, na hora de escrever; a fila do dia
// inteira está na aba Follow-up; o que sai sozinho, na aba Programadas. Virou o
// quarto lugar de olhar as mesmas linhas, e cobrava largura das outras três.
// A fila em si (ordem de culpa, pontos, cadência) mora em
// src/lib/tasksAtendimento.ts, testada.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProvedorDeAudio } from "@/hooks/useAudioAtendimento";
import {
  MessageCircle, Search, Send, AlertTriangle, Check,
  Flame, ChevronRight, Landmark, BadgeCheck, Sparkles, Inbox,
  RefreshCw, StickyNote,
  CalendarDays, Repeat, BellRing, ChevronLeft, CheckCircle2,
  ArrowLeftRight, ChevronsUpDown, ChevronDown, SlidersHorizontal, Pin, Bot, MessageSquareText, Power, PowerOff, Pencil, Plus, ArrowRight, GitBranch, X, Paperclip, Loader2, FileText,
  UserPlus, Phone, Clock, Table2, Trash2, Copy, MessageSquarePlus, Database,
  Columns3, ArrowUpRight, ArrowDownLeft, CheckCheck, Smartphone, Stethoscope,
  RotateCcw, Volume2, VolumeX, Info, Smile, ClipboardList, ScanSearch, PenSquare, Zap, User, MailOpen,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LEADS, LEMBRETES, ESTAGIOS, ORIGENS,
  INSTANCIAS, type Lead, type Origem, type Estagio, type Mensagem, type Instancia,
} from "@/lib/atendimentoMock";
import {
  ordenarTasks, proximaCobranca, ROTULO_TIPO,
  horaBonita, type Task, type TipoTask,
} from "@/lib/tasksAtendimento";
import {
  useConversas, useMensagens, useCustodia, useInstancias, conversaParaLead, instanciaParaCard,
  type PassagemDeCustodia,
  marcarLida, marcarNaoLida, enviarTexto, enviarArquivo, criarConversa, moverEtapaWa, informarBaseWa, marcarPerdidoWa,
  analiseComercialDaConversa,
  usePresencaDaConversa, criarInstancia, qrDaInstancia, estadoDaInstancia, useFotosAssinadas, puxarFotosDePerfil,
  reaplicarWebhook, importarConversas, registrarInstancia, fixarConversaWa, useInvalidarWa,
  moverConversaDeInstancia,
  diagnosticarInstancia, reiniciarInstancia, assinarPresenca, type Diagnostico,
} from "@/hooks/useWhatsapp";
import { acharProblemas, resumoDoDiagnostico } from "@/lib/diagnosticoWa";
import { idDaConversaAberta, telefoneBonito, horaDaLista } from "@/lib/wa";
import {
  TOTAL_RODADAS, rotuloDaRodada, rotuloDoDegrau, diasDaRodada, diasDeAtraso, INTENCAO,
  CADENCIA as CADENCIA_PADRAO, type Regua,
} from "@/lib/followUp";
import {
  useCadencias, reguaDoNumero, useInvalidarCadencia, salvarDegrauDaRegua,
  type ReguasPorNumero,
} from "@/hooks/useCadenciaFollowUp";
import { midiasDaLinha, type AnexoLocal, type Midia } from "@/lib/anexos";
import { baixarMidias } from "@/lib/anexosBucket";
import { EMOJIS, MAX_RECENTES, comOEscolhido } from "@/lib/emojis";
import {
  listaDeInstancias, apelidosDeInstancias, apelidoDeInstancia, corDaInstancia, rotuloDaSelecao,
  mesmaInstancia, contemInstancia, nomeDaCorEmUso, coresDeInstancias, CORES_DE_INSTANCIA,
  type NomeDeCor,
} from "@/lib/instancias";
import {
  passagensPorEtapa, quandoDaPassagem, tempoNaEtapa,
  etapasDaJornada, rotuloDaEtapa, BASES, MOTIVOS_PERDIDO, ETAPAS_BRADESCO, ETAPAS_PADRAO,
  type PassagemNaTela, type PassagemDeEtapa, type EtapaDef,
} from "@/lib/jornada";
import { useEtapaLog, useInvalidarEtapaLog } from "@/hooks/useEtapaLog";
import { documentosDaConversa, selecaoInicial, linkDoFinder } from "@/lib/finderDaConversa";
import { linkDoWriter } from "@/lib/writerDaConversa";
import {
  termoDoRascunho, filtrarAtalhos, normalizarComando, comandoValido, comandoDuplicado, indiceNaLista,
  resumoDoAtalho, type Atalho,
} from "@/lib/atalhos";
import { useAtalhos, useInvalidarAtalhos, salvarAtalho, removerAtalho } from "@/hooks/useAtalhos";
import { useSecoesDaFicha, type SecaoDaFicha } from "@/hooks/useSecoesDaFicha";
import {
  useRegraFollowUp, useInvalidarRegra, salvarRegraFollowUp, followUpDoContato,
} from "@/hooks/useRegraFollowUp";
import {
  useMarcasDeInstancia, useInvalidarMarcas, marcaDe, nomeNaTela, salvarMarcaDeInstancia,
} from "@/hooks/useMarcaInstancia";
import { resumoDasRespostas, resumoDoDossie, dossieExtra } from "@/lib/planilhaLeads";
import {
  situacaoDoContato, estaOnline, estaDigitando, vistoDaMensagem, rotuloDoStatus, marcaDeEnvio,
} from "@/lib/presencaWa";
import {
  novaPendente, aindaPendentes, casamentos, daConversa, marcarFalha, remover, bolhaDaPendente,
  type Pendente,
} from "@/lib/envioOtimista";
import {
  useFontes, useNomesDasBases, useLeadsBrutos, useResumoBases, criarFonte, sincronizarFonte, marcarAbordado,
  descartarLead, desativarFonte, lerColunas, salvarColunas, useInvalidarLeads,
  type Fonte, type LeadBruto,
} from "@/hooks/useLeadsBrutos";
import { mascaraTelefone, aferirTelefone, nomeDaConversaNova } from "@/lib/novaConversa";
import { SeletorDeDia, SeletorDeHora, diaDoISO } from "@/components/EscolherQuando";
import {
  instanteDe, tipoDoMime, motivoDeNaoAgendar, faltaPara, quandoBonito, type TipoRetido,
} from "@/lib/retencao";
import {
  useAgendadas, useInvalidarAgendadas, reterMensagem, cancelarAgendada, editarAgendada,
  type AgendadaRow,
} from "@/hooks/useAgendadas";
import {
  useModelosFollowUp, useInvalidarModelos, salvarModeloFollowUp, alternarModeloAtivo,
  type ModeloFollowUp,
} from "@/hooks/useModelosFollowUp";
import {
  useTasksWa, criarTaskWa, alternarTaskWa, atualizarTaskWa, useInvalidarTasksWa,
  sincronizarFollowUps, concluirFollowUp, finalizarAtendimento,
} from "@/hooks/useTasksWa";
import {
  useAnotacoes, postarAnotacao, apagarAnotacao, useInvalidarAnotacoes, quandoDaNota,
} from "@/hooks/useAnotacoesWa";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { MidiaMensagem } from "@/components/atendimento/MidiaMensagem";
import { GravadorDeAudio } from "@/components/atendimento/GravadorDeAudio";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";
import { useAuth } from "@/hooks/useAuth";
import { useSomAtendimento } from "@/hooks/useSomAtendimento";
import { toast } from "sonner";

/* O "hoje" da maquete é fixo pra ela não mudar de comportamento amanhã e a
   gente perder a referência do que discutiu. Vira hojeISO() quando for real. */
/* HOJE, DE VERDADE.
 *
 * Esta linha era `"2026-09-02"` — uma data fixa, sobra de quando a tela era só
 * maquete. Com o módulo em produção isso deixou de ser detalhe e virou o defeito
 * que explicava um monte de coisa que parecia não ter explicação: o lembrete
 * novo nascia com o dia quatro dias atrás, o botão dizia "hoje, 02/09", a
 * retenção recusava qualquer horário como "no passado" (porque era), e a fila de
 * follow-up media o atraso contra um dia que já tinha passado.
 *
 * É calculado em fuso LOCAL, componente a componente, e nunca por `toISOString`:
 * aquilo devolve UTC, e em Manaus (UTC−4) toda tarde depois das 20h viraria o
 * dia seguinte na tela.
 */
const diaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const HOJE = diaLocal();

const horaLocal = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** O instante padrão de uma retenção: uma hora à frente, no minuto cheio. */
const daquiUmaHora = () => {
  const d = new Date(Date.now() + 3600_000);
  d.setSeconds(0, 0);
  return d;
};

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

/* OS CHIPS DA CAIXA FILTRAM POR ETAPA, NÃO POR ORIGEM.
   Origem já está impressa em cada linha da lista (o "PDA" cinza embaixo do
   nome) e quase não muda o dia de ninguém — praticamente tudo entra pelo mesmo
   número. Etapa muda: "quem está esperando extrato" é uma pergunta que se faz
   várias vezes por dia, e era a única que a caixa não sabia responder. */
/* OS CHIPS DEPENDEM DE QUEM ESTÁ NA CAIXA. Com duas jornadas convivendo (a
   Bradesco, detectada pela base, e a padrão), a fileira mostra as etapas das
   jornadas que têm gente; "Triagem" e "Proposta" existem nas duas e viram um
   chip só, porque a pergunta "quem está em triagem" não depende da jornada. */
function chipsDeEtapa(leads: Lead[], estagioDe: (l: Lead) => string): { chave: "todos" | Estagio; rotulo: string }[] {
  const temBradesco = leads.some((l) => l.jornada === "bradesco");
  const temPadrao = leads.some((l) => l.jornada !== "bradesco");
  const fonte: EtapaDef[] = [
    ...(temBradesco ? ETAPAS_BRADESCO : []),
    ...(temPadrao || !temBradesco ? ETAPAS_PADRAO : []),
  ];
  const vistos = new Set<string>();
  const chips: { chave: "todos" | Estagio; rotulo: string }[] = [{ chave: "todos", rotulo: "Todos" }];
  for (const e of fonte) {
    if (vistos.has(e.chave)) continue;
    vistos.add(e.chave);
    chips.push({ chave: e.chave, rotulo: e.rotulo });
  }
  void estagioDe;
  return chips;
}

/* Espaço-reservado pra quando não há conversa nenhuma. Não aparece na tela:
   existe pra `lead` nunca ser undefined enquanto a caixa está vazia. */
const LEAD_VAZIO: Lead = {
  id: "", nome: "", telefone: "", origem: "pda", estagio: "chegou", jornada: "padrao",
  ultimaFoi: "nos", horasSemResposta: 0, ultimaHora: "", naoLidas: 0,
  temProximaAcao: false, diasParado: 0, followUpsFeitos: 0, chegouEm: HOJE,
  dossie: { banco: null, descontos: [], inss: null, consignado: null, obs: null },
  conversa: [],
};

export default function AtendimentoPage() {
  const [aba, setAba] = useState<"atendimento" | "followup" | "programadas" | "config">("atendimento");
  /* QUAL NÚMERO ABRE. Guardado no navegador e não na conta: quem senta nesta
     mesa atende por um número, quem senta na outra atende por outro, e a mesma
     conta é usada pelos dois. Sem isto a aba abria sempre no primeiro da lista,
     e quem trabalha no segundo trocava de número toda manhã. */
  /* UMA SELEÇÃO, E NÃO UM NÚMERO. A caixa passa a poder mostrar mais de um
     número ao mesmo tempo, e o primeiro da lista continua sendo o PRINCIPAL:
     é por ele que sai mensagem nova, é dele o QR, é ele que importa conversa.
     Tudo isso precisa de um número só, e escolher sozinho qual dos dois seria
     mandar mensagem pelo número que a pessoa não escolheu. */
  const [instanciaIds, setInstanciaIds] = useState<string[]>(() => {
    try {
      const bruto = localStorage.getItem(CHAVE_INSTANCIA);
      if (!bruto) return [INSTANCIAS[0].id];
      // Compatível com o formato antigo, que guardava um id solto.
      const lido = bruto.startsWith("[") ? JSON.parse(bruto) : [bruto];
      return Array.isArray(lido) && lido.length > 0 ? lido : [INSTANCIAS[0].id];
    } catch { return [INSTANCIAS[0].id]; }
  });
  const guardarSelecao = (ids: string[]) => {
    setInstanciaIds(ids);
    try { localStorage.setItem(CHAVE_INSTANCIA, JSON.stringify(ids)); }
    catch { /* sem storage, vale só nesta sessão */ }
  };
  /** Trocar é ficar só com um. É o gesto antigo, e continua sendo o mais comum. */
  const trocarInstancia = (id: string) => guardarSelecao([id]);
  /** Marcar e desmarcar, mantendo a ordem de escolha e NUNCA esvaziando. */
  const alternarInstancia = (id: string) => {
    const tem = instanciaIds.includes(id);
    /* Caixa sem número nenhum não é um estado útil: é uma tela vazia que parece
       defeito. Desmarcar o último não faz nada, e a tela mostra o porquê
       deixando o único marcado sem o gesto de desmarcar. */
    if (tem && instanciaIds.length === 1) return;
    guardarSelecao(tem ? instanciaIds.filter((x) => x !== id) : [...instanciaIds, id]);
  };
  const [filtroEtapa, setFiltroEtapa] = useState<"todos" | Estagio>("todos");
  /* OUTROS RECORTES, que não são etapa. Etapa é onde a pessoa está no funil;
     isto é o estado dela hoje — está sendo cobrada, está esperando a gente. Os
     dois se cruzam em vez de competir, e por isso são dois estados. */
  const [filtroExtra, setFiltroExtra] = useState<"followup" | "semResposta" | null>(null);
  /* Recortes mais finos, cada um respondendo uma pergunta diferente: "quem está
     na terceira cobrança?" e "quem veio da LP do Bradesco?". Separados porque se
     cruzam — dá pra querer os dois ao mesmo tempo. */
  const [filtroRodada, setFiltroRodada] = useState<number | null>(null);
  const [filtroBase, setFiltroBase] = useState<string | null>(null);
  /* Quantos filtros estão ligados. O botão conta porque filtro ligado e
     invisível é a forma mais rápida de alguém concluir que "sumiram conversas"
     — e ir procurar defeito onde não há. */
  const filtrosLigados = (filtroEtapa !== "todos" ? 1 : 0) + (filtroExtra ? 1 : 0)
    + (filtroRodada !== null ? 1 : 0) + (filtroBase ? 1 : 0);
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string>(LEADS[0].id);
  const [lembretesMaquete, setLembretesMaquete] = useState<Task[]>(LEMBRETES);
  const [dia, setDia] = useState(HOJE);
  const [rascunho, setRascunho] = useState("");
  /* ── MENSAGENS RÁPIDAS ──
     `ocultos` existe por causa do Esc: a lista é derivada do rascunho, e sem
     um jeito de dizer "fechei" ela reabriria sozinha no mesmo texto. Volta a
     falso na primeira tecla, porque quem digita de novo quer a lista de novo. */
  const [atalhoIdx, setAtalhoIdx] = useState(0);
  const [atalhosOcultos, setAtalhosOcultos] = useState(false);
  const [atalhoEdicao, setAtalhoEdicao] = useState<{
    id: string | null; comando: string; conteudo: string;
    /** os anexos que já estavam guardados e ficam */
    midias: Midia[];
    /** os arquivos escolhidos agora, ainda no computador */
    novos: AnexoLocal[];
  } | null>(null);
  const seletorAnexoAtalho = useRef<HTMLInputElement>(null);
  const [salvandoAtalho, setSalvandoAtalho] = useState(false);
  /* OS ANEXOS DA BARRA DO CHAT — no plural. Era um só, e escolher o segundo
     trocava o primeiro sem avisar: nada dizia nada, o nome no campo apenas
     mudava. Quem estava mandando três documentos de um caso descobria pelo
     cliente. Agora somam, e saem todos no mesmo aperto do enviar. */
  const [anexos, setAnexos] = useState<AnexoLocal[]>([]);
  const [mandandoAnexo, setMandandoAnexo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const seletorArquivo = useRef<HTMLInputElement>(null);
  const campoResposta = useRef<HTMLTextAreaElement>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [criandoConversa, setCriandoConversa] = useState(false);
  const [taskAberta, setTaskAberta] = useState(false);
  const [taskTitulo, setTaskTitulo] = useState("");
  const [taskDetalhe, setTaskDetalhe] = useState("");
  const [taskDia, setTaskDia] = useState(HOJE);
  /* A RETENÇÃO mora no mesmo diálogo do lembrete, mas com horário PRÓPRIO: o
     lembrete pode ser pra amanhã e a mensagem sair daqui a duas horas. Forçar
     os dois no mesmo instante seria amarrar duas decisões que a pessoa toma
     separadas: quando EU faço alguma coisa, e quando O CLIENTE recebe. */
  const [reterAberta, setReterAberta] = useState(false);
  const [reterTexto, setReterTexto] = useState("");
  /* OS ANEXOS SE ACUMULAM, e não se substituem. Era um só, e escolher o segundo
     trocava o primeiro em silêncio: nada avisava, o nome no campo apenas mudava.
     Quem estava mandando três documentos de um caso descobria pelo cliente. */
  const [reterAnexos, setReterAnexos] = useState<AnexoLocal[]>([]);
  /* O PADRÃO É DAQUI A UMA HORA, e não um horário fixo. Era "09:00", o que
     fazia todo agendamento aberto depois das nove nascer no passado — e a tela
     recusava com "escolha um horário à frente" antes de a pessoa ter escolhido
     coisa alguma. Uma hora à frente é sempre válido e quase sempre perto do que
     se quer; quando não for, mudar são dois cliques. */
  const [reterDia, setReterDia] = useState(() => diaLocal(daquiUmaHora()));
  const [reterHora, setReterHora] = useState(() => horaLocal(daquiUmaHora()));
  const [reterGravando, setReterGravando] = useState(false);
  /* "Você escreveu e não agendou." A pessoa digita a mensagem, esquece de
     apertar o enviar da barra e clica em marcar o lembrete — e o texto morria
     ali, sem aviso nenhum. Salvar por conta própria seria pior: mandaria pro
     cliente algo que ninguém confirmou. Então pergunta. */
  const [avisoRetida, setAvisoRetida] = useState(false);

  /* ═══ O LEMBRETE, AGORA NA FICHA ═══
     Campos próprios, separados dos do diálogo, porque agora são duas telas
     diferentes: aqui se anota o que EU faço; lá se programa o que o CLIENTE
     recebe. Compartilhar o mesmo estado faria um rascunho vazar no outro. */
  const [fichaTitulo, setFichaTitulo] = useState("");
  const [fichaDetalhe, setFichaDetalhe] = useState("");
  const [fichaDia, setFichaDia] = useState(HOJE);
  const [fichaHora, setFichaHora] = useState("");
  const [salvandoFicha, setSalvandoFicha] = useState(false);
  /* Qual lembrete a ficha está editando. Null = está criando um novo. O mesmo
     formulário serve aos dois porque são a mesma coisa; uma tela separada de
     edição repetiria cada campo e divergiria no primeiro ajuste. */
  const [editandoFicha, setEditandoFicha] = useState<Task | null>(null);
  const [fichaAberta, setFichaAberta] = useState(false);

  /* ═══ O EDITOR DA MENSAGEM PADRÃO ═══
     Campos próprios, e não os da retenção: as duas usam a mesma barra e a mesma
     ideia, mas uma é o texto de UMA mensagem para UM lead e a outra é a regra da
     casa para uma rodada inteira. Compartilhar estado faria um rascunho vazar
     no outro, e o que vazaria aqui viraria a mensagem de todo mundo. */
  const [modeloRodada, setModeloRodada] = useState<number | null>(null);
  const [modeloTexto, setModeloTexto] = useState("");
  /* Duas listas porque são duas naturezas: os NOVOS ainda estão no computador de
     quem escreve e precisam subir; os MANTIDOS já estão no bucket desde a última
     vez. O editor mostra as duas juntas, na ordem, porque para quem lê isso é
     uma coisa só — a mensagem que vai sair. */
  const [modeloAnexos, setModeloAnexos] = useState<AnexoLocal[]>([]);
  const [modeloMantidos, setModeloMantidos] = useState<Midia[]>([]);
  const [modeloGravando, setModeloGravando] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const seletorModelo = useRef<HTMLInputElement>(null);
  const campoLembrete = useRef<HTMLInputElement>(null);
  /* QUAL LEMBRETE ESTÁ SENDO EDITADO. Null quando é um novo.
     O mesmo diálogo serve pros dois porque são a mesma coisa: um lembrete com
     dia, hora e mensagens presas. Uma tela só de edição repetiria cada campo e
     ia divergir da de criação no primeiro ajuste. */
  const [editando, setEditando] = useState<Task | null>(null);

  /* Abre o diálogo já preenchido. É o que faltava pra um lembrete ser
     REVISÁVEL: até agora, marcar a hora errada significava concluir e refazer,
     e as mensagens presas nele não tinham como ser corrigidas de jeito nenhum. */
  const abrirLembrete = (t: Task) => {
    setEditando(t);
    setTaskTitulo(t.titulo);
    setTaskDetalhe(t.detalhe ?? "");
    setTaskDia(t.data);
    setTaskHora(t.hora ?? "");
    setRetidas([]);
    setReterTexto("");
    setReterAnexos([]);
    setReterAberta(false);
    setAvisoRetida(false);
    setTaskAberta(true);
  };
  /* AS MENSAGENS JÁ PREPARADAS, esperando o lembrete ser salvo.
     Apertar enviar na barra não fecha nada e não salva o lembrete: ele faz o
     que faria no chat — tira a mensagem do campo e a põe na conversa. A
     diferença é que aqui ela fica de lado, com a hora dela, até alguém marcar
     o lembrete. São dois gestos separados porque são duas decisões separadas,
     e juntá-las fazia o diálogo fechar no meio da configuração. */
  const [retidas, setRetidas] = useState<Array<{
    id: string; texto: string; anexos: AnexoLocal[]; quando: Date;
  }>>([]);
  const seletorRetido = useRef<HTMLInputElement>(null);
  const [taskHora, setTaskHora] = useState("");
  const [salvandoTask, setSalvandoTask] = useState(false);
  const [rascunhoNota, setRascunhoNota] = useState("");
  const [postandoNota, setPostandoNota] = useState(false);
  /* A NOTA ABRE NUM POP, como o lembrete. Um campo de texto aberto no meio da
     ficha pede pra ser preenchido toda vez que alguém passa o olho, e a ficha é
     uma tela de CONSULTA, aberta o dia inteiro. Era assim que o mural antigo
     ficava: sempre aberto, sempre empurrando o resto da coluna pra baixo. */
  const [notaAberta, setNotaAberta] = useState(false);

  /* ═══ PASSAR A CONVERSA PRO OUTRO NÚMERO ═══
     Um diálogo, e não um clique direto na lista: a mudança tem uma consequência
     que o clique sozinho não conta — o cliente não sabe que trocamos de número,
     e a conversa dele no celular continua apontando pro antigo. Isso precisa
     estar escrito na frente de quem vai decidir. */
  /* ═══ A ETIQUETA DE UM NÚMERO ═══
     Qual número está sendo editado; null quando o pop está fechado. */
  const [marcaDe_, setMarcaDe_] = useState<string | null>(null);
  const [marcaApelido, setMarcaApelido] = useState("");
  const [marcaNome, setMarcaNome] = useState("");
  const [marcaCor, setMarcaCor] = useState<NomeDeCor>("sky");
  const [salvandoMarca, setSalvandoMarca] = useState(false);

  const abrirMarca = (nome: string) => {
    /* Abre com o que ESTÁ VALENDO, escolhido ou derivado. Abrir vazio faria a
       pessoa escrever do zero uma sigla que já estava boa, e faria "salvar sem
       mexer" apagar a escolha anterior. */
    setMarcaDe_(nome);
    setMarcaApelido(marcaDe(marcas, nome)?.apelido ?? apelidoDeInstancia(nome));
    setMarcaNome(marcaDe(marcas, nome)?.nome_exibido ?? "");
    setMarcaCor(coresEmUso.get(nome) ?? nomeDaCorEmUso(nome, marcaDe(marcas, nome)?.cor));
  };

  const salvarMarca = async () => {
    if (!marcaDe_) return;
    setSalvandoMarca(true);
    try {
      await salvarMarcaDeInstancia({
        instancia: marcaDe_,
        /* Igual ao derivado grava NULL e volta ao automático: se a pessoa não
           mudou a sigla, ela não escolheu uma — e gravar a escolha faria a
           etiqueta parar de acompanhar uma renomeação do número. */
        apelido: marcaApelido.trim() === apelidoDeInstancia(marcaDe_) ? null : marcaApelido,
        nomeExibido: marcaNome,
        cor: marcaCor,
        por: user?.id ?? null,
      });
      invalidarMarcas();
      setMarcaDe_(null);
      toast.success("Etiqueta atualizada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvandoMarca(false);
    }
  };

  const [moverAberto, setMoverAberto] = useState(false);
  const [moverPara, setMoverPara] = useState<string | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [etapaAberta, setEtapaAberta] = useState(false);
  /* Dentro do "Mover etapa": a pessoa escolheu "Perdido" e agora escolhe o
     motivo. Só nessa etapa se pergunta o motivo. */
  const [perdendo, setPerdendo] = useState(false);
  /* A escolha dos anexos que vão para o Finder. */
  const [finderAberto, setFinderAberto] = useState(false);
  const [docsEscolhidos, setDocsEscolhidos] = useState<string[]>([]);
  const [caixa, setCaixa] = useState<"inbound" | "base">("inbound");
  /* Qual base está expandida. UMA de cada vez: a coluna tem 15,5rem e a fila
     de uma base já ocupa a altura inteira — duas abertas juntas viram rolagem
     sem fim, e a pessoa perde de vista em qual base estava trabalhando. */
  const [baseAberta, setBaseAberta] = useState<string | null>(null);
  const [desligando, setDesligando] = useState<Fonte | null>(null);
  const [conexaoAberta, setConexaoAberta] = useState(false);
  const [nomeNovaInst, setNomeNovaInst] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [instConectando, setInstConectando] = useState<string | null>(null);
  const [passoConexao, setPassoConexao] = useState<"nome" | "qr" | "pronto">("nome");
  const [conectando, setConectando] = useState(false);
  /* Colunas: as disponíveis vêm da planilha; as escolhidas guardam a ORDEM,
     que é o que decide a ordem das linhas no cartão do lead. */
  const [colunasDisponiveis, setColunasDisponiveis] = useState<string[] | null>(null);
  const [colunasEscolhidas, setColunasEscolhidas] = useState<string[]>([]);
  const [lendoColunas, setLendoColunas] = useState(false);
  const [colunasDe, setColunasDe] = useState<Fonte | null>(null);
  const [fonteAberta, setFonteAberta] = useState(false);
  const [novaFonteNome, setNovaFonteNome] = useState("");
  const [novaFonteLink, setNovaFonteLink] = useState("");
  const [novaFonteAba, setNovaFonteAba] = useState("");
  const [salvandoFonte, setSalvandoFonte] = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [abordar, setAbordar] = useState<LeadBruto | null>(null);
  const [msgAbordagem, setMsgAbordagem] = useState("");
  const [abordando, setAbordando] = useState(false);
  const [enviadas, setEnviadas] = useState<Record<string, Mensagem[]>>({});
  const [estagios, setEstagios] = useState<Record<string, Estagio>>({});
  const [puladas, setPuladas] = useState<Record<string, Estagio[]>>({});
  /* Em janela estreita a coluna de tasks nasce RECOLHIDA. Com ela aberta, a
     caixa (15,5rem) + tasks (16rem) + a barra lateral do app não deixavam nem
     200px pra conversa — o balão quebrava uma palavra por linha. */
  /* O DETALHE DO CLIENTE ABRE E FECHA, e o gesto é clicar na foto e no nome do
     lead no alto da conversa — a região retangular inteira. É o lugar certo:
     quem quer saber mais sobre a pessoa olha pro nome dela, não caça um botão
     no canto. Fechado, a conversa ganha a largura da ficha, que é o que
     importa quando se está escrevendo. */
  const [detalheAberto, setDetalheAberto] = useState(true);

  /* ═══ O CELULAR NÃO TEM TRÊS COLUNAS ═══
   *
   * No monitor, a caixa, a conversa e a ficha convivem porque há largura pra
   * isso — e conviver é uma vantagem real: dá pra ler o histórico enquanto se
   * olha a etapa do lead. Num telefone, tentar o mesmo produz três tiras de
   * oitenta pixels onde nada se lê.
   *
   * Então o celular ganha o desenho que todo aplicativo de mensagem tem, porque
   * é o que funciona: UMA COISA POR VEZ, empilhada, com volta. Lista de
   * conversas; toca numa e ela ocupa a tela inteira; toca no nome e a ficha
   * ocupa a tela inteira. Cada passo é um lugar, e o botão de voltar desfaz
   * exatamente um passo — sem painel espremido, sem duas coisas disputando os
   * mesmos pixels.
   *
   * `telaMobile` só existe no telefone. No monitor ele é ignorado e as três
   * colunas continuam lado a lado: são dois desenhos para dois tamanhos, e não
   * um desenho que encolhe até ficar ruim nos dois. */
  const ehMobile = useIsMobile();
  const [telaMobile, setTelaMobile] = useState<"caixa" | "conversa" | "ficha">("caixa");

  /* Voltar sempre desce um degrau: da ficha pra conversa, da conversa pra
     caixa. Um só caminho de volta é o que faz a pilha ser previsível — a pessoa
     não precisa lembrar de onde veio. */
  const voltarMobile = () => {
    setTelaMobile((t) => (t === "ficha" ? "conversa" : "caixa"));
  };

  /* O BOTÃO DE VOLTAR DO APARELHO desfaz um degrau da pilha, e não a navegação
     do site. Sem isto, quem está lendo uma conversa e faz o gesto de voltar —
     que no celular é o gesto mais usado que existe — sai do atendimento
     inteiro, ou fecha a aba. Cada degrau empurra uma entrada no histórico e a
     volta a consome.
     Só no celular: no monitor não há pilha, e mexer no histórico do navegador
     ali seria sequestrar o botão de voltar por nada. */
  useEffect(() => {
    if (!ehMobile || telaMobile === "caixa") return;
    window.history.pushState({ telaAtendimento: telaMobile }, "");
    const aoVoltar = () => voltarMobile();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [ehMobile, telaMobile]);

  /* Sair do celular (girar a tela, abrir no monitor) volta a pilha pro começo:
     as três colunas aparecem todas, e um `telaMobile` esquecido em "ficha"
     faria a caixa nascer escondida na próxima vez que a janela encolhesse. */
  useEffect(() => {
    if (!ehMobile) setTelaMobile("caixa");
  }, [ehMobile]);

  /* A LARGURA DA FICHA MORA NUM LUGAR SÓ — e essa é a correção de um buraco que
     apareceu na tela: o invólucro que anima a abertura tinha a largura escrita
     em JS ("17rem") e o cartão de dentro tinha a dele em classe do Tailwind.
     Quando encolhi só a classe, o invólucro continuou abrindo o tamanho antigo
     e a diferença virou uma coluna de vazio entre a ficha e as tasks.
     Duas fontes para a mesma medida sempre acabam assim; agora é uma variável,
     lida pelos dois. Ela precisa existir em JS porque a animação anima um
     número, e não uma classe — e o cartão continua com largura FIXA por dentro
     pra que o conteúdo não se reorganize a cada quadro da abertura. */
  const [larguraFicha, setLarguraFicha] = useState("17rem");
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1536px)");
    const ver = () => setLarguraFicha(mq.matches ? "17rem" : "14.5rem");
    ver();
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  const { user } = useAuth();
  const { display: nomeDoAutor } = useUserDisplayNames();
  /* As instâncias vêm da Evolution (nome, status, número e FOTO do perfil); a
     maquete só assume quando ela não respondeu ainda. */
  const { data: instRows = [] } = useInstancias();
  const instancias: Instancia[] = instRows.length > 0 ? instRows.map((i) => instanciaParaCard(i)) : INSTANCIAS;
  /* A PRINCIPAL é a primeira da seleção que existe de verdade. Se a lista
     guardada aponta pra um número que saiu do ar, cai na primeira disponível em
     vez de deixar a tela sem instância nenhuma. */
  const instancia = instancias.find((i) => instanciaIds.includes(i.id)) ?? instancias[0];
  /* Os NOMES da seleção, na ordem em que a pessoa escolheu — é o que os hooks
     usam pra montar a caixa cruzada. Instância que sumiu da lista da Evolution
     simplesmente não entra. */
  const nomesSelecionados = useMemo(
    () => listaDeInstancias(
      instanciaIds.map((id) => instancias.find((i) => i.id === id)?.nome).filter(Boolean) as string[],
    ),
    [instanciaIds, instancias],
  );
  /* Uma caixa cruzada muda o que a tela precisa dizer em cada linha: de quem é
     essa conversa. Com um número só, dizer isso em cinquenta linhas seria
     repetir a mesma palavra cinquenta vezes. */
  const caixaCruzada = nomesSelecionados.length > 1;
  const instanciasDaSelecao = useMemo(
    () => instanciaIds.map((id) => instancias.find((i) => i.id === id)).filter(Boolean) as Instancia[],
    [instanciaIds, instancias],
  );
  /* AS ETIQUETAS ESCOLHIDAS A MÃO. Onde não houver escolha, o apelido continua
     sendo derivado do nome — a tabela pode ficar vazia pra sempre. */
  /* QUAIS SEÇÕES DA FICHA FICAM ABERTAS. A escolha vale pra TODAS as conversas,
     e não por conversa: quem fecha "Programadas" fechou porque não usa
     Programadas, não porque não usa as daquele cliente. E a ficha mudando de
     forma a cada conversa aberta faria o olho perder a referência de onde as
     coisas estão, que é justamente o que uma ficha precisa ter. */
  const { aberta: secaoAberta, alternar: alternarSecao } = useSecoesDaFicha();

  const { data: marcas } = useMarcasDeInstancia();
  const invalidarMarcas = useInvalidarMarcas();
  const apelidos = useMemo(() => apelidosDeInstancias(
    nomesSelecionados,
    new Map(nomesSelecionados.map((n) => [n, marcaDe(marcas, n)?.apelido])),
  ), [nomesSelecionados, marcas]);
  /* AS CORES DE TODOS OS NÚMEROS, GARANTIDAMENTE DIFERENTES.
     Sortear por hash não garante coisa nenhuma: com três números e seis cores,
     a chance de dois saírem iguais passa de um terço — e saiu. Aqui elas são
     resolvidas em conjunto: quem escolheu fica com o que escolheu, e o sorteio
     anda na paleta até achar uma livre.
     Sobre TODAS as instâncias e não só as selecionadas: a cor tem que ser a
     mesma quando o número entra e sai da caixa, senão ela deixa de ser o atalho
     que existe pra ser. */
  const coresEmUso = useMemo(() => coresDeInstancias(
    instancias.map((i) => i.nome),
    new Map(instancias.map((i) => [i.nome, marcaDe(marcas, i.nome)?.cor])),
  ), [instancias, marcas]);
  const corDe = (nome: string | null | undefined) =>
    CORES_DE_INSTANCIA[coresEmUso.get(nome ?? "")
      ?? nomeDaCorEmUso(nome ?? "", marcaDe(marcas, nome)?.cor)];
  /** Como o número se chama NA TELA. Só rótulo: nenhuma busca usa isto. */
  const nomeDe = (nome: string | null | undefined) => nomeNaTela(marcas, nome);
  const invalidarWa = useInvalidarWa();

  /* ── A FONTE DOS DADOS ──
     Se a Evolution já está entregando, a tela usa o banco; enquanto não está,
     usa a maquete. Não é gambiarra: é o mesmo formato dos dois lados (a
     conversão mora em useWhatsapp.ts), e evita a tela vazia de "nenhuma
     conversa" enquanto o número não foi conectado. O selo do cabeçalho diz em
     qual dos dois modos ela está. */
  const { data: conversas = [] } = useConversas(nomesSelecionados);
  /* AO VIVO É TER NÚMERO REGISTRADO — não é ter conversa.
     Antes era `conversas.length > 0`, e isso fazia um WhatsApp de verdade,
     conectado e configurado, mostrar as conversas INVENTADAS da maquete
     enquanto ninguém tivesse escrito. Caixa vazia é um estado legítimo de um
     número novo; encher a tela de gente que não existe pra disfarçar é o tipo
     de mentira que faz alguém abrir uma conversa e não entender por que o
     telefone não bate. A maquete volta a ser só o que ela sempre foi: o que
     se vê quando NENHUM número está ligado. */
  const aoVivo = instRows.length > 0;

  /* As bases LIGADAS NESTE NÚMERO — a fila que ele trabalha. O nome delas para
     a etiqueta do cartão vem de outro lugar (`useNomesDasBases`), porque são
     perguntas diferentes: esta é sobre o que este número faz hoje, a outra é
     sobre de onde a pessoa veio um dia. */
  const { data: fontes = [] } = useFontes(instancia.nome);

  /* QUAL CONVERSA ESTÁ ABERTA, DE VERDADE.
     `selecionadoId` nasce com o id da MAQUETE ("l1"), porque na primeira
     renderização ninguém sabe ainda se o WhatsApp respondeu. Quando ele
     responde, esse id não existe entre as conversas reais: a lista mostrava a
     primeira (por causa do fallback lá embaixo), o cabeçalho mostrava o nome
     dela — e o corpo ficava VAZIO, porque as mensagens eram buscadas pelo id
     da maquete. Parecia conversa sem mensagem, e era conversa nenhuma.
     Aqui o id se corrige sozinho: se o escolhido não está entre as conversas
     vivas, a aberta é a primeira delas. */
  const idAberto = idDaConversaAberta(selecionadoId, conversas);

  /* O GRUPO DA CONVERSA ABERTA, quando ela já foi repassada. Lido da lista que
     a caixa já trouxe: pedir a linha de novo só pra ler uma coluna seria uma
     consulta a mais em cada troca de conversa. */
  const grupoDaAberta = useMemo(
    () => conversas.find((c) => c.id === idAberto)?.grupo_id ?? null,
    [conversas, idAberto]);
  const { data: msgsDaAberta = [] } = useMensagens(aoVivo ? idAberto : null, grupoDaAberta);
  /* AS PASSAGENS DE CUSTÓDIA, pra linha divisória no meio do histórico. */
  const { data: custodia = [] } = useCustodia(aoVivo ? grupoDaAberta : null);
  /* A presença da conversa aberta é olhada de perto (3s): "digitando" dura
     três segundos, e a lista, que recarrega a cada dez, nunca pegaria. */
  const { data: presencaViva } = usePresencaDaConversa(idAberto, aoVivo);

  /* AVISAR QUAL CONVERSA ESTÁ ABERTA. É a âncora que ensina o `@lid` do
     contato: a presença chega identificada só pelo LinkedID, que não é
     telefone, e a Evolution não devolve esse par quando perguntada. O vínculo
     se aprende porque o WhatsApp só manda presença de quem se está olhando —
     e é a tela que sabe quem é.
     SEM MEMÓRIA DE "já avisei": o efeito dispara na troca de conversa, que é
     exatamente quando o aviso importa. A versão anterior guardava as já
     avisadas num Set e por isso só ensinava o primeiro contato de cada sessão
     — foi assim que o Luan funcionou e o João não. */
  useEffect(() => {
    if (!aoVivo || !idAberto) return;
    void assinarPresenca(idAberto);
    /* BATIMENTO, não um aviso único. A presença desta build não é assinada de
       verdade — ela vive de um canal que o anúncio da NOSSA presença abre, e que
       morre junto com o socket do Baileys. Foi exatamente isso que aconteceu:
       fluiu uma madrugada inteira, a instância reconectou às 09:59 e secou.
       Uma chamada só teria a mesma vida curta e a gente descobriria de novo
       catorze horas depois. */
    const id = setInterval(() => void assinarPresenca(idAberto), 60_000);
    return () => clearInterval(id);
  }, [aoVivo, idAberto]);

  /* O campo cresce com o texto e volta ao tamanho de uma linha quando esvazia.
     Sem isso, uma resposta de quatro linhas rolaria dentro de uma caixa de uma
     — e quem escreve não vê o que escreveu. */
  useEffect(() => {
    const el = campoResposta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [rascunho]);
  /* Só "digitando" e "gravando" acendem o balão — "online" não: alguém pode
     ficar horas com o app aberto sem escrever nada, e um balão eterno de
     reticências faria a tela mentir a tarde inteira. A regra de validade mora
     em presencaWa.estaDigitando, com teste, e é a MESMA que o cartão da caixa
     usa — duas cópias iam divergir na primeira mudança. */
  /* A última mensagem da conversa aberta entra na conta: quando ela chega, a
     pessoa terminou de escrever, e isso é mais rápido e mais certo do que
     esperar o evento de pausa. Sem isso as reticências ficavam pulando embaixo
     de uma mensagem já lida, prometendo mais coisa que não vinha. */
  const digitandoAgora = estaDigitando(
    presencaViva?.presenca,
    presencaViva?.presenca_em,
    undefined,
    msgsDaAberta[msgsDaAberta.length - 1]?.criada_em ?? null,
  );

  /* AS RETICÊNCIAS DA LISTA PRECISAM DE UM RELÓGIO PRÓPRIO.
     "Está digitando" é uma conta contra o AGORA, mas o React só refaz a conta
     quando alguma coisa manda ele repintar — e a lista de conversas recarrega a
     cada dez segundos. Resultado: as reticências ficavam pulando até dez
     segundos depois de a pessoa ter parado, enquanto o balão de dentro da
     conversa (que tem consulta própria de três em três segundos) apagava na
     hora. Era essa a diferença que você viu: o balão fiel, a lista não.
     O tique só existe enquanto ALGUÉM está digitando — sem ninguém, nenhum
     temporizador roda e a página não repinta à toa. */
  const alguemDigitando = digitandoAgora
    || conversas.some((c) => ["digitando", "gravando"].includes(c.presenca ?? ""));
  const [agoraTique, setAgoraTique] = useState(() => new Date());
  useEffect(() => {
    if (!alguemDigitando) return;
    const id = setInterval(() => setAgoraTique(new Date()), 1500);
    return () => clearInterval(id);
  }, [alguemDigitando]);

  /* OS SONS DA CAIXA.
     A direção da última mensagem sai de dois lugares, e por um motivo: na
     conversa ABERTA ela vem da própria mensagem, que a gente já tem em mãos.
     Nas outras, vem do contador de NÃO LIDAS — que é exatamente "chegou algo
     que ninguém viu". Sem esse cuidado, uma mensagem enviada de outra aba ou do
     celular do escritório faria a caixa apitar como se fosse o cliente
     falando. */
  const { mudo, alternarMudo, aoAtualizar } = useSomAtendimento(idAberto);
  const sinaisDeSom = useMemo(
    () => {
      const ultimaAberta = msgsDaAberta[msgsDaAberta.length - 1];
      return conversas.map((c) => c.id === idAberto
        // O SOM DA CONVERSA ABERTA SAI DA PRÓPRIA MENSAGEM, não da linha da
        // conversa — e isso é sincronia, não preciosismo. São duas consultas
        // diferentes: a lista de conversas recarrega a cada dez segundos, as
        // mensagens a cada cinco. Lendo a lista, o bipe saía ANTES do balão
        // aparecer, e som que anuncia o que ainda não está na tela é pior que
        // som nenhum: a pessoa olha e não acha nada.
        // Vindo da mesma consulta que desenha o balão, os dois acontecem na
        // mesma pintura.
        ? {
            conversaId: c.id,
            em: ultimaAberta?.criada_em ?? null,
            direcao: ultimaAberta?.direcao ?? null,
          }
        // Nas fechadas não há balão pra sincronizar: o cartão da caixa vem
        // desta mesma lista, então já é simultâneo. E a direção sai do contador
        // de NÃO LIDAS, que é exatamente "chegou algo que ninguém viu" — sem
        // isso, mensagem mandada de outra aba ou do celular do escritório faria
        // a caixa apitar como se fosse o cliente falando.
        : {
            conversaId: c.id,
            em: c.ultima_em,
            direcao: (c.nao_lidas ?? 0) > 0 ? "entrada" : "saida",
          });
    },
    [conversas, idAberto, msgsDaAberta],
  );
  useEffect(() => { aoAtualizar(sinaisDeSom); }, [sinaisDeSom, aoAtualizar]);

  /* A etiqueta lê TODAS as bases, e não só as deste número: a conversa guarda
     de onde a pessoa veio, e isso não deixa de ser verdade quando a base muda
     de número depois. */
  const { data: nomeDaBase = {} } = useNomesDasBases();

  const leadsBase: Lead[] = aoVivo
    ? conversas.map((c) => conversaParaLead(c, c.id === idAberto ? msgsDaAberta : [], new Date(), nomeDaBase))
    : LEADS;

  /* Os números do card da instância vêm da CAIXA, não da Evolution.
     A Evolution conta os chats do aparelho (grupos, arquivados, gente que
     nunca falou com a gente); a caixa mostra o que o atendimento tem. Card
     dizendo "3 conversas" em cima de uma lista com 1 é uma contradição na
     mesma tela, e quem lê acredita no número, não na lista. */
  const cartaoDaInstancia: Instancia = aoVivo
    ? {
        ...instancia,
        conversas: conversas.length,
        naoLidas: conversas.reduce((t, c) => t + (c.nao_lidas ?? 0), 0),
      }
    : instancia;
  const estagioDe = (l: Lead): Estagio => estagios[l.id] ?? l.estagio;
  const abrir = (id: string) => {
    setSelecionadoId(id);
    /* No celular, escolher uma conversa é ENTRAR nela: a lista sai e o
       histórico ocupa a tela. No monitor não muda nada — a lista continua
       visível ao lado, que é a vantagem de ter largura. */
    if (ehMobile) setTelaMobile("conversa");
    if (aoVivo) marcarLida(id).then(invalidarWa).catch(() => {});
  };
  const puladasDe = (l: Lead): Estagio[] => puladas[l.id] ?? l.etapasPuladas ?? [];

  /* Fixar e soltar. O estado vive no banco e não no navegador porque a fila é
     compartilhada: quem fixa "a dona Maria vai fechar hoje" está avisando a
     equipe, não organizando a própria tela. */
  const alternarFixada = (l: Lead) => {
    if (!aoVivo) return;
    fixarConversaWa(l.id, !l.fixadaEm)
      .then(invalidarWa)
      .catch((e) => toast.error("Não consegui fixar: " + (e as Error).message));
  };

  /* Alterar etapa, com a mesma regra da linha do tempo do processo: o que fica
     entre a atual e o destino vira PULADA — não some, e não vira concluída. */
  const avancarEtapa = (l: Lead, alvo: Estagio) => {
    // As etapas são as da jornada DESTE lead: a Bradesco e a padrão não têm a
    // mesma régua, e "o que fica no meio" depende da régua.
    const ETS = etapasDaJornada(l.jornada).filter((e) => !e.terminal);
    const i = ETS.findIndex((e) => e.chave === estagioDe(l));
    const j = ETS.findIndex((e) => e.chave === alvo);
    if (j === i || j < 0) return;

    const antes = puladasDe(l);
    // Indo pra frente, o que fica no meio vira pulada. VOLTANDO, some a marca
    // de pulada de tudo que voltou a estar à frente: uma etapa que o lead ainda
    // vai atravessar não pode continuar carimbada como "pulei essa".
    const puladasNovas = j > i
      ? [...new Set([...antes, ...ETS.slice(Math.max(i, -1) + 1, j).map((e) => e.chave)])]
      : antes.filter((c) => ETS.findIndex((e) => e.chave === c) < j);

    setEstagios((p) => ({ ...p, [l.id]: alvo }));
    setPuladas((p) => ({ ...p, [l.id]: puladasNovas }));

    if (aoVivo) {
      moverEtapaWa(l.id, alvo, puladasNovas)
        .then(() => { invalidarWa(); invalidarEtapaLog(); })
        .catch((e) => toast.error("Não consegui mover a etapa: " + (e as Error).message));
    }
  };

  /* Saiu do funil. É a única etapa que pergunta o motivo, e o motivo é o que
     depois diz onde o funil vaza. */
  const perderLead = (l: Lead, motivo: string) => {
    setEstagios((p) => ({ ...p, [l.id]: "perdido" }));
    setPerdendo(false);
    setEtapaAberta(false);
    if (aoVivo) {
      marcarPerdidoWa(l.id, motivo)
        .then(() => { invalidarWa(); invalidarEtapaLog(); toast.success("Lead marcado como perdido."); })
        .catch((e) => toast.error("Não consegui marcar como perdido: " + (e as Error).message));
    }
  };

  /* O atendente disse de onde o lead veio. A jornada troca no banco (gatilho),
     e a etapa é relida dos fatos da conversa; a tela só recarrega. */
  const informarBase = (l: Lead, base: string) => {
    if (!aoVivo) return;
    informarBaseWa(l.id, base)
      .then(() => {
        setEstagios((p) => { const n = { ...p }; delete n[l.id]; return n; });
        invalidarWa(); invalidarEtapaLog();
        toast.success("Base registrada no dossiê.");
      })
      .catch((e) => toast.error("Não consegui registrar a base: " + (e as Error).message));
  };

  /* ESTE BLOCO MORA AQUI, ANTES DA LISTA, e não é arrumação: `lista` filtra
     por "está em follow-up" e lê `followUpPorLead` no array de dependências —
     que é avaliado DURANTE o render. Declarado depois, `const` não é içado e a
     tela inteira cai com "Cannot access before initialization", num erro que o
     `tsc` não pega porque o uso está dentro de um hook. Já aconteceu três vezes
     nesta tela; a regra é simples: o que o corpo do componente usa, declara-se
     antes do primeiro uso. */
  const { data: lembretesDoBanco = [] } = useTasksWa(aoVivo ? nomesSelecionados : null);
  const lembretes = aoVivo ? lembretesDoBanco : lembretesMaquete;

  /* ESTAR NA CADÊNCIA É UMA ETIQUETA DO LEAD, não um item de uma lista à parte.
     A cobrança em aberto muda o jeito de escrever pra pessoa — quem já levou
     três não recebe a mesma mensagem de quem está na primeira —, e quem atende
     descobre isso ao abrir a conversa, não ao visitar outra aba. Por isso a
     rodada viaja com o lead: aparece no cartão da caixa, na barra da conversa e
     na ficha, sempre com o mesmo desenho.

     Um mapa e não um `find` por cartão: a caixa desenha dezenas de linhas a cada
     atualização, e varrer a lista inteira dentro de cada uma faria o custo
     crescer ao quadrado à toa. */
  const followUpPorLead = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of lembretes) {
      if (t.tipo === "follow_up" && !t.feita) m.set(t.leadId, t);
    }
    return m;
  }, [lembretes]);

  /* As cobranças JÁ FEITAS, em ordem de régua. É o histórico que a ficha do
     cliente mostra: "esta é a quarta vez que insistimos" é uma informação
     diferente de "há uma cobrança marcada pra sexta", e as duas decidem coisas
     diferentes na hora de escrever. */

  /* As bases que TÊM gente na caixa, com quantos. Listar campanha vazia é
     oferecer um filtro que devolve nada — e ninguém confia num filtro depois
     que ele devolve zero uma vez. */
  const basesNaCaixa = useMemo(() => {
    const conta = new Map<string, number>();
    for (const l of leadsBase) {
      if (!l.base) continue;
      conta.set(l.base, (conta.get(l.base) ?? 0) + 1);
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1]);
  }, [leadsBase]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leadsBase
      .filter((l) => filtroEtapa === "todos" || estagioDe(l) === filtroEtapa)
      .filter((l) => {
        if (filtroExtra === "followup") return followUpPorLead.has(l.id);
        // "Esperando resposta NOSSA" é o contrário de follow-up: ele escreveu e
        // ninguém respondeu. As duas se parecem numa lista e são opostas — uma
        // é rotina, a outra é falha nossa e urgência de hoje.
        if (filtroExtra === "semResposta") return l.ultimaFoi === "lead";
        return true;
      })
      .filter((l) => filtroRodada === null || followUpPorLead.get(l.id)?.rodada === filtroRodada)
      .filter((l) => !filtroBase || l.base === filtroBase)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo))
      /* A ORDEM DA CAIXA É A DA ÚLTIMA MENSAGEM, e mais nada.
         Antes ela era "quem espera resposta nossa primeiro, depois há mais
         tempo" — e isso tinha um efeito colateral que parecia bug: ABRIR uma
         conversa mudava o lugar dela na fila. O motivo é que os dois critérios
         saem das MENSAGENS, e as mensagens só são carregadas para a conversa
         aberta; para as outras a conta era feita sobre uma lista vazia. Quem
         clicava via a linha pular pro topo sozinha.
         `ultima_em` existe em todas as linhas o tempo todo, vem do banco e só
         muda quando alguém escreve. É o único critério que não se mexe por
         causa de um clique — e é o que todo aplicativo de mensagem usa.
         "Esperando resposta nossa" continua existindo: virou filtro e etiqueta,
         que é onde uma urgência deve estar, sem embaralhar a ordem. */
      .sort((a, b) => {
        // As fixadas ficam em cima, a última fixada primeiro: pilha de papel.
        const fa = a.fixadaEm ? Date.parse(a.fixadaEm) : 0;
        const fb = b.fixadaEm ? Date.parse(b.fixadaEm) : 0;
        if (fa !== fb) return fb - fa;
        return (b.ultimaEm ? Date.parse(b.ultimaEm) : 0) - (a.ultimaEm ? Date.parse(a.ultimaEm) : 0);
      });
  }, [filtroEtapa, filtroExtra, filtroRodada, filtroBase, followUpPorLead, busca, leadsBase, estagios]);

  /* Ao vivo os lembretes vêm de `wa_tasks` e sobrevivem ao recarregar; na
     maquete continuam em memória, pra ela seguir servindo pra discutir formato
     sem escrever nada no banco. */
  const invalidarTasks = useInvalidarTasksWa();
  const { data: agendadas = [] } = useAgendadas(aoVivo ? nomesSelecionados : null);
  const invalidarAgendadas = useInvalidarAgendadas();
  /* ═══ QUAL NÚMERO A ABA DE FOLLOW-UP ESTÁ CONFIGURANDO ═══
     A régua deixou de ser do escritório e passou a ser de cada número, então
     "salvar a régua" virou uma frase incompleta: a régua de quem? Com um número
     escolhido não há dúvida; com dois, editar sem dizer qual seria escrever no
     escuro — e a chance de acertar é metade. */
  const [reguaDe, setReguaDe] = useState<string | null>(null);
  const numeroDaRegua = useMemo(() => {
    // O escolhido só vale enquanto ele estiver na seleção: tirar um número da
    // caixa não pode deixar a aba configurando um número que saiu da tela.
    if (reguaDe && contemInstancia(nomesSelecionados, reguaDe)) return reguaDe;
    return nomesSelecionados[0] ?? null;
  }, [reguaDe, nomesSelecionados]);

  const { data: modelosRegua = [] } = useModelosFollowUp(numeroDaRegua);
  const invalidarModelos = useInvalidarModelos();
  const { data: padraoDaRegua = true } = useRegraFollowUp(numeroDaRegua);
  const invalidarRegra = useInvalidarRegra();
  /* A RÉGUA EM USO. Vem do banco, e é a MESMA que `fn_wa_cadencia()` lê para
     agendar a próxima cobrança: mudar o número na tela muda a fila de amanhã
     porque os dois lados olham a mesma linha, não porque um avisou o outro. */
  /* A RÉGUA QUE A ABA EDITA é a do número escolhido; a que a CONVERSA mostra é
     a do número dela. São perguntas diferentes e podem apontar pra números
     diferentes ao mesmo tempo — quem está configurando o Portal pode ter uma
     conversa do escritório aberta ao lado. */
  /* TODAS AS RÉGUAS DE UMA VEZ. A fila de follow-up mostra leads de todos os
     números escolhidos, e cada cartão precisa do degrau DA RÉGUA DELE — com um
     hook por número isso viraria hook dentro de laço, que o React não permite. */
  const { data: cadencias } = useCadencias();
  const regua = reguaDoNumero(cadencias, numeroDaRegua);
  const invalidarCadencia = useInvalidarCadencia();

  const mudarDegrau = async (rodada: number, dias: number) => {
    if (!numeroDaRegua) { toast.error("Escolha o número antes de mexer na régua."); return; }
    try {
      await salvarDegrauDaRegua(numeroDaRegua, rodada, dias, user?.id ?? null);
      invalidarCadencia();
      invalidarTasks();
      toast.success(`${rotuloDaRodada(rodada)} agora é de ${dias} ${dias === 1 ? "dia" : "dias"}.`, {
        description: `Vale para ${nomeDe(numeroDaRegua)}.`,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* A CHAVE DO NÚMERO: todo mundo entra na régua, ou ninguém entra.
     Depois de mudar, a sincronização roda na hora — sem isso a chave só teria
     efeito na próxima varredura, e quem acabou de desligar veria a fila cheia
     por mais uma hora achando que não funcionou. */
  const mudarPadraoDaRegua = async (ativo: boolean) => {
    if (!numeroDaRegua) return;
    try {
      await salvarRegraFollowUp(numeroDaRegua, ativo, user?.id ?? null);
      invalidarRegra();
      await sincronizarFollowUps(numeroDaRegua).catch(() => {});
      invalidarTasks();
      toast.success(ativo
        ? `Em ${nomeDe(numeroDaRegua)}, todo mundo entra na régua.`
        : `Em ${nomeDe(numeroDaRegua)}, ninguém entra na régua sem ser escolhido.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* LIGAR E DESLIGAR UM CONTATO. Três estados: ligado, desligado, e "segue o
     número" — e o terceiro é o que faz a chave do número continuar valendo pra
     quem nunca teve opinião gravada. */
  const mudarFollowUpDoLead = async (ativo: boolean | null) => {
    try {
      const ficou = await followUpDoContato(lead.id, ativo);
      invalidarWa();
      invalidarTasks();
      toast.success(ativo === null
        ? (ficou ? "Voltou a seguir o número: entra na régua." : "Voltou a seguir o número: fora da régua.")
        : ficou ? "Follow-up ligado para este contato."
                : "Follow-up desligado. As cobranças abertas foram canceladas.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* A CADÊNCIA SE PÕE EM DIA SOZINHA. Cria a cobrança de quem acabou de
     silenciar e cancela a de quem respondeu, fechou ou foi arquivado — as duas
     coisas, porque uma cadência que só cria vira lista de fantasmas, e cobrar
     quem já respondeu é a pior mensagem que existe.
     Roda ao abrir e a cada cinco minutos: é idempotente, então repetir não
     duplica nada.

     MORA AQUI, DEPOIS DE `invalidarTasks`, e isso não é arrumação: a lista de
     dependências do efeito é lida DURANTE a renderização, então declarar ela
     depois derruba o componente inteiro com "Cannot access before
     initialization". É a terceira vez que essa tela cai por uso antes da
     declaração — o `const` não é içado, e o efeito não protege a lista de
     dependências de nada. */
  useEffect(() => {
    if (!aoVivo || !instancia.nome) return;
    const por = () => sincronizarFollowUps(instancia.nome)
      .then((r) => { if (r.criadas || r.canceladas) invalidarTasks(); })
      .catch(() => { /* a fila do dia continua valendo sem isso */ });
    void por();
    const id = setInterval(por, 5 * 60_000);
    return () => clearInterval(id);
  }, [aoVivo, instancia.nome, invalidarTasks]);
  const { data: anotacoes = [] } = useAnotacoes(idAberto, aoVivo);
  const invalidarAnotacoes = useInvalidarAnotacoes();

  /* ── A OUTRA CAIXA: quem nunca escreveu ── */
  const { data: brutos = [] } = useLeadsBrutos(fontes.map((f) => f.id));
  const { data: resumoBases = {} } = useResumoBases(fontes.length > 0);
  const invalidarLeads = useInvalidarLeads();
  /* Mostrar também os anteriores ao corte, por base. Eles não somem da base —
     só não contam como fila. Esconder 612 pessoas sem oferecer o caminho de
     volta seria o mesmo defeito que essa tela já teve três vezes. */
  const [verAntigos, setVerAntigos] = useState<Record<string, boolean>>({});

  /** O lead conta como novo? Antes do corte da base, não — já foi trabalhado. */
  const contaComoNovo = (b: LeadBruto): boolean => {
    const f = fontes.find((x) => x.id === b.fonte_id);
    if (!f?.novos_desde || !b.chegou_em) return true;
    return b.chegou_em >= f.novos_desde;
  };
  const brutosNovos = brutos.filter((b) => b.situacao === "novo" && contaComoNovo(b));
  const brutosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return brutosNovos;
    return brutosNovos.filter((b) =>
      (b.nome ?? "").toLowerCase().includes(termo) || b.telefone.includes(termo.replace(/\D/g, "")));
  }, [brutosNovos, busca]);
  const followUpsFeitosPorLead = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of lembretes) {
      if (t.tipo !== "follow_up" || !t.feita) continue;
      const antes = m.get(t.leadId);
      if (antes) antes.push(t); else m.set(t.leadId, [t]);
    }
    for (const l of m.values()) l.sort((a, b) => (a.rodada ?? 0) - (b.rodada ?? 0));
    return m;
  }, [lembretes]);

  /* Sem conversa nenhuma, `lead` viraria undefined e a tela quebraria em vinte
     lugares que leem `lead.` — inclusive dentro de diálogos fechados, cujo
     conteúdo é montado junto com o resto. O lead vazio segura isso, e
     `semConversas` é quem decide o que aparece. */
  const semConversas = aoVivo && leadsBase.length === 0;
  const lead: Lead = leadsBase.find((l) => l.id === idAberto) ?? lista[0] ?? leadsBase[0] ?? LEAD_VAZIO;

  /* A RÉGUA DA CONVERSA ABERTA é a do NÚMERO DELA, e não a do número que a aba
     de follow-up está configurando: dá pra estar ajustando o Portal com uma
     conversa do escritório aberta ao lado, e os dois painéis têm que falar cada
     um da sua régua.
     Declarada aqui, depois de `lead`, e não lá em cima com as outras: ela lê
     `lead.instancia`, e `const` não é içado — antes da declaração, a tela
     inteira cai com "Cannot access before initialization". Já aconteceu quatro
     vezes neste arquivo. */
  const reguaDaConversa = reguaDoNumero(cadencias, lead.instancia ?? instancia.nome);

  /* ── OS PDFs DESTA CONVERSA, E A IDA AO FINDER ──
     Declarados aqui, depois de `lead`, pelo mesmo motivo da régua acima.
     O Finder abre em OUTRA ABA: a análise leva minutos (parser, e OCR quando o
     extrato é foto de foto), e quem atende não pode ficar preso nela. A conversa
     continua nesta aba, do jeito que estava. */
  const docsDaConversa = useMemo(() => documentosDaConversa(lead.conversa), [lead.conversa]);
  const abrirEscolhaDoFinder = () => {
    setDocsEscolhidos(selecaoInicial(docsDaConversa));
    setFinderAberto(true);
  };
  const levarAoFinder = () => {
    if (docsEscolhidos.length === 0) return;
    setFinderAberto(false);
    window.open(linkDoFinder({ conversaId: lead.id, nome: lead.nome, docs: docsEscolhidos }), "_blank");
  };

  /* ── E DAQUI PARA O WRITER ──
     Nesta etapa o que falta produzir é o kit (contrato e procuração), e o
     Writer monta isso a partir da análise comercial. A busca acontece ANTES de
     abrir a guia porque o que ela responde muda o que vai na URL: com análise,
     o Writer abre já com o cliente preenchido; sem, abriria numa lista de
     todas as análises, que é o trabalho que este botão existe para evitar.
     A guia é aberta de qualquer jeito: negar o Writer porque a análise sumiu
     seria pior que abri-lo vazio. */
  const [abrindoWriter, setAbrindoWriter] = useState(false);
  const levarAoWriter = async () => {
    if (!aoVivo || abrindoWriter) return;
    setAbrindoWriter(true);
    let analiseId: string | null = null;
    try {
      const a = await analiseComercialDaConversa(lead.id);
      analiseId = a?.id ?? null;
      if (!a) toast.info("Não achei a análise comercial desta conversa. O Writer abre, mas você escolhe a análise lá.");
    } catch (e) {
      toast.error("Não consegui buscar a análise: " + (e as Error).message);
    } finally {
      setAbrindoWriter(false);
    }
    window.open(linkDoWriter({ conversaId: lead.id, nome: lead.nome, analiseId }), "_blank");
  };

  /* Sai da conversa e volta pra fila pedindo atenção. Fecha o painel da
     conversa no celular pelo mesmo motivo: continuar dentro dela depois de
     dizer "não li isto" é desfazer o que se acabou de fazer. */
  const deixarNaoLida = () => {
    marcarNaoLida(lead.id)
      .then(() => {
        invalidarWa();
        if (ehMobile) setTelaMobile("caixa");
        toast.success("Conversa marcada como não lida.");
      })
      .catch((e) => toast.error("Não consegui marcar: " + (e as Error).message));
  };

  /* ── AS FOTOS DE PERFIL ──
     Uma assinatura para todas as fotos da caixa, e não uma por avatar. Quem
     não tem foto (ou escondeu) não entra na conta e fica nas iniciais. */
  const { data: fotos = {} } = useFotosAssinadas(leadsBase.map((l) => l.fotoPath));
  const fotoDe = (l: Lead): string | null => (l.fotoPath ? fotos[l.fotoPath] ?? null : null);

  /* De hoje em diante a foto entra sozinha, na primeira mensagem que a conversa
     trocar. Este botão é para o que já estava aqui antes disso, e vai de dez em
     dez de propósito: cada busca faz a Evolution conversar com o WhatsApp, e
     cento e vinte de uma vez é o tipo de rajada que já derrubou este número. */
  const [puxandoFotos, setPuxandoFotos] = useState(false);
  const puxarFotosQueFaltam = async () => {
    if (puxandoFotos) return;
    setPuxandoFotos(true);
    try {
      const r = await puxarFotosDePerfil({ limite: 10 });
      invalidarWa();
      if (!r.tentadas) { toast.info("Nenhuma conversa esperando foto."); return; }
      const partes = [
        r.guardada > 0 ? `${r.guardada} ${r.guardada === 1 ? "foto" : "fotos"}` : null,
        r.sem_foto > 0 ? `${r.sem_foto} sem foto ou escondida` : null,
        r.erro > 0 ? `${r.erro} com erro` : null,
      ].filter(Boolean);
      toast.success(`Perguntamos ${r.tentadas}: ${partes.join(", ")}.`);
    } catch (e) {
      toast.error("Não consegui puxar as fotos: " + (e as Error).message);
    } finally {
      setPuxandoFotos(false);
    }
  };

  /* ── AS MENSAGENS RÁPIDAS DESTA CONVERSA ──
     A lista é a mesma para todo o escritório e não depende de qual conversa
     está aberta; o que depende da conversa é só o que está no rascunho. */
  const { data: atalhos = [] } = useAtalhos();
  const invalidarAtalhos = useInvalidarAtalhos();
  const termoAtalho = atalhosOcultos ? null : termoDoRascunho(rascunho);
  const atalhosNaLista = useMemo(
    () => (termoAtalho === null ? [] : filtrarAtalhos(atalhos, termoAtalho)),
    [atalhos, termoAtalho]);
  const painelAtalhos = termoAtalho !== null;
  const atalhoAtivo = indiceNaLista(atalhoIdx, atalhosNaLista.length);

  /* A frase inteira no lugar do comando: era isso que a barra prometia. O
     cursor vai para o fim porque quase sempre ainda falta completar a frase
     ("..., dona Maria") antes de mandar. */
  const usarAtalho = (a: Atalho) => {
    setRascunho(a.conteudo ?? "");
    setAtalhosOcultos(true);
    requestAnimationFrame(() => {
      const el = campoResposta.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });

    /* O ANEXO ENTRA PELA MESMA PORTA DE UM ARQUIVO DO COMPUTADOR. Daqui pra
       frente ele é um anexo como qualquer outro: aparece na tira, dá pra tirar
       um, somar outro, e o envio é o mesmo. Um caminho de atalho que fosse
       direto pro envio seria uma segunda forma de mandar arquivo, com os seus
       próprios defeitos. */
    const midias = a.midias ?? [];
    if (midias.length === 0) return;
    baixarMidias(midias)
      .then((locais) => {
        if (locais.length === 0) { toast.error("Não consegui trazer o anexo do atalho."); return; }
        setAnexos((p) => [...p, ...locais]);
        if (locais.length < midias.length) toast.warning("Um dos anexos do atalho não veio.");
      })
      .catch((e) => toast.error("Não consegui trazer o anexo: " + (e as Error).message));
  };

  const abrirNovoAtalho = () => {
    // O que já foi digitado depois da barra vira a sugestão de comando: quem
    // digitou "/extrato" e não achou nada quer criar exatamente esse.
    setAtalhoEdicao({ id: null, comando: termoAtalho ?? "", conteudo: "", midias: [], novos: [] });
  };

  const gravarAtalho = async () => {
    if (!atalhoEdicao) return;
    const comando = normalizarComando(atalhoEdicao.comando);
    const conteudo = atalhoEdicao.conteudo.trim();
    if (!comandoValido(comando)) {
      toast.error("O comando aceita letra, número, hífen e traço baixo, e começa por letra ou número.");
      return;
    }
    if (comandoDuplicado(atalhos, comando, atalhoEdicao.id)) {
      toast.error(`Já existe um atalho /${comando}.`);
      return;
    }
    // Sem texto E sem anexo não é atalho nenhum: seria uma barra que não faz
    // nada. Com anexo, o texto é opcional (vira a legenda dele, como no envio).
    if (!conteudo && atalhoEdicao.midias.length === 0 && atalhoEdicao.novos.length === 0) {
      toast.error("Escreva a mensagem ou anexe um arquivo.");
      return;
    }
    setSalvandoAtalho(true);
    try {
      await salvarAtalho({
        id: atalhoEdicao.id, comando, conteudo, criadoPor: user?.id ?? null,
        anexosMantidos: atalhoEdicao.midias, anexosNovos: atalhoEdicao.novos,
      });
      invalidarAtalhos();
      setAtalhoEdicao(null);
      toast.success(`Atalho /${comando} salvo para todo mundo.`);
    } catch (e) {
      toast.error("Não consegui salvar: " + (e as Error).message);
    } finally {
      setSalvandoAtalho(false);
    }
  };

  const apagarAtalho = async () => {
    if (!atalhoEdicao?.id) return;
    setSalvandoAtalho(true);
    try {
      await removerAtalho(atalhoEdicao.id);
      invalidarAtalhos();
      setAtalhoEdicao(null);
      toast.success("Atalho apagado.");
    } catch (e) {
      toast.error("Não consegui apagar: " + (e as Error).message);
    } finally {
      setSalvandoAtalho(false);
    }
  };
  /* A regra do número DA CONVERSA, pra ficha poder explicar o que "segue o
     número" quer dizer nesta conversa específica — que é a única forma de o
     estado do meio não ser um enigma. */
  const { data: padraoDoNumeroDoLead = true } = useRegraFollowUp(lead.instancia ?? instancia.nome ?? null);
  /* ENVIO OTIMISTA: a bolha nasce no enter, não no OK da Evolution.
     Antes o texto ficava preso no campo até a resposta chegar, e quem digita
     via a mensagem parada ali e apertava enter de novo — duas mensagens iguais
     no WhatsApp do cliente. O cuidado com a verdade estava causando o erro que
     queria evitar. A verdade continua dita, só que por um símbolo: relógio
     enquanto está na nossa mão, risco quando o servidor confirma.

     A DECLARAÇÃO MORA AQUI, e não junto das funções de envio lá embaixo, por um
     motivo que já me pegou duas vezes nesta tela: `const` não é içado como
     `var`. Declarado depois e usado aqui em cima, o componente quebra inteiro
     com "Cannot access before initialization" — e o `tsc` não pega quando o uso
     está dentro de um callback. Estado usado no corpo do componente se declara
     antes do primeiro uso, ponto.

     A reconciliação (fazer a bolha otimista sumir quando a de verdade chega do
     banco) mora em src/lib/envioOtimista.ts, que é onde estão os testes. */
  const [pendentes, setPendentes] = useState<Pendente[]>([]);

  /* A lista recarrega a cada 5s; quando a mensagem confirmada chega do banco, a
     bolha otimista precisa sumir no MESMO instante, senão o texto fica
     duplicado na tela — pior que o problema original. A regra de casamento
     (que consome a linha, pra dois "ok" iguais não casarem com a mesma) é
     testada. */
  /* `useLayoutEffect`, e não `useEffect`, pelo mesmo motivo do rolamento: isto
     roda ANTES de o navegador pintar. Com o efeito comum, existia um quadro
     pintado com as duas bolhas ao mesmo tempo — a otimista e a real — e esse
     quadro é o piscar que a pessoa vê como pulo. */
  useLayoutEffect(() => {
    setPendentes((ps) => {
      if (ps.length === 0) return ps;
      const vivas = aindaPendentes(ps, msgsDaAberta);
      return vivas.length === ps.length ? ps : vivas;
    });
  }, [msgsDaAberta]);

  /* As retenções DESTA conversa, pra bolha fantasma no fim do histórico. Ver a
     mensagem que vai sair, no lugar em que ela vai aparecer, é o que impede
     alguém escrever de novo a mesma coisa à mão. */
  const agendadasDaAberta = useMemo(
    () => agendadas.filter((a) => a.conversa_id === lead.id),
    [agendadas, lead.id],
  );

  /* O HISTÓRICO DE ETAPAS DESTA CONVERSA. De uma só, e não da caixa inteira:
     ele é lido quando alguém abre a ficha de alguém, e carregar o histórico das
     cinquenta linhas da caixa pra desenhar uma seria pagar por quarenta e nove
     que ninguém vai olhar. */
  const { data: etapaLog = [] } = useEtapaLog(aoVivo ? lead.id : null);
  const invalidarEtapaLog = useInvalidarEtapaLog();

  const pendentesDaAberta = daConversa(pendentes, lead.id);

  /* A CONVERSA DESCE SOZINHA PRA MENSAGEM NOVA.
     Sem isso, a mensagem chegava, o histórico crescia por baixo e quem estava
     olhando continuava vendo o mesmo trecho de sempre — a conversa "não
     atualizava", quando na verdade só não tinha rolado.
     Desce também quando o balão de digitando acende, e quando se troca de
     conversa: abrir uma conversa no meio do histórico é o mesmo desconforto. */
  /* ROLA O PRÓPRIO CONTAINER, e não um `scrollIntoView` num div vazio no fim.
     Aquilo dava o pulo que aparecia no envio: `scrollIntoView` pede ao navegador
     que o elemento fique visível, e pra isso ele rola TODOS os ancestrais
     roláveis, não só a caixa da conversa. Junto com a mola do framer, que ainda
     está movendo o balão quando o cálculo acontece, o navegador mirava numa
     posição que deixaria de existir um quadro depois — e a conversa "fisgava"
     pra baixo, abrindo um vão além da última mensagem.
     `scrollTop = scrollHeight` não tem esse problema: mexe numa caixa só, e no
     valor final, não numa posição em movimento. */
  /* QUEM JÁ ESTAVA NA TELA. Só quem NÃO está aqui ganha a animação de chegada:
     abrir uma conversa faria as trezentas mensagens do histórico expandirem
     todas de uma vez, que é o oposto de "algo novo chegou".
     Um ref e não estado: isto não muda o que se desenha, só se a bolha nasce
     com a classe da animação — e um estado provocaria justamente o render a
     mais que se está tentando evitar. */
  const jaNaTela = useRef<Set<string>>(new Set());
  const primeiraPintura = useRef(true);

  const caixaDaConversa = useRef<HTMLDivElement>(null);
  const descer = () => {
    const el = caixaDaConversa.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  /* ANTES DO QUADRO, E SEM ROLAGEM SUAVE — e é isto que finalmente acaba com o
     repuxão.
     O que sobrava era a viagem: com `behavior: "smooth"`, o navegador pinta o
     balão no lugar onde o conteúdo ESTAVA e passa os trezentos milissegundos
     seguintes levando a conversa até o fim. Quem olha vê a mensagem nascer mais
     acima e descer até o piso — a animação de chegada acontecendo num lugar que
     não é o dela.
     `useLayoutEffect` roda depois de o React mexer no DOM e ANTES de o navegador
     pintar: quando o balão aparece pela primeira vez, a conversa já está no fim.
     Ele nasce no piso e faz a animação ali, parado.
     (O `requestAnimationFrame` que estava aqui existia pra esperar a medida da
     altura; num efeito de layout a medida já está pronta, e esperar um quadro
     era justamente pintar uma vez no lugar errado.) */
  /* QUAL CONVERSA ESTÁ ABERTA, escrito no `body`. A barra flutuante do áudio
     lê isto pra se calar quando a bolha já está visível — e ler do DOM evita
     atravessar meia dúzia de componentes com um prop que nenhum deles usa. */
  useEffect(() => {
    document.body.setAttribute("data-conversa-aberta", lead.id);
    return () => document.body.removeAttribute("data-conversa-aberta");
  }, [lead.id]);

  useLayoutEffect(() => {
    /* Trocar de conversa zera o que já estava na tela: as bolhas da conversa
       nova são todas "antigas" pra quem acabou de abrir, e nenhuma deve
       expandir. */
    jaNaTela.current = new Set();
    primeiraPintura.current = true;
    descer();
  }, [lead.id]);

  /* Depois de cada pintura, tudo que está na tela passa a ser "antigo". A
     próxima bolha que aparecer sem estar neste conjunto é, por definição, a que
     acabou de chegar. */
  useLayoutEffect(() => {
    for (const m of conversa) jaNaTela.current.add(m.chave);
    primeiraPintura.current = false;
  });

  /* GRUDADO NO FIM ENQUANTO O CONTEÚDO AINDA CRESCE.
     Rolar uma vez, no quadro em que a mensagem entra, resolve o texto e falha
     em tudo que muda de tamanho DEPOIS: uma foto entra sem altura nenhuma e só
     empurra o histórico quando termina de carregar, meio segundo mais tarde —
     aí a conversa já parou de rolar e a imagem nasce metade fora da tela.
     O observador acompanha essas mudanças e, SÓ SE a pessoa já estava no fim,
     segue o conteúdo. A condição é o ponto todo: quem subiu pra reler uma
     mensagem antiga não pode ser arrastado pra baixo porque uma foto acabou de
     carregar em algum lugar. */
  useEffect(() => {
    const el = caixaDaConversa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      const doFim = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (doFim < 120) el.scrollTop = el.scrollHeight;
    });
    /* Observa os FILHOS, e não a caixa: a caixa tem altura fixa (ela é o painel
       da conversa) e nunca dispara; quem muda de tamanho é o conteúdo. */
    for (const filho of Array.from(el.children)) obs.observe(filho);
    return () => obs.disconnect();
  }, [lead.id, msgsDaAberta.length]);
  /* SÓ MENSAGEM PUXA A TELA PRA BAIXO. Digitando não entra na conta: o balão
     de reticências acende e apaga o tempo todo enquanto a pessoa pensa, e cada
     piscada arrastaria a conversa — quem estivesse lendo uma mensagem mais
     acima seria jogado pro fim a cada dois segundos. Rolar é interrupção, e só
     mensagem nova justifica. */
  useLayoutEffect(() => { descer(); }, [msgsDaAberta.length, pendentesDaAberta.length]);

  /* O TECLADO ABRE E A CONVERSA CONTINUA NO FIM.
     Quando o teclado sobe, a área visível encolhe e o histórico fica mais
     curto — e o pedaço que some é justamente o de baixo, onde está a última
     mensagem. Sem isto, tocar no campo pra responder esconde exatamente o que a
     pessoa ia responder, e ela tem que rolar de volta antes de escrever.
     Vale nos dois: no monitor a janela não muda de altura e o efeito nunca
     dispara. */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const aoMudar = () => descer();
    vv.addEventListener("resize", aoMudar);
    return () => vv.removeEventListener("resize", aoMudar);
  }, []);
  /* ═══ AS BOLHAS DA CONVERSA, com identidade estável ═══
     *
     * A reconciliação entre a bolha otimista e a linha do banco acontece AQUI,
     * durante o render — e não num efeito depois dele. Essa mudança de lugar é
     * a correção do piscar.
     *
     * Com a herança de chave feita num efeito, existia um quadro em que a
     * mensagem real já estava na lista com a chave nova (montando, invisível,
     * animando do zero) e a pendente ainda estava lá; no quadro seguinte a
     * chave virava a da pendente e o elemento remontava de novo. Duas
     * montagens para uma mensagem só: o piscar.
     *
     * Calculando junto com a lista, as duas coisas acontecem no MESMO quadro: a
     * linha do banco já nasce com a chave que a pendente tinha, e a pendente já
     * não é desenhada. Uma vira a outra sem que o React veja nada nascer ou
     * morrer — que é a verdade: é a mesma mensagem, trocando o relógio pelo
     * risco.
     *
     * O tipo é declarado, não inferido: sem isso o array vira uma UNIÃO entre a
     * Mensagem completa e o formato mais estreito da bolha pendente, e todo
     * campo opcional (dia, midiaPath, duracao) some do que dá pra ler. */
  const conversa: Array<Mensagem & { chave: string }> = useMemo(() => {
    const heranca = new Map<string, string>();
    for (const { pendenteId, msgId } of casamentos(pendentesDaAberta, msgsDaAberta)) {
      heranca.set(msgId, pendenteId);
    }
    const vivas = aindaPendentes(pendentesDaAberta, msgsDaAberta);

    return [
      ...lead.conversa.map((m, i) => ({
        ...m,
        chave: (m.id && heranca.get(m.id)) || m.id || `m${i}`,
      })),
      ...(enviadas[lead.id] ?? []).map((m, i) => ({ ...m, chave: m.id || `e${i}` })),
      ...vivas.map(bolhaDaPendente).map((b) => ({ ...b, chave: b.id })),
    ] as Array<Mensagem & { chave: string }>;
  }, [lead.conversa, enviadas, lead.id, pendentesDaAberta, msgsDaAberta]);

  /* ONDE A CONVERSA TROCOU DE MÃO.
     Cada passagem de custódia vira uma linha no meio do histórico, presa à
     PRIMEIRA mensagem que veio depois dela. Presa a uma mensagem, e não
     desenhada no fim: o histórico é do grupo inteiro, e uma passagem que
     aconteceu no meio de agosto precisa aparecer no meio de agosto.
     Uma passagem sem nenhuma mensagem depois — repassou e ninguém falou ainda —
     fica sem âncora e é desenhada no fim, que é onde ela está mesmo. */
  const divisoresDeCustodia = useMemo(() => {
    const porMensagem = new Map<string, PassagemDeCustodia>();
    const soltas: PassagemDeCustodia[] = [];
    for (const p of custodia) {
      const primeira = msgsDaAberta.find((m) => m.criada_em >= p.desde);
      if (primeira && !porMensagem.has(primeira.id)) porMensagem.set(primeira.id, p);
      else if (!primeira) soltas.push(p);
    }
    return { porMensagem, soltas };
  }, [custodia, msgsDaAberta]);


  /* AS TASKS DO DIA ESCOLHIDO — TODAS GRAVADAS AGORA.
     O follow-up era CONTA: a cadência lia o tempo parado e deduzia quantas
     cobranças o lead "já devia ter recebido". Servia pra desenhar a tela, não
     pra trabalhar — a conta não sabe o que foi realmente feito, não sabe quem
     fez, e o "feito" morria ao recarregar a página.
     Agora cada cobrança é uma linha, criada pela cadência no banco e concluída
     de verdade. Lembrete e follow-up viraram a mesma coisa aqui: dois tipos da
     mesma task, com o mesmo desenho e o mesmo ciclo. */
  const tasksDoDia = useMemo(
    () => ordenarTasks(lembretes.filter((t) => t.data === dia)),
    [dia, lembretes],
  );

  const tasksDoLead = tasksDoDia.filter((t) => t.leadId === lead.id);
  /* A cobrança em aberto deste lead — e ela NÃO sai de `tasksDoLead`: aquela
     lista é do dia que o calendário está mostrando, e a cobrança quase nunca
     vence hoje. Sair dali faria a ficha dizer "sem follow-up" para quem tem uma
     marcada pra sexta. */
  /* TODOS os lembretes manuais em aberto desta pessoa, de qualquer dia — e não
     só os do dia que o calendário aponta, como faz a jornada. Um recado marcado
     pra sexta ficaria invisível numa quarta, que é justamente quando alguém
     abriria a ficha pra conferir se já tinha anotado aquilo. */
  const lembretesDoLead = useMemo(
    () => lembretes
      .filter((t) => t.leadId === lead.id && t.tipo === "lembrete" && !t.feita)
      .sort((a, b) => a.data.localeCompare(b.data)),
    [lembretes, lead.id],
  );

  const followUpDoLead = followUpPorLead.get(lead.id) ?? null;
  const feitosDoLead = followUpsFeitosPorLead.get(lead.id) ?? [];

  /* O QUE APARECE NA FAIXA DO TOPO DA CONVERSA.
     As tasks do dia MAIS a cobrança em aberto, mesmo que ela vença noutro dia —
     e era exatamente isso que faltava: a faixa filtrava pelo dia do calendário,
     e cobrança quase nunca vence hoje. Resultado: quem abria a conversa não via
     que havia uma cobrança marcada, justamente na hora de escrever pra pessoa.
     Sem duplicar quando ela já está no dia que está sendo olhado. */
  const tasksDoCabecalho = useMemo(() => {
    if (!followUpDoLead) return tasksDoLead;
    /* SÓ QUANDO CHEGOU A HORA. Cobrança que vence daqui a três semanas não é
       trabalho de hoje, e mostrá-la no topo da conversa é pedir pra alguém
       cobrar antes do tempo — o oposto do que a régua serve pra fazer. Entra
       no dia dela, e continua entrando enquanto estiver atrasada. */
    if (followUpDoLead.data > HOJE) return tasksDoLead;
    if (tasksDoLead.some((t) => t.id === followUpDoLead.id)) return tasksDoLead;
    return [followUpDoLead, ...tasksDoLead];
  }, [tasksDoLead, followUpDoLead]);

  /* Dias com task, pro calendário marcar. Uma linha por task, contra a lista
     inteira — não há mais recálculo por dia porque não há mais conta. */


  /* CONCLUIR PASSA A PERGUNTAR ANTES.
     O check ficava a um pixel do resto do cartão e concluía no primeiro clique.
     Isso aconteceu: coisa marcada como feita sem ninguém ter feito — e, no
     follow-up, o estrago não para aí: concluir agenda a PRÓXIMA cobrança
     contando do dia de hoje, então um clique errado empurra a régua inteira e
     não há como voltar (o índice único proíbe duas cobranças abertas).
     Um gesto que mente sobre trabalho feito não pode ter o mesmo custo do gesto
     que se faz dez vezes por dia.

     REABRIR NÃO PERGUNTA. É reversível e não escreve nada em lugar nenhum;
     exigir confirmação nos dois lados transformaria a caixa num carimbo que
     todo mundo aperta sem ler, que é justamente o que se quer evitar. */
  const [aConcluir, setAConcluir] = useState<Task | null>(null);

  /* Cancelar uma programada mora aqui, e não em cada lugar que mostra um
     cartão: são três telas (a conversa, a ficha do cliente e a aba) fazendo a
     mesma coisa, e escrita três vezes uma delas ia esquecer de recarregar a
     lista depois — o cartão continuaria ali, cancelado, parecendo que o clique
     não funcionou. */
  /* As programadas do lembrete aberto. Casa por `task_id` quando existe e, na
     falta dele, pelo lead: a retenção nasceu antes de o vínculo com o lembrete
     existir, e as que já estão no banco sem `task_id` continuariam invisíveis
     numa tela feita justamente pra encontrá-las. */
  const agendadasDoEditando = useMemo(() => {
    if (!editando) return [] as AgendadaRow[];
    return agendadas.filter((a) =>
      a.status === "pendente" &&
      (a.task_id === editando.id || (!a.task_id && a.conversa_id === editando.leadId)));
  }, [editando, agendadas]);

  /* Abre o editor já com o que estiver escrito. Um editor em branco sobre um
     texto que existe é o jeito mais rápido de alguém apagar sem querer o que
     outra pessoa escreveu. */
  const abrirModelo = (rodada: number) => {
    const m = modelosRegua.find((x) => x.rodada === rodada);
    setModeloRodada(rodada);
    setModeloTexto(m?.texto ?? "");
    setModeloAnexos([]);
    /* OS ANEXOS QUE JÁ ESTAVAM VOLTAM PRO EDITOR. Sem isso, salvar uma vírgula
       no texto apagaria o PDF que a rodada mandava — o editor abriria sem ele e
       o salvamento gravaria o que o editor mostrava. */
    setModeloMantidos(m ? midiasDaLinha(m) : []);
  };

  const salvarModelo = async () => {
    if (modeloRodada === null) return;
    const semAnexo = modeloAnexos.length === 0 && modeloMantidos.length === 0;
    if (semAnexo && !modeloTexto.trim()) {
      toast.error("Escreva a mensagem ou anexe um arquivo.");
      return;
    }
    setSalvandoModelo(true);
    try {
      await salvarModeloFollowUp({
        instancia: numeroDaRegua ?? "",
        rodada: modeloRodada,
        texto: modeloTexto,
        anexosNovos: modeloAnexos,
        anexosMantidos: modeloMantidos,
        por: user?.id ?? null,
      });
      invalidarModelos();
      toast.success(`Mensagem padrão do ${rotuloDaRodada(modeloRodada)} salva.`);
      setModeloRodada(null);
    } catch (e) {
      toast.error("Não consegui salvar: " + (e as Error).message);
    } finally {
      setSalvandoModelo(false);
    }
  };

  const cancelarProgramada = (id: string) => {
    cancelarAgendada(id)
      .then(() => { invalidarAgendadas(); toast.success("Mensagem cancelada."); })
      .catch((e) => { invalidarAgendadas(); toast.error((e as Error).message); });
  };

  const concluir = (id: string) => {
    const alvo = lembretes.find((t) => t.id === id) ?? lembretesMaquete.find((t) => t.id === id);
    if (alvo && !alvo.feita) { setAConcluir(alvo); return; }
    aplicarConclusao(id);
  };

  const aplicarConclusao = (id: string) => {
    if (aoVivo) {
      const atual = lembretes.find((t) => t.id === id);
      if (!atual) return;

      /* CONCLUIR UMA COBRANÇA ABRE A PRÓXIMA — e por isso ela não passa pelo
         mesmo caminho de um lembrete. A régua inteira mora no banco: ele marca
         esta como feita e já agenda a seguinte, contando do dia de HOJE.
         Desmarcar um follow-up não desfaz a próxima de propósito: a régua anda
         pra frente, e voltar atrás criaria duas cobranças abertas pro mesmo
         lead — que é exatamente o que o índice único no banco proíbe. */
      if (atual.tipo === "follow_up" && !atual.feita) {
        concluirFollowUp(id, user?.id ?? null)
          .then((proxima) => {
            invalidarTasks();
            toast.success(proxima
              ? `${atual.lead}: cobrança feita. A próxima já está agendada.`
              : `${atual.lead}: última da régua. O lead sai da cadência.`);
          })
          .catch((e) => toast.error("Não consegui concluir: " + (e as Error).message));
        return;
      }

      alternarTaskWa(id, !atual.feita, user?.id ?? null)
        .then(invalidarTasks)
        .catch((e) => toast.error("Não consegui marcar: " + (e as Error).message));
      return;
    }
    setLembretesMaquete((prev) => prev.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t)));
  };

  /* LIGAR E DESLIGAR A TRAVA. Cancelar a cobrança aberta é parte do gesto, não
     efeito colateral: quem clica "finalizado" espera a fila mudar naquele
     segundo — e o banco faz as duas coisas numa chamada só, pra não existir o
     estado intermediário de "finalizado mas ainda sendo cobrado". */
  const [finalizando, setFinalizando] = useState(false);
  const alternarFinalizado = (finalizar: boolean) => {
    if (!aoVivo || semConversas) return;
    setFinalizando(true);
    finalizarAtendimento(lead.id, finalizar, user?.id ?? null)
      .then(() => {
        invalidarTasks();
        invalidarWa();
        toast.success(finalizar
          ? `${lead.nome}: atendimento finalizado. Sai da régua de follow-up.`
          : `${lead.nome}: atendimento reaberto.`);
      })
      .catch((e) => toast.error("Não consegui: " + (e as Error).message))
      .finally(() => setFinalizando(false));
  };

  /* O `window.prompt` que estava aqui aceitava uma linha de texto e mais nada:
     sem detalhe, sem dia, sem hora — e com a cara do sistema operacional no
     meio de uma tela que não é dele. Agora abre um diálogo de verdade, já com
     o dia que está sendo olhado no calendário. */
  /* Abre o diálogo da MENSAGEM PROGRAMADA. O nome antigo (`novoLembrete`) ficou
     errado quando as duas coisas se separaram: o diálogo não marca mais nada
     pra mim, ele programa algo pro cliente. */
  const novaProgramada = () => {
    setEditando(null);
    setTaskTitulo("");
    setTaskDetalhe("");
    setTaskDia(dia);
    setTaskHora("");
    limparRetencao();
    setReterAberta(true);
    setTaskAberta(true);
  };

  /* MARCAR LEMBRETE, direto da ficha e sem diálogo nenhum. Um recado de duas
     palavras não merece uma janela que cobre a conversa: quem anota "ligar
     amanhã" está olhando a pessoa, e perder a conversa de vista pra digitar
     isso é o tipo de atrito que faz ninguém anotar. */
  /* O pop do lembrete, nos dois modos. Criar e editar usam a MESMA janela
     porque são a mesma coisa; uma tela separada de edição repetiria cada campo
     e divergiria no primeiro ajuste. */
  const abrirLembreteNovo = () => {
    setEditandoFicha(null);
    setFichaTitulo("");
    setFichaDetalhe("");
    setFichaDia(HOJE);
    setFichaHora("");
    setFichaAberta(true);
  };

  /* Clicar num lembrete da lista abre ele pra corrigir — marcar no dia errado é
     o erro mais comum que existe nisso, e sem edição a saída seria concluir e
     refazer. */
  const abrirLembreteEdicao = (t: Task) => {
    setEditandoFicha(t);
    setFichaTitulo(t.titulo);
    setFichaDetalhe(t.detalhe ?? "");
    setFichaDia(t.data);
    setFichaHora(t.hora ?? "");
    setFichaAberta(true);
  };

  const salvarLembreteDaFicha = async () => {
    const titulo = fichaTitulo.trim();
    if (!titulo) return;
    if (!aoVivo) {
      setLembretesMaquete((p) => [...p, {
        id: `lb-${Date.now()}`, tipo: "lembrete", leadId: lead.id, lead: lead.nome,
        titulo, detalhe: fichaDetalhe.trim(), data: fichaDia, hora: fichaHora || null, feita: false,
      }]);
      setFichaTitulo(""); setFichaDetalhe(""); setFichaAberta(false);
      return;
    }
    setSalvandoFicha(true);
    try {
      if (editandoFicha) {
        await atualizarTaskWa(editandoFicha.id, {
          titulo, detalhe: fichaDetalhe, dia: fichaDia, hora: fichaHora || null,
        });
      } else {
        await criarTaskWa({
          conversaId: lead.id,
          titulo,
          detalhe: fichaDetalhe,
          dia: fichaDia,
          hora: fichaHora || null,
          criadoPor: user?.id ?? null,
        });
      }
      invalidarTasks();
      setEditandoFicha(null);
      setFichaAberta(false);
      setFichaTitulo(""); setFichaDetalhe(""); setFichaHora("");
      toast.success(editandoFicha
        ? "Lembrete atualizado."
        : (fichaDia === HOJE ? "Lembrete marcado pra hoje." : `Lembrete marcado pra ${fmtDiaCurto(fichaDia)}.`));
      // O calendário do daily segue o lembrete recém-criado: marcar algo pra
      // quinta e continuar olhando a terça faz parecer que não salvou.
      if (fichaDia !== dia) setDia(fichaDia);
    } catch (e) {
      toast.error("Não consegui marcar: " + (e as Error).message);
    } finally {
      setSalvandoFicha(false);
    }
  };

  /* Limpar depois de salvar não é higiene: sem isso, o próximo lembrete abre
     com a mensagem do anterior já dentro, e basta um clique distraído pra
     agendar de novo o mesmo texto pra outra pessoa. */
  /* PREPARAR É O "ENVIAR" DESTA BARRA.
     Tira a mensagem do campo e a põe na fila do lembrete, com a hora escolhida
     naquele momento — cada preparada carrega a SUA hora, porque a pessoa pode
     querer uma daqui a uma hora e outra amanhã cedo, e o seletor lá embaixo é
     só o valor corrente do campo. */
  const prepararRetida = () => {
    /* O tipo da mensagem é o do PRIMEIRO anexo: é ele que define a rota de
       envio, e é dele que o texto vira legenda. */
    const tipo: TipoRetido = reterAnexos[0] ? tipoDoMime(reterAnexos[0].arquivo.type) : "texto";
    const quando = instanteDe(reterDia, reterHora || null);
    const impedimento = motivoDeNaoAgendar({
      tipo, texto: reterTexto, temArquivo: reterAnexos.length > 0, quando,
    });
    if (impedimento) { toast.error(impedimento); return; }

    setRetidas((p) => [...p, {
      id: `r-${Date.now()}`, texto: reterTexto.trim(), anexos: reterAnexos, quando,
    }]);
    // Só o conteúdo se limpa. Dia e hora ficam: quem prepara duas mensagens
    // pro mesmo horário não deveria escolhê-lo duas vezes.
    setReterTexto("");
    setReterAnexos([]);
  };

  const limparRetencao = () => {
    setReterAberta(false);
    setReterTexto("");
    setReterAnexos([]);
    setReterDia(diaLocal(daquiUmaHora()));
    setReterHora(horaLocal(daquiUmaHora()));
    setRetidas([]);
    setAvisoRetida(false);
  };

  /* PROGRAMAR AS MENSAGENS. Não cria mais lembrete nenhum: desde que os dois se
     separaram, este diálogo só trata do que o CLIENTE recebe. O lembrete tem
     caminho próprio, na ficha do cliente. O nome da função ficou como estava
     porque ela ainda é o "salvar" deste diálogo. */
  const salvarTask = async (ignorarPendente = false) => {
    /* Conteúdo escrito e não preparado segura o salvamento UMA vez. Não é
       teimosia: o texto está a um clique de sumir sem nunca ter existido, e
       quem escreveu acha que já programou. */
    const sobrou = !!reterTexto.trim() || reterAnexos.length > 0;
    if (sobrou && !ignorarPendente) { setAvisoRetida(true); return; }
    setAvisoRetida(false);

    if (retidas.length === 0) { setTaskAberta(false); limparRetencao(); return; }

    if (!aoVivo) {
      toast.info("Na maquete nada é programado de verdade.");
      setTaskAberta(false); limparRetencao();
      return;
    }

    setSalvandoTask(true);
    try {
      let feitas = 0;
      for (const r of retidas) {
        try {
          await reterMensagem({
            conversaId: lead.id,
            taskId: editando?.id ?? null,
            quando: r.quando,
            texto: r.texto,
            anexos: r.anexos,
            criadaPor: user?.id ?? null,
          });
          feitas++;
        } catch (e) {
          toast.error("Uma mensagem não foi programada: " + (e as Error).message);
        }
      }
      if (feitas > 0) {
        invalidarAgendadas();
        toast.success(feitas === 1 ? "Mensagem programada." : `${feitas} mensagens programadas.`);
      }
      setTaskAberta(false);
      limparRetencao();
    } finally {
      setSalvandoTask(false);
    }
  };

  /* ── LIGAR UM NÚMERO NOVO ──
     Três passos numa tela só: nomear, apontar a câmera, esperar conectar. O
     quarto passo — apontar o webhook pra cá com a lista certa de eventos —
     acontece sozinho na criação, porque é o único que quebra em silêncio:
     instância conectada com webhook errado mostra "conectado" no painel e não
     entrega mensagem nenhuma. */
  const abrirConexao = () => {
    setNomeNovaInst("");
    setQr(null);
    setInstConectando(null);
    setPassoConexao("nome");
    setConexaoAberta(true);
  };

  /* O número que já existe foi criado à mão no painel, e a lista de eventos
     dele é o que alguém marcou naquele dia. Aqui ela passa a ser a que este
     código diz — que é o caminho pra descobrir se a presença não chega por
     configuração ou por outro motivo. */
  /* PERGUNTAR EM VEZ DE DEDUZIR. Este botão existe porque eu já errei o
     diagnóstico desta integração duas vezes inferindo de ausência ("não tem
     log, logo não chegou"). Ele lê o webhook que está gravado na Evolution
     para este número e mostra a configuração real — inclusive quais eventos
     estão marcados, que é a coisa que nunca dá pra ver de fora. */
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);

  /* AS TRÊS AÇÕES DE MANUTENÇÃO recebem o número em vez de assumir o principal:
     com a engrenagem aberta num número, "reconfigurar eventos" tem que
     reconfigurar AQUELE, e não o que por acaso está selecionado no topo. */
  const rodarDiagnostico = async (nome = instancia.nome) => {
    setDiagnosticando(true);
    setDiagnostico(null);
    try {
      setDiagnostico(await diagnosticarInstancia(nome));
    } catch (e) {
      toast.error((e as Error).message, { duration: 12_000 });
    } finally {
      setDiagnosticando(false);
    }
  };

  /* REINICIAR O NÚMERO. Diferente de reconfigurar eventos: aquilo reaponta o
     webhook (a porta de ENTRADA), isto levanta a sessão de novo (a de SAÍDA).
     Em 08/09 o problema era só a segunda, e a tela só sabia mexer na primeira —
     por isso o "Reconfigurar e conferir de novo" respondia, com razão, que
     estava tudo certo, enquanto nenhuma mensagem saía. */
  const reiniciarNumero = async (nome = instancia.nome) => {
    setReiniciando(true);
    const t = toast.loading(`Reiniciando ${nome}…`);
    try {
      await reiniciarInstancia(nome);
      toast.success(`${nome} reiniciada.`, {
        id: t,
        description: "A sessão volta em alguns segundos. Mande uma mensagem de teste pra confirmar que saiu.",
        duration: 12_000,
      });
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 12_000 });
    } finally {
      setReiniciando(false);
    }
  };

  const reconfigurarEventos = async (nome = instancia.nome) => {
    try {
      const r = await reaplicarWebhook(nome);
      toast.success(`Eventos reconfigurados em ${nome}.`, {
        description: (r as { eventos?: string[] }).eventos?.join(", "),
        duration: 10_000,
      });
    } catch (e) {
      toast.error((e as Error).message, { duration: 12_000 });
    }
  };

  /* A lista de conversas do aparelho. NÃO traz histórico: o WhatsApp não
     entrega mensagem antiga por API, e fingir que entregou seria pior que a
     caixa vazia. O que vem é quem existe — já dá pra abrir e responder. */
  const importarDoAparelho = async (nome = instancia.nome) => {
    const t = toast.loading(`Lendo as conversas de ${nome}…`);
    try {
      const r = await importarConversas(nome);
      invalidarWa();
      toast.success(
        r.importadas > 0
          ? `${r.importadas} conversa${r.importadas === 1 ? "" : "s"} na caixa.`
          : "Nenhuma conversa nova pra trazer.",
        {
          id: t,
          duration: r.ignoradas ? 15_000 : 6_000,
          // O QUE FICOU DE FORA, E POR QUÊ. "Importei 0 de 14" sem motivo é o
          // mesmo silêncio que já custou dois diagnósticos errados aqui — e o
          // motivo mais comum hoje é o @lid, que não é telefone.
          description: r.ignoradas
            ?? (r.total > r.importadas
              ? `A Evolution listou ${r.total}; conversas já conhecidas ficaram de fora.`
              : "As mensagens antigas não vêm — o WhatsApp não entrega histórico por API."),
        },
      );
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 12_000 });
    }
  };

  /* REGISTRAR, NÃO CRIAR. O número nasce no painel da Evolution — é o fluxo
     que o escritório escolheu manter. Aqui ele só entra na lista deste
     sistema, e o webhook é apontado de quebra: é o passo que falta quando a
     instância nasce pelo painel, e o único que quebra em silêncio. */
  const criarNumero = async () => {
    const nome = nomeNovaInst.trim();
    if (!nome) { toast.error("Digite o nome exato da instância na Evolution."); return; }
    setConectando(true);
    try {
      const r = await registrarInstancia(nome);
      setInstConectando(r.instancia);
      invalidarWa();
      if (r.aviso) toast.warning(r.aviso, { duration: 12_000 });
      if (r.estado === "conectado") {
        setPassoConexao("pronto");
      } else {
        // Existe na Evolution mas não está de pé. O QR resolve sem sair daqui.
        const q = await qrDaInstancia(r.instancia).catch(() => null);
        setQr(q?.qr ?? null);
        setPassoConexao("qr");
      }
    } catch (e) {
      toast.error((e as Error).message, { duration: 12_000 });
    } finally {
      setConectando(false);
    }
  };

  const novoQr = async () => {
    if (!instConectando) return;
    setConectando(true);
    try {
      const r = await qrDaInstancia(instConectando);
      setQr(r.qr ?? null);
      if (!r.qr) toast.info("A Evolution não devolveu QR — talvez já esteja conectada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConectando(false);
    }
  };

  /* Enquanto o QR está na tela, perguntamos a cada 3s se já conectou. O QR do
     WhatsApp expira em menos de um minuto, então saber na hora é a diferença
     entre "pronto" e "por que não funcionou". */
  useEffect(() => {
    if (passoConexao !== "qr" || !instConectando) return;
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const r = await estadoDaInstancia(instConectando);
        if (!vivo) return;
        if (r.estado === "conectado") {
          setPassoConexao("pronto");
          invalidarWa();
        }
      } catch { /* tentar de novo no próximo tique */ }
    }, 3_000);
    return () => { vivo = false; clearInterval(id); };
  }, [passoConexao, instConectando, invalidarWa]);

  /* ── A PLANILHA DA LANDING ──
     O link inteiro serve como entrada: ninguém decora que o id da planilha é o
     pedaço entre /d/ e /edit, e pedir "cole o id" é pedir que a pessoa faça
     manualmente o recorte que o código faz sem errar. */
  const idDaPlanilha = (linkOuId: string): string => {
    const t = linkOuId.trim();
    const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : t;
  };

  /* LER O CABEÇALHO ANTES DE SALVAR.
     A escolha de colunas só existe se a pessoa souber quais são — e quem sabe
     é a planilha. Uma leitura só, na mesma função que lê os leads: se ela
     consegue trazer as linhas, consegue trazer o cabeçalho. */
  const puxarColunas = async () => {
    const planilhaId = idDaPlanilha(novaFonteLink);
    if (!planilhaId) { toast.error("Cole o link da planilha."); return; }
    setLendoColunas(true);
    try {
      const cols = await lerColunas(planilhaId, novaFonteAba);
      setColunasDisponiveis(cols);
      // Nenhuma marcada de saída: marcar tudo faria a escolha virar
      // desmarcação, e é justamente o excesso que a pessoa quer evitar.
      setColunasEscolhidas([]);
      if (cols.length === 0) toast.info("A planilha não tem colunas além do contato.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendoColunas(false);
    }
  };

  /** Marcar/desmarcar preservando a ORDEM em que foram marcadas. */
  const alternarColuna = (c: string) => {
    setColunasEscolhidas((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  };

  const abrirColunasDe = async (f: Fonte) => {
    setColunasDe(f);
    setColunasEscolhidas(f.colunas_exibidas ?? []);
    setColunasDisponiveis(null);
    setLendoColunas(true);
    try {
      setColunasDisponiveis(await lerColunas(f.planilha_id, f.aba));
    } catch (e) {
      toast.error((e as Error).message);
      setColunasDe(null);
    } finally {
      setLendoColunas(false);
    }
  };

  const salvarColunasDaFonte = async () => {
    const f = colunasDe;
    if (!f) return;
    try {
      await salvarColunas(f.id, colunasEscolhidas);
      invalidarLeads();
      setColunasDe(null);
      toast.success("Colunas atualizadas.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const salvarFonte = async () => {
    const planilhaId = idDaPlanilha(novaFonteLink);
    if (!planilhaId) { toast.error("Cole o link da planilha."); return; }
    setSalvandoFonte(true);
    try {
      await criarFonte({
        nome: novaFonteNome.trim() || "Leads da landing",
        planilhaId,
        aba: novaFonteAba,
        instancia: instancia.nome,
        colunas: colunasEscolhidas,
      });
      invalidarLeads();
      setFonteAberta(false);
      setNovaFonteNome(""); setNovaFonteLink(""); setNovaFonteAba("");
      setColunasDisponiveis(null); setColunasEscolhidas([]);
      toast.success("Planilha ligada. Puxe os leads no ícone de atualizar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvandoFonte(false);
    }
  };

  const puxarPlanilha = async (f: Fonte) => {
    setSincronizando(f.id);
    try {
      const r = await sincronizarFonte(f);
      invalidarLeads();
      // O número de linhas IGNORADAS é dito, não escondido: linha com telefone
      // torto some da fila em silêncio, e alguém precisa saber que sumiu pra
      // ir consertar na planilha.
      toast.success(
        `${r.lidos} lead${r.lidos === 1 ? "" : "s"} na planilha · ${r.novos} novo${r.novos === 1 ? "" : "s"}`,
      );
      // O aviso vai num toast separado e mais demorado: ele explica por que a
      // fila pode ter saído menor do que a planilha, e some junto do "deu
      // certo" faria a pessoa ler só a metade boa.
      if (r.aviso) toast.warning(r.aviso, { duration: 12_000 });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSincronizando(null);
    }
  };

  /** O e-mail da conta de serviço que o erro cita — pra dar um botão de copiar. */
  const emailDaConta = (erro: string | null): string | null => {
    const m = String(erro || "").match(/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/);
    return m ? m[0] : null;
  };

  const copiarTexto = async (texto: string, aviso: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success(aviso); }
    catch { toast.error("Não consegui copiar."); }
  };
  const copiarEmail = (e: string) => copiarTexto(e, "E-mail copiado — compartilhe a planilha com ele.");

  /** Como está a leitura dessa base — o pingo ao lado do nome. */
  const saudeDaFonte = (f: Fonte): { cor: string; titulo: string } => {
    if (!f.ultimo_sync) return { cor: "bg-muted-foreground/40", titulo: "Nunca puxou desta planilha" };
    if (f.ultimo_erro) return { cor: "bg-amber-400", titulo: f.ultimo_erro };
    return { cor: "bg-emerald-400", titulo: `Leitura ok — último puxão ${horaDaLista(f.ultimo_sync)}` };
  };

  /* DESLIGAR PASSA A PERGUNTAR ANTES.
     O X ficava do mesmo tamanho do botão de atualizar, a um pixel dele, e
     apagava a base inteira num clique — foi o que aconteceu. Um gesto que
     desfaz semanas de trabalho não pode ter o mesmo custo do gesto que se faz
     dez vezes por dia. */
  const confirmarDesligar = async () => {
    const f = desligando;
    if (!f) return;
    try {
      await desativarFonte(f.id);
      if (baseAberta === f.id) setBaseAberta(null);
      setDesligando(null);
      invalidarLeads();
      toast.success(`${f.nome} desligada. Religar a mesma planilha traz tudo de volta.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* PLANILHA LIGADA JÁ NASCE PUXADA.
     Ligar a fonte e ver uma lista vazia é indistinguível de "não tem ninguém
     aqui" — foi exatamente o que aconteceu na primeira vez. Fonte que nunca
     sincronizou é puxada sozinha ao abrir a tela, uma por vez pra não brigarem
     pelo mesmo indicador; se der erro, o aviso fica no cabeçalho dela e a
     próxima abertura tenta de novo (que é o que se quer depois de compartilhar
     a planilha com a conta de serviço). */
  const jaTentou = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pendentes = fontes.filter((f) => f.ativa && !f.ultimo_sync && !jaTentou.current.has(f.id));
    if (pendentes.length === 0) return;
    let vivo = true;
    (async () => {
      for (const f of pendentes) {
        if (!vivo) return;
        jaTentou.current.add(f.id);
        try { await sincronizarFonte(f); } catch { /* o aviso já foi gravado na fonte */ }
      }
      if (vivo) invalidarLeads();
    })();
    return () => { vivo = false; };
  }, [fontes, invalidarLeads]);

  const abrirAbordagem = (b: LeadBruto) => {
    setAbordar(b);
    setMsgAbordagem("");
  };

  /* Abrir a conversa e (se houver texto) já mandar a primeira mensagem — que é
     o ponto todo: hoje isso custa abrir a planilha, achar a linha, copiar o
     número, colar no WhatsApp e escrever. */
  const abordarLead = async (enviar: boolean) => {
    const b = abordar;
    if (!b) return;
    setAbordando(true);
    try {
      const r = await criarConversa({
        instancia: instancia.nome,
        telefone: b.telefone,
        nome: b.nome ?? null,
      });
      if (enviar && msgAbordagem.trim()) {
        await enviarTexto(r.conversa_id, msgAbordagem.trim());
      }
      await marcarAbordado(b.id, r.conversa_id, user?.id ?? null);
      invalidarLeads();
      invalidarWa();
      setAbordar(null);
      setMsgAbordagem("");
      // Vai junto pra conversa: quem abordou quer ver a resposta chegar, não
      // voltar pra fila e procurar a pessoa de novo.
      setCaixa("inbound");
      setSelecionadoId(r.conversa_id);
      if (r.aviso) toast.warning(r.aviso);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAbordando(false);
    }
  };

  const postarNota = async () => {
    const texto = rascunhoNota.trim();
    if (!texto) return;
    if (!aoVivo) { toast.info("Sem WhatsApp conectado, a anotação não é gravada."); return; }
    setPostandoNota(true);
    try {
      await postarAnotacao(lead.id, texto, user?.id ?? null);
      setRascunhoNota("");
      setNotaAberta(false);
      invalidarAnotacoes();
    } catch (e) {
      toast.error("Não consegui postar: " + (e as Error).message);
    } finally {
      setPostandoNota(false);
    }
  };

  /* APAGAR SEM CONFIRMAÇÃO, e de propósito: uma nota é o que alguém escreveu de
     qualquer jeito sobre o cliente, e não tem consequência nenhuma. Um diálogo
     de "tem certeza?" pra cada linha rabiscada faria pensar duas vezes antes de
     rabiscar — que é o oposto do que essa caixa serve. */
  const tirarNota = (id: string) => {
    apagarAnotacao(id)
      .then(invalidarAnotacoes)
      .catch((e) => toast.error("Não consegui apagar: " + (e as Error).message));
  };

  /**
   * Passa a conversa aberta para outro número.
   *
   * O NÚMERO DE DESTINO ENTRA NA SELEÇÃO junto, e isso não é firula: sem isso a
   * conversa some da tela no segundo seguinte ao clique, e "sumiu" é
   * indistinguível de "deu errado". Somando o destino à caixa, a conversa
   * continua ali, agora com o selo do outro número — que é a confirmação visual
   * de que funcionou.
   */
  const moverConversa = async () => {
    if (!moverPara) return;
    setMovendo(true);
    try {
      await moverConversaDeInstancia(lead.id, moverPara);
      const destino = instancias.find((i) => mesmaInstancia(i.nome, moverPara));
      if (destino && !instanciaIds.includes(destino.id)) {
        guardarSelecao([...instanciaIds, destino.id]);
      }
      invalidarWa();
      setMoverAberto(false);
      toast.success(`Conversa passou para ${nomeDe(moverPara)}.`, {
        description: "O que sair daqui pra frente sai por esse número.",
      });
    } catch (e) {
      const erro = e as Error & { conversaExistente?: string | null };
      if (erro.conversaExistente) {
        /* JÁ EXISTE CONVERSA COM ESSA PESSOA LÁ. Juntar as duas seria a resposta
           bonita e é justamente a que não dá pra dar sozinho: as duas têm
           histórico, etapa e mensagens marcadas próprias, e escolher qual
           sobrevive é decisão de quem atende. O que dá pra fazer é levar até
           ela. */
        const id = erro.conversaExistente;
        toast.error(erro.message, {
          description: "Abra a que já existe e decida o que fazer com as duas.",
          action: {
            label: "Abrir a outra",
            onClick: () => {
              const destino = instancias.find((i) => mesmaInstancia(i.nome, moverPara));
              if (destino && !instanciaIds.includes(destino.id)) {
                guardarSelecao([...instanciaIds, destino.id]);
              }
              setSelecionadoId(id);
              setMoverAberto(false);
            },
          },
          duration: 12_000,
        });
      } else {
        toast.error(erro.message);
      }
    } finally {
      setMovendo(false);
    }
  };

  /* ── ABRIR CONVERSA COM QUEM AINDA NÃO ESCREVEU ──
     Metade do atendimento começa fora do WhatsApp: o lead ligou, deixou o
     número num formulário, veio por indicação. A caixa só conhece quem mandou
     mensagem, e esse "+" é a porta pro resto. */
  const abrirNova = async () => {
    const afere = aferirTelefone(novoTelefone);
    if (!afere.ok) { toast.error(afere.erro ?? "Número inválido"); return; }
    setCriandoConversa(true);
    try {
      const r = await criarConversa({
        instancia: instancia.nome,
        telefone: afere.canonico,
        nome: nomeDaConversaNova(novoNome),
      });
      setSelecionadoId(r.conversa_id);
      invalidarWa();
      setNovaAberta(false);
      setNovoTelefone("");
      setNovoNome("");
      // "Já existia" não é erro nenhum, mas precisa ser dito: senão a pessoa
      // acha que criou uma conversa nova e fica procurando a antiga.
      if (r.ja_existia) toast.info("Vocês já tinham conversa — abri ela.");
      if (r.aviso) toast.warning(r.aviso);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCriandoConversa(false);
    }
  };

  /* ── MANDAR ARQUIVO E ÁUDIO ──
     Os dois caem no mesmo caminho: sobe pro bucket, a wa-enviar assina a URL e
     a Evolution baixa. Quando dá erro, o anexo FICA na barra — apagar o que não
     foi obrigaria a pessoa a procurar o arquivo de novo pra tentar outra vez,
     que é o pior momento pra dar trabalho. */
  const mandarArquivo = async (arquivo: Blob, nome: string, legenda?: string, segundos?: number) => {
    setMandandoAnexo(true);
    try {
      const r = await enviarArquivo({
        conversaId: lead.id, arquivo, nome, legenda, duracao: segundos ?? null,
      });
      setAnexos([]);
      setRascunho("");
      invalidarWa();
      if (r?.aviso) toast.warning(r.aviso);
    } catch (e) {
      toast.error("Não consegui enviar: " + (e as Error).message);
    } finally {
      setMandandoAnexo(false);
    }
  };

  /**
   * Manda a fila inteira de anexos, um atrás do outro.
   *
   * O TEXTO VAI COM O PRIMEIRO, como no WhatsApp: legenda embaixo da primeira
   * imagem e os demais secos atrás. Repetir a legenda em cada um faria o cliente
   * receber o mesmo parágrafo quatro vezes.
   *
   * UM POR VEZ, EM ORDEM. Disparar os quatro em paralelo chegaria mais rápido e
   * embaralhado — e a ordem dos documentos de um caso é justamente o que a
   * pessoa escolheu ao anexar.
   *
   * O CAMPO SÓ ESVAZIA NO FIM, e só do que foi. Limpar antes de saber se saiu
   * apagaria da tela um arquivo que o cliente nunca recebeu.
   */
  const mandarAnexos = async () => {
    const fila = anexos;
    if (fila.length === 0) return;
    const legenda = rascunho.trim() || undefined;

    setMandandoAnexo(true);
    const ficaram: AnexoLocal[] = [];
    try {
      for (const [i, a] of fila.entries()) {
        try {
          const r = await enviarArquivo({
            conversaId: lead.id,
            arquivo: a.arquivo,
            nome: a.arquivo.name,
            legenda: i === 0 ? legenda : undefined,
            duracao: a.duracao ?? null,
          });
          if (r?.aviso) toast.warning(r.aviso);
        } catch (e) {
          /* NÃO DERRUBA A FILA POR UM ARQUIVO. Parar no segundo deixaria o
             terceiro e o quarto na tela sem explicação, e quem olha não teria
             como saber se eles foram ou não. O que falhou continua no campo,
             sozinho, pronto pra tentar de novo. */
          ficaram.push(a);
          toast.error(`Não consegui enviar "${a.arquivo.name}": ${(e as Error).message}`);
        }
      }
      setAnexos(ficaram);
      if (ficaram.length < fila.length) setRascunho("");
      invalidarWa();
    } finally {
      setMandandoAnexo(false);
    }
  };

  /**
   * COLAR UM PRINT VIRA ANEXO.
   *
   * O gesto é o do WhatsApp Web e o de todo lugar onde se conversa: recorta a
   * tela, Ctrl+V, manda. Sem isso, a pessoa que acabou de printar um extrato
   * precisa salvar em Downloads, achar o arquivo no seletor e apagar depois —
   * três passos e um arquivo esquecido no computador, pra mandar uma imagem que
   * já estava na mão.
   *
   * SÓ INTERCEPTA QUANDO HÁ ARQUIVO. Colar texto continua colando texto: quem
   * copiou o número de um processo e colou aqui não pode ver o campo não fazer
   * nada porque a área de transferência também tinha uma imagem antiga.
   */
  const colarEmLista = (
    e: React.ClipboardEvent,
    guardar: React.Dispatch<React.SetStateAction<AnexoLocal[]>>,
  ) => {
    const arquivos = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (arquivos.length === 0) return;

    e.preventDefault();
    guardar((p) => [...p, ...arquivos.map((bruto) => ({
      /* O print chega sem nome próprio: o navegador entrega "image.png" pra
         todos. Um nome com a hora é o que evita três anexos idênticos na mesma
         fila, indistinguíveis na hora de tirar o errado. */
      arquivo: bruto.name && bruto.name !== "image.png"
        ? bruto
        : new File([bruto], `print-${new Date().toLocaleTimeString("pt-BR").replace(/\D/g, "")}.png`,
            { type: bruto.type || "image/png" }),
    }))]);
  };

  const colarNoCampo = (e: React.ClipboardEvent) => colarEmLista(e, setAnexos);

  /**
   * O RELÓGIO DA BARRA: a mesma mensagem, marcada pra depois.
   *
   * Leva o que já está escrito — texto e anexos — pro diálogo da programada, em
   * vez de abrir em branco. Abrir vazio faria a pessoa reescrever o que acabou
   * de escrever, e reescrever é onde o texto muda sem querer.
   */
  const programarDaBarra = () => {
    setEditando(null);
    setTaskTitulo("");
    setTaskDetalhe("");
    setTaskDia(dia);
    setTaskHora("");
    limparRetencao();
    setReterTexto(rascunho);
    setReterAnexos(anexos);
    setReterAberta(true);
    setTaskAberta(true);
    // O campo esvazia: a mensagem MUDOU DE LUGAR, não foi duplicada. Deixá-la
    // nos dois faria alguém programar e mandar a mesma coisa.
    setRascunho("");
    setAnexos([]);
  };

  const enviarAudio = async (audio: Blob, segundos: number) => {
    // A extensão acompanha o que o navegador gravou: Safari entrega mp4/aac e o
    // resto entrega webm/opus. Extensão errada faz o WhatsApp recusar o arquivo
    // sem dizer por quê.
    const ext = audio.type.includes("mp4") ? "m4a" : "webm";
    await mandarArquivo(audio, `audio-${Date.now()}.${ext}`, undefined, segundos);
  };

  const dispararTexto = async (p: Pendente) => {
    try {
      await enviarTexto(p.conversaId, p.texto);
      invalidarWa();
      // NÃO removo aqui: quem tira a bolha é a chegada da linha do banco. Tirar
      // agora abriria uma janela de meio segundo com a mensagem fora da tela.
    } catch (e) {
      const msg = (e as Error).message;
      setPendentes((ps) => marcarFalha(ps, p.id, msg));
      toast.error("Não consegui enviar: " + msg);
    }
  };

  const reenviar = (p: Pendente) => {
    const nova = { ...p, estado: "pendente" as const, erro: undefined };
    setPendentes((ps) => ps.map((x) => (x.id === p.id ? nova : x)));
    void dispararTexto(nova);
  };

  /* "FALHOU" TEM DUAS ORIGENS, e o botão precisa servir às duas.
   *
   * A primeira nunca chegou ao banco: o envio quebrou aqui, a bolha vive na
   * lista de pendentes e o texto está na memória da tela. É a original, e
   * `reenviar` continua sendo o caminho dela.
   *
   * A segunda apareceu em 08/09: a Evolution ACEITOU a mensagem, gravou linha
   * com id do WhatsApp, e só depois mandou `ERROR`. A linha existe no banco,
   * com status "falhou", e não há pendente nenhum pra achar — o `find` voltava
   * `undefined` e o clique não fazia nada. Um botão que não faz nada é pior
   * que nenhum botão: quem clica sai acreditando que reenviou.
   *
   * MÍDIA FICA DE FORA DE PROPÓSITO. O arquivo não está mais na mão da tela, e
   * refazer o caminho pediria baixar do bucket pra subir de novo. O botão some,
   * em vez de existir e falhar calado — que é o defeito que esta tela toda
   * acabou de levar duas horas pra descobrir.
   */
  type MsgQueFalhou = { id?: string | null; midiaPath?: string | null; texto?: string | null };

  const pendenteDaMensagem = (msg: MsgQueFalhou) =>
    pendentesDaAberta.find((x) => x.id === msg.id);

  const podeReenviar = (msg: MsgQueFalhou) =>
    !!pendenteDaMensagem(msg) || (!msg.midiaPath && !!msg.texto?.trim());

  const tentarDeNovo = (msg: MsgQueFalhou) => {
    const p = pendenteDaMensagem(msg);
    if (p) { reenviar(p); return; }

    const texto = msg.texto?.trim();
    if (!texto || msg.midiaPath) return;
    /* Mensagem NOVA, e não a mesma ressuscitada. A linha antiga fica no
       histórico marcada como não entregue — apagá-la esconderia que a primeira
       tentativa existiu, e é ela que explica por que o cliente ficou sem
       resposta por duas horas. */
    const nova = novaPendente(lead.id, texto);
    setPendentes((ps) => [...ps, nova]);
    void dispararTexto(nova);
  };

  const enviar = async () => {
    if (anexos.length > 0) { await mandarAnexos(); return; }
    const texto = rascunho.trim();
    if (!texto) return;
    if (aoVivo) {
      const p = novaPendente(lead.id, texto);
      setPendentes((ps) => [...ps, p]);
      setRascunho("");            // o campo esvazia AGORA
      void dispararTexto(p);
      return;
    }
    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setEnviadas((prev) => ({
      ...prev,
      [lead.id]: [...(prev[lead.id] ?? []), { de: "nos", texto, hora: agora }],
    }));
    setRascunho("");
    /* Responder NÃO precisa marcar follow-up aqui. Quando a cobrança era uma
       conta na memória da tela, esta linha era o único jeito de dizer "já
       falei com ele". Agora a cobrança é linha no banco, e quem a resolve é a
       sincronização: assim que o lead responde, a conversa sai da cadência
       sozinha — e a cobrança aberta é CANCELADA em vez de ficar marcada como
       feita, porque ela não foi feita, deixou de fazer sentido. */
  };

  /* A bancada cancela o respiro que o layout dá a todas as páginas e reaplica
     um menor: numa tela de trabalho, margem larga em volta é espaço que sai da
     conversa. Header do app tem 3,5rem; com py-3 aqui a conta fecha em 5rem. */
  return (
    /* O PROVEDOR DE ÁUDIO ENVOLVE A PÁGINA INTEIRA, e é isso que faz um áudio
       sobreviver à troca de conversa: o elemento vive aqui em cima, onde nada
       o desmonta. Dentro das bolhas ele morreria junto com a conversa que sai
       da tela — que é exatamente o momento em que a pessoa quer continuar
       ouvindo. */
    <ProvedorDeAudio>
    {/* A BANCADA CABE NA JANELA, SEMPRE. Aqui havia um `min-h-[40rem]`, e ele
       era a causa da barra de rolagem: em qualquer janela com menos de 640px
       de área útil — notebook de 768px com as barras do navegador, por exemplo
       — a altura mínima ganhava da altura real e empurrava a página pra baixo.
       O jeito certo é o contrário: a bancada ocupa exatamente o que existe, e
       quem se aperta são as colunas, que já têm rolagem própria. Rolar a
       PÁGINA numa tela de atendimento é o pior dos dois mundos, porque leva
       embora o cabeçalho e o campo de digitar junto. */}
    {/* SEM CONTA DE ALTURA. Aqui havia um `calc(100dvh - 5rem)`, e ele estava
       errado por baixo: a conta cobria o cabeçalho e o respiro, e ignorava as
       áreas seguras do iPhone. Com entalhe em cima e barra de gesto embaixo, a
       bancada ficava uns noventa pixels mais alta que o buraco onde mora — e a
       moldura rolava exatamente essa sobra, levando embora o cartão do número e
       o cabeçalho da conversa.
       Agora a moldura não rola (ver SidebarLayout) e a altura vem dela: `h-full`
       é o buraco inteiro, já descontado de tudo, sem nenhum número escrito à
       mão pra ficar desatualizado no próximo ajuste de layout. */}
    <div className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-4
                    flex-1 min-h-0 overflow-hidden">

      {/* ── UMA FAIXA SÓ NO TOPO ──
          Aqui havia duas: um título "Atendimento" sozinho numa linha larga e,
          logo abaixo, o cartão da instância. Duas bandas empilhadas comem uns
          quarenta e quatro pixels de altura e — pior — deixam a palavra
          flutuando sem se ligar a nada, que foi exatamente a sensação de
          recortado.
          O título saiu porque era a terceira cópia da mesma palavra na mesma
          tela: a barra lateral já marca "Atendimento", a aba ativa também diz
          "Atendimento", e o navegador repete no título. O que sobrou é o que a
          tela realmente precisa dizer: por qual número você está falando.
          As abas vieram morar no cartão, do lado direito, ancoradas no mesmo
          objeto — e o cartão passa a existir nas duas abas, porque a instância
          é o contexto dos dois painéis. */}
      {/* A INSTÂNCIA E AS ABAS SÓ NA PRIMEIRA TELA DO CELULAR.
          Elas respondem "por qual número, e olhando o quê" — perguntas que se
          faz ao CHEGAR, não no meio de uma conversa. Mantê-las fixas roubaria
          duas faixas de altura de uma tela que já é pequena, justamente onde o
          histórico precisa de todo o espaço que houver. */}
      {(!ehMobile || telaMobile === "caixa") && (
      <CardInstancia
        instancia={cartaoDaInstancia}
        todas={instancias}
        maquete={!aoVivo}
        selecao={instanciasDaSelecao}
        apelidos={apelidos}
        corDe={corDe}
        nomeDe={nomeDe}
        onEditarMarca={abrirMarca}
        onTrocar={trocarInstancia}
        onAlternar={alternarInstancia}
        onConectar={abrirConexao}
        onReaplicar={reconfigurarEventos}
        onImportar={importarDoAparelho}
        onDiagnosticar={rodarDiagnostico}
        abas={
          /* No celular as quatro abas não cabem lado a lado sem virar texto
             ilegível, então elas ROLAM de lado — o gesto natural do polegar —
             em vez de encolher até não se ler. */
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5
                          shrink-0 max-w-full overflow-x-auto scrollbar-thin">
            {([["atendimento", "Atendimento", Inbox], ["followup", "Follow-up", Repeat], ["programadas", "Programadas", Clock], ["config", "Ajustes", SlidersHorizontal]] as const).map(([k, rot, Ico]) => (
              <button key={k} onClick={() => { setAba(k); if (ehMobile) setTelaMobile("caixa"); }}
                className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors shrink-0",
                  aba === k ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Ico className="h-3.5 w-3.5" /> {rot}
              </button>
            ))}
          </div>
        }
      />
      )}

      {aba === "followup" ? (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-2">
          {/* ── DE QUAL NÚMERO É A RÉGUA QUE ESTOU EDITANDO ──
              A régua deixou de ser do escritório e passou a ser de cada número,
              então "salvar a régua" virou frase incompleta: a régua de quem?
              Com um número escolhido não há dúvida e a barra some. Com dois, ela
              aparece e OBRIGA a escolher, porque a alternativa é escrever no
              escuro com metade de chance de acertar. */}
          <BarraDaReguaDoNumero
            numeros={instanciasDaSelecao}
            escolhido={numeroDaRegua}
            apelidos={apelidos}
            corDe={corDe}
            nomeDe={nomeDe}
            padraoAtivo={padraoDaRegua}
            onEscolher={setReguaDe}
            onMudarPadrao={mudarPadraoDaRegua} />
          <ModelosDaRegua
            modelos={modelosRegua}
            regua={regua}
            onMudarDia={mudarDegrau}
            onEditar={abrirModelo}
            onAlternar={(r, ativo) => {
              alternarModeloAtivo(numeroDaRegua ?? "", r, ativo)
                .then(invalidarModelos)
                .catch((e) => toast.error((e as Error).message));
            }} />
          <CentralFollowUp
          tasks={lembretes}
          leads={leadsBase}
          hoje={HOJE}
          cadencias={cadencias}
          onConcluir={concluir}
          onAbrirConversa={(id) => { setSelecionadoId(id); setAba("atendimento"); if (ehMobile) setTelaMobile("conversa"); }}
          />
        </div>
      ) : aba === "programadas" ? (
        <CentralProgramadas
          agendadas={agendadas}
          leads={leadsBase}
          onCancelar={cancelarProgramada}
          onAbrirConversa={(id) => { setSelecionadoId(id); setAba("atendimento"); if (ehMobile) setTelaMobile("conversa"); }}
        />
      ) : aba === "config" ? (
        <PainelAjustes
          instancias={instancias}
          instanciaId={instancia.id}
          nomeDe={nomeDe}
          onEscolherInstancia={trocarInstancia}
          mudo={mudo}
          onAlternarMudo={alternarMudo}
          regua={regua}
          agendadas={agendadas}
          aoVivo={aoVivo}
          onAbrirRegua={() => setAba("followup")}
          onAbrirProgramadas={() => setAba("programadas")}
          onReaplicarEventos={reconfigurarEventos}
          onDiagnosticar={rodarDiagnostico}
          onPuxarFotos={puxarFotosQueFaltam}
          puxandoFotos={puxandoFotos}
        />
      ) : (
        <>

          {/* ── a bancada: três painéis, perto mas cada um o seu ──
              Colar tudo numa caixa só apagava a divisão de trabalho: a caixa, a
              conversa e o cliente são três coisas diferentes. Um gap curto
              mantém cada uma como objeto próprio sem espalhar a tela.

              ERAM QUATRO. O Daily — a coluna do dia, com o placar e o filtro de
              tipo — saiu: tudo que ele mostrava passou a ter casa melhor. A
              cobrança do lead está na ficha dele, na hora de escrever; a fila do
              dia inteira está na aba Follow-up; o que vai sair sozinho está na
              aba Programadas. A coluna virou o quarto lugar de olhar as mesmas
              linhas, e o preço dela era largura das outras três. */}
          {/* `min-w-0` e `overflow-hidden` são o que impedem uma coluna teimosa
              de empurrar a largura da página: sem eles, um nome comprido ou uma
              etiqueta larga vazam e a janela ganha barra horizontal. Quem
              aperta é a coluna, nunca a tela. */}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex gap-0 md:gap-2">

            {/* ═══ caixa ═══ */}
            {/* A CAIXA ALARGA QUANDO UMA BASE ABRE.
                Na largura de sempre, o que o lead respondeu na landing cabe em
                quarenta caracteres — e é justamente esse texto que decide como
                abrir a conversa. Com a base aberta a coluna vai a 24rem e as
                respostas passam a caber na própria fila, sem precisar abrir
                cada ficha pra descobrir se vale falar com aquela pessoa. */}
            <SpotlightCard sutil className={cn(
              "flex flex-col min-h-0 p-0 overflow-hidden md:transition-[width] md:duration-200",
              /* No celular a caixa é a tela inteira; no monitor é a primeira de
                 três colunas, com largura própria. */
              "w-full md:shrink-0",
              ehMobile && telaMobile !== "caixa" && "hidden",
              caixa === "base" && baseAberta ? "md:w-[21rem] 2xl:md:w-[24rem]" : "md:w-[13.25rem] 2xl:md:w-[15.5rem]")}>
              <div className="px-2.5 pt-2.5 pb-2 flex flex-col gap-2 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12.5px] font-semibold flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" /> Caixa
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] text-muted-foreground tabular-nums">
                      {caixa === "inbound" ? lista.length : brutosNovos.length}
                    </span>
                    {/* O "+" fica no cabeçalho da caixa, e não perto do campo
                        de digitar, porque o gesto é "arrumar mais um na lista"
                        — não "responder alguém". */}
                    <button type="button"
                      title={caixa === "inbound" ? "Nova conversa" : "Ligar uma planilha"}
                      onClick={() => (caixa === "inbound" ? setNovaAberta(true) : setFonteAberta(true))}
                      className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.10] transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* DUAS CAIXAS, UM CARTÃO SÓ.
                    Inbound é quem escreveu; base é quem deixou o número na
                    landing e nunca chamou. São dois trabalhos diferentes —
                    responder e prospectar — mas a mesma fila de pessoas: quem
                    sai da base entra no inbound assim que recebe a primeira
                    mensagem. Separar em duas telas faria a atendente perder de
                    vista metade do funil enquanto trabalha a outra. */}
                <div className="flex rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] p-[2px]">
                  {([
                    { chave: "inbound" as const, rotulo: "Inbound", n: leadsBase.length },
                    { chave: "base" as const, rotulo: "Base", n: brutosNovos.length },
                  ]).map((t) => (
                    <button key={t.chave} onClick={() => setCaixa(t.chave)}
                      className={cn("flex-1 rounded-md px-2 py-1 text-[10.5px] transition-colors flex items-center justify-center gap-1.5",
                        caixa === t.chave
                          ? "bg-white/[0.10] text-foreground"
                          : "text-muted-foreground hover:text-foreground")}>
                      {t.rotulo}
                      {t.n > 0 && <span className="tabular-nums opacity-60">{t.n}</span>}
                    </button>
                  ))}
                </div>
                {/* O FILTRO SAI DA FRENTE.
                    Eram seis chips de etapa ocupando duas linhas do cabeçalho,
                    todo dia, para um gesto que se faz poucas vezes por hora — e
                    eles empurravam a lista de conversas, que é o que se olha o
                    tempo todo, para baixo. Agora é um ícone: quem filtra clica,
                    quem não filtra ganha duas linhas de fila.

                    O botão CONTA quantos filtros estão ligados e fica aceso
                    quando há algum. Filtro ligado e invisível é a forma mais
                    rápida de alguém concluir que "sumiram conversas". */}
                {caixa === "inbound" && (
                  <div className="flex items-center gap-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className={cn("h-7 shrink-0 flex items-center gap-1.5 rounded-md px-2 text-[11px] ring-1 transition-colors",
                            filtrosLigados > 0
                              ? "bg-primary/15 text-foreground ring-primary/35"
                              : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground")}>
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Filtros
                          {filtrosLigados > 0 && (
                            <span className="tabular-nums rounded-full bg-primary/25 px-1 text-[9.5px]">
                              {filtrosLigados}
                            </span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[15rem] p-2 flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">
                            Por etapa
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {chipsDeEtapa(leadsBase, estagioDe).map((c) => {
                              const n = c.chave === "todos"
                                ? leadsBase.length
                                : leadsBase.filter((l) => estagioDe(l) === c.chave).length;
                              return (
                                <button key={c.chave} onClick={() => setFiltroEtapa(c.chave)}
                                  className={cn("rounded-full px-2 py-[2px] text-[10px] transition-colors ring-1 flex items-center gap-1",
                                    filtroEtapa === c.chave
                                      ? "bg-white/[0.10] text-foreground ring-white/20"
                                      : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                                    // Etapa vazia fica apagada mas CLICÁVEL: sumir
                                    // com ela mudaria a largura da fileira a cada
                                    // mensagem que chega, e o chip que estava no
                                    // lugar A pularia pro B debaixo do dedo.
                                    n === 0 && filtroEtapa !== c.chave && "opacity-45")}>
                                  {c.rotulo}
                                  {n > 0 && <span className="tabular-nums opacity-60">{n}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* OUTROS RECORTES, que não são etapa. Etapa é onde a
                            pessoa está no funil; isto é o estado dela hoje, e
                            os dois se cruzam em vez de competir. */}
                        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
                          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">
                            Outros
                          </p>
                          {([
                            ["followup", "Em follow-up", Repeat],
                            ["semResposta", "Esperando resposta nossa", Inbox],
                          ] as const).map(([k, rot, Ico]) => (
                            <button key={k}
                              onClick={() => setFiltroExtra((v) => (v === k ? null : k))}
                              className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px] transition-colors text-left",
                                filtroExtra === k
                                  ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
                              <Ico className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1">{rot}</span>
                              {filtroExtra === k && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>

                        {/* POR RODADA DA RÉGUA. "Quem está na terceira
                            cobrança" é uma pergunta de trabalho: as mensagens
                            de UP01 e UP05 são opostas, e quem vai escrever um
                            lote quer o lote inteiro na mesma altura da régua. */}
                        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
                          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">
                            Rodada do follow-up
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Array.from({ length: TOTAL_RODADAS }, (_, i) => i + 1).map((r) => {
                              const n = leadsBase.filter((l) => followUpPorLead.get(l.id)?.rodada === r).length;
                              return (
                                <button key={r}
                                  onClick={() => setFiltroRodada((v) => (v === r ? null : r))}
                                  className={cn("rounded-full px-2 py-[2px] text-[10px] tabular-nums transition-colors ring-1 flex items-center gap-1",
                                    filtroRodada === r
                                      ? "bg-violet-400/20 text-violet-200 ring-violet-400/35"
                                      : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                                    n === 0 && filtroRodada !== r && "opacity-45")}>
                                  {rotuloDaRodada(r)}
                                  {n > 0 && <span className="opacity-60">{n}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* POR BASE. De onde a pessoa veio muda a abordagem
                            inteira, e quem trabalha uma campanha trabalha a
                            base dela, não a caixa toda. Só aparecem as bases
                            que TÊM gente na caixa: listar campanha vazia é
                            oferecer um filtro que devolve nada. */}
                        {basesNaCaixa.length > 0 && (
                          <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2.5">
                            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">
                              Base
                            </p>
                            <div className="flex flex-col gap-0.5 max-h-[9rem] overflow-y-auto scrollbar-thin">
                              {basesNaCaixa.map(([nome, n]) => (
                                <button key={nome}
                                  onClick={() => setFiltroBase((v) => (v === nome ? null : nome))}
                                  className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px] transition-colors text-left",
                                    filtroBase === nome
                                      ? "bg-blue-400/15 text-blue-100 ring-1 ring-blue-400/30"
                                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
                                  <Database className="h-3.5 w-3.5 shrink-0" />
                                  <span className="flex-1 truncate">{nome}</span>
                                  <span className="tabular-nums opacity-60 shrink-0">{n}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {filtrosLigados > 0 && (
                          <button
                            onClick={() => { setFiltroEtapa("todos"); setFiltroExtra(null); setFiltroRodada(null); setFiltroBase(null); }}
                            className="text-[11px] text-muted-foreground hover:text-foreground
                                       underline underline-offset-2 self-start">
                            Limpar filtros
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>

                    {/* O QUE ESTÁ LIGADO FICA VISÍVEL FORA DO POPOVER, e some
                        com um clique. Escondido atrás do ícone, um filtro
                        esquecido vira "a caixa está errada". */}
                    {filtroEtapa !== "todos" && (
                      <button onClick={() => setFiltroEtapa("todos")}
                        className="h-7 shrink-0 flex items-center gap-1 rounded-md px-2 text-[10.5px]
                                   bg-white/[0.06] text-foreground ring-1 ring-white/[0.10] hover:bg-white/[0.10] transition-colors">
                        {chipsDeEtapa(leadsBase, estagioDe).find((c) => c.chave === filtroEtapa)?.rotulo}
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    )}
                    {filtroExtra && (
                      <button onClick={() => setFiltroExtra(null)}
                        className="h-7 shrink-0 flex items-center gap-1 rounded-md px-2 text-[10.5px]
                                   bg-violet-400/12 text-violet-300 ring-1 ring-violet-400/25 hover:bg-violet-400/20 transition-colors">
                        {filtroExtra === "followup" ? "Follow-up" : "Sem resposta"}
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    )}
                    {filtroRodada !== null && (
                      <button onClick={() => setFiltroRodada(null)}
                        className="h-7 shrink-0 flex items-center gap-1 rounded-md px-2 text-[10.5px] tabular-nums
                                   bg-violet-400/12 text-violet-300 ring-1 ring-violet-400/25 hover:bg-violet-400/20 transition-colors">
                        {rotuloDaRodada(filtroRodada)}
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    )}
                    {filtroBase && (
                      <button onClick={() => setFiltroBase(null)}
                        title={filtroBase}
                        className="h-7 shrink-0 flex items-center gap-1 rounded-md px-2 text-[10.5px] max-w-[8rem]
                                   bg-blue-400/12 text-blue-200 ring-1 ring-blue-400/25 hover:bg-blue-400/20 transition-colors">
                        <span className="truncate">{filtroBase}</span>
                        <X className="h-3 w-3 opacity-60 shrink-0" />
                      </button>
                    )}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="nome ou telefone" className="h-7 pl-7 text-[12px]" />
                </div>
              </div>

              {caixa === "base" ? (
                /* AS BASES VÊM ANTES DOS CONTATOS.
                   Cada landing é uma base — LP Bradesco, LP concessionárias — e
                   elas não se misturam: a abordagem de quem veio de uma é
                   diferente da de quem veio da outra, e a fila só faz sentido
                   dentro de uma delas. Então a aba abre com a LISTA DE BASES, e
                   uma se expande por vez. */
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                  {fontes.length === 0 ? (
                    <div className="px-3 py-8 text-center flex flex-col items-center gap-2">
                      <Table2 className="h-5 w-5 text-muted-foreground/50" />
                      <p className="text-[11.5px] text-muted-foreground leading-snug">
                        Nenhuma base ligada ainda.
                      </p>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]"
                        onClick={() => setFonteAberta(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Ligar planilha
                      </Button>
                    </div>
                  ) : (
                    <>
                      {fontes.map((f) => {
                        const aberta = baseAberta === f.id;
                        const r = resumoBases[f.id];
                        const mostrandoAntigos = !!verAntigos[f.id];
                        const daBase = brutosVisiveis.filter(
                          (b) => b.fonte_id === f.id && (mostrandoAntigos || contaComoNovo(b)));
                        return (
                          <div key={f.id} className="border-b border-white/[0.06]">
                            {/* O NOME É O BOTÃO, e o sinal à esquerda diz o que
                                o clique faz: + abre, − fecha. Um "v" de seta
                                diria "tem mais coisa"; o par +/− diz que é uma
                                gaveta, e gaveta é o que isto é. */}
                            {/* UMA BASE NÃO É UMA LINHA. São 635 pessoas atrás
                                desse nome; num item de lista fininho ela pesa o
                                mesmo que um contato solto, e o olho passa
                                batido. Duas alturas de texto, o número grande do
                                que espera, e o total logo abaixo — é um bloco,
                                porque é um bloco de trabalho. */}
                            <div className={cn("px-2.5 py-2.5 transition-colors",
                              aberta ? "bg-white/[0.06]" : "bg-white/[0.02] hover:bg-white/[0.04]")}>
                              <div className="flex items-start gap-2">
                                <button type="button"
                                  onClick={() => setBaseAberta(aberta ? null : f.id)}
                                  className="flex items-start gap-2 min-w-0 flex-1 text-left">
                                  {/* O ícone é o de BANCO DE DADOS, e não um
                                      +/−: ele diz o que a linha É, não o que o
                                      clique faz. O que o clique faz já está
                                      dito pelo fundo aceso e pela fila que
                                      aparece embaixo. */}
                                  <span className={cn("h-6 w-6 mt-[1px] shrink-0 rounded-md grid place-items-center ring-1 transition-colors",
                                    aberta
                                      ? "bg-primary/15 text-primary ring-primary/25"
                                      : "bg-white/[0.05] text-muted-foreground ring-white/[0.10]")}>
                                    <Database className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[12.5px] font-medium truncate" title={f.nome}>
                                      {f.nome}
                                    </span>
                                    {/* Um número por linha. Lado a lado, "635 na
                                        base" não cabia junto do selo e quebrava
                                        no meio ("635 na / base") — número
                                        partido em duas linhas deixa de ser
                                        número e vira texto. */}
                                    <span className="flex flex-col items-start gap-1 mt-1">
                                      <span className={cn(
                                        "rounded px-1.5 py-[1px] text-[10px] font-semibold tabular-nums ring-1 whitespace-nowrap",
                                        (r?.novos ?? 0) > 0
                                          ? "bg-primary/15 text-primary ring-primary/25"
                                          : "bg-white/[0.05] text-muted-foreground ring-white/[0.08]")}>
                                        {r?.novos ?? 0} novo{(r?.novos ?? 0) === 1 ? "" : "s"}
                                      </span>
                                      <span className="text-[10px] tabular-nums text-muted-foreground/70 whitespace-nowrap">
                                        {r?.total ?? 0} na base
                                      </span>
                                    </span>
                                  </span>
                                </button>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <div className="flex items-center gap-0.5">
                                    {/* O PINGO DIZ SE A LEITURA ESTÁ DE PÉ.
                                        Verde = último puxão trouxe os leads;
                                        âmbar = trouxe com ressalva (é o texto
                                        logo abaixo); cinza = nunca puxou. Sem
                                        ele, "635 na base" continuaria escrito
                                        igual no dia em que a planilha parar de
                                        responder — o número velho é o disfarce
                                        perfeito pra uma integração quebrada. */}
                                    <span title={saudeDaFonte(f).titulo}
                                      className={cn("h-1.5 w-1.5 rounded-full mr-1 shrink-0",
                                        saudeDaFonte(f).cor,
                                        sincronizando === f.id && "animate-pulse")} />
                                    <button type="button" title="Colunas que aparecem"
                                      onClick={() => abrirColunasDe(f)}
                                      className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.10] transition-colors">
                                      <Columns3 className="h-3 w-3" />
                                    </button>
                                    <button type="button" title="Puxar da planilha"
                                      onClick={() => puxarPlanilha(f)}
                                      disabled={sincronizando === f.id}
                                      className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.10] transition-colors">
                                      <RefreshCw className={cn("h-3 w-3", sincronizando === f.id && "animate-spin")} />
                                    </button>
                                    {/* Separado do atualizar e apagado até o
                                        mouse chegar. A confirmação evita o
                                        estrago, mas o estrago começou na
                                        vizinhança: dois botões colados, um que
                                        se usa dez vezes por dia e outro que
                                        tira a base da tela. */}
                                    <button type="button" title="Desligar base"
                                      onClick={() => setDesligando(f)}
                                      className="h-5 w-5 ml-1.5 rounded-full grid place-items-center text-muted-foreground/40 hover:text-destructive hover:bg-white/[0.10] transition-colors">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <span className="text-[9px] text-muted-foreground/60 whitespace-nowrap">
                                    {sincronizando === f.id ? "puxando…"
                                      : f.ultimo_sync ? horaDaLista(f.ultimo_sync) : "nunca"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* O ERRO FICA NA TELA, NÃO SÓ NO TOAST. Toast some;
                                o motivo de a fila estar vazia não pode. */}
                            {f.ultimo_erro && (
                              <div className="px-2.5 pb-2 pt-0.5">
                                <div className="rounded-md bg-amber-400/10 ring-1 ring-amber-400/25 px-2 py-1.5">
                                  <p className="text-[10px] text-amber-200/90 leading-snug break-words">
                                    {f.ultimo_erro}
                                  </p>
                                  {emailDaConta(f.ultimo_erro) && (
                                    <button type="button"
                                      onClick={() => copiarEmail(emailDaConta(f.ultimo_erro)!)}
                                      className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[9.5px] bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 transition-colors">
                                      <Copy className="h-2.5 w-2.5" /> Copiar e-mail
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {aberta && (daBase.length === 0 ? (
                              <p className="text-[11.5px] text-muted-foreground/70 text-center py-6">
                                {busca.trim() ? "Ninguém com esse nome aqui." : "Ninguém esperando nessa base."}
                              </p>
                            ) : daBase.map((b) => (
                              <Popover key={b.id}
                                open={abordar?.id === b.id}
                                onOpenChange={(a) => { if (!abordando) { if (a) abrirAbordagem(b); else setAbordar(null); } }}>
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-full text-left pl-4 pr-2.5 py-2 border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors flex gap-2 data-[state=open]:bg-white/[0.06]">
                                    <span className="h-7 w-7 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold ring-1 bg-primary/10 text-primary ring-primary/20">
                                      {iniciais(b.nome || telefoneBonito(b.telefone))}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-baseline gap-1.5">
                                        <span className="text-[12px] font-medium truncate flex-1">
                                          {b.nome || telefoneBonito(b.telefone)}
                                        </span>
                                        <span className="text-[9.5px] text-muted-foreground shrink-0">
                                          {horaDaLista(b.chegou_em)}
                                        </span>
                                      </span>
                                      {/* UMA COLUNA POR LINHA, com o rótulo à
                                          esquerda. Emendadas com "·" numa
                                          linha só, o olho tinha que procurar
                                          onde um campo acabava e o outro
                                          começava; em coluna, os rótulos se
                                          alinham e a leitura vira varredura
                                          vertical — que é como se compara um
                                          lead com o de baixo. */}
                                      {(() => {
                                        const f2 = fontes.find((x) => x.id === b.fonte_id);
                                        const campos = dossieExtra(b.bruto, f2?.colunas_exibidas);
                                        if (campos.length === 0) {
                                          return (
                                            <span className="block text-[10.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                                              {resumoDasRespostas(b.respostas, 150) || telefoneBonito(b.telefone)}
                                            </span>
                                          );
                                        }
                                        return (
                                          <span className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-[1px] mt-1">
                                            {campos.slice(0, 5).map((c) => (
                                              <span key={c.rotulo} className="contents">
                                                <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/55 whitespace-nowrap pt-[1px]">
                                                  {c.rotulo}
                                                </span>
                                                <span className="text-[10.5px] text-muted-foreground truncate">
                                                  {c.valor}
                                                </span>
                                              </span>
                                            ))}
                                          </span>
                                        );
                                      })()}
                                      <span className="flex items-center gap-1 mt-1">
                                        <span className="rounded px-1.5 py-[1px] text-[9px] bg-primary/10 text-primary/90 ring-1 ring-primary/20">
                                          Nunca escreveu
                                        </span>
                                        {b.cidade && (
                                          <span className="text-[9px] text-muted-foreground/70 truncate">{b.cidade}</span>
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                </PopoverTrigger>

                                {/* O DOBRO DA LARGURA DA CAIXA (15,5rem → 31rem),
                                    e ao LADO da linha: um modal centralizado faz
                                    a fila sumir atrás dele, e quem prospecta
                                    trabalha a fila em sequência. */}
                                <PopoverContent side="right" align="start" sideOffset={8}
                                  className="w-[31rem] p-0 overflow-hidden">
                                  <FichaDoLead
                                    lead={b}
                                    colunas={f.colunas_exibidas}
                                    mensagem={msgAbordagem}
                                    onMensagem={setMsgAbordagem}
                                    ocupado={abordando}
                                    onCopiar={() => copiarTexto(telefoneBonito(b.telefone), "Número copiado")}
                                    onEnviar={() => abordarLead(true)}
                                    onSoAbrir={() => abordarLead(false)}
                                    onDescartar={async () => {
                                      setAbordar(null);
                                      try { await descartarLead(b.id); invalidarLeads(); }
                                      catch (e) { toast.error((e as Error).message); }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            )))}

                            {/* OS ANTERIORES AO CORTE CONTINUAM ALCANÇÁVEIS.
                                Eles não contam como fila porque já foram
                                trabalhados, mas some-los sem dizer nada seria
                                esconder 612 pessoas — e esta tela já teve esse
                                defeito três vezes. */}
                            {aberta && (r?.antigos ?? 0) > 0 && (
                              <button type="button"
                                onClick={() => setVerAntigos((p) => ({ ...p, [f.id]: !mostrandoAntigos }))}
                                className="w-full px-2.5 py-2 border-t border-white/[0.04] text-[10.5px] text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03] transition-colors text-center">
                                {mostrandoAntigos
                                  ? "esconder os anteriores"
                                  : `mostrar ${r!.antigos} anteriores ao corte (base já trabalhada)`}
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Adicionar outra base fica no FIM da lista, e não no
                          cabeçalho: é o gesto mais raro desta coluna, e no topo
                          ele ficaria do lado do que se faz todo dia. */}
                      <button type="button" onClick={() => setFonteAberta(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/[0.04] transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Adicionar base
                      </button>
                    </>
                  )}
                </div>
              ) : (
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {lista.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">Nenhuma conversa aqui.</p>
                ) : lista.map((l) => {
                  const semResposta = l.ultimaFoi === "lead";
                  const ativo = l.id === lead.id;
                  return (
                    <button key={l.id} onClick={() => abrir(l.id)}
                      className={cn("group w-full text-left px-2.5 py-2 border-b border-white/[0.04] transition-colors flex gap-2 relative",
                        ativo ? "bg-white/[0.07]" : "hover:bg-white/[0.03]",
                        /* MEIO MORTA: a conversa foi repassada e este número só
                           lê. Apagada, e não escondida — o histórico continua
                           aqui, e quem atendeu essa pessoa por três semanas
                           precisa poder reler o que combinou com ela.
                           O `hover` devolve a opacidade: o que está apagado por
                           estado, e não por defeito, tem que reagir ao dedo. */
                        l.podeEscrever === false && !ativo && "opacity-45 hover:opacity-80")}>
                      {ativo && <span className="absolute left-0 inset-y-0 w-[2px] bg-foreground/40" />}

                      {/* SUBIU SOZINHA. A conversa está no alto porque o
                          despachante soltou uma mensagem programada, não porque
                          alguém trabalhou nela — e a diferença importa muito:
                          sem a marca, quem abre a caixa de manhã pode responder
                          a um "oi, tudo bem?" que ele mesmo agendou, achando que
                          o cliente escreveu.
                          Verde e à esquerda, no mesmo lugar da barra da conversa
                          ativa, porque as duas dizem a mesma categoria de coisa:
                          "olha esta linha aqui". A marca some sozinha quando o
                          lead responde — a última mensagem passa a ser dele. */}
                      {l.ultimaAutomatica && !ativo && (
                        <span className="absolute left-0 inset-y-0 w-[2px] bg-emerald-400/80" />
                      )}

                      {/* FIXAR. Aparece no hover, ou o tempo todo se já estiver
                          fixada — um alfinete visível em cada linha da caixa
                          seria ruído em cinquenta linhas para um gesto que se
                          usa em três. Fica no canto oposto ao nome pra não
                          disputar o alvo do clique que abre a conversa. */}
                      <span
                        role="button"
                        tabIndex={-1}
                        title={l.fixadaEm ? "Soltar do topo" : "Fixar no topo"}
                        onClick={(e) => { e.stopPropagation(); alternarFixada(l); }}
                        /* CANTO DE BAIXO. Em cima ele caía debaixo do horário
                           da última mensagem, que fica no mesmo lugar e é
                           informação permanente — o alfinete some atrás dela e
                           o clique pega a hora. Embaixo o canto está livre. */
                        className={cn("absolute bottom-1 right-1 h-6 w-6 grid place-items-center rounded-md z-10 transition-all",
                          l.fixadaEm
                            ? "text-primary opacity-100"
                            : "text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-white/[0.08]")}>
                        <Pin className={cn("h-3.5 w-3.5", l.fixadaEm && "fill-current")} />
                      </span>
                      {/* O PINGO DE ONLINE FICA SOBRE A FOTO, no canto — que é
                          onde todo aplicativo de mensagem põe e onde o olho já
                          procura. Ao lado do nome ele empurrava o texto e fazia
                          a lista dançar de largura conforme as pessoas entravam
                          e saíam. */}
                      {/* `self-start` e `block` são o que segura o pingo NO
                          avatar: sem eles o contêiner relativo estica na altura
                          do cartão inteiro (é um item de flex), e o pingo, que
                          se ancora na borda dele, ia parar lá embaixo, solto,
                          longe da foto. */}
                      <span className="relative shrink-0 self-start block h-7 w-7">
                        <AvatarDoLead
                          foto={fotoDe(l)}
                          tamanho="h-7 w-7 text-[10px]"
                          classe={semResposta ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                                              : "bg-white/[0.05] text-muted-foreground ring-white/10"} />
                        {estaOnline(l.presenca, l.presencaEm) && (
                          <span title="online agora"
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0e1013]" />
                        )}

                        {/* ── DE QUAL NÚMERO É ESTA CONVERSA ──
                            Só na caixa cruzada: com um número só, repetir a
                            mesma sigla em cinquenta linhas é tinta pra dizer o
                            que o cabeçalho já disse.
                            EMBAIXO DA FOTO, meio por cima, como o pingo de
                            online fica em cima — os dois cantos livres do
                            avatar, cada um com uma informação. E é SIGLA, não
                            foto: duas instâncias do mesmo escritório têm a mesma
                            logo, e aí a foto não distingue nada. A cor vem do
                            nome e é sempre a mesma, então em dois dias ela vira
                            o atalho e a sigla vira confirmação. */}
                        {caixaCruzada && l.instancia && (() => {
                          const cor = corDe(l.instancia);
                          return (
                            <span
                              title={`Conversa de ${l.instancia}`}
                              className={cn("absolute -bottom-1 -right-1 rounded px-[3px] py-[1px]",
                                "text-[7.5px] font-bold leading-none tracking-wide ring-2 ring-[#0e1013]",
                                cor.fundo, cor.texto)}>
                              {apelidos.get(l.instancia)
                                ?? [...apelidos.entries()].find(([n]) => mesmaInstancia(n, l.instancia))?.[1]
                                ?? "?"}
                            </span>
                          );
                        })()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[12px] font-medium truncate flex-1">{l.nome}</span>
                          {/* O ROBÔ ANTES DA HORA, e sem círculo em volta. Ele
                              qualifica a última mensagem — "isto subiu sozinho"
                              — e a hora é exatamente o carimbo dessa mensagem;
                              os dois juntos formam uma informação só. Sobre a
                              foto ele disputava espaço com o pingo de online,
                              que fala de outra coisa, e o círculo o fazia
                              parecer um status da PESSOA. */}
                          {/* OS SELOS EMPILHAM, um por cima do outro, quando
                              coincidem. Lado a lado eles roubariam a largura do
                              nome — que é o que se lê primeiro numa lista de
                              cinquenta linhas — e três símbolos numa fileira
                              viram uma tira que ninguém decifra. Empilhados,
                              cada um continua sendo um símbolo. */}
                          {(l.ultimaAutomatica || l.grupoId) && (
                            <span className="shrink-0 flex flex-col items-center gap-[1px]">
                              {l.ultimaAutomatica && (
                                <Bot className="h-3.5 w-3.5 text-emerald-400"
                                  aria-label="a última mensagem saiu por automação" />
                              )}
                              {/* REPASSADA E MUDA: este número entregou a
                                  conversa e ficou só com a leitura. */}
                              {l.grupoId && l.podeEscrever === false && (
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50"
                                  aria-label="repassada para outro número" />
                              )}
                              {/* RECEBIDA: chegou aqui por repasse, e este
                                  número é quem responde. */}
                              {l.grupoId && l.podeEscrever !== false && l.movidaDe && (
                                <ArrowDownLeft className="h-3.5 w-3.5 text-sky-300/80"
                                  aria-label="recebida de outro número" />
                              )}
                            </span>
                          )}
                          <span className="text-[9.5px] text-muted-foreground shrink-0">{l.ultimaHora}</span>
                        </span>
                        {/* DIGITANDO GANHA DA PRÉVIA. Quem está escrevendo agora
                            é notícia mais nova que a última mensagem, e é a
                            informação que muda a decisão de quem lê a fila:
                            espera esse antes de cobrar aquele outro. */}
                        {estaDigitando(l.presenca, l.presencaEm, agoraTique, l.ultimaEm) ? (
                          <span className="flex items-center gap-[3px] h-[15px] mt-0.5">
                            {[0, 150, 300].map((atraso) => (
                              <span key={atraso}
                                style={{ animationDelay: `${atraso}ms` }}
                                className="h-[3px] w-[3px] rounded-full bg-emerald-400 animate-bounce" />
                            ))}
                          </span>
                        ) : (
                          <span className="block text-[10.5px] text-muted-foreground truncate mt-0.5">
                            {semResposta && <AlertTriangle className="inline h-3 w-3 text-amber-300 mr-1 -mt-px" />}
                            {(l.conversa[l.conversa.length - 1]?.texto || l.previa || "").slice(0, 40)}
                          </span>
                        )}
                        {/* AS ETIQUETAS EMPILHADAS, uma por linha.
                            Lado a lado elas competiam pela mesma largura: o
                            nome da base é longo, a etapa é curta, e a fileira
                            quebrava em lugares diferentes de cartão pra cartão
                            — o que fazia a mesma informação aparecer em alturas
                            diferentes e o olho ter que caçá-la. Empilhadas, a
                            etapa está sempre na primeira linha, o inbound
                            sempre na segunda, a base sempre na terceira. */}
                        <span className="flex items-end gap-1 mt-1">
                          <span className="flex flex-col items-start gap-1 min-w-0">
                            <span className="rounded px-1.5 py-[1px] text-[9px] bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
                              {rotuloDaEtapa(l.jornada, estagioDe(l))}
                            </span>
                            <SeloContato origem={l.importada ? undefined : l.origemContato} base={l.base}
                              followUp={followUpPorLead.get(l.id)?.rodada ?? null} />
                          </span>
                          {l.naoLidas > 0 && (
                            <span className="ml-auto shrink-0 h-4 min-w-4 px-1 rounded-full bg-foreground/85 text-[9px] font-semibold text-background grid place-items-center">
                              {l.naoLidas}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </SpotlightCard>

            {semConversas ? (
              /* CAIXA VAZIA DE VERDADE, e não maquete disfarçando.
                 Número novo começa sem conversa: o sistema só conhece quem
                 escreve daqui pra frente. Dizer isso, com os dois caminhos pra
                 sair do zero, vale mais que uma tela cheia de gente que não
                 existe. */
              <SpotlightCard sutil className={cn("flex flex-col min-h-0 p-0 overflow-hidden bg-black/25",
              /* Celular: a conversa é a tela toda, e some quando a pilha está
                 na caixa ou na ficha. Monitor: a coluna elástica do meio. */
              "w-full md:w-auto md:flex-1 md:min-w-[15rem]",
              ehMobile && telaMobile !== "conversa" && "hidden")}>
                <div className="flex-1 grid place-items-center p-8">
                  <div className="max-w-sm text-center flex flex-col items-center gap-3">
                    <span className="h-12 w-12 rounded-full grid place-items-center bg-white/[0.05] ring-1 ring-white/10">
                      <Inbox className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-[14px] font-medium">Nenhuma conversa em {instancia.nome}</p>
                      <p className="text-[12px] text-muted-foreground leading-snug mt-1">
                        {instancia.status === "conectado"
                          ? "O número está conectado. As conversas aparecem aqui assim que alguém escrever — o sistema só conhece quem passa por ele daqui pra frente."
                          : "Esse número está desconectado na Evolution. Enquanto ele estiver fora, nenhuma mensagem chega."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                      <Button size="sm" variant="outline" className="h-8 text-[11.5px]"
                        onClick={() => importarDoAparelho()}>
                        <Inbox className="h-3.5 w-3.5 mr-1.5" /> Trazer conversas do aparelho
                      </Button>
                      <Button size="sm" className="h-8 text-[11.5px]" onClick={() => setNovaAberta(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Começar uma conversa
                      </Button>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground/60 leading-snug mt-1">
                      Trazer do aparelho traz a LISTA de quem já conversa com esse número — não o
                      histórico. O WhatsApp não entrega mensagem antiga por API.
                    </p>
                  </div>
                </div>
              </SpotlightCard>
            ) : (
              <>
            {/* ═══ conversa — só a conversa ═══ */}
            {/* Três profundidades de propósito: a caixa no nível base, a conversa
                REBAIXADA (é a mesa onde os balões pousam, e escurecer o fundo faz
                eles existirem) e o detalhe do cliente OPACO — superfície sólida,
                sem vidro, porque é ficha que se lê. Sem isso os painéis eram a
                mesma superfície repetida e o olho não sabia onde estava. */}
            <SpotlightCard sutil className={cn("flex flex-col min-h-0 p-0 overflow-hidden bg-black/25",
              /* Celular: a conversa é a tela toda, e some quando a pilha está
                 na caixa ou na ficha. Monitor: a coluna elástica do meio. */
              "w-full md:w-auto md:flex-1 md:min-w-[15rem]",
              ehMobile && telaMobile !== "conversa" && "hidden")}>
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center gap-2.5 shrink-0">
                {/* A FOTO E O NOME SÃO O BOTÃO da ficha do cliente. Um alvo
                    grande, no lugar onde o olho já está quando a pergunta é
                    "quem é essa pessoa?" — e não mais um ícone no canto, que
                    ninguém encontra sem procurar. */}
                {/* VOLTAR, só no celular. Na pilha, sair da conversa é um
                    gesto tão frequente quanto entrar nela, e ele precisa estar
                    onde a mão já vai: no canto de cima à esquerda, como em
                    qualquer aplicativo de mensagem. */}
                {ehMobile && (
                  <button onClick={voltarMobile} title="Voltar para a caixa"
                    className="shrink-0 -ml-1.5 h-8 w-8 grid place-items-center rounded-lg
                               text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => (ehMobile ? setTelaMobile("ficha") : setDetalheAberto((v) => !v))}
                  title={ehMobile ? "Ver o detalhe do cliente" : (detalheAberto ? "Esconder o detalhe do cliente" : "Ver o detalhe do cliente")}
                  className="flex items-center gap-2.5 min-w-0 flex-1 -mx-1 px-1 py-0.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors">
                {/* Mesmo lugar do pingo da lista: sobre a foto, no canto. */}
                <span className="relative shrink-0 self-start block h-8 w-8">
                  <AvatarDoLead
                    foto={fotoDe(lead)}
                    tamanho="h-8 w-8 text-[11px]"
                    classe="bg-white/[0.05] ring-white/10" />
                  {estaOnline(presencaViva?.presenca ?? lead.presenca,
                              presencaViva?.presenca_em ?? lead.presencaEm) && (
                    <span title="online agora"
                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0e1013]" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{lead.nome}</p>
                  {/* O QUE ELE ESTÁ FAZENDO AGORA, quando o WhatsApp conta.
                      Quando não conta — e é o caso da maioria, que esconde o
                      status — fica só o telefone. A tela NÃO escreve "offline":
                      ausência de evento é "não sei", e dizer offline seria
                      inventar um fato sobre uma pessoa real. */}
                  {/* NADA DE "ONLINE" NEM DE "DIGITANDO" ESCRITO AQUI.
                      O pingo verde no avatar já diz que está online, e o balão
                      de reticências no fim da conversa já diz que está
                      escrevendo — dizer de novo em palavra é o mesmo recado
                      duas vezes, e é o tipo de repetição que faz o olho parar
                      de ler a linha inteira.
                      Sobra o que NÃO tem outro lugar pra aparecer: o "visto por
                      último", que só faz sentido justamente quando a pessoa não
                      está online. */}
                  {(() => {
                    const sit = situacaoDoContato({
                      presenca: presencaViva?.presenca ?? lead.presenca,
                      presencaEm: presencaViva?.presenca_em ?? lead.presencaEm,
                      vistoEm: presencaViva?.visto_em ?? lead.vistoEm,
                    });
                    const visto = sit && !sit.aoVivo ? sit.texto : null;
                    return (
                      <p className="text-[10.5px] truncate flex items-center gap-1.5 text-muted-foreground">
                        {visto && (
                          <>
                            <span>{visto}</span>
                            <span className="text-muted-foreground/50">·</span>
                          </>
                        )}
                        <span className="truncate">{lead.telefone}</span>
                      </p>
                    );
                  })()}
                </div>

                  {/* O ACUMULADO DAS ETIQUETAS, ESPALHADO PELA BARRA.
                      Coladas no nome elas espremiam os dois: o nome perdia
                      espaço pra truncar e as etiquetas viravam um bloco só,
                      ilegível de tão junto. A barra é larga e estava vazia — o
                      `ml-auto` joga o grupo pro fim do espaço livre, e o `gap`
                      largo separa cada informação da seguinte.
                      São as mesmas etiquetas do cartão da caixa, no mesmo
                      desenho: repetir a forma é o que faz a fila e a conversa
                      serem lidas como a mesma coisa vista de dois lugares. */}
                  <span className="hidden sm:flex items-center gap-3 shrink-0 ml-auto pl-4">
                    <span className="rounded px-1.5 py-[2px] text-[9.5px] bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
                      {rotuloDaEtapa(lead.jornada, estagioDe(lead))}
                    </span>
                    <SeloContato origem={lead.importada ? undefined : lead.origemContato} base={lead.base}
                      followUp={followUpPorLead.get(lead.id)?.rodada ?? null} />
                  </span>

                  {/* UM "i" DE INFORMAÇÃO, e não uma seta de painel. A seta
                      descrevia o mecanismo — que lado abre, que lado fecha —, e
                      quem está atendendo não quer saber de mecanismo: quer
                      saber quem é a pessoa. O "i" diz o CONTEÚDO que está do
                      outro lado do clique. Ele acende quando a ficha está
                      aberta, o que já é estado suficiente. */}
                  <Info className={cn("h-4 w-4 ml-3 shrink-0 transition-colors",
                    detalheAberto ? "text-foreground/70" : "text-muted-foreground/40")} />
                </button>

                {/* ── DEIXAR COMO NÃO LIDA ──
                    Ao lado do "i" porque é ali que fica o que se faz COM a
                    conversa. Ler não é resolver: abre-se para ver do que se
                    trata, descobre-se que vai dar trabalho, e ela precisa
                    continuar pedindo atenção na fila. */}
                {aoVivo && (
                  <button
                    onClick={deixarNaoLida}
                    title="Deixar como não lida"
                    className="ml-2 shrink-0 h-7 w-7 grid place-items-center rounded-lg text-muted-foreground/50
                               hover:text-foreground hover:bg-white/[0.05] transition-colors">
                    <MailOpen className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* O MUDO FICA À MÃO, e isso não é capricho. Quem atende de
                    fone e quem atende numa sala com cliente na frente querem
                    coisas opostas, e a segunda pessoa precisa resolver isso em
                    um clique — não caçando uma tela de configuração. Fica no
                    navegador, não na conta: é preferência da mesa, do momento. */}
                <button
                  onClick={alternarMudo}
                  title={mudo ? "Sons desligados" : "Sons ligados"}
                  className={cn("ml-auto shrink-0 h-7 w-7 grid place-items-center rounded-lg transition-colors",
                    mudo ? "text-muted-foreground/40 hover:text-muted-foreground"
                         : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
                  {mudo ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* DOSSIÊ INCOMPLETO, ANTES DE QUALQUER MENSAGEM. O telefone não
                  está em nenhuma base, então a jornada não sabe qual régua usar.
                  A pergunta fica no caminho do olho, com as respostas a um
                  clique; some assim que alguém responde. */}
              {!lead.baseChave && aoVivo && (
                <div className="px-3 py-1.5 border-b border-white/[0.08] bg-white/[0.03] flex flex-wrap items-center gap-2 shrink-0 text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span className="text-foreground/85">
                    Dossiê incompleto: este número não está em nenhuma base. De onde ele veio?
                  </span>
                  <span className="flex items-center gap-1 ml-auto">
                    {BASES.map((b) => (
                      <button key={b.chave} onClick={() => informarBase(lead, b.chave)}
                        className="rounded-md px-2 py-[3px] text-[10.5px] font-medium ring-1 ring-white/[0.12] bg-white/[0.05] hover:bg-white/[0.10] transition-colors">
                        {b.curto}
                      </button>
                    ))}
                  </span>
                </div>
              )}

              {/* AS TASKS DO LEAD, ANTES DAS MENSAGENS.
                  Elas já existem na coluna da direita e dentro da etapa, mas
                  quem está conversando não olha pros lados — olha pra conversa.
                  A faixa põe o que ficou combinado com ESTA pessoa no caminho
                  do olho, logo abaixo do nome dela, e some quando não há nada. */}
              {(tasksDoCabecalho.length > 0 || anotacoes.length > 0) && (
                <FaixaQueRola className="px-3 py-2 border-b border-white/[0.06] shrink-0">
                  {tasksDoCabecalho.map((t) => {
                    const Ico = t.tipo === "follow_up" ? Repeat : BellRing;
                    return (
                      <div key={t.id}
                        role="button" tabIndex={0}
                        onClick={() => abrirLembrete(t)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirLembrete(t); } }}
                        className={cn("shrink-0 w-[13.5rem] rounded-xl border px-2.5 py-2 flex items-start gap-2",
                          "cursor-pointer transition-colors hover:border-primary/40 hover:bg-white/[0.05]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                          t.feita ? "border-white/[0.05] bg-white/[0.015] opacity-60"
                                  : "border-white/[0.07] bg-white/[0.03]")}>
                        <span className="h-6 w-6 rounded-lg bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
                          <Ico className="h-3 w-3 text-primary" />
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* No follow-up, o DEGRAU no lugar da palavra
                              "Follow-up": qual régua é essa muda o que se
                              escreve, e o rótulo genérico não muda nada. */}
                          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
                            {t.tipo === "follow_up" ? rotuloDoDegrau(t.rodada ?? 1, reguaDaConversa) : ROTULO_TIPO[t.tipo]}
                            {t.data !== dia && (
                              <span className="text-muted-foreground/50 tabular-nums normal-case">
                                · {t.data < dia ? "venceu" : "vence"} {fmtDiaCurto(t.data)}
                              </span>
                            )}
                          </span>
                          <span className={cn("block text-[11.5px] font-medium leading-tight truncate",
                            t.feita && "line-through")}>{t.titulo}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {t.hora && <span className="text-primary font-semibold tabular-nums mr-1">{horaBonita(t.hora)}</span>}
                            {t.detalhe}
                          </span>

                          {/* ── A MENSAGEM PADRÃO, ONDE ELA SERVE ──
                              Escrever a régua e não ter como usá-la é guardar
                              texto num lugar que ninguém abre na hora de
                              cobrar. Este botão traz a mensagem da rodada pro
                              campo de digitar, com o campo aberto e o texto
                              editável: quem cobra continua lendo antes de
                              mandar, que é o ponto de ela não sair sozinha. */}
                          {(() => {
                            if (t.tipo !== "follow_up" || t.feita) return null;
                            const mod = modelosRegua.find(
                              (x) => x.rodada === (t.rodada ?? 1) && x.ativo !== false);
                            if (!mod || !mod.texto) return null;
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRascunho(mod.texto ?? "");
                                  campoResposta.current?.focus();
                                  const anexos = midiasDaLinha(mod).length;
                                  if (anexos > 0) {
                                    toast.info(anexos === 1
                                      ? "Esta rodada tem 1 anexo padrão: anexe pelo clipe antes de mandar."
                                      : `Esta rodada tem ${anexos} anexos padrão: anexe pelo clipe antes de mandar.`);
                                  }
                                }}
                                className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-[2px]
                                           text-[9.5px] bg-violet-400/12 text-violet-200 ring-1 ring-violet-400/25
                                           hover:bg-violet-400/20 transition-colors">
                                <MessageSquareText className="h-2.5 w-2.5" /> Usar a mensagem da rodada
                              </button>
                            );
                          })()}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); concluir(t.id); }}
                          title={t.feita ? "Reabrir" : "Concluir"}
                          className={cn("shrink-0 transition-colors",
                            t.feita ? "text-emerald-400" : "text-muted-foreground/35 hover:text-emerald-400/70")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  {/* ── AS NOTAS, NA MESMA FAIXA ──
                      Mesmo lugar das tasks porque respondem à mesma pergunta no
                      mesmo momento: estou com a conversa aberta, o que eu já sei
                      dessa pessoa? Mas com DESENHO MAIS LEVE, e isso é o
                      conteúdo: sem moldura, sem ícone em quadrado, sem botão de
                      concluir. Uma nota não é trabalho a fazer, é coisa
                      lembrada. Dar a ela a mesma caixa da cobrança faria as duas
                      parecerem igualmente urgentes, e a faixa deixaria de
                      ordenar o olho. */}
                  {anotacoes.slice(0, 4).map((n) => (
                    <div key={n.id}
                      role="button" tabIndex={0}
                      title={n.texto}
                      onClick={() => { setRascunhoNota(""); setNotaAberta(true); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setNotaAberta(true); } }}
                      className="shrink-0 w-[11.5rem] rounded-xl border border-dashed border-white/[0.07]
                                 bg-transparent px-2.5 py-2 cursor-pointer transition-colors
                                 hover:border-white/[0.16] hover:bg-white/[0.025]
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                      <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground/50">
                        <StickyNote className="h-2.5 w-2.5 shrink-0" />
                        <span className="tabular-nums normal-case">{quandoDaNota(n.quando)}</span>
                      </span>
                      <span className="block text-[10.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {n.texto}
                      </span>
                    </div>
                  ))}
                </FaixaQueRola>
              )}

              {/* A CHAVE É A CONVERSA, e isso não é detalhe: ela faz a coluna
                  inteira remontar ao trocar de lead, o que zera o conjunto de
                  bolhas "já vistas". Sem isso, abrir uma conversa faria as
                  trezentas mensagens do histórico expandirem de uma vez. */}
              <div key={lead.id} ref={caixaDaConversa}
                className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-2">
                {/* O que separa "mensagem nova" de "mensagem que já estava
                    aqui" é o conjunto `jaNaTela`, montado depois de cada
                    pintura: o que existe quando a conversa abre entra sem
                    animação, e só o que CHEGA depois expande. É a diferença
                    entre a tela reagir e a tela se exibir. */}
                {conversa.map((msg) => {
                  /* A BOLHA NOVA GANHA A CLASSE, e mais nada muda.
                     "Nova" é a que não estava na tela na pintura anterior —
                     nem a que o React acabou de montar, que é outra coisa: a
                     linha do banco que substitui a bolha otimista MONTA (chave
                     nova pro React em alguns casos) mas não é nova pra quem
                     está olhando, porque o texto já estava ali com o relógio.
                     Por isso a pergunta é feita sobre a CHAVE, e a chave da
                     linha do banco é herdada da pendente que ela confirma. */
                  const nova = !primeiraPintura.current && !jaNaTela.current.has(msg.chave);
                  const passagem = msg.id ? divisoresDeCustodia.porMensagem.get(msg.id) : undefined;
                  return (
                  <React.Fragment key={`f-${msg.chave}`}>
                  {passagem && (
                    <LinhaDeCustodia passagem={passagem}
                      instancia={instancias.find((i) => mesmaInstancia(i.nome, passagem.instancia))}
                      nome={nomeDe(passagem.instancia)} />
                  )}
                  <div
                    key={msg.chave}
                    /* Sem framer aqui. A animação é uma classe CSS que roda uma
                       vez, no nascimento do elemento, e nunca reinicia num
                       re-render — ao contrário de uma animação em JS, que
                       precisa decidir a cada atualização se aquele elemento é
                       novo, e errava essa decisão de quatro maneiras
                       diferentes nesta lista. */
                    className={cn("flex flex-col gap-2", nova && "bolha-entra")}
                    style={{ "--bolha-origem": msg.de === "lead" ? "0% 100%" : "100% 100%" } as React.CSSProperties}>
                    {msg.dia && (
                      <div className="self-center rounded-full px-2.5 py-[2px] text-[10px] text-muted-foreground bg-white/[0.04] ring-1 ring-white/[0.06] my-1">
                        {msg.dia}
                      </div>
                    )}
                    {/* O padding encolhe quando a bolha é só imagem ou vídeo:
                        moldura larga em volta de foto vira porta-retrato, e a
                        foto é o conteúdo, não o enfeite dentro dele. */}
                    <div className={cn("max-w-[70%] rounded-2xl text-[12.5px] leading-snug",
                      msg.midiaPath && (msg.tipo === "imagem" || msg.tipo === "video" || msg.tipo === "sticker")
                        ? "p-1" : "px-3 py-2",
                      msg.de === "lead"
                        ? "self-start bg-white/[0.05] rounded-tl-sm"
                        : "self-end bg-white/[0.08] rounded-tr-sm ring-1 ring-white/[0.10]")}>
                      {msg.midiaPath && (
                        <MidiaMensagem
                          id={msg.id ?? msg.chave}
                          conversaId={lead.id}
                          conversaNome={lead.nome}
                          tipo={msg.tipo ?? null}
                          path={msg.midiaPath}
                          mime={msg.midiaMime ?? null}
                          nome={msg.midiaNome ?? null}
                          duracao={msg.duracao ?? null}
                          nossa={msg.de === "nos"}
                        />
                      )}
                      {/* Legenda de foto é onde mora metade do que o cliente
                          diz — some só quando realmente não veio nada. */}
                      {msg.texto && (
                        <span className={cn("block", msg.midiaPath && "mt-1.5 px-2")}>{msg.texto}</span>
                      )}
                      <span className={cn("flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground/70 mt-1 tabular-nums",
                        msg.midiaPath && "px-2 pb-0.5")}>
                        {msg.hora}
                        {msg.de === "nos" && <VistoDaMensagem status={msg.status} />}
                      </span>

                      {/* A QUE NÃO SAIU CONTINUA NA TELA, com o botão do lado.
                          Sumir com a bolha e mostrar um toast faria o texto
                          morrer junto — quem escreveu teria que lembrar de
                          cabeça o que tinha escrito pra digitar de novo. */}
                      {msg.status === "falhou" && (
                        <span className="flex items-center justify-end gap-2 mt-1">
                          {podeReenviar(msg) && (
                            <button
                              onClick={() => tentarDeNovo(msg)}
                              className="inline-flex items-center gap-1 text-[10px] text-foreground/80 hover:text-foreground underline underline-offset-2">
                              <RotateCcw className="h-3 w-3" /> tentar de novo
                            </button>
                          )}
                          {/* Descartar só existe pra bolha que nunca virou
                              linha: ela mora na memória da tela e sai de lá. A
                              que já está no banco não se descarta por um botão
                              de canto de bolha — some da tela e continua no
                              histórico, que é a pior combinação possível. */}
                          {pendenteDaMensagem(msg) && (
                            <button
                              onClick={() => setPendentes((ps) => remover(ps, String(msg.id)))}
                              className="text-[10px] text-muted-foreground/70 hover:text-foreground">
                              descartar
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                  );
                })}

                {/* A passagem sem mensagem depois dela: repassou e ninguém
                    falou ainda. Fica no fim, que é onde ela está mesmo. */}
                {divisoresDeCustodia.soltas.map((p) => (
                  <LinhaDeCustodia key={p.id} passagem={p}
                    instancia={instancias.find((i) => mesmaInstancia(i.nome, p.instancia))}
                    nome={nomeDe(p.instancia)} />
                ))}

                {/* O BALÃO DE DIGITANDO FICA NO FIM DA CONVERSA, onde a próxima
                    mensagem vai nascer — e não num rótulo no cabeçalho. É onde
                    o olho já está, e é o que ele significa: tem coisa vindo,
                    espera antes de mandar outra.
                    Ele entra e sai com a mesma mola das mensagens, e cresce a
                    partir do canto de baixo à esquerda — de onde o balão do
                    contato nasce. Aparecer instantâneo dava um susco na tela a
                    cada tecla que a pessoa encostava. */}
                {digitandoAgora && (
                  /* Mesma animação das mensagens, e pelo mesmo motivo: uma
                     classe CSS que roda uma vez ao nascer. Sem animação de
                     SAÍDA — este balão fica depois das mensagens e some
                     justamente quando a mensagem chega; animando a saída, ele
                     continuava ocupando espaço enquanto sumia, a conversa
                     descia contando com ele, e a mensagem nova ficava acima do
                     piso até o balão terminar de desaparecer. */
                  <div className="flex flex-col gap-2 bolha-entra"
                    style={{ "--bolha-origem": "0% 100%" } as React.CSSProperties}>
                    <div className="self-start rounded-2xl rounded-tl-sm bg-white/[0.05] px-3 py-2.5">
                      <span className="flex items-center gap-[3px]">
                        {[0, 150, 300].map((atraso) => (
                          <span key={atraso}
                            style={{ animationDelay: `${atraso}ms` }}
                            className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" />
                        ))}
                      </span>
                    </div>
                  </div>
                )}

                {/* ═══ AS MENSAGENS RETIDAS ═══
                    No fim do histórico, no lugar exato em que vão aparecer
                    quando saírem. Isso não é enfeite: sem ver o que já está
                    programado, alguém escreve à mão a mesma coisa e o cliente
                    recebe duas vezes — e o segundo texto chega sem que ninguém
                    tenha decidido mandá-lo.

                    Tracejada e apagada de propósito: ela ainda NÃO é uma
                    mensagem. Uma bolha igual às outras diria que já foi. */}
                {agendadasDaAberta.map((a) => (
                  <div key={a.id}
                    className={cn("self-end max-w-[70%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px] leading-snug",
                      "border border-dashed",
                      a.status === "falhou"
                        ? "border-red-400/40 bg-red-400/[0.06]"
                        : "border-primary/30 bg-primary/[0.05]")}>
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1 text-muted-foreground/80">
                      {a.status === "falhou"
                        ? <><AlertTriangle className="h-3 w-3 text-red-400" /> Não saiu</>
                        : a.status === "enviando"
                          ? <><Loader2 className="h-3 w-3 animate-spin text-primary" /> Enviando</>
                          : <><Clock className="h-3 w-3 text-primary" /> {quandoBonito(a.quando)} · {faltaPara(a.quando)}</>}
                    </p>

                    {a.midia_nome && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate">{a.midia_nome}</span>
                      </p>
                    )}
                    {a.texto && <p className="whitespace-pre-wrap break-words opacity-90">{a.texto}</p>}

                    {a.erro && (
                      <p className="text-[10.5px] text-red-300/80 mt-1 leading-snug">{a.erro}</p>
                    )}

                    {/* CANCELAR SÓ ENQUANTO ESTÁ PENDENTE. Depois que o
                        despachante toma a linha, o WhatsApp já está a caminho e
                        oferecer o botão seria mentir sobre o que ele faz. */}
                    {a.status === "pendente" && (
                      <button
                        onClick={() => cancelarProgramada(a.id)}
                        className="mt-1.5 text-[10.5px] text-muted-foreground/70 hover:text-red-300
                                   underline underline-offset-2 transition-colors">
                        Cancelar envio
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-white/[0.06] shrink-0">
                {/* ── ESTA CONVERSA FOI REPASSADA, E ESTE NÚMERO SÓ LÊ ──
                    No lugar do campo de digitar, e não como um aviso acima
                    dele: campo desabilitado com um recado ao lado é um convite a
                    tentar escrever e descobrir depois. Aqui não há campo, e a
                    frase diz quem está atendendo agora.
                    A porta reabre sozinha se o cliente escrever para ESTE
                    número — ele não sabe que mudamos, e recusar seria deixar
                    uma pessoa falando sozinha com um número mudo. */}
                {lead.podeEscrever === false ? (
                  <div className="px-3 py-3 flex items-start gap-2.5">
                    <span className="h-7 w-7 shrink-0 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08]
                                     grid place-items-center">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-foreground/80">
                        Este atendimento passou para{" "}
                        <span className="text-foreground">
                          {nomeDe(custodia[custodia.length - 1]?.instancia ?? "outro número")}
                        </span>.
                      </span>
                      <span className="block text-[10.5px] text-muted-foreground/70 leading-snug mt-0.5">
                        Por {nomeDe(lead.instancia)} dá pra ler o histórico, não pra responder.
                        Se {lead.nome.split(" ")[0]} escrever para este número, ele volta a
                        aceitar resposta.
                      </span>
                    </span>
                  </div>
                ) : (
                <>
                {/* O anexo escolhido fica VISÍVEL antes de ir. Anexar e mandar
                    no mesmo clique é o jeito de mandar o arquivo errado pro
                    cliente errado, e no WhatsApp não existe desfazer. */}
                {anexos.length > 0 && (
                  <div className="px-3 pt-2.5">
                    <TiraDeAnexos
                      itens={anexos.map((a, i) => ({
                        chave: `${i}-${a.arquivo.name}-${a.arquivo.size}`,
                        nome: a.arquivo.name,
                        mime: a.arquivo.type,
                        arquivo: a.arquivo,
                        onRemover: () => setAnexos((p) => p.filter((_, j) => j !== i)),
                      }))} />
                  </div>
                )}

                {/* ── MENSAGENS RÁPIDAS ──
                    Abre com a barra e fica ACIMA do campo, encostada nele: é
                    uma continuação do que se está digitando, não uma janela.
                    A lista é do escritório inteiro, então a frase melhora com o
                    uso em vez de existir em cinco versões particulares. */}
                {painelAtalhos && !gravando && (
                  <div className="px-3 pt-2.5">
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] overflow-hidden">
                      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-white/[0.06]">
                        <Zap className="h-3 w-3 shrink-0 text-primary" />
                        <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                          Mensagens rápidas
                        </span>
                        {atalhosNaLista.length > 0 && (
                          <span className="hidden sm:block ml-auto text-[9.5px] text-muted-foreground/50">
                            ↑↓ escolher · Enter usar · Esc fechar
                          </span>
                        )}
                      </div>

                      {atalhosNaLista.length > 0 ? (
                        <div className="max-h-[9.5rem] overflow-y-auto scrollbar-thin">
                          {atalhosNaLista.map((a, i) => (
                            <div key={a.id}
                              className={cn("group/atalho flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
                                i === atalhoAtivo ? "bg-primary/[0.10]" : "hover:bg-white/[0.04]")}
                              onMouseEnter={() => setAtalhoIdx(i)}
                              onClick={() => usarAtalho(a)}>
                              <span className={cn("shrink-0 font-mono text-[11px]",
                                i === atalhoAtivo ? "text-primary" : "text-muted-foreground")}>
                                /{a.comando}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/80">
                                {resumoDoAtalho(a)}
                              </span>
                              {(a.midias?.length ?? 0) > 0 && (a.conteudo || "").trim() && (
                                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                              )}
                              {aoVivo && (
                                <button
                                  title="Editar ou apagar"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setAtalhoEdicao({
                                      id: a.id, comando: a.comando, conteudo: a.conteudo,
                                      midias: a.midias ?? [], novos: [],
                                    });
                                  }}
                                  className="shrink-0 opacity-0 group-hover/atalho:opacity-100 text-muted-foreground/60
                                             hover:text-foreground transition-opacity">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-2 text-[11px] text-muted-foreground/70">
                          {atalhos.length === 0
                            ? "Nenhuma mensagem rápida ainda. Crie a primeira e ela fica para todo mundo."
                            : <>Nenhum atalho com <span className="font-mono">/{termoAtalho}</span>.</>}
                        </p>
                      )}

                      {aoVivo && (
                        <button onClick={abrirNovoAtalho}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 border-t border-white/[0.06]
                                     text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/[0.05] transition-colors">
                          <Plus className="h-3 w-3" />
                          Adicionar atalho{termoAtalho ? <span className="font-mono text-primary/80">/{normalizarComando(termoAtalho)}</span> : null}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="px-3 py-2.5 flex items-center gap-1.5">
                  {aoVivo && !gravando && (
                    <>
                      <input
                        ref={seletorArquivo} type="file" className="hidden" multiple
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(e) => {
                          /* SOMA, NÃO TROCA. Escolher vários de uma vez e voltar
                             pra escolher mais são o mesmo gesto no WhatsApp. */
                          const novos = Array.from(e.target.files ?? []).map((arquivo) => ({ arquivo }));
                          setAnexos((p) => [...p, ...novos]);
                          e.target.value = "";
                        }}
                      />
                      <Button size="sm" variant="ghost" title="Anexar arquivos"
                        className="h-9 w-9 p-0 shrink-0" onClick={() => seletorArquivo.current?.click()}>
                        <Paperclip className="h-4 w-4" />
                      </Button>

                      {/* O EMOJI FICA COLADO NO CLIPE, e não do lado do enviar:
                          os dois são "o que entra na mensagem"; o enviar é "o
                          que sai". */}
                      {/* SEM `focus()` no campo. Ele parecia gentileza e era o
                          que fechava a galeria a cada escolha: devolver o foco
                          ao textarea é, pro popover, foco saindo dele. */}
                      <SeletorDeEmoji onEscolher={(e) => setRascunho((t) => t + e)} />

                      {/* MESMO GESTO DA MENSAGEM PROGRAMADA, na barra onde a
                          mensagem é escrita. Ela existia só no botão lá da
                          coluna do dia, longe de onde se está escrevendo — e
                          "isso aqui é melhor mandar às oito" é uma decisão que
                          se toma com o texto na mão, não antes dele.
                          Fantasma de propósito: só um envio é o envio: dar o
                          mesmo peso aos dois faria a pessoa programar quando
                          queria mandar. */}
                      <Button size="sm" variant="ghost" title="Programar esta mensagem para depois"
                        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={programarDaBarra}>
                        <Clock className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {!gravando && (
                    /* ENTER MANDA; Ctrl+Shift+Enter (e Shift+Enter) quebra a
                       linha. Virou Textarea por causa disso: num Input de uma
                       linha só, "quebrar linha" não existe — a tecla não teria
                       o que fazer. Ele cresce até cinco linhas e depois rola,
                       pra um recado longo não empurrar a conversa pra fora da
                       tela enquanto se escreve. */
                    <Textarea
                      ref={campoResposta}
                      value={rascunho}
                      rows={1}
                      onChange={(e) => { setRascunho(e.target.value); setAtalhosOcultos(false); setAtalhoIdx(0); }}
                      onKeyDown={(e) => {
                        /* COM A LISTA DE ATALHOS ABERTA, o teclado é dela: as
                           setas escolhem, o Enter usa (e não manda), o Esc
                           fecha. Sem isto, Enter mandaria "/ext" pro cliente,
                           que é o erro que esta lista existe pra evitar. */
                        if (painelAtalhos) {
                          if (e.key === "Escape") { e.preventDefault(); setAtalhosOcultos(true); return; }
                          if (atalhosNaLista.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setAtalhoIdx((i) => (indiceNaLista(i, atalhosNaLista.length) + 1) % atalhosNaLista.length);
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              const n = atalhosNaLista.length;
                              setAtalhoIdx((i) => (indiceNaLista(i, n) - 1 + n) % n);
                              return;
                            }
                            if ((e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
                              e.preventDefault();
                              usarAtalho(atalhosNaLista[atalhoAtivo]);
                              return;
                            }
                          }
                        }
                        if (e.key !== "Enter") return;
                        if (e.shiftKey || e.ctrlKey || e.metaKey) return;  // deixa quebrar a linha
                        e.preventDefault();
                        enviar();
                      }}
                      onPaste={colarNoCampo}
                      placeholder={anexos.length > 0 ? "Legenda (opcional)…" : `Responder ${lead.nome.split(" ")[0]}…`}
                      className="min-h-9 max-h-[7.5rem] py-[0.45rem] text-[12.5px] resize-none scrollbar-thin"
                    />
                  )}

                  {aoVivo && anexos.length === 0 && (
                    <GravadorDeAudio
                      onEnviar={enviarAudio}
                      onGravandoChange={setGravando}
                      disabled={mandandoAnexo}
                    />
                  )}

                  {!gravando && (
                    <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={enviar}
                      disabled={mandandoAnexo || (!rascunho.trim() && anexos.length === 0)}>
                      {mandandoAnexo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                </>
                )}
              </div>
            </SpotlightCard>

            {/* ═══ detalhe do cliente ═══
                A coluna serve pra DEFINIR ETAPA. O dossiê vem antes porque é a
                referência que se consulta pra decidir a etapa; a jornada vem
                logo abaixo, no mesmo desenho e com as mesmas animações da linha
                do tempo dos processos — inclusive a lógica de abrir a etapa
                corrente, inserir task ali dentro e avançar. */}
            {/* A FICHA DESLIZA, NÃO PISCA. Antes ela aparecia e sumia de uma
                vez, e o corte seco parecia defeito — a conversa dava um salto
                de largura sem nada explicando o movimento.
                A largura é animada por fora e o cartão fica com a largura FIXA
                por dentro: sem isso o conteúdo se reorganizaria a cada quadro,
                o texto dançaria durante toda a abertura e o resultado seria
                pior que o corte seco.
                Some por dois motivos, e os dois são o mesmo princípio: quando
                falta espaço, o que sai é a CONSULTA, nunca a conversa. Abaixo
                de 1280px o espaço acaba sozinho; acima disso, quem decide é
                quem está atendendo. */}
            {/* NO CELULAR A FICHA É UMA TELA, não uma coluna que desliza.
                A animação de largura existe pro monitor, onde a conversa
                encolhe pra dar espaço; no telefone não há o que encolher — a
                ficha simplesmente toma o lugar da conversa, com volta no topo.
                É a MESMA árvore nos dois casos, com o invólucro mudando de
                papel: duplicar o conteúdo faria as duas versões divergirem na
                primeira mudança, e a ficha é a parte da tela que mais muda. */}
            <AnimatePresence initial={false}>
            {(ehMobile ? telaMobile === "ficha" : detalheAberto) && (
            <motion.div
              key="detalhe"
              initial={ehMobile ? false : { width: 0, opacity: 0 }}
              animate={ehMobile ? { opacity: 1 } : { width: larguraFicha, opacity: 1 }}
              exit={ehMobile ? { opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 42, mass: 0.9 }}
              className={cn("min-h-0 overflow-hidden",
                ehMobile ? "w-full" : "hidden xl:block shrink-0")}>
            {/* A largura fica NESTE div e não no cartão: o `SpotlightCard` não
                recebe `style`, e a medida precisa ser a mesma que a animação usa
                lá em cima — foi a divergência entre as duas que abriu a coluna
                de vazio. Aqui elas leem a mesma variável. */}
            <div style={ehMobile ? undefined : { width: larguraFicha }}
              className={cn("h-full", ehMobile && "w-full")}>
            <SpotlightCard sutil className={cn(
              "w-full h-full flex flex-col min-h-0 p-0 overflow-hidden bg-card backdrop-blur-none")}>
              <div className="px-3 py-2 border-b border-white/[0.06] shrink-0 flex items-center gap-2">
                {ehMobile && (
                  <button onClick={voltarMobile} title="Voltar para a conversa"
                    className="shrink-0 -ml-1.5 h-8 w-8 grid place-items-center rounded-lg
                               text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <h2 className="text-[12.5px] font-semibold min-w-0 truncate">
                  {ehMobile ? lead.nome : "Detalhe do cliente"}
                </h2>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {/* ═══ DOSSIÊ ═══
                    Ganhou título quando as seções viraram retráteis: sem ele,
                    era o único bloco sem alça — e um bloco sem alça no meio de
                    seis que fecham parece defeito, não escolha. */}
                <SecaoFicha id="dossie" titulo="Dossiê" aberta={secaoAberta("dossie")} onAlternar={alternarSecao}
                  icone={<ClipboardList className="h-3 w-3 shrink-0" />}>
                <div className="flex flex-col gap-2">
                  {/* A ORIGEM NÃO SE ESCOLHE. Ela responde "quem falou
                      primeiro", e disso o sistema sabe mais que qualquer um:
                      se a primeira mensagem foi dele, ele veio até nós; se
                      saiu daqui, fomos nós até ele. Campo escolhido à mão vira
                      campo em branco — ou, pior, preenchido no chute e depois
                      usado pra decidir onde investir. */}
                  <div className="flex flex-col gap-1 items-start">
                    <span className="text-[9.5px] text-muted-foreground/70">Origem</span>
                    {/* SÓ A ORIGEM AQUI. A etiqueta de follow-up saiu deste
                        bloco porque ela não é origem: origem responde "quem
                        falou primeiro" e nunca muda; follow-up é o estado de
                        hoje e muda toda semana. Juntas, a segunda fazia a
                        primeira parecer variável. Ela tem bloco próprio logo
                        abaixo, onde cabem os números que lhe dão sentido. */}
                    <span className="w-full flex flex-col gap-1 [&>span]:w-full">
                      <SeloContato origem={lead.importada ? undefined : lead.origemContato} base={lead.base}
                        tamanho="grande" />
                    </span>
                  </div>

                  {/* A BASE DECIDE A JORNADA. Detectada pelo telefone na planilha
                      quando dá; quando não dá, o dossiê está incompleto e é o
                      atendente que diz de onde a pessoa veio. Sem isso, a
                      jornada não sabe qual régua usar. */}
                  <BaseDoDossie
                    baseChave={lead.baseChave} baseOrigem={lead.baseOrigem} baseNome={lead.base}
                    jornada={lead.jornada}
                    onInformar={(b) => informarBase(lead, b)} />

                  {/* O RESUMO DO FOLLOW-UP SAIU DAQUI e foi pra seção de
                      follow-up, que é onde ele se explica. Aqui ele era um
                      bloco de três linhas no meio da origem e da data de
                      chegada: três assuntos diferentes um embaixo do outro, e o
                      dossiê deixava de responder a pergunta simples que ele
                      existe pra responder — de onde essa pessoa veio e há
                      quanto tempo ela está aqui. */}
                  {/* DUAS LINHAS, E NÃO UMA. A data e a contagem respondem
                      perguntas diferentes: "quando ela chegou" é registro, se
                      cruza com campanha e com planilha; "há quantos dias está
                      no funil" é diagnóstico, e é o número que decide se um
                      lead está encalhado. Na mesma linha, separadas por um
                      ponto, as duas viravam uma tira só e a segunda — que é a
                      que cobra ação — se perdia no fim dela. */}
                  <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Chegou em"
                    valor={fmtDiaLongo(lead.chegouEm)} />
                  <Campo icone={<Clock className="h-3 w-3" />} rotulo="No funil"
                    valor={diasEntre(lead.chegouEm, HOJE) === 0
                      ? "chegou hoje"
                      : `${diasEntre(lead.chegouEm, HOJE)} ${diasEntre(lead.chegouEm, HOJE) === 1 ? "dia" : "dias"}`} />
                </div>
                </SecaoFicha>

                {/* ═══ O FOLLOW-UP DESTE CLIENTE ═══
                    Bloco próprio, e não uma etiqueta perdida na origem. Aqui o
                    número da rodada finalmente faz sentido, porque vem
                    acompanhado do que o explica: há quanto tempo a pessoa não
                    responde e quanto falta pro próximo toque. Sozinho, "UP03"
                    não diz nada; com os dois números do lado, ele diz o tom da
                    mensagem que precisa ser escrita.

                    QUANDO É HOJE, ELE SOBE — passa na frente da jornada, que é
                    consulta, porque follow-up de hoje é TRABALHO de hoje. A
                    ficha inteira existe pra decidir o que fazer com a pessoa, e
                    o que fazer hoje não pode estar abaixo de uma linha do tempo
                    que ninguém vai mexer agora. */}
                {/* ── FOLLOW-UP, UMA SEÇÃO SÓ E SEMPRE AQUI ──
                    Antes ele aparecia em dois lugares: solto acima da jornada
                    quando vencia hoje, e mais abaixo quando era pra depois. A
                    ideia era boa — o de hoje é trabalho, o de depois é consulta
                    — e o preço era a ficha mudar de forma conforme o dia, com o
                    mesmo bloco ora aqui, ora ali. Numa coluna que agora abre e
                    fecha por seção, isso vira dois lugares pra procurar a mesma
                    coisa.
                    Ficou um só, antes da jornada, e a URGÊNCIA VIRA COR em vez
                    de posição: vencido ou de hoje acende em violeta.
                    Aqui dentro mora tudo que é da régua desta pessoa: em que
                    rodada está, há quanto tempo está calada, quando vence a
                    próxima, e a chave de ligar ou desligar a cobrança. Estavam
                    em três lugares diferentes da mesma coluna. */}
                <SecaoFicha id="followup" titulo="Follow-up" aberta={secaoAberta("followup")}
                  onAlternar={alternarSecao} icone={<Repeat className="h-3 w-3 shrink-0" />}>
                  <div className="flex flex-col gap-3.5">
                    {followUpDoLead && (
                      <ResumoFollowUp task={followUpDoLead} lead={lead} hoje={HOJE} regua={reguaDaConversa} />
                    )}
                    <PainelFollowUpDoLead
                      task={followUpDoLead} feitos={feitosDoLead} lead={lead} hoje={HOJE} regua={reguaDaConversa}
                      semMoldura
                      onAbrir={() => campoResposta.current?.focus()}
                      onConcluir={() => { if (followUpDoLead) concluir(followUpDoLead.id); }} />

                    {/* ── A CHAVE DESTE CONTATO ──
                        Veio do fim da coluna pra cá, junto do que ela decide.
                        Lá embaixo, entre "mover de número" e "finalizar
                        atendimento", ela era uma terceira coisa parecida com as
                        outras duas; aqui ela é a última linha do assunto que já
                        está sendo lido. */}
                    {aoVivo && !lead.atendimentoFinalizadoEm && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                          Cobrança automática
                        </p>
                        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
                          {([[null, "Segue o número"], [true, "Ligado"], [false, "Desligado"]] as const).map(([v, rot]) => {
                            const marcado = (lead.followupAtivo ?? null) === v;
                            return (
                              <button key={String(v)} onClick={() => mudarFollowUpDoLead(v)}
                                className={cn("flex-1 rounded-md px-1.5 py-1.5 text-[10.5px] transition-colors",
                                  marcado
                                    ? v === false ? "bg-white/[0.10] text-foreground"
                                      : v === true ? "bg-emerald-400/15 text-emerald-300"
                                      : "bg-white/[0.09] text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
                                {rot}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10.5px] text-muted-foreground/60 leading-relaxed">
                          {lead.followupAtivo === false
                            ? "Este contato não entra na régua, mesmo que o número cobre todo mundo."
                            : lead.followupAtivo === true
                              ? "Este contato entra na régua, mesmo que o número não cobre ninguém."
                              : padraoDoNumeroDoLead
                                ? "Segue o número: entra na régua sozinho quando ficar sem responder."
                                : "Segue o número: não entra na régua sem ser ligado aqui."}
                        </p>
                      </div>
                    )}
                  </div>
                </SecaoFicha>

                {/* jornada */}
                <SecaoFicha id="jornada" titulo="Jornada" aberta={secaoAberta("jornada")} onAlternar={alternarSecao}
                  icone={<GitBranch className="h-3 w-3 shrink-0" />}>
                  <JornadaLead
                    etapas={etapasDaJornada(lead.jornada)}
                    perdidoMotivo={lead.perdidoMotivo}
                    atual={estagioDe(lead)}
                    puladas={puladasDe(lead)}
                    tasksDoLead={tasksDoLead}
                    log={etapaLog}
                    programadas={agendadasDaAberta}
                    onEscolherEtapa={() => setEtapaAberta(true)}
                    onLevarAoFinder={aoVivo ? abrirEscolhaDoFinder : undefined}
                    onLevarAoWriter={aoVivo ? levarAoWriter : undefined}
                    abrindoWriter={abrindoWriter}
                    docsNaConversa={docsDaConversa.length}
                    onNovaTask={novaProgramada}
                    onConcluirTask={concluir}
                    onAbrirTask={abrirLembrete}
                  />
                </SecaoFicha>

                {/* ── O FOLLOW-UP DESTE CLIENTE ────────────────────────────
                    A central responde "quem eu cobro hoje". Esta janela
                    responde a outra pergunta, feita em outro momento: estou
                    com a conversa aberta, prestes a escrever — em que pé
                    estamos com essa pessoa? Sem isso, quem atende teria que
                    sair da conversa, ir na aba de follow-up e procurar o nome
                    pra descobrir que já insistimos três vezes; e ninguém faz
                    isso, então escreve como se fosse a primeira.

                    O cartão é o mesmo da central e o mesmo da aba Tarefas, de
                    propósito: forma repetida é o que dispensa aprender a ler
                    de novo em cada lugar. */}
                {/* ═══ MARCAR UM LEMBRETE ═══
                    Aqui era o mural de anotações. As duas coisas competiam pelo
                    mesmo espaço e pela mesma pergunta — "o que fica registrado
                    sobre essa pessoa?" — mas só uma delas tem CONSEQUÊNCIA: uma
                    nota fica parada esperando alguém reler, um lembrete aparece
                    no dia marcado e cobra. Numa tela de trabalho, o que tem
                    consequência ganha o lugar.

                    E o lembrete mora na FICHA, e não mais no diálogo junto da
                    mensagem programada, porque são dois gestos com donos
                    diferentes: o lembrete é uma anotação MINHA sobre o que EU
                    faço; a mensagem programada é algo que o CLIENTE recebe. Um
                    diálogo só, com os dois, fazia parecer que um dependia do
                    outro — e fazia quem só queria anotar um recado configurar
                    envio automático sem querer. */}
                <SecaoFicha id="lembretes" titulo="Lembretes" aberta={secaoAberta("lembretes")}
                  onAlternar={alternarSecao} contador={lembretesDoLead.length}
                  icone={<BellRing className="h-3 w-3 shrink-0" />}>
                <div className="flex flex-col gap-2">

                  {/* UM BOTÃO, E NÃO UM FORMULÁRIO ABERTO.
                      Quatro campos esperando texto no meio da ficha pedem para
                      serem preenchidos toda vez que alguém passa o olho — e a
                      ficha é uma tela de CONSULTA, aberta o dia inteiro. O
                      formulário aberto também empurrava o resto da coluna pra
                      baixo por algo que se usa poucas vezes ao dia.
                      O pop resolve os dois: o gesto continua a um clique e o
                      espaço volta pra informação. */}
                  <button
                    onClick={() => abrirLembreteNovo()}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed
                               border-border hover:border-primary/50 hover:bg-primary/[0.04] py-1.5
                               text-[11px] text-muted-foreground hover:text-primary transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Marcar lembrete
                  </button>

                  {/* O QUE JÁ ESTÁ MARCADO PRA ESSA PESSOA, em qualquer dia. A
                      jornada mostra só os do dia que o calendário aponta, e um
                      lembrete pra sexta ficaria invisível numa quarta. */}
                  {lembretesDoLead.map((t) => (
                    <div key={t.id}
                      role="button" tabIndex={0}
                      onClick={() => abrirLembreteEdicao(t)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirLembreteEdicao(t); } }}
                      className="rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] px-2.5 py-2 cursor-pointer
                                 hover:ring-primary/40 hover:bg-white/[0.06] transition-colors">
                      <p className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-wide text-muted-foreground/70">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {fmtDiaCurto(t.data)}
                        {t.hora && <span className="tabular-nums">{horaBonita(t.hora)}</span>}
                      </p>
                      <p className="text-[11.5px] leading-snug mt-0.5 break-words">{t.titulo}</p>
                    </div>
                  ))}
                </div>
                </SecaoFicha>

                {/* ═══ NOTAS ═══
                    O mural voltou, e agora com o lugar certo: DEPOIS dos
                    lembretes. Ele tinha sido tirado porque disputava espaço com
                    o lembrete e perdia — um lembrete tem consequência, aparece
                    no dia e cobra; uma nota fica parada esperando alguém reler.
                    Só que "menos importante" não é "não serve": metade do que se
                    sabe de um cliente não vira tarefa nem mensagem. É o nome da
                    esposa, o horário em que ele atende, o motivo de ter sumido
                    em maio. Sem um lugar pra isso, essa metade some com quem
                    atendeu daquela vez.
                    NADA AQUI DISPARA: não agenda, não cobra, não sai pro
                    cliente. É rascunho sobre a pessoa, e a caixa inteira é
                    desenhada pra deixar escrever de qualquer jeito. */}
                <SecaoFicha id="notas" titulo="Notas" aberta={secaoAberta("notas")}
                  onAlternar={alternarSecao} contador={anotacoes.length}
                  icone={<StickyNote className="h-3 w-3 shrink-0" />}>
                <div className="flex flex-col gap-2">

                  <button
                    onClick={() => { setRascunhoNota(""); setNotaAberta(true); }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed
                               border-border hover:border-primary/50 hover:bg-primary/[0.04] py-1.5
                               text-[11px] text-muted-foreground hover:text-primary transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Escrever nota
                  </button>

                  {anotacoes.map((n) => (
                    <div key={n.id}
                      className="group/nota rounded-lg bg-white/[0.025] ring-1 ring-white/[0.05] px-2.5 py-2">
                      <p className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground/60">
                        <span className="tabular-nums">{quandoDaNota(n.quando)}</span>
                        {n.autorId && <span className="truncate">· {nomeDoAutor({ id: n.autorId })}</span>}
                        <button
                          onClick={() => tirarNota(n.id)}
                          title="Apagar esta nota"
                          className="ml-auto shrink-0 opacity-0 group-hover/nota:opacity-100
                                     text-muted-foreground/50 hover:text-red-300 transition-all">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </p>
                      <p className="text-[11.5px] leading-snug mt-0.5 whitespace-pre-wrap break-words">
                        {n.texto}
                      </p>
                    </div>
                  ))}
                </div>
                </SecaoFicha>

                {/* ═══ AS MENSAGENS PROGRAMADAS DESTA PESSOA ═══
                    A conversa mostra as que estão no fim do histórico; a aba
                    mostra as de todo mundo. Esta responde a pergunta que se faz
                    com a ficha aberta, prestes a escrever: o que já está a
                    caminho pra ela? Sem isso, o risco é escrever à mão o que já
                    vai sair sozinho daqui a uma hora. */}
                {agendadasDaAberta.length > 0 && (
                  <SecaoFicha id="programadas" titulo="Programadas" aberta={secaoAberta("programadas")}
                    onAlternar={alternarSecao} contador={agendadasDaAberta.length}
                    icone={<Clock className="h-3 w-3 shrink-0" />}>
                    <div className="flex flex-col gap-2">
                      {agendadasDaAberta.map((a) => (
                        <CardProgramada key={a.id} a={a} nome={lead.nome}
                          onAbrir={() => campoResposta.current?.focus()}
                          onCancelar={() => cancelarProgramada(a.id)} />
                      ))}
                    </div>
                  </SecaoFicha>
                )}

                {/* ═══ A TRAVA, no fim de tudo ═══
                    Fica por último de propósito: é a última coisa que se faz
                    com um lead, e o gesto que tira ele de toda fila. Perto do
                    topo, viraria um botão que se aperta sem querer no meio de
                    um atendimento vivo.

                    A única saída automática da régua é o lead responder. Esta é
                    a saída HUMANA: cliente que virou processo, pessoa que pediu
                    pra não insistir, caso que morreu por fora do chat. Sem ela
                    o lead fica na fila para sempre, e a métrica de cobrança
                    passa a contar trabalho que ninguém vai fazer.

                    NÃO é o mesmo que a etapa "fechado": aquilo quer dizer VIROU
                    CLIENTE, e muita gente que não fechou também merece parar de
                    ser cobrada. */}
                {/* ═══ PASSAR PRO OUTRO NÚMERO ═══
                    Vizinho do "finalizar" porque são os dois gestos que TIRAM a
                    conversa daqui — um encerra, o outro entrega. Ficam no fim
                    pelo mesmo motivo: não se aperta por engano no meio de um
                    atendimento vivo.
                    O caso é sempre o mesmo: o lead entrou pelo Portal, virou
                    caso do escritório, e daqui pra frente quem fala com ele é o
                    Dr. Matheus, pelo número dele. Até aqui a saída era pedir pro
                    cliente salvar outro número e recomeçar — perdendo o
                    histórico exatamente quando ele passa a valer mais. */}
                {aoVivo && instancias.length > 1 && !lead.atendimentoFinalizadoEm && (
                  <div className="px-3 pt-3 flex flex-col gap-1.5">
                    <button
                      onClick={() => { setMoverPara(null); setMoverAberto(true); }}
                      disabled={semConversas}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px]
                                 ring-1 ring-white/[0.08] bg-white/[0.03] text-muted-foreground
                                 hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-50">
                      <ArrowLeftRight className="h-3.5 w-3.5" /> Mover para outro número
                    </button>
                    {lead.movidaDe && (
                      <p className="text-[10px] text-muted-foreground/60 leading-snug">
                        Veio de <span className="text-foreground/70">{lead.movidaDe}</span>
                        {lead.movidaEm ? ` em ${fmtDiaCurto(lead.movidaEm.slice(0, 10))}` : ""}.
                      </p>
                    )}
                  </div>
                )}

                <div className="px-3 py-3 border-t border-white/[0.06]">
                  {lead.atendimentoFinalizadoEm ? (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-emerald-300/90">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Atendimento finalizado em {fmtDiaLongo(lead.atendimentoFinalizadoEm.slice(0, 10))}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground/60 leading-snug">
                        Fora da régua de follow-up e fora da métrica de cobrança.
                        Se a pessoa voltar a escrever, a conversa continua normal.
                      </p>
                      <button
                        onClick={() => alternarFinalizado(false)}
                        disabled={finalizando}
                        className="self-start text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50">
                        Reabrir atendimento
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => alternarFinalizado(true)}
                      disabled={finalizando || semConversas}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px]
                                 ring-1 ring-white/[0.08] bg-white/[0.03] text-muted-foreground
                                 hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-50">
                      {finalizando
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finalizando…</>
                        : <><CheckCircle2 className="h-3.5 w-3.5" /> Finalizar atendimento</>}
                    </button>
                  )}
                </div>
              </div>
            </SpotlightCard>
            </div>
            </motion.div>
            )}
            </AnimatePresence>

              </>
            )}
          </div>
        </>
      )}

      {/* ── COLUNAS DE UMA BASE JÁ LIGADA ── */}
      <Dialog open={!!colunasDe} onOpenChange={(a) => { if (!a) setColunasDe(null); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Columns3 className="h-4 w-4" /> Colunas de {colunasDe?.nome}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              O que aparece no cartão de cada lead, na ordem em que você marcar.
            </DialogDescription>
          </DialogHeader>

          {lendoColunas ? (
            <p className="text-[12px] text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a planilha…
            </p>
          ) : (
            <SeletorDeColunas
              disponiveis={colunasDisponiveis ?? []}
              escolhidas={colunasEscolhidas}
              onAlternar={alternarColuna}
            />
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setColunasDe(null)}>Cancelar</Button>
            <Button size="sm" onClick={salvarColunasDaFonte} disabled={lendoColunas}>
              Salvar <Check className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── POR QUE NÃO CHEGA MENSAGEM ──
          A tela mostra a configuração que a Evolution TEM, não a que deveria
          ter, e traduz cada divergência em uma frase com conserto junto.
          Existe porque este mesmo sintoma já me levou a inferir de ausência
          duas vezes — e as duas vezes a causa era outra. */}
      <Dialog open={diagnosticando || !!diagnostico} onOpenChange={(a) => { if (!a) setDiagnostico(null); }}>
        <DialogContent className="max-w-lg [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> {instancia.nome}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {diagnosticando
                ? "Perguntando pra Evolution o que ela tem configurado…"
                : diagnostico
                  ? resumoDoDiagnostico(acharProblemas(diagnostico))
                  : ""}
            </DialogDescription>
          </DialogHeader>

          {diagnosticando && (
            <div className="py-6 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {diagnostico && (
            <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
              {acharProblemas(diagnostico).map((a, i) => (
                <div key={i}
                  className={cn("rounded-lg border p-2.5",
                    a.nivel === "erro" ? "border-amber-400/25 bg-amber-400/[0.06]"
                      : a.nivel === "alerta" ? "border-sky-400/25 bg-sky-400/[0.06]"
                        : "border-white/[0.08] bg-white/[0.03]")}>
                  <p className="text-[12.5px] font-medium leading-snug">{a.titulo}</p>
                  <p className="text-[11.5px] text-muted-foreground leading-snug mt-1">{a.conserto}</p>
                </div>
              ))}

              {/* O CRU, embaixo. Quem já sabe o que procura não deveria ter que
                  confiar na minha tradução — e quando a tradução estiver
                  errada, é isto aqui que mostra. */}
              <details className="mt-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
                  O que a Evolution respondeu
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-muted-foreground">estado</dt>
                  <dd className="truncate">{diagnostico.estado}</dd>
                  <dt className="text-muted-foreground">webhook</dt>
                  <dd className="break-all">{diagnostico.webhook?.url || diagnostico.erroWebhook || "sem webhook configurado"}</dd>
                  <dt className="text-muted-foreground">eventos</dt>
                  <dd className="break-words">{diagnostico.webhook?.eventos.join(", ") || "nenhum marcado"}</dd>
                  <dt className="text-muted-foreground">conversas</dt>
                  <dd className="tabular-nums">{diagnostico.conversas}</dd>
                  <dt className="text-muted-foreground">últimos eventos</dt>
                  <dd className="break-words">
                    {diagnostico.recebidos.length === 0
                      ? "nenhum"
                      : diagnostico.recebidos.map((r) => r.evento).join(", ")}
                  </dd>
                </dl>
                <p className="mt-2 text-[10.5px] text-muted-foreground/70 leading-snug">
                  “Últimos eventos” inclui tudo que entra por esta porta, mensagem nova junto. Então
                  “messages.upsert” aparecer aqui e a conversa não existir significa que o defeito é
                  nosso; não aparecer significa que a Evolution não mandou.
                </p>
              </details>
            </div>
          )}

          {/* CONFIGURAÇÃO CERTA E MENSAGEM QUE NÃO SAI SÃO COISAS DIFERENTES.
              Este diálogo responde sobre a porta de ENTRADA — webhook, URL,
              token — e responde bem. Em 08/09 ele disse "está tudo certo", e
              estava: o que tinha quebrado era a sessão de SAÍDA, do lado da
              Evolution. Quem lia a tela ficava sem próximo passo, porque o
              único botão aqui reconfigurava justamente a metade que estava boa.
              A frase abaixo existe pra separar as duas perguntas antes que
              alguém passe uma tarde reconfigurando o que não está quebrado. */}
          <p className="text-[10.5px] text-muted-foreground/70 leading-snug border-t border-white/[0.06] pt-3">
            Isto confere o que <strong>chega</strong>. Se o problema é mensagem que <strong>não sai</strong> —
            fica no relógio ou vira triângulo de falha —, a configuração pode estar certa e ainda assim
            nada sair: aí o conserto é reiniciar o número, que levanta a sessão sem desfazer o pareamento.
          </p>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-[12px]"
              onClick={() => setDiagnostico(null)}>Fechar</Button>
            <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5"
              disabled={reiniciando}
              onClick={() => reiniciarNumero()}>
              <RotateCcw className="h-3.5 w-3.5" /> {reiniciando ? "Reiniciando…" : "Reiniciar o número"}
            </Button>
            <Button size="sm" className="h-8 text-[12px] gap-1.5"
              disabled={diagnosticando}
              onClick={async () => { await reconfigurarEventos(); await rodarDiagnostico(); }}>
              <RefreshCw className="h-3.5 w-3.5" /> Reconfigurar e conferir de novo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DESLIGAR UMA BASE ──
          A pergunta diz o TAMANHO do que sai da tela (quantos leads, quantos
          já foram abordados) e que dá pra voltar. Sem esse número, "desligar a
          base?" soa como fechar uma aba; com ele, soa como o que é. */}
      <Dialog open={!!desligando} onOpenChange={(a) => { if (!a) setDesligando(null); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Database className="h-4 w-4" /> Desligar {desligando?.nome}?
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {(() => {
                const r = desligando ? resumoBases[desligando.id] : undefined;
                const total = r?.total ?? 0;
                const novos = r?.novos ?? 0;
                return total > 0
                  ? `${total} lead${total === 1 ? "" : "s"} saem da caixa${novos > 0 ? `, ${novos} deles esperando abordagem` : ""}.`
                  : "Essa base ainda não tinha leads na caixa.";
              })()}
            </DialogDescription>
          </DialogHeader>

          <p className="text-[11.5px] text-muted-foreground/80 leading-snug">
            Nada é apagado: a planilha continua sendo a dona dos dados, e religar a mesma
            planilha traz a base de volta com o registro de quem já foi abordado.
          </p>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDesligando(null)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={confirmarDesligar}>
              Desligar base
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONECTAR UM NÚMERO ── */}
      <Dialog open={conexaoAberta} onOpenChange={(a) => { if (!conectando) setConexaoAberta(a); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> Adicionar número
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {passoConexao === "nome" && "O número já precisa existir na Evolution. Digite o nome EXATO da instância lá."}
              {passoConexao === "qr" && "No celular: WhatsApp → Aparelhos conectados → Conectar aparelho."}
              {passoConexao === "pronto" && "Pronto. As mensagens desse número já entram na caixa."}
            </DialogDescription>
          </DialogHeader>

          {passoConexao === "nome" && (
            <div className="flex flex-col gap-3">
              <Input
                autoFocus value={nomeNovaInst}
                onChange={(e) => setNomeNovaInst(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarNumero(); } }}
                placeholder="PORTAL DIREITO ABERTO 2"
                className="h-9 text-[13px]" />
              <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
                Só aparecem aqui os números que você adicionar: o servidor da Evolution é
                compartilhado com outros projetos, e existir lá não pode significar existir
                aqui. Ao adicionar, o webhook é apontado pra cá com os eventos certos — o
                passo que costuma ser esquecido, e sem o qual o número fica conectado sem
                entregar mensagem nenhuma.
              </p>
            </div>
          )}

          {passoConexao === "qr" && (
            <div className="flex flex-col items-center gap-3">
              {/* Fundo branco atrás do QR: câmera não lê código escuro, e num
                  tema escuro é exatamente isso que ele vira. */}
              {qr ? (
                <div className="rounded-xl bg-white p-3">
                  <img src={qr} alt="QR code para conectar o WhatsApp" className="h-52 w-52" />
                </div>
              ) : (
                <div className="h-52 w-52 rounded-xl bg-white/[0.05] grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> esperando você apontar a câmera…
              </p>
              <Button variant="outline" size="sm" className="h-7 text-[11px]"
                onClick={novoQr} disabled={conectando}>
                <RefreshCw className={cn("h-3 w-3 mr-1.5", conectando && "animate-spin")} /> Gerar outro QR
              </Button>
              <p className="text-[10px] text-muted-foreground/60 text-center leading-snug">
                O QR do WhatsApp expira em menos de um minuto. Se demorar, gere outro.
              </p>
            </div>
          )}

          {passoConexao === "pronto" && (
            <div className="flex flex-col items-center gap-2 py-4">
              <span className="h-11 w-11 rounded-full grid place-items-center bg-sky-400/12 text-sky-300 ring-1 ring-sky-400/25">
                <Check className="h-5 w-5" />
              </span>
              <p className="text-[13px] font-medium">{instConectando} conectado</p>
              <p className="text-[11.5px] text-muted-foreground text-center leading-snug">
                Ele já aparece no seletor de instâncias, com o webhook apontado pra cá.
              </p>
            </div>
          )}

          <DialogFooter>
            {passoConexao === "nome" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConexaoAberta(false)} disabled={conectando}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={criarNumero} disabled={conectando || !nomeNovaInst.trim()}>
                  {conectando
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Procurando…</>
                    : <>Adicionar <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>}
                </Button>
              </>
            )}
            {passoConexao === "qr" && (
              <Button variant="ghost" size="sm" onClick={() => setConexaoAberta(false)}>
                Fecho depois
              </Button>
            )}
            {passoConexao === "pronto" && (
              <Button size="sm" onClick={() => {
                setConexaoAberta(false);
                /* `trocarInstancia` e não `setInstanciaId`: quem acabou de
                   conectar um número quer trabalhar nele, e abrir amanhã no
                   antigo desfaz calado o que a pessoa acabou de fazer. */
                if (instConectando) trocarInstancia(instConectando);
              }}>
                Abrir esse número <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── LIGAR UMA PLANILHA ── */}
      <Dialog open={fonteAberta} onOpenChange={(a) => { if (!salvandoFonte) setFonteAberta(a); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Table2 className="h-4 w-4" /> Ligar planilha da landing
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Os leads dela entram na aba <span className="text-foreground/80">Base</span> de{" "}
              <span className="text-foreground/80">{instancia.nome}</span>. A planilha continua sendo
              a dona dos dados — o sistema só guarda quem já foi abordado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Link da planilha</span>
              <Input value={novaFonteLink} onChange={(e) => setNovaFonteLink(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="h-9 text-[12px]" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Apelido</span>
                <Input value={novaFonteNome} onChange={(e) => setNovaFonteNome(e.target.value)}
                  placeholder="LP Bradesco" className="h-9 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Aba <span className="opacity-60">(opcional)</span></span>
                <Input value={novaFonteAba} onChange={(e) => setNovaFonteAba(e.target.value)}
                  placeholder="Leads" className="h-9 text-[13px]" />
              </label>
            </div>
            {/* AS COLUNAS QUE VÃO APARECER NA FILA.
                Nem tudo que a landing pergunta ajuda a abrir a conversa: SCORE
                diz algo pro marketing, DESCONTOS diz o que escrever. Escolher
                aqui evita que o cartão do lead vire despejo de planilha — e
                escolher POR MIM seria adivinhar qual metade importa. */}
            {colunasDisponiveis === null ? (
              <Button variant="outline" size="sm" className="h-8 text-[11.5px]"
                onClick={puxarColunas} disabled={lendoColunas || !novaFonteLink.trim()}>
                {lendoColunas
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Lendo a planilha…</>
                  : <><Columns3 className="h-3.5 w-3.5 mr-1.5" /> Escolher colunas</>}
              </Button>
            ) : (
              <SeletorDeColunas
                disponiveis={colunasDisponiveis}
                escolhidas={colunasEscolhidas}
                onAlternar={alternarColuna}
              />
            )}

            <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
              A planilha precisa estar compartilhada com a conta de serviço do sistema (a mesma do
              Drive). Se não estiver, o erro ao puxar diz o e-mail exato pra compartilhar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setFonteAberta(false)} disabled={salvandoFonte}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarFonte} disabled={salvandoFonte || !novaFonteLink.trim()}>
              {salvandoFonte
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Ligando…</>
                : <>Ligar <Check className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ESCOLHER A ETAPA ──
          Antes cada etapa à frente tinha seu próprio "pular pra cá" de dez
          pixels, cinco vezes na mesma coluna: o clique errado era do mesmo
          tamanho do certo, e ninguém via o estrago antes de fazer. Aqui a
          escolha é uma lista, e o que vai virar PULADA aparece escrito antes
          de virar. */}
      <Dialog open={etapaAberta} onOpenChange={(o) => { setEtapaAberta(o); if (!o) setPerdendo(false); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> {perdendo ? "Por que saiu do funil?" : "Mover etapa"}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              <span className="text-foreground/80">{lead.nome}</span> está em{" "}
              <span className="text-foreground/80">
                {rotuloDaEtapa(lead.jornada, estagioDe(lead))}
              </span>.
            </DialogDescription>
          </DialogHeader>

          {/* PERDIDO PERGUNTA O MOTIVO, e só ele. É a informação que, somada,
              diz onde o funil vaza: "não respondeu" e "sem desconto" pedem
              remédios diferentes, e sem o motivo os dois viram o mesmo número. */}
          {perdendo ? (
            <div className="flex flex-col gap-1.5">
              {MOTIVOS_PERDIDO.map((m) => (
                <button key={m} onClick={() => perderLead(lead, m)}
                  className="text-left rounded-lg px-3 py-2 ring-1 transition-colors bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.07] hover:ring-white/[0.14]">
                  <span className="text-[12.5px] font-medium">{m}</span>
                </button>
              ))}
              <button onClick={() => setPerdendo(false)}
                className="mt-1 self-start text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Voltar às etapas
              </button>
            </div>
          ) : (
          <div className="flex flex-col gap-1.5">
            {etapasDaJornada(lead.jornada).map((e, i) => {
              const ETS = etapasDaJornada(lead.jornada);
              const iAtual = ETS.findIndex((x) => x.chave === estagioDe(lead));
              const eAtual = e.chave === estagioDe(lead);
              const puladas = e.terminal ? 0 : (i > iAtual + 1 ? i - iAtual - 1 : 0);
              return (
                <button
                  key={e.chave}
                  disabled={eAtual}
                  onClick={() => {
                    if (e.terminal) { setPerdendo(true); return; }
                    avancarEtapa(lead, e.chave); setEtapaAberta(false);
                  }}
                  className={cn(
                    "text-left rounded-lg px-3 py-2 ring-1 transition-colors",
                    eAtual
                      ? "bg-primary/10 ring-primary/25 cursor-default"
                      : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.07] hover:ring-white/[0.14]")}>
                  <span className="flex items-center gap-2">
                    <span className={cn("text-[12.5px] font-medium", eAtual && "text-primary")}>{e.rotulo}</span>
                    {eAtual && <span className="text-[9.5px] text-primary/70">atual</span>}
                    {i < iAtual && <span className="text-[9.5px] text-muted-foreground/60 ml-auto">voltar</span>}
                    {puladas > 0 && (
                      <span className="text-[9.5px] text-amber-300/80 ml-auto">
                        pula {puladas} etapa{puladas > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground/70 mt-0.5">{e.descricao}</span>
                </button>
              );
            })}
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── QUAIS DOCUMENTOS VÃO PRO FINDER ──
          A conversa costuma ter mais de um PDF, e nem todo PDF é extrato: o
          contrato que a gente mandou, o boleto que ele mandou por engano. Quem
          escolhe é quem leu a conversa. Os recebidos já vêm marcados porque é
          quase sempre isso que se quer analisar. */}
      <Dialog open={finderAberto} onOpenChange={setFinderAberto}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <ScanSearch className="h-4 w-4" /> Levar ao Finder
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {docsDaConversa.length === 0
                ? <>Nenhum PDF nesta conversa. O Finder lê extrato em PDF; foto de extrato não serve.</>
                : <>Escolha o que vai para a fila do Finder. Ele abre em outra aba, com a conversa intacta aqui.</>}
            </DialogDescription>
          </DialogHeader>

          {docsDaConversa.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto scrollbar-thin">
                {docsDaConversa.map((d) => {
                  const marcado = docsEscolhidos.includes(d.id);
                  return (
                    <button key={d.id}
                      onClick={() => setDocsEscolhidos((p) => marcado ? p.filter((x) => x !== d.id) : [...p, d.id])}
                      className={cn("flex items-center gap-2.5 text-left rounded-lg px-3 py-2 ring-1 transition-colors",
                        marcado ? "bg-primary/[0.09] ring-primary/25" : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]")}>
                      <span className={cn("h-4 w-4 rounded shrink-0 grid place-items-center ring-1 transition-colors",
                        marcado ? "bg-primary ring-primary" : "ring-white/20")}>
                        {marcado && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <FileText className={cn("h-3.5 w-3.5 shrink-0", marcado ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium truncate">{d.nome}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {d.de === "lead" ? "recebido" : "enviado por nós"}{d.hora ? ` às ${d.hora}` : ""}
                          {d.nomeOriginal && d.nomeOriginal.replace(/\.pdf$/i, "") !== d.nome.replace(/\.pdf$/i, "")
                            ? " · renomeado pra ficar legível na fila" : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-snug">
                Ao salvar a análise comercial lá, ela nasce ligada a esta conversa: o lead avança para Aguardando
                documentação e o nome lido no extrato entra no sistema.
              </p>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFinderAberto(false)}>Cancelar</Button>
            <Button onClick={levarAoFinder} disabled={docsEscolhidos.length === 0} className="gap-2">
              <ScanSearch className="h-4 w-4" />
              Abrir o Finder{docsEscolhidos.length > 0 ? ` (${docsEscolhidos.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CRIAR OU EDITAR UMA MENSAGEM RÁPIDA ──
          Editar e apagar moram aqui, e não só o criar: um atalho nasce com o
          comando errado ou com a frase que a gente melhorou depois, e sem
          conserto a lista vira um monte de barra morta que ninguém usa. */}
      <Dialog open={!!atalhoEdicao} onOpenChange={(o) => { if (!o) setAtalhoEdicao(null); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Zap className="h-4 w-4" /> {atalhoEdicao?.id ? "Editar mensagem rápida" : "Nova mensagem rápida"}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              O comando é o que você digita depois da barra; a mensagem é o que entra no campo. Fica para todo o escritório.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Comando</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[13px] text-primary shrink-0">/</span>
                <Input
                  autoFocus
                  value={atalhoEdicao?.comando ?? ""}
                  onChange={(e) => setAtalhoEdicao((a) => a && { ...a, comando: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void gravarAtalho(); } }}
                  placeholder="extrato"
                  className="h-8 font-mono text-[12.5px]"
                />
              </div>
              {atalhoEdicao?.comando ? (
                <span className="text-[10.5px] text-muted-foreground/70">
                  Vai ficar <span className="font-mono text-foreground/80">/{normalizarComando(atalhoEdicao.comando) || "?"}</span>
                </span>
              ) : (
                <span className="text-[10.5px] text-muted-foreground/70">Letra, número, hífen e traço baixo. Sem espaço e sem acento.</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Mensagem</span>
              <Textarea
                rows={4}
                value={atalhoEdicao?.conteudo ?? ""}
                onChange={(e) => setAtalhoEdicao((a) => a && { ...a, conteudo: e.target.value })}
                placeholder="Me manda o extrato dos últimos cinco anos, por favor."
                className="text-[12.5px] resize-none scrollbar-thin"
              />
            </div>

            {/* ── O ANEXO DO ATALHO ──
                Metade do que se repete no dia não é texto: é o áudio que explica
                o prazo, o modelo de declaração, o print do passo a passo. Com
                anexo, o texto vira legenda dele e pode ficar vazio. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Anexos</span>
              <input
                ref={seletorAnexoAtalho} type="file" className="hidden" multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => {
                  const novos = Array.from(e.target.files ?? []).map((arquivo) => ({ arquivo }));
                  setAtalhoEdicao((a) => a && { ...a, novos: [...a.novos, ...novos] });
                  e.target.value = "";
                }}
              />
              <TiraDeAnexos
                itens={[
                  ...(atalhoEdicao?.midias ?? []).map((m, i) => ({
                    chave: `guardado-${m.path}`,
                    nome: m.nome,
                    mime: m.mime,
                    onRemover: () => setAtalhoEdicao((a) => a && { ...a, midias: a.midias.filter((_, j) => j !== i) }),
                  })),
                  ...(atalhoEdicao?.novos ?? []).map((n, i) => ({
                    chave: `novo-${i}-${n.arquivo.name}-${n.arquivo.size}`,
                    nome: n.arquivo.name,
                    mime: n.arquivo.type,
                    arquivo: n.arquivo,
                    onRemover: () => setAtalhoEdicao((a) => a && { ...a, novos: a.novos.filter((_, j) => j !== i) }),
                  })),
                ]} />
              <button onClick={() => seletorAnexoAtalho.current?.click()}
                className="self-start inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border
                           px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/50
                           hover:bg-primary/[0.04] transition-colors">
                <Paperclip className="h-3.5 w-3.5" /> Anexar arquivo
              </button>
            </div>
          </div>

          <DialogFooter>
            {atalhoEdicao?.id && (
              <Button variant="ghost" onClick={() => void apagarAtalho()} disabled={salvandoAtalho}
                      className="mr-auto gap-1.5 text-red-300/80 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Apagar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setAtalhoEdicao(null)} disabled={salvandoAtalho}>Cancelar</Button>
            <Button onClick={() => void gravarAtalho()} disabled={salvandoAtalho} className="gap-2">
              {salvandoAtalho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAR A CONCLUSÃO ──
          Diz o que vai acontecer, e não só "tem certeza?". No follow-up isso é
          o essencial: concluir não fecha nada, ABRE a próxima cobrança contando
          do dia de hoje — quem clica sem saber disso acha que está encerrando
          quando está agendando. */}
      <Dialog open={!!aConcluir} onOpenChange={(a) => { if (!a) setAConcluir(null); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              {aConcluir?.tipo === "follow_up" ? "Cobrança feita?" : "Concluir lembrete?"}
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              {aConcluir?.tipo === "follow_up" ? (
                <>
                  Confirma que você já falou com{" "}
                  <span className="text-foreground/80">{aConcluir?.lead}</span>?
                  {(aConcluir?.rodada ?? 1) < TOTAL_RODADAS ? (
                    <> A próxima cobrança da régua será agendada a partir de hoje.</>
                  ) : (
                    <> Esta é a última da régua: o lead sai da cadência.</>
                  )}
                </>
              ) : (
                <>
                  <span className="text-foreground/80">{aConcluir?.titulo}</span>
                  {aConcluir?.lead ? <> · {aConcluir.lead}</> : null}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAConcluir(null)}>
              Ainda não
            </Button>
            <Button size="sm"
              onClick={() => { if (aConcluir) aplicarConclusao(aConcluir.id); setAConcluir(null); }}>
              Concluir <Check className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── O EDITOR DA MENSAGEM PADRÃO ──
          A MESMA BARRA DO CHAT, e pelo mesmo motivo de sempre: quem escreve
          cobrança escreve mensagem, não preenche campo de configuração. Um
          formulário com "Texto do template" faria a pessoa pensar em sistema
          quando ela precisa pensar no cliente que vai ler aquilo.
          A diferença é que aqui não há destinatário: o que se escreve vale pra
          todo mundo que cair nessa rodada, e o cabeçalho diz isso em vez de
          mostrar uma foto. */}
      <Dialog open={modeloRodada !== null} onOpenChange={(a) => { if (!salvandoModelo && !a) setModeloRodada(null); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Repeat className="h-4 w-4" /> Mensagem padrão do {modeloRodada ? rotuloDaRodada(modeloRodada) : ""}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Vale para quem estiver com{" "}
              <span className="text-foreground/80">
                {modeloRodada ? diasDaRodada(modeloRodada, regua) : 0} dias sem responder
              </span>. Escreva como escreveria pra uma pessoa: é isso que vai ser
              mandado. Por ora ela não sai sozinha — serve pra quem for cobrar.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg ring-1 ring-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="p-2.5 flex flex-col gap-2">
              {/* OS ANEXOS EM TIRA, na ordem em que vão sair. Os que já estavam
                  gravados e os que acabaram de ser escolhidos aparecem juntos,
                  porque para quem lê são a mesma coisa: a mensagem que vai. */}
              <TiraDeAnexos
                itens={[
                  ...modeloMantidos.map((m, i) => ({
                    chave: `g${i}-${m.path}`, nome: m.nome, mime: m.mime,
                    onRemover: () => setModeloMantidos((p) => p.filter((_, j) => j !== i)),
                  })),
                  ...modeloAnexos.map((a, i) => ({
                    chave: `n${i}-${a.arquivo.name}`, nome: a.arquivo.name,
                    mime: a.arquivo.type, arquivo: a.arquivo,
                    onRemover: () => setModeloAnexos((p) => p.filter((_, j) => j !== i)),
                  })),
                ]} />

              <div className="flex items-center gap-1.5">
                {!modeloGravando && (
                  <>
                    <input ref={seletorModelo} type="file" className="hidden" multiple
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={(e) => {
                        const novos = Array.from(e.target.files ?? []).map((arquivo) => ({ arquivo }));
                        setModeloAnexos((p) => [...p, ...novos]);
                        e.target.value = "";
                      }} />
                    <Button size="sm" variant="ghost" title="Anexar arquivos"
                      className="h-9 w-9 p-0 shrink-0" onClick={() => seletorModelo.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <SeletorDeEmoji onEscolher={(x) => setModeloTexto((t) => t + x)} />
                  </>
                )}

                {!modeloGravando && (
                  <Textarea
                    value={modeloTexto}
                    rows={1}
                    onChange={(e) => setModeloTexto(e.target.value)}
                    onPaste={(ev) => colarEmLista(ev, setModeloAnexos)}
                    placeholder={modeloAnexos.length + modeloMantidos.length > 0
                      ? "Legenda (opcional)…" : "A mensagem desta rodada…"}
                    className="min-h-9 max-h-[9rem] py-[0.45rem] text-[12.5px] resize-none scrollbar-thin" />
                )}

                <GravadorDeAudio
                  onEnviar={async (audio, segundos) => {
                    const ext = audio.type.includes("mp4") ? "m4a" : "webm";
                    setModeloAnexos((p) => [...p, {
                      arquivo: new File([audio], `audio-${Date.now()}.${ext}`, { type: audio.type }),
                      duracao: segundos,
                    }]);
                  }}
                  onGravandoChange={setModeloGravando} />
              </div>

              <p className="text-[10.5px] text-muted-foreground/60 leading-snug">
                Quem for cobrar vê esta mensagem pronta. Trocar o texto aqui muda
                para todo mundo, daqui pra frente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setModeloRodada(null)} disabled={salvandoModelo}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarModelo}
              disabled={salvandoModelo ||
                (!modeloTexto.trim() && modeloAnexos.length + modeloMantidos.length === 0)}>
              {salvandoModelo
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                : <>Salvar <Check className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AS CONFIGURAÇÕES DE UM NÚMERO ──
          Tudo que é daquele número num lugar só: como ele se chama aqui, a
          etiqueta que o identifica na caixa cruzada, o estado da sessão, e a
          manutenção da ligação com a Evolution.
          O QUE ELE É lá na Evolution fica em cima e não se edita: aquele nome é
          CHAVE — é por ele que a conversa acha o número, o webhook casa a
          mensagem e o despachante escolhe por onde mandar. Deixar editável aqui
          seria oferecer um campo que quebra o sistema inteiro em silêncio. */}
      <Dialog open={marcaDe_ !== null} onOpenChange={(a) => { if (!salvandoMarca && !a) setMarcaDe_(null); }}>
        <DialogContent className="max-w-lg [&>*]:min-w-0 max-h-[88vh] overflow-y-auto scrollbar-thin">
          {(() => {
            const alvo = instancias.find((i) => mesmaInstancia(i.nome, marcaDe_));
            if (!marcaDe_) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-[15px] flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    {nomeNaTela(marcas, marcaDe_)}
                  </DialogTitle>
                  <DialogDescription className="text-[12px]">
                    O que vale só para este número. O que vale para a tela inteira
                    fica na aba Ajustes.
                  </DialogDescription>
                </DialogHeader>

                {/* ── NOME NESTA TELA ── */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Nome nesta tela</span>
                  <Input
                    value={marcaNome}
                    maxLength={60}
                    onChange={(e) => setMarcaNome(e.target.value)}
                    placeholder={marcaDe_}
                    className="h-9 text-[13px]" />
                  <p className="text-[10px] text-muted-foreground/60 leading-snug">
                    Só rótulo. Na Evolution ele continua sendo{" "}
                    <span className="text-foreground/70">{marcaDe_}</span>, e é esse
                    nome que a conversa, o webhook e o despacho usam. Em branco, a
                    tela mostra o nome técnico.
                  </p>
                </div>

                {/* ── A ETIQUETA ── */}
                <div className="flex items-center gap-3">
                  <label className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] text-muted-foreground">Sigla da etiqueta</span>
                    <Input
                      value={marcaApelido}
                      maxLength={6}
                      onChange={(e) => setMarcaApelido(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarMarca(); } }}
                      placeholder={apelidoDeInstancia(marcaDe_)}
                      className="h-9 text-[13px] uppercase tracking-wide" />
                  </label>

                  {/* A PRÉVIA NO TAMANHO REAL, sobre um círculo do tamanho do
                      avatar do contato. Em corpo grande toda sigla parece
                      legível; o teste que importa é o de dezoito pixels. */}
                  <span className="flex flex-col gap-1.5 items-center shrink-0">
                    <span className="text-[11px] text-muted-foreground">Fica assim</span>
                    <span className="relative h-9 w-9 rounded-full bg-white/[0.06] ring-1 ring-white/10
                                     grid place-items-center text-[10px] text-muted-foreground">
                      AB
                      <span className={cn("absolute -bottom-1 -right-1 rounded px-[3px] py-[1px]",
                        "text-[7.5px] font-bold leading-none tracking-wide ring-2 ring-[#0e1013]",
                        CORES_DE_INSTANCIA[marcaCor].fundo, CORES_DE_INSTANCIA[marcaCor].texto)}>
                        {marcaApelido.trim() || apelidoDeInstancia(marcaDe_)}
                      </span>
                    </span>
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Cor da etiqueta</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(CORES_DE_INSTANCIA) as NomeDeCor[]).map((c) => {
                      /* A COR JÁ USADA POR OUTRO NÚMERO APARECE MARCADA. Duas
                         etiquetas da mesma cor é o defeito que esta tela existe
                         pra evitar — e escolher a cor do vizinho sem saber é o
                         jeito mais fácil de recriá-lo à mão. */
                      const dono = instancias.find((i) =>
                        !mesmaInstancia(i.nome, marcaDe_) && coresEmUso.get(i.nome) === c);
                      return (
                        <button key={c} onClick={() => setMarcaCor(c)}
                          title={dono ? `Já é a cor de ${nomeNaTela(marcas, dono.nome)}` : c}
                          className={cn("relative h-7 w-7 rounded-lg grid place-items-center transition-transform",
                            CORES_DE_INSTANCIA[c].fundo,
                            marcaCor === c ? "ring-2 ring-white/70 scale-105"
                                           : cn("hover:scale-105", dono ? "opacity-30" : "opacity-80"))}>
                          {marcaCor === c && (
                            <Check className={cn("h-3.5 w-3.5", CORES_DE_INSTANCIA[c].texto)} strokeWidth={3} />
                          )}
                          {dono && marcaCor !== c && (
                            <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-[#0e1013]
                                             ring-1 ring-white/30" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-snug">
                    As apagadas já são de outro número. Âmbar, verde e vermelho
                    querem dizer atraso, automação e falha nesta tela — use se
                    quiser, é bom saber antes.
                  </p>
                </div>

                {/* ── O QUE ELE É, DO OUTRO LADO ──
                    Só leitura, e é aqui que se responde "por que não chega
                    mensagem" antes de mexer em qualquer coisa: conectado desde
                    quando, com qual número, com quantas conversas do lado de lá. */}
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 flex flex-col gap-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">
                    Na Evolution
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <LinhaTecnica rotulo="Nome da instância" valor={marcaDe_} />
                    <LinhaTecnica rotulo="Número" valor={alvo?.telefone ?? "sem número"} />
                    <LinhaTecnica
                      rotulo="Sessão"
                      valor={alvo?.status === "conectado"
                        ? (alvo?.conectadaDesde
                            ? `de pé ${tempoNaEtapa(alvo.conectadaDesde)}`
                            : "de pé")
                        : "desconectada"}
                      tom={alvo?.status === "conectado" ? "text-emerald-300" : "text-rose-300"} />
                    <LinhaTecnica rotulo="Conferido" valor={alvo?.sincronizadoEm ?? "—"} />
                    <LinhaTecnica rotulo="Perfil no WhatsApp" valor={alvo?.perfilNome || "sem nome"} />
                    <LinhaTecnica rotulo="Conversas do aparelho" valor={String(alvo?.conversas ?? 0)} />
                  </div>
                  {alvo?.conectadaDesde && alvo.status === "conectado" && (
                    <p className="text-[10px] text-muted-foreground/50 tabular-nums">
                      Conectado desde {quandoDaPassagem(alvo.conectadaDesde)}.
                    </p>
                  )}
                  {alvo?.jid && (
                    <p className="text-[9.5px] text-muted-foreground/40 font-mono truncate" title={alvo.jid}>
                      {alvo.jid}
                    </p>
                  )}
                </div>

                {/* ── MANUTENÇÃO, deste número ──
                    Os mesmos botões do menu, agora apontando pro número que a
                    engrenagem abriu. No menu eles agem no principal, que é o
                    certo lá; aqui seria errado. */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]"
                    onClick={() => rodarDiagnostico(marcaDe_)}>
                    <Stethoscope className="h-3.5 w-3.5" /> Por que não chega mensagem?
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]"
                    onClick={() => reconfigurarEventos(marcaDe_)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Reconfigurar eventos
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]"
                    onClick={() => importarDoAparelho(marcaDe_)}>
                    <Inbox className="h-3.5 w-3.5" /> Importar conversas
                  </Button>
                </div>

                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setMarcaDe_(null)} disabled={salvandoMarca}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={salvarMarca} disabled={salvandoMarca}>
                    {salvandoMarca
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                      : <>Salvar <Check className="h-3.5 w-3.5 ml-1.5" /></>}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── PASSAR A CONVERSA PRA OUTRO NÚMERO ──
          O aviso do meio é o motivo de isto ser um diálogo e não um clique
          direto: o cliente NÃO SABE que trocamos de número. A conversa dele, no
          celular dele, continua sendo a com o número antigo — e se ele responder
          por lá, a mensagem chega no número antigo e abre uma linha nova. Não é
          defeito a consertar aqui: é como o WhatsApp funciona, e o único jeito
          de o cliente migrar é a gente escrever primeiro pelo número novo.
          O que não pode é isso ser descoberto três dias depois. */}
      <Dialog open={moverAberto} onOpenChange={(a) => { if (!movendo) setMoverAberto(a); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Mover {lead.nome.split(" ")[0]} para outro número
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Hoje esta conversa é atendida por{" "}
              <span className="text-foreground/80">{nomeDe(lead.instancia ?? instancia.nome)}</span>.
              O histórico inteiro vai junto — ele é nosso, não do número.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            {instancias
              .filter((i) => !mesmaInstancia(i.nome, lead.instancia ?? instancia.nome))
              .map((i) => {
                const cor = corDe(i.nome);
                const escolhido = mesmaInstancia(i.nome, moverPara);
                return (
                  <button key={i.id} onClick={() => setMoverPara(i.nome)}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ring-1",
                      escolhido ? "bg-primary/12 ring-primary/30" : "ring-transparent hover:bg-white/[0.05]")}>
                    <span className="h-8 w-8 shrink-0 rounded-full overflow-hidden grid place-items-center text-[10.5px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
                      {i.fotoUrl
                        ? <img src={i.fotoUrl} alt="" className="h-full w-full object-cover"
                               onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        : i.avatar}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide shrink-0",
                          cor.fundo, cor.texto)}>
                          {apelidoDeInstancia(i.nome)}
                        </span>
                        <span className="text-[12px] font-medium truncate">{nomeDe(i.nome)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={cn("h-1 w-1 rounded-full",
                          i.status === "conectado" ? "bg-emerald-400" : "bg-rose-400")} />
                        <span className="tabular-nums">{i.telefone}</span>
                      </span>
                    </span>
                    {escolhido && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
          </div>

          <div className="rounded-lg ring-1 ring-amber-400/25 bg-amber-400/[0.06] p-2.5">
            <p className="flex items-start gap-1.5 text-[11.5px] text-amber-200/90 leading-snug">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
              <span>
                O cliente não é avisado. No celular dele, a conversa continua sendo
                a com o número antigo — se ele responder por lá, a mensagem chega
                no antigo e abre uma linha nova. Para ele migrar de verdade,
                escreva primeiro pelo número novo.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMoverAberto(false)} disabled={movendo}>
              Cancelar
            </Button>
            <Button size="sm" onClick={moverConversa} disabled={movendo || !moverPara}>
              {movendo
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Movendo…</>
                : <>Mover <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── O POP DA NOTA ──
          Menor que todos os outros, e com um campo só. É proposital: nada aqui
          tem consequência — não agenda, não cobra, não sai pro cliente. O peso
          da janela conta o peso do que ela faz, e esta faz a coisa mais leve da
          tela. Sem título, sem data, sem tipo: escrever uma nota não pode custar
          quatro decisões. */}
      <Dialog open={notaAberta} onOpenChange={(a) => { if (!postandoNota) setNotaAberta(a); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <StickyNote className="h-4 w-4" /> Nota sobre {lead.nome.split(" ")[0]}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Fica guardada aqui e não faz mais nada: não agenda, não cobra, não
              vai pro cliente. É o que você sabe sobre essa pessoa e não vira tarefa.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            autoFocus
            value={rascunhoNota}
            rows={5}
            onChange={(e) => setRascunhoNota(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl+Enter salva; Enter sozinho quebra a linha. O contrário do
              // chat, e pelo motivo certo: aqui se escreve parágrafo, não recado.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postarNota(); }
            }}
            placeholder="O que você quiser lembrar sobre essa pessoa…"
            className="text-[12.5px] resize-none scrollbar-thin" />

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setNotaAberta(false)} disabled={postandoNota}>
              Cancelar
            </Button>
            <Button size="sm" onClick={postarNota} disabled={postandoNota || !rascunhoNota.trim()}>
              {postandoNota
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                : <>Salvar <Check className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── O POP DO LEMBRETE ──
          Pequeno de propósito: são quatro campos e nenhuma decisão perigosa —
          nada aqui sai para o cliente. O diálogo grande é o da mensagem
          programada, e a diferença de tamanho entre os dois é intencional: o
          peso da janela conta o peso do que ela faz. */}
      <Dialog open={fichaAberta} onOpenChange={(a) => { if (!salvandoFicha) setFichaAberta(a); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <BellRing className="h-4 w-4" /> {editandoFicha ? "Editar lembrete" : "Marcar lembrete"}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Sobre <span className="text-foreground/80">{lead.nome}</span>. É uma anotação sua:
              aparece no daily do dia que você escolher, e não vai para o cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">O que fazer</span>
              <Input
                autoFocus
                ref={campoLembrete}
                value={fichaTitulo}
                onChange={(e) => setFichaTitulo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarLembreteDaFicha(); } }}
                placeholder="Ligar pra confirmar o extrato"
                className="h-9 text-[13px]" />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Detalhe <span className="opacity-60">(opcional)</span>
              </span>
              <Textarea
                value={fichaDetalhe}
                onChange={(e) => setFichaDetalhe(e.target.value)}
                placeholder="o que ficou combinado, o que conferir"
                className="text-[12.5px] min-h-[62px] resize-none" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> Dia
                </span>
                <SeletorDeDia valor={fichaDia} onEscolher={setFichaDia} hojeISO={HOJE} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Hora <span className="opacity-60">(opcional)</span>
                </span>
                <SeletorDeHora valor={fichaHora} onEscolher={setFichaHora} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setFichaAberta(false)} disabled={salvandoFicha}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarLembreteDaFicha} disabled={salvandoFicha || !fichaTitulo.trim()}>
              {salvandoFicha
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                : <>{editandoFicha ? "Salvar" : "Marcar"} <Check className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NOVA MENSAGEM PROGRAMADA ──
          A janela grande, e a diferença de tamanho pro pop do lembrete é
          intencional: aqui se decide algo que SAI para o cliente, sozinho, com
          o escritório fechado. O peso da janela conta o peso do que ela faz. */}
      <Dialog open={taskAberta} onOpenChange={(a) => { if (!salvandoTask) { setTaskAberta(a); if (!a) limparRetencao(); } }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Send className="h-4 w-4" /> {editando ? "Editar programação" : "Nova mensagem programada"}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Para <span className="text-foreground/80">{editando?.lead ?? lead.nome}</span>.
              {" "}Escreva como escreveria agora; ela sai sozinha na hora que você marcar,
              mesmo com o sistema fechado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {/* AS QUE JÁ ESTÃO NO BANCO, quando se está editando. Elas não
                são as preparadas de baixo: aquelas ainda não existem, estas já
                vão sair sozinhas e por isso aparecem primeiro, com a edição
                aberta. */}
            {editando && agendadasDoEditando.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {agendadasDoEditando.length === 1
                    ? "1 mensagem já programada"
                    : `${agendadasDoEditando.length} mensagens já programadas`}
                </p>
                {agendadasDoEditando.map((a) => (
                  <RetidaEditavel key={a.id} a={a} hojeISO={HOJE}
                    onCancelar={() => cancelarProgramada(a.id)}
                    onSalvar={async (texto, quando) => {
                      try {
                        await editarAgendada(a.id, { texto, quando });
                        invalidarAgendadas();
                        toast.success("Mensagem reprogramada.");
                      } catch (e) {
                        invalidarAgendadas();
                        toast.error((e as Error).message);
                      }
                    }} />
                ))}
              </div>
            )}

            {/* ═══ A MENSAGEM ═══
                A BARRA É A MESMA DO CHAT, e essa é a decisão de desenho que
                importa aqui. Um formulário de "agendar mensagem" — campo
                Mensagem, campo Anexo, botão Salvar — faria a pessoa preencher
                um cadastro. A barra do chat ela já usa cem vezes por dia: o
                clipe à esquerda, o campo no meio, o microfone e o botão de
                mandar à direita, na mesma ordem e do mesmo tamanho. O gesto é
                idêntico ao de responder agora; o que muda é só a hora em que
                chega.

                Sem o painel dobrável que existia aqui: quando isto dividia o
                diálogo com os campos do lembrete, esconder fazia sentido — era
                a parte perigosa, que manda mensagem sozinha, e não podia ser
                algo em que se esbarra anotando um recado. Agora o diálogo É
                isto, e um painel fechado que guarda a única coisa da tela é só
                um clique a mais. */}
            <div className="rounded-lg ring-1 ring-white/[0.07] bg-white/[0.02] overflow-hidden">
                    {/* PRA QUEM VAI, logo acima da barra de escrever — a mesma
                        faixa que fica no topo da conversa, com foto, nome,
                        número e etiquetas.
                        Não é enfeite: esta janela abre a partir de vários
                        lugares (a jornada, o rodapé do daily, um lembrete), e a
                        conversa por trás dela pode nem ser a que a pessoa
                        estava lendo. Uma mensagem que sai sozinha, horas
                        depois, pro cliente errado, é o erro mais caro que este
                        módulo pode cometer — e o mais fácil de evitar: basta a
                        cara da pessoa estar na frente de quem escreve. */}
                    <div className="px-2.5 py-2 border-b border-white/[0.06] flex items-center gap-2.5">
                      <AvatarDoLead
                        foto={fotoDe(lead)}
                        tamanho="h-8 w-8 shrink-0 text-[11px]"
                        classe="bg-white/[0.05] ring-white/10" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium truncate">{lead.nome}</span>
                        <span className="block text-[10.5px] text-muted-foreground tabular-nums truncate">
                          {telefoneBonito(lead.telefone)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="rounded px-1.5 py-[2px] text-[9.5px] bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
                          {rotuloDaEtapa(lead.jornada, estagioDe(lead))}
                        </span>
                        <SeloContato origem={lead.importada ? undefined : lead.origemContato} base={lead.base}
                          followUp={followUpPorLead.get(lead.id)?.rodada ?? null} />
                      </span>
                    </div>

                    <div className="p-2.5 flex flex-col gap-2">

                      {/* AS JÁ PREPARADAS, como bolhas — porque é isso que
                          acontece no chat quando se aperta enviar: a mensagem
                          sai do campo e aparece na conversa. Aqui ela aparece
                          com a hora em que vai sair, e some do campo do mesmo
                          jeito. Nada disso existe no banco ainda: só vira
                          agendamento quando o lembrete for marcado. */}
                      <AnimatePresence initial={false}>
                        {retidas.map((r) => (
                          <motion.div key={r.id}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.85 }}
                            className="overflow-hidden">
                            <div className="self-end ml-auto w-fit max-w-full rounded-2xl rounded-tr-sm
                                            border border-dashed border-primary/30 bg-primary/[0.05] px-3 py-2">
                              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide
                                            text-muted-foreground/80 mb-1">
                                <Clock className="h-3 w-3 text-primary" />
                                {quandoBonito(r.quando.toISOString())}
                                <button type="button"
                                  onClick={() => setRetidas((p) => p.filter((x) => x.id !== r.id))}
                                  title="Tirar esta mensagem"
                                  className="ml-1 text-muted-foreground/40 hover:text-red-300 transition-colors">
                                  <X className="h-3 w-3" />
                                </button>
                              </p>
                              {r.anexos.map((a, i) => (
                                <p key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[220px]">{a.arquivo.name}</span>
                                </p>
                              ))}
                              {r.texto && (
                                <p className="text-[12.5px] leading-snug whitespace-pre-wrap break-words opacity-90">
                                  {r.texto}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {/* O anexo escolhido fica VISÍVEL antes de ir, igual ao
                          chat: anexar e agendar no mesmo clique é o jeito de
                          programar o arquivo errado pro cliente errado, e o
                          erro só aparece quando já chegou nele. */}
                      <TiraDeAnexos
                        itens={reterAnexos.map((a, i) => ({
                          chave: `${i}-${a.arquivo.name}`, nome: a.arquivo.name,
                          mime: a.arquivo.type, arquivo: a.arquivo,
                          onRemover: () => setReterAnexos((p) => p.filter((_, j) => j !== i)),
                        }))} />

                      {/* A LINHA DO CHAT, na mesma ordem e nas mesmas medidas. */}
                      <div className="flex items-center gap-1.5">
                        {!reterGravando && (
                          <>
                            <input ref={seletorRetido} type="file" className="hidden" multiple
                              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                              onChange={(e) => {
                                /* SOMA, não troca. Selecionar vários de uma vez e
                                   voltar pra escolher mais são o mesmo gesto no
                                   WhatsApp, e aqui também. */
                                const novos = Array.from(e.target.files ?? []).map((arquivo) => ({ arquivo }));
                                setReterAnexos((p) => [...p, ...novos]);
                                e.target.value = "";
                              }} />
                            <Button size="sm" variant="ghost" title="Anexar arquivos"
                              className="h-9 w-9 p-0 shrink-0" onClick={() => seletorRetido.current?.click()}>
                              <Paperclip className="h-4 w-4" />
                            </Button>
                            <SeletorDeEmoji onEscolher={(x) => setReterTexto((t) => t + x)} />
                          </>
                        )}

                        {!reterGravando && (
                          <Textarea
                            value={reterTexto}
                            rows={1}
                            onChange={(e) => setReterTexto(e.target.value)}
                            onKeyDown={(e) => {
                              // Mesmo atalho do chat: enter manda, shift+enter
                              // quebra a linha. Aqui "mandar" é preparar.
                              if (e.key !== "Enter") return;
                              if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                              e.preventDefault();
                              prepararRetida();
                            }}
                            onPaste={(ev) => colarEmLista(ev, setReterAnexos)}
                            placeholder={reterAnexos.length > 0 ? "Legenda (opcional)…" : `Mensagem para ${lead.nome.split(" ")[0]}…`}
                            className="min-h-9 max-h-[7.5rem] py-[0.45rem] text-[12.5px] resize-none scrollbar-thin"
                          />
                        )}

                        {/* O MICROFONE GRAVA, MAS NÃO MANDA. No chat o áudio
                            sai no fim da gravação; aqui ele vira o anexo e
                            espera a hora, como todo o resto. */}
                        <GravadorDeAudio
                          onEnviar={async (audio, segundos) => {
                            const ext = audio.type.includes("mp4") ? "m4a" : "webm";
                            setReterAnexos((p) => [...p, {
                              arquivo: new File([audio], `audio-${Date.now()}.${ext}`, { type: audio.type }),
                              duracao: segundos,
                            }]);
                          }}
                          onGravandoChange={setReterGravando}
                        />

                        {!reterGravando && (
                          /* O MESMO BOTÃO DO CHAT: quadrado, avião de papel,
                             sem texto. A versão anterior trazia a hora escrita
                             dentro dele e virava um híbrido estranho — o botão
                             que manda não é o lugar de informar quando; isso já
                             está no seletor logo abaixo e na bolha que aparece
                             depois de preparar.
                             E ele NÃO salva o lembrete: prepara a mensagem, do
                             mesmo jeito que o enviar do chat tira o texto do
                             campo e o põe na conversa. */
                          <Button size="sm" className="h-9 w-9 p-0 shrink-0"
                            onClick={prepararRetida}
                            disabled={!reterTexto.trim() && reterAnexos.length === 0}
                            title={`Programar para ${quandoBonito(instanteDe(reterDia, reterHora || null).toISOString())}`}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <SeletorDeDia valor={reterDia} onEscolher={setReterDia} hojeISO={HOJE} />
                        <SeletorDeHora valor={reterHora} onEscolher={setReterHora} opcional={false} />
                      </div>

                      {/* O IMPEDIMENTO APARECE ANTES DO CLIQUE, e não como erro
                          depois. Descobrir que a hora já passou só ao salvar faz
                          perder o texto que se acabou de escrever. */}
                      {(() => {
                        const m = motivoDeNaoAgendar({
                          tipo: reterAnexos[0] ? tipoDoMime(reterAnexos[0].arquivo.type) : "texto",
                          texto: reterTexto,
                          temArquivo: reterAnexos.length > 0,
                          quando: instanteDe(reterDia, reterHora || null),
                        });
                        return m && (reterTexto.trim() || reterAnexos.length > 0) ? (
                          <p className="flex items-start gap-1.5 text-[10.5px] text-amber-300/90 leading-snug">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-[1px]" /> {m}
                          </p>
                        ) : (
                          <p className="text-[10.5px] text-muted-foreground/60 leading-snug">
                            {retidas.length > 0
                              ? "Sai sozinha na hora marcada, mesmo com o sistema fechado, quando você confirmar. Dá pra cancelar até a hora, pela conversa."
                              : "Escreva e aperte enviar: a mensagem fica guardada aqui até você confirmar embaixo."}
                          </p>
                        );
                      })()}
                    </div>
            </div>
          </div>

          {/* O AVISO FICA AQUI, colado no botão que a pessoa acabou de
              apertar, e não num toast que some. Ele aparece uma vez e oferece
              as duas saídas honestas: programar o que ficou escrito, ou dizer
              que aquilo era rascunho. Salvar por conta própria mandaria pro
              cliente algo que ninguém confirmou; descartar calado apagaria
              texto que alguém escreveu. */}
          <AnimatePresence initial={false}>
            {avisoRetida && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.85 }}
                className="overflow-hidden">
                <div className="rounded-lg ring-1 ring-amber-400/25 bg-amber-400/[0.06] p-2.5 flex flex-col gap-2">
                  <p className="flex items-start gap-1.5 text-[11.5px] text-amber-200/90 leading-snug">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
                    Você escreveu uma mensagem e não apertou enviar. Ela não vai ser programada.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]"
                      onClick={() => { setReterTexto(""); setReterAnexos([]); salvarTask(true); }}>
                      Descartar e salvar
                    </Button>
                    <Button size="sm" className="h-7 text-[11px]"
                      onClick={() => { prepararRetida(); setAvisoRetida(false); }}>
                      Programar também
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setTaskAberta(false); limparRetencao(); }} disabled={salvandoTask}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => salvarTask()}
              disabled={salvandoTask || (retidas.length === 0 && !reterTexto.trim() && reterAnexos.length === 0)}>
              {salvandoTask
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Programando…</>
                : <>Programar <Check className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NOVA CONVERSA ──
          Só o número é obrigatório: é o que o WhatsApp precisa. O nome é
          gentileza pra atendente reconhecer a linha na lista enquanto o
          cliente não responde — quando ele responder, o webhook grava o nome
          do perfil por cima. */}
      <Dialog open={novaAberta} onOpenChange={(a) => { if (!criandoConversa) setNovaAberta(a); }}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Nova conversa
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Falando por <span className="text-foreground/80">{instancia.nome}</span>. O número é
              conferido com o WhatsApp antes de a conversa aparecer na caixa.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Telefone com DDD</span>
              <div className="relative">
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  inputMode="numeric"
                  value={novoTelefone}
                  onChange={(e) => setNovoTelefone(mascaraTelefone(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); abrirNova(); } }}
                  placeholder="(92) 98812-4471"
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Nome <span className="opacity-60">(opcional)</span></span>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); abrirNova(); } }}
                placeholder="como você chama essa pessoa"
                className="h-9 text-[13px]"
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setNovaAberta(false)} disabled={criandoConversa}>
              Cancelar
            </Button>
            <Button size="sm" onClick={abrirNova} disabled={criandoConversa || !novoTelefone.trim()}>
              {criandoConversa
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Conferindo…</>
                : <>Abrir conversa <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ProvedorDeAudio>
  );
}

/* ── OS VISTINHOS ─────────────────────────────────────────────────────────
   Um risco: saiu daqui. Dois cinzas: chegou no aparelho dele. Dois azuis: ele
   abriu. É o vocabulário que todo mundo já sabe ler do próprio WhatsApp, e
   reproduzi-lo aqui poupa a única explicação que essa informação precisaria.

   SEM CONFIRMAÇÃO, NÃO DESENHA NADA. A tentação é pôr um risco cinza de
   consolo, mas ele afirmaria "saiu do servidor" sem ninguém ter dito isso — e
   a diferença entre "não respondeu" e "não recebeu" é justamente o que essa
   marca existe pra mostrar. */
function VistoDaMensagem({ status }: { status?: string | null }) {
  // ANTES DOS RISCOS, O RELÓGIO. A bolha nasce no enter, sem nenhuma notícia da
  // Evolution ainda — e não desenhar nada nesse intervalo faria ela parecer
  // confirmada, que é a única coisa que essa marca existe pra não deixar
  // acontecer. O relógio diz "está na minha mão", o risco diz "saiu".
  const marca = marcaDeEnvio(status);
  if (marca === "relogio") {
    return (
      <span title={rotuloDoStatus(status)} className="inline-flex shrink-0 text-muted-foreground/50">
        <Clock className="h-3 w-3" />
      </span>
    );
  }
  if (marca === "erro") {
    return (
      <span title={rotuloDoStatus(status)} className="inline-flex shrink-0 text-amber-400">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }

  const v = vistoDaMensagem(status);
  if (!v) return null;
  return (
    <span title={rotuloDoStatus(status)}
      className={cn("inline-flex shrink-0", v.lida ? "text-sky-400" : "text-muted-foreground/60")}>
      {v.riscos === 1
        ? <Check className="h-3 w-3" />
        : <CheckCheck className="h-3 w-3" />}
    </span>
  );
}

/* ── DE ONDE VEIO, E QUEM FALOU PRIMEIRO ──────────────────────────────────
   Duas informações, dois selos, sempre juntos:

     inbound   ele deu o primeiro passo — a seta entra
     outbound  nós demos — a seta sai
     base      de qual landing esse contato saiu

   Elas não se deduzem uma da outra: o mesmo lead da LP Bradesco pode chegar
   dos dois jeitos, preenchendo o formulário e depois chamando, ou preenchendo
   e ficando quieto até a Adria chamar. É a mesma origem com dois começos, e a
   conversa se abre diferente em cada caso.

   TUDO EM AZUL, de propósito. Verde e vermelho, nesta tela, já querem dizer
   "feito" e "atenção"; usá-los aqui faria "outbound" parecer um problema e
   "inbound" parecer uma conquista, quando nenhum dos dois é julgamento — é só
   de onde a conversa veio. Dois azuis vizinhos e ícones opostos separam os
   dois sem inventar hierarquia. */
function SeloContato({ origem, base, followUp, tamanho = "pequeno" }: {
  origem?: "inbound" | "outbound";
  base?: string | null;
  /** a rodada da cobrança em aberto, quando o lead está na cadência */
  followUp?: number | null;
  tamanho?: "pequeno" | "grande";
}) {
  if (!origem && !base && !followUp) return null;
  const g = tamanho === "grande";
  /* NO TAMANHO GRANDE, A MESMA CAIXA DAS LINHAS DE FOLLOW-UP.
     A ficha ganhou as três linhas do follow-up com 12px e altura de toque, e a
     origem ficou ao lado com 10px e cara de etiqueta de canto — duas medidas
     diferentes para dois campos vizinhos do mesmo bloco. Quem lê não vê duas
     escolhas, vê um descuido: o menor parece menos importante sem que ninguém
     tenha decidido isso.
     No tamanho pequeno nada muda: lá ele convive com o nome do lead numa linha
     de lista, e crescer roubaria o espaço do nome. */
  const caixa = g
    ? "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ring-1"
    : "inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[9px] ring-1";
  const ico = g ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  const saiu = origem === "outbound";

  return (
    <>
      {origem && (
        <span className={cn(caixa, saiu
          ? "bg-indigo-400/12 text-indigo-300 ring-indigo-400/25"
          : "bg-sky-400/12 text-sky-300 ring-sky-400/25")}>
          {saiu ? <ArrowUpRight className={ico} /> : <ArrowDownLeft className={ico} />}
          {saiu ? "Outbound" : "Inbound"}
        </span>
      )}
      {base && (
        <span className={cn(caixa, "bg-blue-400/10 text-blue-200/90 ring-blue-400/20 max-w-[10rem]")}>
          <Database className={cn(ico, "shrink-0")} />
          <span className="truncate">{base}</span>
        </span>
      )}
      {/* ESTÁ NA CADÊNCIA — e só isso.
          O número da rodada saiu daqui: numa fila de trinta linhas, "UP03" é um
          detalhe que ninguém compara entre leads e que gastava metade da
          etiqueta. O que a caixa precisa dizer é a categoria: esta pessoa está
          sendo cobrada. O número importa na hora de ESCREVER, e é na ficha do
          cliente que ele aparece, junto dos dias que dão sentido a ele.
          Roxo porque é a única cor que esta tela não usa pra mais nada — âmbar
          competia com o atraso das tasks e fazia "está na régua" parecer "está
          atrasado", que são coisas diferentes. */}
      {followUp ? (
        <span className={cn(caixa, "bg-violet-400/12 text-violet-300 ring-violet-400/25")}>
          <Repeat className={cn(ico, "shrink-0")} />
          Follow-up
        </span>
      ) : null}
    </>
  );
}

/* ═══════════════════ o card de follow-up ═══════════════════
 *
 * Mesmo desenho dos cards da aba Tarefas do sistema: canto arredondado grande,
 * quadradinho do ícone no topo, rótulo miúdo em caixa alta, título, conteúdo, e
 * uma faixa embaixo separada por linha com os dados de apoio. Repetir a forma
 * não é preguiça — é o que faz uma pessoa que já usa Tarefas saber ler isto
 * aqui sem aprender nada.
 *
 * O CARD INTEIRO É O BOTÃO. Só o nome clicável obriga a mirar em duas palavras;
 * o alvo é o retângulo todo, com teclado junto, e o único ponto que não abre a
 * conversa é o botão de concluir — que faz outra coisa e por isso segura o
 * clique pra si.
 */
function CardFollowUp({ task, diasSemResposta, hoje, regua, onAbrir, onConcluir }: {
  task: Task;
  diasSemResposta: number;
  hoje: string;
  regua: Regua;
  onAbrir: () => void;
  onConcluir: () => void;
}) {
  /* O DIA SEMPRE ESCRITO, e não só "há 3 dias". Quem trabalha a fila precisa
     saber a data pra cruzar com a agenda — "venceu há 3 dias" obriga a fazer a
     conta de cabeça toda vez, e a conta muda de sentido dependendo de quando a
     pessoa abriu a tela. A distância continua ali, ao lado: uma diz o quanto
     atrasou, a outra diz o dia. */
  const atraso = diasDeAtraso(task.data, hoje);
  const quando = fmtDiaCurto(task.data);
  const prazo = atraso > 0
    ? { texto: `${quando} · venceu há ${atraso} ${atraso === 1 ? "dia" : "dias"}`, cor: "text-amber-300" }
    : task.data === hoje
      ? { texto: `${quando} · vence hoje`, cor: "text-foreground/80" }
      : { texto: `${quando} · a fazer`, cor: "text-muted-foreground" };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
      className={cn(
        "group flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md p-3.5 cursor-pointer",
        "shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}>
      <div className="flex items-start justify-between gap-2">
        <span className="h-8 w-8 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
          <Repeat className="h-4 w-4 text-primary" />
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onConcluir(); }}
          title="Cobrança feita, abre a próxima"
          className="shrink-0 h-7 w-7 grid place-items-center rounded-lg text-muted-foreground/40
                     hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors">
          <CheckCircle2 className="h-4 w-4" />
        </button>
      </div>

      {/* O DEGRAU, NÃO A POSIÇÃO NA FILA. "UP01 de 5" contava uma ordem que não
          muda o que se escreve; "de 1 dia" e "de 60 dias" pedem mensagens
          opostas — a primeira retoma, a última encerra. */}
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2.5">
        {rotuloDoDegrau(task.rodada ?? 1, regua)}
      </p>
      <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">{task.lead}</p>
      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 flex-1">{task.detalhe}</p>

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5">
        {/* O NÚMERO QUE DECIDE A CONVERSA. Três dias de silêncio e trinta pedem
            mensagens diferentes, e uma fila que não diz isso faz todo mundo
            escrever a mesma coisa. */}
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
          diasSemResposta >= 15
            ? "bg-amber-400/12 text-amber-300 ring-amber-400/25"
            : "bg-white/[0.05] text-muted-foreground ring-white/[0.08]")}>
          <Clock className="h-3 w-3" />
          {diasSemResposta === 0
            ? "sem resposta desde hoje"
            : `${diasSemResposta} ${diasSemResposta === 1 ? "dia" : "dias"} sem responder`}
        </span>
        <p className={cn("flex items-center gap-1.5 text-[11px] leading-snug", prazo.cor)}>
          <CalendarDays className="h-3 w-3 shrink-0" /> {prazo.texto}
        </p>
      </div>
    </div>
  );
}

/* ── ESCOLHER AS COLUNAS ─────────────────────────────────────────────────
   Lista de marcar, com o NÚMERO da ordem em vez de um check: a ordem é o que
   decide a sequência das linhas no cartão do lead, e um check idêntico em
   todas esconderia justamente isso. Marcar de novo desmarca e as outras se
   renumeram sozinhas. */
function SeletorDeColunas({ disponiveis, escolhidas, onAlternar }: {
  disponiveis: string[];
  escolhidas: string[];
  onAlternar: (c: string) => void;
}) {
  if (disponiveis.length === 0) {
    return (
      <p className="text-[11.5px] text-muted-foreground/70 py-2">
        Essa planilha não tem colunas além do contato — o cartão vai mostrar só nome e telefone.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">
        Colunas no cartão do lead
        {escolhidas.length > 0 && <span className="opacity-60"> · {escolhidas.length} marcada{escolhidas.length === 1 ? "" : "s"}</span>}
      </p>
      <div className="flex flex-col gap-1 max-h-[42vh] overflow-y-auto scrollbar-thin pr-0.5">
        {disponiveis.map((c) => {
          const i = escolhidas.indexOf(c);
          const marcada = i >= 0;
          return (
            <button key={c} type="button" onClick={() => onAlternar(c)}
              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ring-1 transition-colors",
                marcada
                  ? "bg-primary/10 ring-primary/25"
                  : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]")}>
              <span className={cn("h-4.5 w-4.5 shrink-0 rounded grid place-items-center text-[9.5px] font-semibold tabular-nums ring-1",
                marcada
                  ? "bg-primary/20 text-primary ring-primary/30"
                  : "bg-white/[0.04] text-muted-foreground/50 ring-white/[0.08]")}>
                {marcada ? i + 1 : ""}
              </span>
              <span className={cn("text-[12px] truncate", marcada ? "text-foreground" : "text-muted-foreground")}>
                {c}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-snug">
        Sem nenhuma marcada, o cartão mostra tudo que a planilha trouxe.
      </p>
    </div>
  );
}

/* ── A FICHA DO LEAD DA BASE ──────────────────────────────────────────────
   O que ela precisa responder, nessa ordem: quem é (nome), como falar com ele
   (número, copiável), o que ele já contou (as respostas da landing) e o que
   dizer agora. Nome e número em cima e grandes porque é o que se confere antes
   de mandar — mandar mensagem pra número errado é o erro caro aqui, e ele
   acontece justamente quando o número está em corpo 10 no meio de um parágrafo.
   As respostas ficam VISÍVEIS enquanto se escreve: é a diferença entre "Olá,
   tudo bem?" e uma primeira mensagem que já cita o desconto que a pessoa
   marcou. */
function FichaDoLead({ lead, colunas, mensagem, onMensagem, ocupado, onCopiar, onEnviar, onSoAbrir, onDescartar }: {
  lead: LeadBruto;
  /** as colunas escolhidas na base; nulo = todas */
  colunas: string[] | null;
  mensagem: string;
  onMensagem: (v: string) => void;
  ocupado: boolean;
  onCopiar: () => void;
  onEnviar: () => void;
  onSoAbrir: () => void;
  onDescartar: () => void;
}) {
  const nome = lead.nome?.trim() || telefoneBonito(lead.telefone);
  const extras = dossieExtra(lead.bruto, colunas);
  return (
    <div className="flex flex-col max-h-[70vh]">
      <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.07] flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold ring-1 bg-primary/10 text-primary ring-primary/20">
          {iniciais(nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight truncate" title={nome}>{nome}</p>
          <button type="button" onClick={onCopiar}
            title="Copiar número"
            className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-muted-foreground hover:text-foreground transition-colors">
            <Phone className="h-3 w-3" /> {telefoneBonito(lead.telefone)}
            <Copy className="h-2.5 w-2.5 opacity-60" />
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground/70 shrink-0 text-right leading-snug">
          {lead.cidade && <>{lead.cidade}<br /></>}
          {lead.chegou_em ? `chegou ${horaDaLista(lead.chegou_em)}` : ""}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-3">
        {/* CADA LANDING PERGUNTA DO SEU JEITO. Uma junta tudo numa coluna
            "Respostas"; a do Bradesco espalha em DESCONTOS, TEMPO DE CONTA,
            USO DA CONTA, SCORE. Em vez de escolher um formato e ignorar o
            outro, a ficha mostra o que existir — as colunas que o leitor não
            soube nomear já vêm guardadas inteiras. */}
        {(lead.respostas || extras.length > 0) ? (
          <div className="rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] px-3 py-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1.5">
              O que respondeu na landing
            </p>
            {lead.respostas && (
              <p className="text-[11.5px] leading-snug whitespace-pre-wrap break-words">{lead.respostas}</p>
            )}
            {extras.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {extras.map((c) => (
                  <div key={c.rotulo} className="contents">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 whitespace-nowrap pt-[1px]">
                      {c.rotulo}
                    </span>
                    <span className="text-[11.5px] leading-snug break-words">{c.valor}</span>
                  </div>
                ))}
              </div>
            )}
            {lead.origem_texto && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">{lead.origem_texto}</p>
            )}
          </div>
        ) : (
          <p className="text-[11.5px] text-muted-foreground/70">
            A planilha não trouxe nada além do contato.
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Primeira mensagem</span>
          <Textarea value={mensagem} onChange={(e) => onMensagem(e.target.value)}
            rows={5} placeholder="Olá! Aqui é a Adria, do Portal Direito Aberto…"
            className="text-[12.5px] resize-none" />
        </label>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.07] flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-[11px] text-muted-foreground hover:text-destructive"
          onClick={onDescartar} disabled={ocupado}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Descartar
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[11px] ml-auto"
          onClick={onSoAbrir} disabled={ocupado}>
          Só abrir
        </Button>
        <Button size="sm" className="h-8 text-[11px]"
          onClick={onEnviar} disabled={ocupado || !mensagem.trim()}>
          {ocupado
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enviando…</>
            : <><MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" /> Mandar mensagem</>}
        </Button>
      </div>
    </div>
  );
}

/* ═══════════ os três números do follow-up ═══════════
 *
 * Qual rodada, há quanto tempo a pessoa está calada, e quanto falta pro próximo
 * toque. Os três juntos, porque nenhum deles sozinho responde a pergunta que se
 * faz aqui: o que eu escrevo agora?
 *
 * Isto vive no DOSSIÊ, ao lado da origem, e aparece sempre que existe cobrança
 * aberta — inclusive quando ela vence daqui a três semanas. Saber que a pessoa
 * está na régua muda o tom de qualquer mensagem que se mande hoje, e não só no
 * dia da cobrança. O que espera o dia certo é o CARTÃO da tarefa, que é
 * trabalho; isto é contexto, e contexto se lê antes de escrever.
 */
function ResumoFollowUp({ task, lead, hoje, regua }: {
  task: Task; lead: Lead; hoje: string; regua: Regua;
}) {
  const atrasada = task.data < hoje;
  const deHoje = task.data === hoje;
  const faltam = Math.max(0, Math.round(
    (diaDoISO(task.data).getTime() - diaDoISO(hoje).getTime()) / 86400000));

  return (
    /* SÓ O UP GANHA BOLHA. Os três eram três pastilhas empilhadas, e três
       pastilhas do mesmo tamanho não hierarquizam nada: a moldura repetida faz
       tudo parecer igualmente importante e o dossiê inteiro vira um monte de
       botão que não é botão.
       O UP fica na bolha porque é ETIQUETA — um nome curto, que se procura de
       relance e que é a mesma coisa que aparece no cartão da fila. Os outros
       dois são FRASES, e frase em pastilha se lê pior: o olho para na moldura
       antes de chegar no texto. Fora dela, eles viram o que sempre foram, duas
       linhas de leitura. */
    /* MAIOR E MAIS ESPAÇADO, de propósito. Esta é a informação que se lê ANTES
       de escrever pra pessoa, e ela vinha em três linhas de onze pixels
       coladas — tamanho de rodapé para o que decide o texto da mensagem.
       O degrau em corpo grande é a âncora: "de 5 dias" é o que diz o tom, e é a
       primeira coisa que o olho pega. */
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-baseline gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium
                         bg-violet-400/15 text-violet-200 ring-1 ring-violet-400/30 shrink-0 self-center">
          <Repeat className="h-3 w-3 shrink-0" />
          <span className="tabular-nums">{rotuloDaRodada(task.rodada ?? 1)}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-none tabular-nums">
            {diasDaRodada(task.rodada ?? 1, regua) ?? "?"}{" "}
            <span className="text-[11.5px] font-normal text-muted-foreground">
              {(diasDaRodada(task.rodada ?? 1, regua) ?? 0) === 1 ? "dia de régua" : "dias de régua"}
            </span>
          </span>
          <span className="block text-[10.5px] text-muted-foreground/70 tabular-nums mt-1">
            rodada {task.rodada ?? 1} de {TOTAL_RODADAS}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
          {lead.diasParado === 0
            ? "calado desde hoje"
            : `${lead.diasParado} ${lead.diasParado === 1 ? "dia" : "dias"} sem responder`}
        </span>

        {/* A COR CONTINUA, o fundo é que sai. O atraso e o "é hoje" são a única
            coisa aqui que muda o que se faz agora, e tirar a marca junto com a
            moldura apagaria a informação em vez de despoluí-la. */}
        <span className={cn("flex items-center gap-2 text-[12px]",
          atrasada ? "text-amber-300 font-medium"
                   : deHoje ? "text-violet-200 font-medium"
                            : "text-muted-foreground")}>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-60" />
          {atrasada
            ? `venceu há ${diasDeAtraso(task.data, hoje)} ${diasDeAtraso(task.data, hoje) === 1 ? "dia" : "dias"}`
            : deHoje
              ? "cobrança é hoje"
              : `próximo toque em ${faltam} ${faltam === 1 ? "dia" : "dias"}`}
        </span>
      </div>
    </div>
  );
}

/* ═══════════ o follow-up de UM cliente, na ficha ═══════════
 *
 * A caixa diz apenas que a pessoa está sendo cobrada; aqui o número da rodada
 * finalmente aparece, porque aqui ele vem acompanhado do que o explica. "UP03"
 * sozinho não diz nada. "UP03, doze dias sem responder, próximo em três" diz o
 * tom exato da mensagem que precisa ser escrita — e é essa a decisão que se
 * toma com a ficha aberta.
 *
 * O DESTAQUE DE HOJE não é enfeite: o painel muda de cor e ganha uma tarja
 * quando a cobrança vence hoje, porque nessa hora ele deixa de ser consulta e
 * vira a próxima coisa a fazer. Quem abre a conversa precisa disso antes de
 * escrever "oi, tudo bem?" para alguém que está esperando o terceiro toque.
 */
function PainelFollowUpDoLead({ task, feitos, lead, hoje, regua, semMoldura, onAbrir, onConcluir }: {
  task: Task | null;
  feitos: Task[];
  lead: Lead;
  hoje: string;
  regua: Regua;
  /* NA POSIÇÃO DE REPOUSO ele mora dentro de uma seção retrátil, que já traz
     título e respiro — repetir os dois aqui daria dois títulos "Follow-up", um
     dentro do outro. Na posição de HOJE ele continua solto e destacado, porque
     ali ele não é seção: é a próxima coisa a fazer. */
  semMoldura?: boolean;
  onAbrir: () => void;
  onConcluir: () => void;
}) {
  /* "Agora" é hoje OU atrasado: se a cobrança de hoje já é trabalho, a de ontem
     é mais ainda. É o que decide a cor do painel e a posição dele na ficha. */
  const agora = !!task && task.data <= hoje;

  return (
    <div className={cn("flex flex-col gap-2",
      semMoldura ? "" : "px-3 py-3 border-b",
      !semMoldura && (agora ? "border-violet-400/20 bg-violet-400/[0.05]" : "border-white/[0.06]"))}>
      {!semMoldura && (
      <p className={cn("text-[9px] uppercase tracking-[0.12em] flex items-center gap-1",
        agora ? "text-violet-300" : "text-muted-foreground/70")}>
        <Repeat className="h-3 w-3" /> Follow-up
        {feitos.length > 0 && (
          <span className="ml-auto tabular-nums opacity-70">
            {feitos.length} de {TOTAL_RODADAS}
          </span>
        )}
      </p>
      )}

      {task ? (
        /* Sem repetir os três números: eles já estão no dossiê, algumas linhas
           acima, e aparecem lá mesmo quando a cobrança é de outro dia. Aqui o
           que interessa é o cartão — a coisa que se faz. */
        <CardFollowUp task={task} diasSemResposta={lead.diasParado} hoje={hoje} regua={regua}
          onAbrir={onAbrir} onConcluir={onConcluir} />
      ) : (
        <p className="text-[11px] text-muted-foreground/60 leading-snug">
          {feitos.length >= TOTAL_RODADAS
            ? "A régua acabou: as cinco tentativas foram feitas e o lead saiu da cadência."
            : "Sem cobrança marcada. Ou a bola está com a gente, ou a conversa saiu da cadência."}
        </p>
      )}

      {/* AS TENTATIVAS JÁ FEITAS. Uma linha por rodada seria uma lista que
          ninguém precisa reler; o que decide o tom da próxima mensagem é o
          NÚMERO de vezes que já insistimos, e isso cabe em cinco marcas. */}
      {feitos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {feitos.map((t) => (
            <span key={t.id} title={t.titulo}
              className="inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[9px] tabular-nums
                         bg-emerald-400/10 text-emerald-300/90 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {rotuloDaRodada(t.rodada ?? 1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════ editar uma mensagem já programada ═══════════
 *
 * Uma retida agendada não é um rascunho: ela está no banco, com hora marcada, e
 * vai sair sozinha. Editar aqui é a diferença entre corrigir um horário e ter
 * que cancelar e refazer a mensagem inteira — que era a única saída até agora.
 *
 * O ARQUIVO NÃO SE TROCA. Trocar mídia é subir outra e apagar a anterior do
 * bucket, e meia troca (nova subiu, antiga ficou) deixa lixo que ninguém acha
 * depois. Quem quer outro arquivo cancela e agenda de novo, que é explícito.
 */
function RetidaEditavel({ a, hojeISO, onSalvar, onCancelar }: {
  a: AgendadaRow;
  hojeISO: string;
  onSalvar: (texto: string, quando: Date) => Promise<void>;
  onCancelar: () => void;
}) {
  const inicial = new Date(a.quando);
  const [texto, setTexto] = useState(a.texto ?? "");
  const [dia, setDia] = useState(
    `${inicial.getFullYear()}-${String(inicial.getMonth() + 1).padStart(2, "0")}-${String(inicial.getDate()).padStart(2, "0")}`);
  const [hora, setHora] = useState(
    `${String(inicial.getHours()).padStart(2, "0")}:${String(inicial.getMinutes()).padStart(2, "0")}`);
  const [salvando, setSalvando] = useState(false);

  const quando = instanteDe(dia, hora);
  const mudou = texto !== (a.texto ?? "") || quando.getTime() !== inicial.getTime();
  const impedimento = motivoDeNaoAgendar({
    tipo: a.tipo, texto, temArquivo: !!a.midia_path, quando,
  });

  return (
    <div className="rounded-lg ring-1 ring-white/[0.07] bg-white/[0.02] p-2.5 flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        <Clock className="h-3 w-3 text-primary" /> {quandoBonito(a.quando)}
        <button type="button" onClick={onCancelar} title="Cancelar o envio"
          className="ml-auto text-muted-foreground/40 hover:text-red-300 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </p>

      {a.midia_nome && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{a.midia_nome}</span>
          <span className="opacity-60">(pra trocar o arquivo, cancele e agende de novo)</span>
        </p>
      )}

      <Textarea
        value={texto}
        rows={2}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={a.midia_path ? "Legenda (opcional)" : "A mensagem que o cliente vai receber"}
        className="text-[12.5px] resize-none" />

      <div className="grid grid-cols-2 gap-2">
        <SeletorDeDia valor={dia} onEscolher={setDia} hojeISO={hojeISO} />
        <SeletorDeHora valor={hora} onEscolher={setHora} opcional={false} />
      </div>

      {impedimento ? (
        <p className="flex items-start gap-1.5 text-[10.5px] text-amber-300/90 leading-snug">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-[1px]" /> {impedimento}
        </p>
      ) : mudou ? (
        <Button size="sm" className="h-7 text-[11px] self-end" disabled={salvando}
          onClick={async () => {
            setSalvando(true);
            try { await onSalvar(texto, quando); } finally { setSalvando(false); }
          }}>
          {salvando
            ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Salvando…</>
            : <>Salvar mudança <Check className="h-3 w-3 ml-1.5" /></>}
        </Button>
      ) : null}
    </div>
  );
}

/* ═══════════ o cartão de uma mensagem programada ═══════════
 *
 * Mesmo desenho dos cartões de lembrete e de follow-up: quadradinho do ícone,
 * rótulo miúdo em caixa alta, título, conteúdo, faixa de apoio embaixo da
 * linha. Uma pessoa que já lê a fila do dia lê esta sem aprender nada.
 *
 * O QUE ELE PRECISA RESPONDER, nesta ordem: quando sai, pra quem, o que diz, e
 * dá pra parar? A última é a que justifica a tela existir — a mensagem já foi
 * escrita e decidida, e o único trabalho que resta é o de mudar de ideia a
 * tempo.
 */
function CardProgramada({ a, nome, onAbrir, onCancelar }: {
  a: AgendadaRow;
  nome: string;
  onAbrir: () => void;
  onCancelar: () => void;
}) {
  const falhou = a.status === "falhou";
  const saindo = a.status === "enviando";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
      className={cn(
        "group flex flex-col text-left rounded-2xl border backdrop-blur-md p-3.5 cursor-pointer",
        "shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        falhou
          ? "border-red-400/25 bg-red-400/[0.04] hover:border-red-400/45"
          : "border-white/[0.07] bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.05]",
      )}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("h-8 w-8 rounded-xl ring-1 grid place-items-center shrink-0",
          falhou ? "bg-red-400/12 ring-red-400/25" : "bg-primary/12 ring-primary/25")}>
          {falhou ? <AlertTriangle className="h-4 w-4 text-red-400" />
            : saindo ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
            : <Clock className="h-4 w-4 text-primary" />}
        </span>
        {/* CANCELAR SÓ ENQUANTO DÁ. Depois que o despachante toma a linha o
            WhatsApp já está a caminho, e um botão que não faz nada é pior que
            botão nenhum. */}
        {a.status === "pendente" && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelar(); }}
            title="Cancelar o envio"
            className="shrink-0 h-7 w-7 grid place-items-center rounded-lg text-muted-foreground/40
                       hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className={cn("text-[10px] uppercase tracking-wide mt-2.5",
        falhou ? "text-red-300/90" : "text-muted-foreground")}>
        {falhou ? "Não saiu" : saindo ? "Saindo agora" : `Sai ${quandoBonito(a.quando)}`}
      </p>
      <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-1">{nome}</p>

      {a.midia_nome && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{a.midia_nome}</span>
        </p>
      )}
      {a.texto && (
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 flex-1">{a.texto}</p>
      )}

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06]">
        {falhou ? (
          <p className="text-[10.5px] text-red-300/80 leading-snug line-clamp-2">
            {a.erro || "A Evolution recusou o envio."}
          </p>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium
                           ring-1 bg-white/[0.05] text-muted-foreground ring-white/[0.08]">
            <Clock className="h-3 w-3" /> {faltaPara(a.quando)}
          </span>
        )}
      </div>
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
function JornadaLead({ etapas, perdidoMotivo, atual, puladas, tasksDoLead, log, programadas, onEscolherEtapa, onNovaTask, onConcluirTask, onAbrirTask, onLevarAoFinder, onLevarAoWriter, abrindoWriter = false, docsNaConversa = 0 }: {
  /** as etapas da jornada DESTE lead (a Bradesco ou a padrão, conforme o dossiê) */
  etapas: readonly EtapaDef[];
  perdidoMotivo?: string | null;
  atual: Estagio;
  puladas: Estagio[];
  tasksDoLead: Task[];
  /** cada passagem do lead por cada etapa, em ordem de tempo */
  log: PassagemDeEtapa[];
  /** as mensagens marcadas, pra aparecerem na etapa em que foram marcadas */
  programadas: AgendadaRow[];
  onEscolherEtapa: () => void;
  onNovaTask: () => void;
  /** abre a escolha dos anexos que vão para o Finder (etapa de análise) */
  onLevarAoFinder?: () => void;
  /** abre o Writer com a análise deste contato (etapa de documentação) */
  onLevarAoWriter?: () => void;
  abrindoWriter?: boolean;
  /** quantos PDFs a conversa tem, pra o botão dizer o tamanho da fila */
  docsNaConversa?: number;
  onConcluirTask: (id: string) => void;
  onAbrirTask: (t: Task) => void;
}) {
  /* O trilho são as etapas contínuas. "Perdido" é saída, não degrau: aparece
     como um aviso em cima do trilho, com o motivo, e o trilho fica apagado. */
  const trilho = etapas.filter((e) => !e.terminal);
  const perdido = !!etapas.find((e) => e.chave === atual)?.terminal;
  const iAtual = perdido ? -1 : trilho.findIndex((e) => e.chave === atual);

  /* O LOG VIRADO POR ETAPA. Ele chega em ordem de tempo, que é como a coisa
     aconteceu; a tela precisa por etapa, que é onde a informação vai morar. */
  const passagens = useMemo(
    () => passagensPorEtapa(log, trilho.map((e) => e.chave)),
    [log, trilho]);

  /* As programadas de cada etapa. Uma mensagem marcada quando o lead estava em
     Extrato foi escrita pensando em Extrato -- dali a três dias ele já mudou de
     lugar, e a lista de programadas sozinha não conta essa parte. */
  const programadasPorEtapa = useMemo(() => {
    const m = new Map<string, AgendadaRow[]>();
    for (const a of programadas) {
      if (!a.etapa) continue;
      m.set(a.etapa, [...(m.get(a.etapa) ?? []), a]);
    }
    return m;
  }, [programadas]);

  return (
    <div>
      {perdido && (
        <div className="mb-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 flex items-start gap-2">
          <X className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium">Perdido</span>
            <span className="block text-[10.5px] text-muted-foreground">{perdidoMotivo || "sem motivo registrado"}</span>
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] shrink-0" onClick={onEscolherEtapa}>
            Reabrir
          </Button>
        </div>
      )}

      {/* ── ETAPA QUE ESTA TELA NÃO CONHECE ──
          Acontece na janela entre o banco mudar e o navegador receber a versão
          nova (uma etapa renomeada, por exemplo). Sem este aviso, a jornada
          aparecia ZERADA: nenhuma etapa marcada como atual, nenhum botão, e
          nada explicando por quê. Dizer o nome cru e deixar o "alterar etapa"
          à mão é pior que a etapa certa e muito melhor que uma tela vazia. */}
      {!perdido && iAtual === -1 && atual && (
        <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-300/80" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium">Etapa: {atual}</span>
            <span className="block text-[10.5px] text-muted-foreground">
              Esta versão da tela não conhece esta etapa. Recarregue a página; se continuar, é a régua que mudou.
            </span>
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] shrink-0" onClick={onEscolherEtapa}>
            Alterar
          </Button>
        </div>
      )}
      {trilho.map((e, i) => {
        const last = i === trilho.length - 1;
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
                {pulada ? "pulada" : eAtual ? e.descricao : concluida ? "concluída" : "ainda não"}
              </p>

              {/* ── O LOG DESTA ETAPA ──
                  Uma linha por passagem, com a data. Duas linhas aqui querem
                  dizer que o lead voltou -- e é essa a informação que a etapa
                  sozinha apagava, porque `etapa` guarda uma palavra e a segunda
                  passagem sobrescrevia a primeira.
                  A DATA DA VOLTA É O QUE SE USA: é por ela que se acha a
                  conversa daquele dia e se descobre o que fez o lead recuar. */}
              <PassagensDaEtapa
                passagens={passagens.get(e.chave) ?? []}
                agendadas={programadasPorEtapa.get(e.chave) ?? []}
                eAtual={eAtual} />

              {eAtual && (
                <motion.div className="mt-2 flex flex-col gap-1.5 overflow-hidden"
                  initial={false} animate={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                  {tasksDoLead.map((t) => {
                    const Ico = t.tipo === "follow_up" ? Repeat : BellRing;
                    return (
                      <div key={t.id}
                        role="button" tabIndex={0}
                        onClick={() => onAbrirTask(t)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrirTask(t); } }}
                        className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5
                                   cursor-pointer transition-colors hover:border-primary/40 hover:bg-white/[0.05]
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                        <span className="h-5 w-5 rounded-md bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
                          <Ico className="h-3 w-3 text-primary" />
                        </span>
                        {/* A hora vem ANTES do título: numa faixa estreita ela
                            é o que decide se a task é pra agora ou pra depois,
                            e no fim da linha some no truncate. */}
                        {t.hora && (
                          <span className="shrink-0 rounded px-1 py-[1px] text-[9.5px] font-semibold tabular-nums bg-primary/15 text-primary">
                            {horaBonita(t.hora)}
                          </span>
                        )}
                        <span className={cn("text-[11px] font-medium truncate flex-1", t.feita && "line-through")}>
                          {t.titulo}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); onConcluirTask(t.id); }}
                          title={t.feita ? "Reabrir" : "Concluir"}
                          className={cn("shrink-0 transition-colors",
                            t.feita ? "text-primary" : "text-muted-foreground/35 hover:text-primary/70")}>
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  {/* ── A PONTE COM O FINDER ──
                      Nesta etapa o extrato já está na conversa: é isso que
                      trouxe o lead até aqui. O caminho antigo era baixar o PDF,
                      achar na pasta de downloads, abrir o Finder e arrastar.
                      Aqui é escolher quais anexos vão e clicar. */}
                  {e.chave === "aguardando_analise" && onLevarAoFinder && (
                    <button onClick={onLevarAoFinder}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.07] py-1.5 text-[11px] font-medium text-primary hover:bg-primary/[0.13] transition-colors">
                      <ScanSearch className="h-3.5 w-3.5" />
                      Levar ao Finder
                      {docsNaConversa > 0 && (
                        <span className="rounded-full bg-primary/15 px-1.5 text-[9.5px] tabular-nums">{docsNaConversa}</span>
                      )}
                    </button>
                  )}

                  {/* ── E A PONTE COM O WRITER ──
                      Aqui o que falta produzir é o kit que vai para a
                      assinatura. O Writer abre em outra guia, já com a análise
                      comercial deste contato: o nome que o extrato revelou, o
                      CPF e o réu entram sozinhos. */}
                  {e.chave === "aguardando_documentos" && onLevarAoWriter && (
                    <button onClick={onLevarAoWriter} disabled={abrindoWriter}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.07] py-1.5 text-[11px] font-medium text-primary hover:bg-primary/[0.13] transition-colors disabled:opacity-60">
                      {abrindoWriter
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Abrindo o Writer…</>
                        : <><PenSquare className="h-3.5 w-3.5" /> Levar ao Writer</>}
                    </button>
                  )}

                  <button onClick={onNovaTask}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/[0.04] py-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Programar mensagem
                  </button>

                  {/* SEM TRAVA NO FIM DA RÉGUA. Antes o botão sumia em
                      "Fechado", porque não havia próxima -- e "não há pra onde
                      avançar" foi confundido com "não há o que mudar". Fechar
                      por engano acontece, e desfazer era impossível pela tela:
                      a etapa que mais precisa de saída era a única sem nenhuma. */}
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] mt-0.5"
                    onClick={onEscolherEtapa}>
                    Alterar etapa
                  </Button>
                </motion.div>
              )}

              {/* O "pular pra cá" saiu daqui: pular etapa é decisão, e decisão
                  não deveria caber num link de dez pixels espalhado cinco vezes
                  pela coluna, onde o clique errado é do tamanho do certo. Agora
                  é um botão só, que abre a escolha e mostra o que vai virar
                  pulada antes de virar. */}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ OS AJUSTES DO ATENDIMENTO ═══════════════════════
 *
 * A aba nasce quase vazia de propósito, e é assim que uma tela de ajustes deve
 * nascer: com o que já existe espalhado e precisa de casa, e não com uma lista
 * de opções inventadas para ela parecer completa. Opção que ninguém pediu é
 * opção que ninguém mexe — e cada uma delas é um jeito a mais de o sistema se
 * comportar diferente entre duas pessoas, sem que nenhuma das duas saiba por quê.
 *
 * O QUE ENTROU AQUI tem uma coisa em comum: são decisões que valem para a tela
 * inteira e não para a conversa aberta. O som, o número que abre, a régua, o que
 * sai sozinho. O que é DA CONVERSA continua na conversa — etapa, lembrete, nota,
 * cobrança —, porque ninguém procura ajustes para responder um cliente.
 *
 * O QUE NÃO ESTÁ AQUI, ESTÁ DITO. Cada bloco que só mostra e não muda tem o
 * botão que leva onde se muda. Uma tela de ajustes que repete editores é uma
 * tela que vai divergir da outra na primeira mudança.
 */
function PainelAjustes({
  instancias, instanciaId, nomeDe, onEscolherInstancia, mudo, onAlternarMudo, regua,
  agendadas, aoVivo, onAbrirRegua, onAbrirProgramadas, onReaplicarEventos, onDiagnosticar,
  onPuxarFotos, puxandoFotos,
}: {
  instancias: Instancia[];
  instanciaId: string;
  nomeDe: (nome: string) => string;
  onEscolherInstancia: (id: string) => void;
  mudo: boolean;
  onAlternarMudo: () => void;
  regua: Regua;
  agendadas: AgendadaRow[];
  aoVivo: boolean;
  onAbrirRegua: () => void;
  onAbrirProgramadas: () => void;
  onReaplicarEventos: () => void;
  onDiagnosticar: () => void;
  onPuxarFotos: () => void;
  puxandoFotos: boolean;
}) {
  const pendentes = agendadas.filter((a) => a.status === "pendente").length;
  const falhas = agendadas.filter((a) => a.status === "falhou").length;

  const Bloco = ({ titulo, descricao, children }: {
    titulo: string; descricao: string; children: React.ReactNode;
  }) => (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 flex flex-col gap-2.5">
      <div>
        <h3 className="text-[12.5px] font-medium">{titulo}</h3>
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{descricao}</p>
      </div>
      {children}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Ajustes do atendimento
          </h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            O que vale para a tela inteira. O que é de uma conversa continua na
            conversa: etapa, lembrete, nota e cobrança se mexem lá, com o cliente
            na frente.
          </p>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {/* ── O NÚMERO QUE ABRE ── */}
          <Bloco
            titulo="Número que abre por padrão"
            descricao="Vale só neste computador. Quem senta nesta mesa atende por um número, quem senta na outra atende por outro, e a conta é a mesma.">
            <div className="flex flex-col gap-1">
              {instancias.map((i) => (
                <button key={i.id} onClick={() => onEscolherInstancia(i.id)}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    i.id === instanciaId
                      ? "bg-primary/12 ring-1 ring-primary/30"
                      : "hover:bg-white/[0.05] ring-1 ring-transparent")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0",
                    i.status === "conectado" ? "bg-emerald-400" : "bg-muted-foreground/40")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] truncate">{nomeDe(i.nome)}</span>
                    <span className="block text-[10px] text-muted-foreground/70 tabular-nums">
                      {telefoneBonito(i.telefone)} · {i.status === "conectado" ? "conectado" : "desconectado"}
                    </span>
                  </span>
                  {i.id === instanciaId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </Bloco>

          {/* ── O SOM ── */}
          <Bloco
            titulo="Aviso sonoro de mensagem nova"
            descricao="Também vale só neste computador. Quem atende de fone e quem atende com cliente na sala querem coisas opostas.">
            <button onClick={onAlternarMudo}
              className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors text-left",
                mudo ? "bg-white/[0.04] hover:bg-white/[0.07]" : "bg-emerald-400/10 ring-1 ring-emerald-400/25")}>
              {mudo
                ? <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px]">{mudo ? "Desligado" : "Ligado"}</span>
                <span className="block text-[10px] text-muted-foreground/70">
                  {mudo ? "nada toca quando chega mensagem" : "um bipe curto por mensagem que chega"}
                </span>
              </span>
            </button>
          </Bloco>

          {/* ── AS FOTOS DE PERFIL ── */}
          <Bloco
            titulo="Fotos de perfil dos contatos"
            descricao="De agora em diante a foto entra sozinha na primeira mensagem que a conversa trocar. Este botão é para as conversas que já existiam.">
            <button onClick={onPuxarFotos} disabled={!aoVivo || puxandoFotos}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors
                         bg-white/[0.04] hover:bg-white/[0.07] disabled:opacity-50 disabled:hover:bg-white/[0.04]">
              {puxandoFotos
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                : <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px]">{puxandoFotos ? "Perguntando ao WhatsApp…" : "Puxar as 10 mais recentes"}</span>
                <span className="block text-[10px] text-muted-foreground/70">
                  dez por vez, com respiro entre uma e outra. Quem esconde a foto continua nas iniciais
                </span>
              </span>
            </button>
          </Bloco>

          {/* ── A RÉGUA, SÓ DE LEITURA ──
              Mostrar aqui e editar lá não é meio caminho: é a única forma de a
              régua não existir em dois lugares e divergir no primeiro ajuste. */}
          <Bloco
            titulo="A régua de follow-up"
            descricao="De quantos em quantos dias de silêncio cada cobrança vence. Vale para o escritório inteiro.">
            <div className="flex flex-wrap gap-1.5">
              {regua.map((d, i) => (
                <span key={i}
                  className="rounded-lg bg-violet-400/10 ring-1 ring-violet-400/25 px-2 py-1
                             text-[11px] tabular-nums text-violet-200">
                  {rotuloDaRodada(i + 1)} · {d} {d === 1 ? "dia" : "dias"}
                </span>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] self-start"
              onClick={onAbrirRegua}>
              <Pencil className="h-3.5 w-3.5" /> Ajustar na aba Follow-up
            </Button>
          </Bloco>

          {/* ── O QUE SAI SOZINHO ──
              O único bloco que não é preferência: é ESTADO. As mensagens
              programadas são a única coisa do módulo que acontece sem ninguém na
              frente da tela, e "quantas estão a caminho, quantas falharam" é a
              pergunta que ninguém faz até o dia em que devia ter feito. */}
          <Bloco
            titulo="O que sai sozinho"
            descricao="As mensagens programadas disparam com o escritório fechado. Este é o estado da fila agora.">
            <div className="flex gap-2">
              <span className="flex-1 rounded-lg bg-white/[0.04] px-2.5 py-2">
                <span className="block text-[17px] font-semibold tabular-nums leading-none">{pendentes}</span>
                <span className="block text-[10px] text-muted-foreground/70 mt-0.5">a caminho</span>
              </span>
              <span className={cn("flex-1 rounded-lg px-2.5 py-2",
                falhas > 0 ? "bg-red-400/10 ring-1 ring-red-400/25" : "bg-white/[0.04]")}>
                <span className={cn("block text-[17px] font-semibold tabular-nums leading-none",
                  falhas > 0 && "text-red-300")}>{falhas}</span>
                <span className="block text-[10px] text-muted-foreground/70 mt-0.5">falharam</span>
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px] self-start"
              onClick={onAbrirProgramadas}>
              <Clock className="h-3.5 w-3.5" /> Ver a fila
            </Button>
          </Bloco>

          {/* ── A LIGAÇÃO COM O WHATSAPP ──
              Os dois botões que já existiam no cartão da instância, também aqui,
              e não no lugar dele: lá são socorro no meio do trabalho, aqui são
              manutenção. É o mesmo código nos dois — botão repetido chamando a
              mesma função não diverge; editor repetido diverge. */}
          <Bloco
            titulo="A ligação com o WhatsApp"
            descricao="Quando a mensagem para de chegar sem erro nenhum na tela, o problema costuma ser a lista de eventos do webhook."><div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]"
                onClick={onDiagnosticar} disabled={!aoVivo}>
                <Stethoscope className="h-3.5 w-3.5" /> Diagnosticar
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]"
                onClick={onReaplicarEventos} disabled={!aoVivo}>
                <RefreshCw className="h-3.5 w-3.5" /> Reaplicar eventos
              </Button>
            </div>
          </Bloco>
        </div>

        {/* O QUE AINDA NÃO SE AJUSTA, DITO EM VOZ ALTA. Uma tela de ajustes que
            some com o que não tem faz a pessoa procurar por dez minutos algo que
            não existe. */}
        <p className="text-[10.5px] text-muted-foreground/60 leading-snug">
          Ainda não se ajusta por aqui: o texto das mensagens padrão da régua (fica
          na aba Follow-up), as etapas da jornada e a janela de horário em que as
          programadas podem sair — hoje elas saem na hora marcada, qualquer que
          seja.
        </p>
      </SpotlightCard>
    </div>
  );
}

/* ── AS PASSAGENS POR UMA ETAPA ──────────────────────────────────────────
 *
 * "Entrou aqui em 05/09" é uma frase; "entrou aqui em 05/09 e de novo em 12/09,
 * voltando da Proposta" é uma HISTÓRIA, e é ela que muda a conversa. Um lead
 * que bateu duas vezes na mesma etapa travou em alguma coisa, e a data da volta
 * é o que permite achar a conversa daquele dia e descobrir o quê.
 *
 * A ETAPA CORRENTE MOSTRA HÁ QUANTO TEMPO. Nas outras, o tempo parado não
 * significa nada — o lead já saiu de lá. Na atual, é a pergunta inteira.
 *
 * O QUE NÃO SE SABE, NÃO SE INVENTA. As conversas anteriores ao log não têm
 * história gravada: essas linhas dizem "desde antes do registro" em vez de
 * exibirem uma data que parece apurada e não é.
 */
function PassagensDaEtapa({ passagens, agendadas, eAtual }: {
  passagens: PassagemNaTela[];
  agendadas: AgendadaRow[];
  eAtual: boolean;
}) {
  if (passagens.length === 0 && agendadas.length === 0) return null;
  const ultima = passagens[passagens.length - 1];

  return (
    <div className="mt-1.5 flex flex-col gap-[3px]">
      {passagens.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[9.5px] leading-tight text-muted-foreground/60">
          <span className="h-1 w-1 rounded-full bg-current shrink-0 opacity-70" />
          {p.estimado ? (
            <span className="italic">desde antes do registro</span>
          ) : (
            <>
              <span className="tabular-nums">{quandoDaPassagem(p.entrouEm)}</span>
              {p.voltou && (
                <span className="text-amber-300/70">
                  voltou{p.de ? ` de ${rotuloDaEtapa(undefined, p.de)}` : ""}
                </span>
              )}
              {/* A CONTAGEM SÓ APARECE QUANDO PASSA DE UMA. "1ª vez" em toda
                  etapa de todo lead seria ruído em cinco linhas por ficha, pra
                  dizer o que o normal já diz. */}
              {p.vez > 1 && <span className="opacity-70">{p.vez}ª vez</span>}
            </>
          )}
        </p>
      ))}

      {eAtual && ultima && !ultima.estimado && (
        <p className="text-[9.5px] leading-tight text-muted-foreground/50 pl-2.5">
          aqui {tempoNaEtapa(ultima.entrouEm)}
        </p>
      )}

      {agendadas.map((a) => (
        <p key={a.id}
          title={a.texto ?? a.midia_nome ?? "mensagem programada"}
          className="flex items-center gap-1.5 text-[9.5px] leading-tight text-primary/70">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span className="tabular-nums shrink-0">{quandoDaPassagem(a.quando)}</span>
          <span className="truncate opacity-80">{a.texto || a.midia_nome || "mensagem"}</span>
        </p>
      ))}
    </div>
  );
}

/* ── um campo do dossiê: valor vazio DIZ que está vazio ───────────────────
   "não perguntado" é informação; espaço em branco é só espaço em branco, e a
   atendente não consegue distinguir o que ninguém perguntou do que a pessoa
   não soube responder. */
/* ── a base, no dossiê ──
   Com base: qual é, como se soube (planilha ou atendente) e qual jornada isso
   liga, com um "alterar" discreto para o caso de a detecção ter errado. Sem
   base: a pergunta e as opções, porque enquanto ela não for respondida o lead
   anda pela régua padrão e não pela dele. */
function BaseDoDossie({ baseChave, baseOrigem, baseNome, jornada, onInformar }: {
  baseChave?: string | null;
  baseOrigem?: "detectada" | "informada" | null;
  baseNome?: string | null;
  jornada?: "padrao" | "bradesco";
  onInformar: (base: string) => void;
}) {
  const [alterando, setAlterando] = useState(false);
  const opcoes = (
    <span className="flex flex-wrap items-center gap-1 mt-0.5">
      {BASES.map((b) => (
        <button key={b.chave} onClick={() => { onInformar(b.chave); setAlterando(false); }}
          className={cn("rounded-md px-2 py-[3px] text-[10.5px] font-medium ring-1 transition-colors",
            b.chave === baseChave
              ? "bg-primary/10 text-primary ring-primary/25"
              : "bg-white/[0.04] ring-white/[0.10] hover:bg-white/[0.09]")}>
          {b.curto}
        </button>
      ))}
    </span>
  );
  if (!baseChave) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
        <span className="text-[9.5px] text-muted-foreground/70 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-300/80" /> Base
        </span>
        <span className="text-[11px] text-foreground/85">Dossiê incompleto. Este número não está em nenhuma base. De onde ele veio?</span>
        {opcoes}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] text-muted-foreground/70 flex items-center gap-1"><Database className="h-3 w-3" /> Base</span>
      <span className="text-[11.5px] break-words flex items-center gap-2">
        <span>{baseNome ?? baseChave}</span>
        <button onClick={() => setAlterando((v) => !v)} className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
          {alterando ? "fechar" : "alterar"}
        </button>
      </span>
      <span className="text-[10px] text-muted-foreground/60">
        {baseOrigem === "informada" ? "informada pelo atendente" : "detectada pelo telefone na planilha"}
        {" · jornada "}{jornada === "bradesco" ? "Bradesco" : "padrão"}
      </span>
      {alterando && opcoes}
    </div>
  );
}

/* ── A CARA DA PESSOA ──
   A foto quando ela existe; o desenho de uma pessoa quando não.

   AS INICIAIS SAÍRAM. Elas repetiam o nome que já está escrito ao lado, em
   letra menor e sem acrescentar nada, e num nome que é emoji ou "😎" viravam
   rabisco. O ícone diz a única coisa que falta ali: é gente, e não sabemos a
   cara. As duas formas têm o mesmo tamanho e o mesmo anel, então trocar uma
   pela outra não mexe no layout. */
function AvatarDoLead({ foto, tamanho, classe }: {
  foto?: string | null;
  /** as classes de tamanho, iguais nas duas formas */
  tamanho: string;
  /** cor de fundo e anel da reserva, que muda conforme o estado da conversa */
  classe: string;
}) {
  if (foto) {
    return (
      <img src={foto} alt="" loading="lazy"
        className={cn(tamanho, "rounded-full object-cover ring-1 ring-white/10 bg-white/[0.04]")} />
    );
  }
  return (
    <span className={cn(tamanho, "rounded-full grid place-items-center ring-1", classe)}>
      <User className="h-1/2 w-1/2" strokeWidth={1.8} />
    </span>
  );
}

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
function CardInstancia({ instancia, todas, maquete, abas, selecao, apelidos, corDe, nomeDe, onEditarMarca, onTrocar, onAlternar, onConectar, onReaplicar, onImportar, onDiagnosticar }: {
  instancia: Instancia; todas: Instancia[];
  /** os dados da tela são inventados — quem abre sem contexto precisa saber */
  maquete?: boolean;
  /** as abas da página moram aqui: uma faixa no topo, não duas */
  abas?: React.ReactNode;
  /** os números escolhidos, na ordem; o primeiro é o principal */
  selecao: Instancia[];
  apelidos: Map<string, string>;
  /** a cor da etiqueta de um número: a escolhida, ou a derivada do nome */
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  /** o nome que o número tem na tela; o da Evolution continua sendo a chave */
  nomeDe: (nome: string) => string;
  onEditarMarca: (nome: string) => void;
  onTrocar: (id: string) => void;
  onAlternar: (id: string) => void;
  onConectar: () => void;
  onReaplicar: () => void;
  onImportar: () => void;
  onDiagnosticar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const on = instancia.status === "conectado";
  const varios = selecao.length > 1;
  return (
    /* SEM CARTÃO. A instância não é uma ferramenta da bancada — é o CONTEXTO
       dela: por qual número tudo aqui embaixo está acontecendo. Dentro de um
       cartão ela virava o quinto painel, disputando a mesma superfície da
       caixa, da conversa e da ficha, e a tela passava a ter cinco objetos
       quando tem quatro.
       Solta, ela lê como cabeçalho: um título que não precisa de moldura pra
       existir. E o cartão que sobrou é o que de fato guarda trabalho. */
    /* NO CELULAR ELE QUEBRA EM DUAS LINHAS. Foto, nome e o botão de trocar
       ocupam a primeira; as abas descem pra segunda e rolam de lado. Numa
       linha só, com 360px de largura, o nome truncaria em três letras e o
       botão viraria um retângulo sem texto. */
    <div className="shrink-0 px-1 pb-0.5 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2">
      {/* A FOTO DO PERFIL É IDENTIDADE, NÃO STATUS. Ela fica neutra: quem diz
          se o número está de pé é o selo ao lado do nome, e só ele. O mesmo
          recado em três lugares — anel colorido, pontinho na foto e selo —
          fazia o card inteiro parecer um alarme aceso. */}
      {/* COM MAIS DE UM NÚMERO, AS FOTOS SE EMPILHAM. Uma foto só, num modo em
          que a caixa mostra dois números, seria a tela dizendo o contrário do
          que está fazendo. Empilhadas com um dedo de sobreposição, elas contam
          quantos são antes de qualquer texto — e o anel escuro em volta de cada
          uma é o que separa duas fotos parecidas encostadas. */}
      <div className="shrink-0 flex items-center">
        {(varios ? selecao : [instancia]).slice(0, 3).map((i, k) => (
          <div key={i.id}
            title={nomeDe(i.nome)}
            style={{ marginLeft: k === 0 ? 0 : "-0.85rem", zIndex: 10 - k }}
            className={cn("relative rounded-full overflow-hidden grid place-items-center font-semibold",
              "bg-white/[0.05] text-foreground/80 ring-1 ring-white/10",
              varios ? "h-9 w-9 text-[11px] outline outline-2 outline-[#0d0f12]" : "h-11 w-11 text-[13px]")}>
            {i.fotoUrl
              ? <img src={i.fotoUrl} alt="" className="h-full w-full object-cover"
                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              : i.avatar}
          </div>
        ))}
        {varios && selecao.length > 3 && (
          <div style={{ marginLeft: "-0.85rem" }}
            className="relative h-9 w-9 rounded-full grid place-items-center text-[10px] font-semibold
                       bg-white/[0.10] text-foreground/70 ring-1 ring-white/10 outline outline-2 outline-[#0d0f12]">
            +{selecao.length - 3}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate">
            {rotuloDaSelecao(selecao.map((i) => i.nome), nomeDe(instancia.nome))}
          </span>
          {/* CAIXA CRUZADA É UM MODO, e a tela diz isso em vez de deixar
              descobrir pelas linhas. Sem o selo, uma conversa de outro número no
              meio da lista parece erro de filtro. */}
          {varios && (
            <span className="rounded-full px-1.5 py-[1px] text-[9.5px] ring-1 shrink-0
                             bg-sky-400/10 text-sky-300 ring-sky-400/25">
              caixa cruzada
            </span>
          )}
          {!varios && (
          <span className={cn("rounded-full px-1.5 py-[1px] text-[9.5px] ring-1 shrink-0",
            on ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25"
               : "bg-rose-400/10 text-rose-300 ring-rose-400/25")}>
            {on ? "conectado" : "desconectado"}
          </span>
          )}
          {/* O selo de maquete perdeu a casa quando o título saiu, e veio pra
              cá — que é onde ele importa mesmo: colado no número, dizendo que
              aquele número e aquelas pessoas não existem. */}
          {maquete && (
            <span className="rounded-full px-2 py-[1px] text-[9px] uppercase tracking-[0.12em] bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25 shrink-0">
              maquete
            </span>
          )}
        </div>
        {/* SÓ O NÚMERO. Saíram daqui o nome do gateway, o "sincronizado há X
            min", a contagem de conversas e a de não lidas — quatro coisas que
            falavam da ENGRENAGEM, não do atendimento. Quantas conversas e
            quantas não lidas a caixa logo abaixo já mostra, contando as mesmas
            linhas; e "Evolution API" só interessa no dia em que ela quebra,
            que é o dia em que se abre o diagnóstico.
            O que sobrou responde a única pergunta que essa faixa existe pra
            responder: por qual número eu estou falando. */}
        {varios ? (
          /* OS APELIDOS APARECEM AQUI PRIMEIRO, e não só nas linhas da caixa.
             É onde se aprende o código: "PDA2 é o Portal, ME é o Matheus". Sem
             esta legenda, o selo em cima da foto do contato seria uma sigla que
             ninguém sabe ler — e o caso que ele existe pra resolver é justamente
             o de dois números com a MESMA foto, onde não há de onde deduzir. */
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {selecao.map((i) => {
              const cor = corDe(i.nome);
              return (
                <span key={i.id} className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                  <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide shrink-0",
                    cor.fundo, cor.texto)}>
                    {apelidos.get(i.nome) ?? "?"}
                  </span>
                  <span className="truncate max-w-[9rem]">{nomeDe(i.nome)}</span>
                  <span className={cn("h-1 w-1 rounded-full shrink-0",
                    i.status === "conectado" ? "bg-emerald-400" : "bg-rose-400")} />
                </span>
              );
            })}
          </span>
        ) : (
          <span className="text-[10.5px] text-muted-foreground tabular-nums">{instancia.telefone}</span>
        )}
      </div>

      {/* `order` põe as abas depois do botão no celular e antes dele no
          monitor, sem duplicar a marcação: é a mesma peça, em dois lugares. */}
      <div className="order-last md:order-none w-full md:w-auto min-w-0">{abas}</div>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 shrink-0 text-[11.5px]">
            <ArrowLeftRight className="h-3.5 w-3.5 md:mr-1.5" />
            <span className="hidden md:inline">Trocar instância</span>
            <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[19rem] p-1.5">
          <p className="px-2 py-1 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Números conectados
          </p>
          {/* DOIS GESTOS NA MESMA LINHA, e a diferença entre eles é o ponto:
              CLICAR NA LINHA é "quero trabalhar só neste" — o gesto antigo, o
              mais comum, e o que fecha o popover.
              MARCAR O QUADRADINHO é "quero este TAMBÉM" — soma o número à caixa
              e não fecha nada, porque quem está montando uma caixa cruzada
              costuma marcar mais de um.
              Fundir os dois num clique só obrigaria a escolher qual dos dois
              significados o clique tem, e o escolhido seria o errado metade das
              vezes. */}
          <div className="flex flex-col gap-0.5">
            {todas.map((i) => {
              const marcada = selecao.some((x) => x.id === i.id);
              const principal = i.id === instancia.id;
              const iOn = i.status === "conectado";
              const cor = corDe(i.nome);
              return (
                <div key={i.id}
                  className={cn("flex items-center gap-2 rounded-lg pl-1.5 pr-2 transition-colors",
                    marcada ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                  <button
                    onClick={() => onAlternar(i.id)}
                    title={marcada
                      ? (selecao.length === 1 ? "É o único número escolhido" : "Tirar da caixa")
                      : "Somar este número à caixa"}
                    disabled={marcada && selecao.length === 1}
                    className={cn("h-4 w-4 shrink-0 rounded-[4px] grid place-items-center ring-1 transition-colors",
                      marcada
                        ? "bg-primary/80 ring-primary/60 text-primary-foreground"
                        : "ring-white/[0.18] hover:ring-white/40",
                      marcada && selecao.length === 1 && "opacity-60 cursor-default")}>
                    {marcada && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>

                  <button
                    onClick={() => { onTrocar(i.id); setAberto(false); }}
                    title="Trabalhar só neste número"
                    className="flex items-center gap-2.5 py-1.5 text-left min-w-0 flex-1">
                    <span className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden grid place-items-center text-[10.5px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
                      {i.fotoUrl
                        ? <img src={i.fotoUrl} alt="" className="h-full w-full object-cover"
                               onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        : i.avatar}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {/* O APELIDO TAMBÉM AQUI, e não só na caixa: é onde se
                            aprende que sigla é de quem, e o único lugar que
                            resolve dois números com a MESMA foto de perfil. */}
                        <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide shrink-0",
                          cor.fundo, cor.texto)}>
                          {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                        </span>
                        <span className="block text-[12px] font-medium truncate">{nomeDe(i.nome)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={cn("h-1 w-1 rounded-full", iOn ? "bg-emerald-400" : "bg-rose-400")} />
                        <span className="tabular-nums">{i.telefone}</span>
                        {i.naoLidas > 0 && (
                          <span className="text-foreground/70 tabular-nums">· {i.naoLidas} não lidas</span>
                        )}
                      </span>
                    </span>
                    {principal && varios && (
                      <span className="shrink-0 text-[8.5px] uppercase tracking-wide text-muted-foreground/60">
                        principal
                      </span>
                    )}
                  </button>

                  {/* ── A ENGRENAGEM DO NÚMERO ──
                      Era um lápis, e lápis prometia pouco: só a etiqueta. Como
                      engrenagem ela vira a porta de TUDO que é daquele número —
                      o nome que ele tem aqui, a etiqueta, o estado da sessão, a
                      manutenção da ligação. Fica nesta linha porque é aqui que
                      se olha os números lado a lado e se percebe qual deles
                      está com problema. */}
                  <button
                    onClick={() => { setAberto(false); onEditarMarca(i.nome); }}
                    title="Configurações deste número"
                    className="shrink-0 h-6 w-6 grid place-items-center rounded-md text-muted-foreground/40
                               hover:text-foreground hover:bg-white/[0.08] transition-colors">
                    <SlidersHorizontal className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* O QUE "PRINCIPAL" QUER DIZER, escrito onde a palavra aparece.
              Conversa nova, QR e importação precisam de UM número, e escolher
              sozinho qual seria mandar mensagem pelo número que ninguém pediu. */}
          {varios && (
            <p className="px-2 pt-1.5 text-[10px] text-muted-foreground/60 leading-snug">
              A caixa mostra os {selecao.length} juntos. Conversa nova sai pelo principal
              — clique num número pra torná-lo o principal.
            </p>
          )}
          <div className="mt-1 border-t border-white/[0.06] pt-1.5 flex flex-col gap-0.5">
            <button
              onClick={() => { setAberto(false); onConectar(); }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <Plus className="h-3.5 w-3.5 shrink-0" /> Adicionar número da Evolution
            </button>
            {/* ANTES DE CONSERTAR, PERGUNTAR. "Conectou mas não chega mensagem"
                tem seis causas que se parecem na tela, e reconfigurar às cegas
                acerta em algumas e esconde as outras. Isto lê o que a Evolution
                TEM gravado e diz qual é. */}
            <button
              onClick={() => { setAberto(false); onDiagnosticar(); }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <Stethoscope className="h-3.5 w-3.5 shrink-0" /> Por que não chega mensagem?
            </button>
            {/* Reapontar o webhook de um número que já existe. Ele foi criado à
                mão no painel da Evolution, e a lista de eventos dele é o que
                alguém marcou naquele dia — não o que este sistema precisa.
                Aqui a lista passa a ser a do código. */}
            <button
              onClick={() => { setAberto(false); onReaplicar(); }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" /> Reconfigurar eventos
            </button>
            {/* Trazer as conversas que já existem no aparelho. Número recém
                conectado tem caixa vazia porque o sistema só conhece quem
                escreve daqui pra frente — e caixa vazia num WhatsApp cheio
                parece que a conexão não funcionou. */}
            <button
              onClick={() => { setAberto(false); onImportar(); }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <Inbox className="h-3.5 w-3.5 shrink-0" /> Importar conversas do aparelho
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ═════════════════════════ a central de follow-up ═════════════════════════
 *
 * Substitui uma planilha que calculava ao contrário: "hoje é dia X, então quem
 * leva o UP03 é quem entrou em X−15" — e alguém ia procurar essas pessoas à
 * mão, uma a uma, no chat. O trabalho todo era ACHAR QUEM; fazer era o fácil.
 *
 * Aqui a lista já vem pronta, e a ordem é a única que importa numa fila de
 * cobrança: o que venceu primeiro. ATRASADAS no topo, e com o tamanho do atraso
 * escrito — três dias e trinta dias pedem conversas diferentes, e uma fila que
 * não diz isso faz todo mundo escrever a mesma coisa.
 *
 * O QUE FICA DE FORA É TÃO IMPORTANTE QUANTO. Lead que ESCREVEU e está
 * esperando resposta não aparece aqui: aquilo é caixa não respondida, urgência
 * de hoje, e misturar as duas faria o caso urgente sumir embaixo da rotina.
 */
function CentralFollowUp({ tasks, leads, hoje, cadencias, onConcluir, onAbrirConversa }: {
  tasks: Task[];
  leads: Lead[];
  hoje: string;
  /* AS RÉGUAS DE TODOS OS NÚMEROS, e não uma só: esta fila mistura leads dos
     números escolhidos, e "Follow-up de 5 dias" num cartão do Portal ao lado de
     um do escritório, que cobra em 7, seria o rótulo errado na metade da tela. */
  cadencias: ReguasPorNumero | undefined;
  onConcluir: (id: string) => void;
  onAbrirConversa: (leadId: string) => void;
}) {
  const fila = useMemo(() => {
    const fu = tasks.filter((t) => t.tipo === "follow_up" && !t.feita);
    return fu.sort((a, b) => a.data.localeCompare(b.data));
  }, [tasks]);

  const atrasadas = fila.filter((t) => t.data < hoje);
  const deHoje = fila.filter((t) => t.data === hoje);
  const futuras = fila.filter((t) => t.data > hoje);
  const porLead = new Map(leads.map((l) => [l.id, l]));

  /* A GRADE, e não uma lista de linhas. Cada cobrança é uma unidade de
     trabalho — abrir, ler o histórico, escrever — e cartão lado a lado é o
     desenho que a aba Tarefas já usa pra isso. Linha empilhada dava a impressão
     de lista de conferência, coisa que se marca em série sem abrir. */
  const Grupo = ({ titulo, itens, tom }: { titulo: string; itens: Task[]; tom: string }) => {
    if (itens.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className={cn("text-[9.5px] uppercase tracking-[0.12em] flex items-center gap-2", tom)}>
          {titulo}
          <span className="tabular-nums opacity-70">{itens.length}</span>
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {itens.map((t) => (
            <CardFollowUp
              key={t.id}
              task={t}
              diasSemResposta={porLead.get(t.leadId)?.diasParado ?? 0}
              hoje={hoje}
              regua={reguaDoNumero(cadencias, porLead.get(t.leadId)?.instancia)}
              onAbrir={() => onAbrirConversa(t.leadId)}
              onConcluir={() => onConcluir(t.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-4">
        {/* Sem parágrafo explicando a régua. Quem abre esta aba abre pra
            trabalhar a fila, não pra ler como ela funciona — e o texto ocupava
            a altura de dois cartões todo dia, para ser lido uma vez. */}
        {fila.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 py-6 text-center">
            Ninguém para cobrar hoje. Toda conversa aberta está com a bola do outro lado.
          </p>
        ) : (
          <>
            <Grupo titulo="Atrasadas" itens={atrasadas} tom="text-amber-300" />
            <Grupo titulo="Hoje" itens={deHoje} tom="text-foreground/80" />
            <Grupo titulo="Programadas" itens={futuras} tom="text-muted-foreground/70" />
          </>
        )}
      </SpotlightCard>
    </div>
  );
}

/* ═══════════ AS MENSAGENS PADRÃO DA RÉGUA ═══════════
 *
 * Um cartão à parte, acima da fila. A fila responde "quem eu cobro hoje"; isto
 * responde "o que a gente diz em cada rodada" — uma é trabalho do dia, a outra é
 * decisão do escritório, tomada uma vez e revista de vez em quando. Misturar as
 * duas faria a decisão virar item de lista.
 *
 * CADA RODADA COM O TEMPO ESCRITO, porque é o tempo que justifica o tom: "1 dia
 * sem responder" pede um lembrete leve, "60 dias" pede uma mensagem de
 * encerramento. Sem o número ao lado, os cinco textos parecem cinco variações
 * arbitrárias do mesmo recado.
 *
 * A MENSAGEM APARECE COMO ELA VAI CHEGAR — uma bolha, do lado de quem envia,
 * com o anexo se houver. Um campo de formulário mostrando o mesmo texto não
 * responde a única pergunta que importa aqui: isso está bom pra mandar pra um
 * cliente?
 *
 * POR ORA NADA DISPARA SOZINHO, e o cartão diz isso em voz alta. A retenção já
 * mostrou o tamanho do cuidado que uma mensagem automática exige; ligar cinco
 * delas de uma vez, para a carteira inteira, seria começar pelo lado perigoso.
 */
/* A TIRA DE ANEXOS — os arquivos escolhidos, na ordem em que vão sair.
 *
 * Uma tira e não uma pilha: o WhatsApp mostra assim, e o número de arquivos é a
 * informação que a pessoa precisa conferir num relance antes de programar. Cada
 * chip tem o seu X, porque tirar o terceiro de quatro é um gesto comum e a
 * alternativa (limpar tudo e reanexar) faz perder os outros três. */
function TiraDeAnexos({ itens }: {
  itens: Array<{ chave: string; nome: string; mime?: string | null; arquivo?: File; onRemover: () => void }>;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((it) => (
        <ChipDeAnexo key={it.chave} nome={it.nome} arquivo={it.arquivo} onRemover={it.onRemover} />
      ))}
    </div>
  );
}

/* O SELETOR DE EMOJI — uma galeria, como a do celular.
 *
 * Uma lista corrida, sem títulos de categoria: ninguém procura "🙏" pensando
 * "isso é da categoria pessoas", procura passando o olho. A separação por grupo
 * parece organização e na prática é atrito, porque obriga a decidir onde
 * procurar antes de procurar.
 *
 * ELE NÃO FECHA AO ESCOLHER, e essa foi a correção que faltava. Quem escreve
 * "👍🙏" escolhe dois seguidos; fechar no primeiro obriga a reabrir e reachar o
 * lugar de onde parou. O que fechava era o `focus()` que eu mandava pro campo
 * depois de inserir: focar fora do popover é, pro Radix, sair dele. Agora o
 * cursor fica onde está — o texto já vai pro campo do mesmo jeito.
 *
 * O HISTÓRICO MORA NO NAVEGADOR, não no banco. É preferência de quem está
 * sentado naquela mesa: os quinze emojis que ESTA pessoa usa, do jeito que o
 * teclado do celular faz. Guardar isso na conta seria sincronizar entre
 * máquinas um dado que não vale a viagem, e criar linha de banco pra cada
 * clique num emoji.
 */
const CHAVE_RECENTES = "aw:atendimento:emojis";
const CHAVE_INSTANCIA = "aw:atendimento:instancia";

function SeletorDeEmoji({ onEscolher }: { onEscolher: (e: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [recentes, setRecentes] = useState<string[]>([]);

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(CHAVE_RECENTES);
      if (bruto) setRecentes(JSON.parse(bruto).slice(0, MAX_RECENTES));
    } catch { /* navegador sem storage: some a linha de recentes, o resto serve */ }
  }, []);

  const escolher = (e: string) => {
    onEscolher(e);
    setRecentes((p) => {
      const novo = comOEscolhido(p, e);
      try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novo)); } catch { /* idem */ }
      return novo;
    });
  };

  const Grade = ({ itens }: { itens: string[] }) => (
    <div className="grid grid-cols-8 gap-0.5">
      {itens.map((e, i) => (
        <button key={`${e}-${i}`} type="button" onClick={() => escolher(e)}
          className="h-7 w-7 grid place-items-center rounded-md text-[18px] leading-none
                     hover:bg-white/[0.12] active:scale-95 transition-all">
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Emoji" className="h-9 w-9 p-0 shrink-0">
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top"
        /* O FOCO NÃO SAI DAQUI. Sem isto o popover se fecha assim que o clique
           devolve o foco pro campo de texto, que é exatamente o que acontece a
           cada emoji escolhido. */
        onOpenAutoFocus={(ev) => ev.preventDefault()}
        onFocusOutside={(ev) => ev.preventDefault()}
        className="w-[16.5rem] p-2 flex flex-col gap-2">
        {recentes.length > 0 && (
          <>
            <div>
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 mb-1 px-0.5">
                Usados agora há pouco
              </p>
              <Grade itens={recentes} />
            </div>
            <span className="h-px bg-white/[0.07]" />
          </>
        )}
        {/* A GALERIA ROLA, o resto do popover não. Os recentes ficam parados no
            topo: eles são o atalho, e um atalho que some ao rolar não é atalho. */}
        <div className="max-h-[min(17rem,45vh)] overflow-y-auto scrollbar-thin pr-0.5">
          <Grade itens={EMOJIS} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ChipDeAnexo({ nome, arquivo, onRemover }: {
  nome: string; arquivo?: File; onRemover: () => void;
}) {
  /* A PRÉVIA NASCE UMA VEZ E MORRE COM O CHIP. `createObjectURL` no meio do
     JSX criava um endereço novo a cada pintura e nunca soltava nenhum: com meia
     dúzia de imagens anexadas e o campo sendo digitado, isso vira memória
     presa que só o refresh devolve. */
  const previa = useMemo(
    () => (arquivo && arquivo.type.startsWith("image/") ? URL.createObjectURL(arquivo) : null),
    [arquivo]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  return (
    <span className="flex items-center gap-2 min-w-0 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.07] px-2 py-1.5">
      {previa
        ? <img src={previa} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
        : <FileText className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="text-[11.5px] truncate max-w-[160px]" title={nome}>{nome}</span>
      <button type="button" onClick={onRemover} title="Tirar este anexo"
        className="h-5 w-5 shrink-0 rounded-full grid place-items-center hover:bg-white/[0.12] transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* O DEGRAU, EDITÁVEL NO LUGAR ONDE ELE É LIDO.
 *
 * O número de dias estava escrito em código e mudá-lo custava um deploy; por
 * custar um deploy, nunca mudava. Aqui ele é um botão que vira campo: o gesto é
 * clicar no número que já está na tela, e não procurar uma tela de configuração
 * que repetiria a régua inteira num segundo lugar.
 *
 * Enter salva, Escape desiste, sair do campo salva. Sem botão de confirmar: é
 * um número de dois dígitos, e um "salvar" ao lado de cada um dos cinco encheria
 * a régua de botões que fazem a mesma coisa. */
function DegrauEditavel({ dias, salto, onSalvar }: {
  dias: number;
  /** quantos dias depois do degrau anterior; null na primeira rodada */
  salto: number | null;
  onSalvar: (dias: number) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(dias));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!editando) setValor(String(dias)); }, [dias, editando]);

  const confirmar = async () => {
    const n = Number(valor);
    setEditando(false);
    if (!Number.isFinite(n) || n === dias) { setValor(String(dias)); return; }
    setSalvando(true);
    try { await onSalvar(Math.round(n)); } finally { setSalvando(false); }
  };

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="number" min={1} max={365}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirmar(); }
            if (e.key === "Escape") { e.preventDefault(); setValor(String(dias)); setEditando(false); }
          }}
          className="w-12 rounded-md bg-white/[0.08] ring-1 ring-primary/40 px-1.5 py-0.5
                     text-[12px] tabular-nums text-center outline-none" />
        <span className="text-[11px] text-muted-foreground">dias</span>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditando(true)}
      title="Clique para mudar de quantos dias é esta rodada"
      className="group/degrau inline-flex items-baseline gap-1 rounded-md px-1 -mx-1
                 hover:bg-white/[0.06] transition-colors">
      <span className="text-[17px] font-semibold tabular-nums leading-none">
        {salvando ? "…" : dias}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {dias === 1 ? "dia" : "dias"}
      </span>
      <Pencil className="h-2.5 w-2.5 self-center opacity-0 group-hover/degrau:opacity-60 transition-opacity" />
      {salto !== null && (
        <span className="text-[10px] text-muted-foreground/50 tabular-nums ml-0.5">
          (+{salto})
        </span>
      )}
    </button>
  );
}

/* ── UMA FAIXA QUE ROLA DE LADO, E QUE AVISA QUE ROLA ────────────────────
 *
 * A faixa de lembretes e notas já rolava: `overflow-x-auto` está lá desde
 * sempre. O que faltava era o SINAL de que rola — este projeto esconde toda
 * barra de rolagem, então o quarto cartão aparecia cortado na borda e parecia
 * um cartão quebrado, não um cartão que continua.
 *
 * A RESPOSTA É O DEGRADÊ NAS PONTAS, e só do lado que tem mais. Uma sombra
 * permanente nas duas bordas seria enfeite: ela precisa dizer "tem coisa ali",
 * e dizer isso quando não tem é ruído que se aprende a ignorar — e aí, no dia
 * em que tem, ninguém vê.
 *
 * As setinhas aparecem junto, e no HOVER: quem tem trackpad arrasta de lado sem
 * pensar, quem tem mouse de roda não tem gesto nenhum pra isso. O botão é pra
 * segunda pessoa, e some pra primeira.
 */
function FaixaQueRola({ className, children }: {
  className?: string;
  children: React.ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [temAntes, setTemAntes] = useState(false);
  const [temDepois, setTemDepois] = useState(false);

  const medir = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    /* A margem de 2px evita o piscar no fim do arrasto: com o cálculo exato, um
       resto de sub-pixel deixa a seta acendendo e apagando enquanto o dedo
       encosta no limite. */
    setTemAntes(el.scrollLeft > 2);
    setTemDepois(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  /* Mede quando o conteúdo muda de tamanho, e não só na rolagem: marcar um
     lembrete a mais é exatamente o momento em que a faixa passa a caber menos,
     e ninguém rolou nada pra isso acontecer. */
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    for (const filho of Array.from(el.children)) obs.observe(filho);
    return () => obs.disconnect();
  }, [medir, children]);

  /* Só desbota o lado que TEM mais. Desbotar sempre seria enfeite — a ponta
     precisa dizer "tem coisa ali", e dizer isso quando não tem é ruído que se
     aprende a ignorar; no dia em que tem, ninguém vê. */
  const mascara = useMemo(() => {
    if (!temAntes && !temDepois) return undefined;
    const ini = temAntes ? "transparent 0, black 2.5rem" : "black 0";
    const fim = temDepois ? "black calc(100% - 2.5rem), transparent 100%" : "black 100%";
    return `linear-gradient(to right, ${ini}, ${fim})`;
  }, [temAntes, temDepois]);

  const andar = (dir: 1 | -1) => {
    const el = caixa.current;
    if (!el) return;
    // Uma "página" menos um pedaço: o cartão da borda continua visível depois
    // do salto, e é ele que diz que o movimento foi contínuo.
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className={cn("relative group/faixa", className)}>
      {/* A PONTA SOME PELO CONTEÚDO, e não por uma sombra por cima.
          O caminho óbvio seria um degradê da cor do painel sobre a borda — e
          essa cor não existe: o painel é `bg-black/25` sobre o fundo da página,
          então qualquer cor fixa que eu escrevesse aqui apareceria como uma
          faixa levemente diferente. A máscara desbota o PRÓPRIO conteúdo até o
          transparente, e por isso funciona sobre qualquer fundo, em qualquer
          tema, sem eu precisar acertar cor nenhuma. */}
      <div ref={caixa} onScroll={medir}
        /* `overscroll-x-contain`: no celular, arrastar além da última carta não
           pode virar o gesto de voltar do navegador. */
        className="flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-thin"
        style={{
          maskImage: mascara,
          WebkitMaskImage: mascara,
        }}>
        {children}
      </div>

      {temAntes && (
        <button onClick={() => andar(-1)} aria-label="Ver os anteriores"
          className="absolute left-0.5 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full
                     bg-white/[0.10] ring-1 ring-white/[0.14] text-foreground/80 backdrop-blur-sm
                     opacity-0 group-hover/faixa:opacity-100 focus-visible:opacity-100
                     hover:bg-white/[0.16] transition-all">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {temDepois && (
        <button onClick={() => andar(1)} aria-label="Ver os próximos"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full
                     bg-white/[0.10] ring-1 ring-white/[0.14] text-foreground/80 backdrop-blur-sm
                     opacity-0 group-hover/faixa:opacity-100 focus-visible:opacity-100
                     hover:bg-white/[0.16] transition-all">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ── A LINHA QUE MARCA A TROCA DE MÃO ────────────────────────────────────
 *
 * No meio do histórico, com a foto e o nome de quem assumiu dali pra baixo.
 * Sem ela, uma conversa repassada lê como uma conversa só, e a mudança de tom
 * no meio — outro atendente, outro número, às vezes outro assunto — não tem
 * explicação nenhuma na tela.
 *
 * É UMA LINHA E NÃO UM CARTÃO. O que aconteceu aqui não é uma mensagem: é uma
 * mudança de contexto, e mudança de contexto se marca como as datas se marcam,
 * atravessando a conversa. Um cartão competiria com os balões pela leitura.
 */
function LinhaDeCustodia({ passagem, instancia, nome }: {
  passagem: PassagemDeCustodia;
  instancia?: Instancia;
  nome: string;
}) {
  return (
    <div className="my-3 flex items-center gap-2.5">
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="flex items-center gap-2 rounded-full bg-white/[0.04] ring-1 ring-white/[0.07]
                       pl-1 pr-3 py-1 shrink-0 max-w-[75%]">
        <span className="h-6 w-6 shrink-0 rounded-full overflow-hidden grid place-items-center
                         text-[9px] font-semibold bg-white/[0.06] text-foreground/70 ring-1 ring-white/10">
          {instancia?.fotoUrl
            ? <img src={instancia.fotoUrl} alt="" className="h-full w-full object-cover"
                   onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            : (instancia?.avatar ?? "?")}
        </span>
        <span className="min-w-0">
          <span className="block text-[10.5px] leading-tight truncate">
            <span className="text-muted-foreground/70">passou para </span>
            <span className="text-foreground/85 font-medium">{nome}</span>
          </span>
          <span className="block text-[9px] text-muted-foreground/50 tabular-nums leading-tight">
            {quandoDaPassagem(passagem.desde)}
          </span>
        </span>
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

/* ── UMA SEÇÃO DA FICHA ──────────────────────────────────────────────────
 *
 * A ficha juntou muita coisa, e cada pedaço se justifica: origem, follow-up,
 * dossiê, jornada, lembretes, programadas, notas. Juntos viram uma coluna que
 * se rola inteira pra achar a etapa — e o remédio não é tirar informação, é
 * deixar cada um fechar o que não usa.
 *
 * O TÍTULO CRESCEU. Eram nove pixels em maiúsculas espaçadas, que é tamanho de
 * legenda e não de divisor: os blocos corriam um no outro e a coluna lia como
 * um texto só. Agora ele é a alça da seção, e alça precisa ser vista antes do
 * conteúdo.
 *
 * O CONTADOR FICA VISÍVEL COM A SEÇÃO FECHADA, e é o que torna fechar uma
 * escolha barata: quem fechou "Lembretes" continua sabendo que existem dois lá
 * dentro, e reabre quando isso importar. Sem ele, fechar viraria esquecer.
 */
function SecaoFicha({
  id, titulo, icone, contador, aberta, onAlternar, children, semDivisor,
}: {
  id: SecaoDaFicha;
  titulo: string;
  icone?: React.ReactNode;
  /** aparece do lado do título, e sobrevive à seção fechada */
  contador?: number;
  aberta: boolean;
  onAlternar: (id: SecaoDaFicha) => void;
  children: React.ReactNode;
  semDivisor?: boolean;
}) {
  return (
    <div className={cn(!semDivisor && "border-b border-white/[0.06]")}>
      <button
        onClick={() => onAlternar(id)}
        /* O CABEÇALHO REAGE AO DEDO ANTES DO CLIQUE: o fundo acende de leve e o
           ícone desliza um fio pra dentro. É o que diz "isto abre" sem precisar
           de um "clique para expandir" escrito. */
        className="w-full px-3 py-3 flex items-center gap-2 text-left
                   text-muted-foreground hover:text-foreground hover:bg-white/[0.025]
                   transition-colors duration-200 group/sec">
        {icone && (
          <span className="shrink-0 transition-transform duration-200 group-hover/sec:translate-x-0.5">
            {icone}
          </span>
        )}
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em]">{titulo}</span>
        {contador !== undefined && contador > 0 && (
          <span className="rounded-full bg-white/[0.07] px-1.5 py-[1px] text-[9.5px] tabular-nums
                           transition-colors group-hover/sec:bg-white/[0.12]">
            {contador}
          </span>
        )}
        <ChevronDown className={cn(
          "ml-auto h-3.5 w-3.5 shrink-0 opacity-40 transition-all duration-300 group-hover/sec:opacity-80",
          !aberta && "-rotate-90")} />
      </button>

      {/* ABRE DESLIZANDO, e não de um quadro pro outro.
          O corte seco parece defeito: o conteúdo aparece do nada e empurra
          tudo abaixo dele de uma vez, e o olho perde onde estava. A altura
          animada faz o resto da coluna acompanhar, e aí a pessoa vê PARA ONDE
          as coisas foram em vez de reencontrá-las.
          `AnimatePresence` com `initial={false}`: na primeira pintura as
          seções já nascem no lugar, sem uma cascata de abertura toda vez que se
          troca de conversa. */}
      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { type: "spring", stiffness: 320, damping: 34, mass: 0.85 },
              opacity: { duration: 0.18 },
            }}
            className="overflow-hidden">
            <div className="px-3 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Uma linha de informação técnica: rótulo pequeno em cima, valor embaixo.
   Existe pra as seis linhas do painel do número saírem alinhadas sem repetir a
   mesma marcação seis vezes — e pra "conectado" e "desconectado" ganharem cor
   sem que a cor vire decisão de cada linha. */
function LinhaTecnica({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50">
        {rotulo}
      </span>
      <span className={cn("block text-[11.5px] truncate", tom ?? "text-foreground/80")} title={valor}>
        {valor}
      </span>
    </span>
  );
}

/* ═══════════ A RÉGUA É DE QUEM ═══════════
 *
 * Com um número só, esta barra é uma linha discreta dizendo de quem é a régua
 * que está na tela. Com dois ou três, ela é o seletor — e é ele que impede o
 * erro mais caro desta aba: ajustar a cadência do Portal achando que está
 * ajustando a do escritório, e descobrir três dias depois pela fila errada.
 *
 * A CHAVE DO PADRÃO MORA AQUI e não nos Ajustes, apesar de ser configuração:
 * ela é a pergunta ANTERIOR a tudo que a aba mostra. "Quem entra na régua" vem
 * antes de "de quantos em quantos dias" e antes de "o que a gente escreve" — e
 * lida em outra tela, viraria uma decisão que ninguém revisita.
 */
function BarraDaReguaDoNumero({
  numeros, escolhido, apelidos, corDe, nomeDe, padraoAtivo, onEscolher, onMudarPadrao,
}: {
  numeros: Instancia[];
  escolhido: string | null;
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  padraoAtivo: boolean;
  onEscolher: (nome: string) => void;
  onMudarPadrao: (ativo: boolean) => void;
}) {
  if (numeros.length === 0) return null;

  return (
    <SpotlightCard sutil className="rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60 shrink-0">
          Régua de
        </span>
        {numeros.length === 1 ? (
          <span className="text-[12.5px] font-medium truncate">{nomeDe(numeros[0].nome)}</span>
        ) : (
          <span className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {numeros.map((i) => {
              const cor = corDe(i.nome);
              const ativo = mesmaInstancia(i.nome, escolhido);
              return (
                <button key={i.id} onClick={() => onEscolher(i.nome)}
                  title={nomeDe(i.nome)}
                  className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-colors",
                    ativo ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide",
                    ativo ? cn(cor.fundo, cor.texto) : "bg-white/[0.08] text-muted-foreground")}>
                    {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                  </span>
                  <span className="truncate max-w-[9rem]">{nomeDe(i.nome)}</span>
                </button>
              );
            })}
          </span>
        )}
      </span>

      {/* ── DE QUE LADO ESTE NÚMERO COMEÇA ──
          Dois jeitos opostos e os dois certos, dependendo do número. No Portal,
          cobrar todo mundo é o certo: são leads de anúncio, e sumir é o
          comportamento normal deles. No número do escritório é o contrário — a
          maioria é cliente com processo andando, e cobrança automática ali
          constrange quem já pagou. */}
      <span className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 ml-auto">
        {([[true, "Todo mundo entra"], [false, "Ninguém entra"]] as const).map(([v, rot]) => (
          <button key={String(v)} onClick={() => onMudarPadrao(v)}
            className={cn("rounded-md px-2.5 py-1 text-[11px] transition-colors",
              padraoAtivo === v
                ? v ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.09] text-foreground"
                : "text-muted-foreground hover:text-foreground")}>
            {rot}
          </button>
        ))}
      </span>

      <p className="w-full text-[10.5px] text-muted-foreground/60 leading-snug">
        {padraoAtivo
          ? "Neste número, quem fica sem responder entra na régua sozinho. Dá pra tirar um contato pela ficha dele."
          : "Neste número, ninguém entra na régua sozinho. Só cobra quem for ligado na ficha, um a um."}
      </p>
    </SpotlightCard>
  );
}

function ModelosDaRegua({ modelos, regua, onEditar, onAlternar, onMudarDia }: {
  modelos: ModeloFollowUp[];
  regua: Regua;
  onEditar: (rodada: number) => void;
  onAlternar: (rodada: number, ativo: boolean) => void;
  onMudarDia: (rodada: number, dias: number) => Promise<void>;
}) {
  const porRodada = new Map(modelos.map((m) => [m.rodada, m]));
  const rodadas = Array.from({ length: TOTAL_RODADAS }, (_, i) => i + 1);
  const escritas = rodadas.filter((r) => {
    const m = porRodada.get(r);
    return m && (m.texto || midiasDaLinha(m).length > 0);
  }).length;

  return (
    <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            A régua
          </h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            O que a gente diz em cada rodada, e de quantos em quantos dias. Clique
            no número para mudar o espaçamento; clique na mensagem para editar.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]
                         px-2.5 py-1 text-[10.5px] text-muted-foreground tabular-nums">
          {escritas} de {TOTAL_RODADAS} escritas
        </span>
      </div>

      {/* ── A RÉGUA COMO RÉGUA ──
          As cinco rodadas ficam LADO A LADO, numa faixa que rola de lado, e
          nunca empilhadas. Empilhadas elas viravam cinco cartões parecidos e a
          única coisa que importa aqui se perdia: que uma vem DEPOIS da outra, e
          que a distância entre elas é o que decide o tom. O trilho atrás dos
          marcadores é o desenho dessa passagem de tempo. */}
      <div className="-mx-1 px-1 overflow-x-auto scrollbar-thin">
        <div className="flex gap-3 min-w-max pb-1">
          {rodadas.map((r, i) => {
            const m = porRodada.get(r);
            const anexos = m ? midiasDaLinha(m) : [];
            const vazio = !m || (!m.texto && anexos.length === 0);
            const dias = diasDaRodada(r, regua) ?? 0;
            const anterior = i === 0 ? null : (diasDaRodada(r - 1, regua) ?? 0);
            const desligada = m?.ativo === false;

            return (
              <div key={r} className="relative w-[16.5rem] shrink-0 flex flex-col">
                <span className="block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-1">
                  {rotuloDaRodada(r)}
                </span>

                {/* O TRILHO. Corre na altura do marcador e segue pelo vão até o
                    próximo, o que faz as cinco lerem como uma linha do tempo e
                    não como cinco caixas soltas. A faixa é só do marcador, sem
                    texto por cima, pra linha não cortar palavra nenhuma. */}
                <div className="relative h-[1.35rem] mb-1.5">
                  <span aria-hidden
                    className={cn("absolute top-1/2 left-[0.68rem] h-px bg-white/[0.12]",
                      i === TOTAL_RODADAS - 1 ? "right-1/2" : "-right-3")} />
                  <span className={cn(
                    "relative h-[1.35rem] w-[1.35rem] rounded-full grid place-items-center text-[10px] font-semibold tabular-nums",
                    desligada
                      ? "bg-[#14161a] ring-1 ring-white/[0.12] text-muted-foreground/50"
                      : vazio
                        ? "bg-[#14161a] ring-1 ring-dashed ring-white/[0.20] text-muted-foreground"
                        : "bg-violet-400/20 ring-1 ring-violet-400/40 text-violet-200")}>
                    {r}
                  </span>
                </div>

                <div className={cn("flex-1 flex flex-col rounded-2xl border p-3 transition-colors",
                  desligada
                    ? "border-white/[0.05] bg-white/[0.015]"
                    : "border-white/[0.07] bg-white/[0.03]")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <DegrauEditavel
                        dias={dias}
                        salto={anterior === null ? null : dias - anterior}
                        onSalvar={(d) => onMudarDia(r, d)} />
                      <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                        sem responder
                      </span>
                    </span>
                    {m && !vazio && (
                      <button
                        onClick={() => onAlternar(r, !(m.ativo ?? true))}
                        title={desligada ? "Ligar esta mensagem" : "Desligar sem apagar o texto"}
                        className={cn("shrink-0 h-6 w-6 grid place-items-center rounded-md transition-colors",
                          desligada
                            ? "text-muted-foreground/40 hover:text-foreground hover:bg-white/[0.08]"
                            : "text-emerald-400 hover:bg-emerald-400/10")}>
                        {desligada ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* A INTENÇÃO DA RODADA, que é o que muda entre as cinco. Sem
                      ela o cartão vazio não diz o que escrever, e o preenchido
                      não diz por que aquele texto e não outro. */}
                  <p className="text-[10.5px] text-muted-foreground/80 leading-snug mt-2">
                    {INTENCAO[r]?.titulo}
                  </p>

                  {/* A MENSAGEM COMO ELA CHEGA. Bolha do nosso lado, com os
                      anexos se houver — a pergunta aqui é "isso está bom pra
                      mandar pra um cliente?", e um campo de formulário não
                      responde isso. */}
                  <button
                    onClick={() => onEditar(r)}
                    title={vazio ? "Escrever a mensagem desta rodada" : "Editar esta mensagem"}
                    className={cn("mt-2 flex-1 min-h-[4.5rem] flex text-left rounded-xl p-1.5 -m-1.5 transition-colors",
                      "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      desligada && "opacity-55")}>
                    {vazio ? (
                      <span className="m-auto flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                        <Pencil className="h-3.5 w-3.5" /> Escrever a mensagem
                      </span>
                    ) : (
                      <span className="self-end ml-auto w-fit max-w-full rounded-2xl rounded-tr-sm
                                       bg-white/[0.08] ring-1 ring-white/[0.10] px-3 py-2">
                        {anexos.map((a, k) => (
                          <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[11rem]">{a.nome}</span>
                          </span>
                        ))}
                        {m?.texto && (
                          <span className="block text-[12.5px] leading-snug whitespace-pre-wrap break-words line-clamp-6">
                            {m.texto}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10.5px] text-muted-foreground/60 leading-snug">
        Mudar um degrau muda o agendamento das próximas cobranças, e não as que já
        estão marcadas. Por ora nada aqui sai sozinho: a mensagem fica pronta para
        quem for cobrar.
      </p>
    </SpotlightCard>
  );
}

/* ═══════════ A CENTRAL DAS PROGRAMADAS ═══════════
 *
 * Tudo que vai sair sozinho, num lugar só.
 *
 * POR QUE ELA EXISTE: as mensagens retidas são a única coisa deste módulo que
 * acontece sem ninguém presente. Espalhadas por conversa, a pergunta "o que o
 * escritório vai mandar hoje?" não tem resposta — teria que abrir uma por uma.
 * E é justamente essa a pergunta que alguém faz quando muda alguma coisa: o
 * cliente ligou, o caso mudou, e três mensagens marcadas ontem ficaram erradas.
 *
 * A ORDEM É POR URGÊNCIA DE REVISÃO, não por horário. As que FALHARAM vêm
 * primeiro, sempre: elas não chegaram no cliente e ninguém foi avisado, então
 * são a única coisa aqui que já deu errado. Depois o que sai hoje, depois o
 * resto — porque cancelar algo de daqui a uma hora é urgente e cancelar algo da
 * semana que vem pode esperar o café.
 */
function CentralProgramadas({ agendadas, leads, onCancelar, onAbrirConversa }: {
  agendadas: AgendadaRow[];
  leads: Lead[];
  onCancelar: (id: string) => void;
  onAbrirConversa: (leadId: string) => void;
}) {
  const porLead = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const nomeDe = (id: string) => porLead.get(id)?.nome ?? "conversa arquivada";

  const { falhas, hoje, depois } = useMemo(() => {
    const ordenadas = [...agendadas].sort((a, b) => a.quando.localeCompare(b.quando));
    const fimDeHoje = new Date();
    fimDeHoje.setHours(23, 59, 59, 999);
    return {
      falhas: ordenadas.filter((a) => a.status === "falhou"),
      hoje: ordenadas.filter((a) => a.status !== "falhou" && new Date(a.quando) <= fimDeHoje),
      depois: ordenadas.filter((a) => a.status !== "falhou" && new Date(a.quando) > fimDeHoje),
    };
  }, [agendadas]);

  const Grupo = ({ titulo, itens, tom }: { titulo: string; itens: AgendadaRow[]; tom: string }) => {
    if (itens.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className={cn("text-[9.5px] uppercase tracking-[0.12em] flex items-center gap-2", tom)}>
          {titulo}
          <span className="tabular-nums opacity-70">{itens.length}</span>
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {itens.map((a) => (
            <CardProgramada key={a.id} a={a} nome={nomeDe(a.conversa_id)}
              onAbrir={() => onAbrirConversa(a.conversa_id)}
              onCancelar={() => onCancelar(a.id)} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <SpotlightCard sutil className="rounded-xl p-4 flex flex-col gap-4">
        {agendadas.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/70 py-6 text-center">
            Nada programado. Toda mensagem que sair daqui vai sair porque alguém apertou enviar.
          </p>
        ) : (
          <>
            <Grupo titulo="Não saíram" itens={falhas} tom="text-red-300" />
            <Grupo titulo="Ainda hoje" itens={hoje} tom="text-foreground/80" />
            <Grupo titulo="Próximos dias" itens={depois} tom="text-muted-foreground/70" />
          </>
        )}
      </SpotlightCard>
    </div>
  );
}
