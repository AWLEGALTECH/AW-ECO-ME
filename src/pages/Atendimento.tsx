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

import { useEffect, useMemo, useRef, useState } from "react";
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
  ArrowLeftRight, ChevronsUpDown, Plus, ArrowRight, X, Paperclip, Loader2, FileText,
  UserPlus, Phone, Clock, Table2, Trash2, Copy, MessageSquarePlus, Database,
  Columns3, ArrowUpRight, ArrowDownLeft, CheckCheck, Smartphone, Stethoscope,
  RotateCcw, Volume2, VolumeX,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LEADS, LEMBRETES, ESTAGIOS, ORIGENS, PLACAR_MES, FUNIL_MES,
  INSTANCIAS, type Lead, type Origem, type Estagio, type Mensagem, type Instancia,
} from "@/lib/atendimentoMock";
import {
  followUpsDoDia, ordenarTasks, progressoTasks, proximaCobranca, ROTULO_TIPO,
  CADENCIA, horaBonita, type Task, type TipoTask,
} from "@/lib/tasksAtendimento";
import {
  useConversas, useMensagens, useInstancias, conversaParaLead, instanciaParaCard,
  marcarLida, enviarTexto, enviarArquivo, criarConversa, moverEtapaWa,
  usePresencaDaConversa, criarInstancia, qrDaInstancia, estadoDaInstancia,
  reaplicarWebhook, importarConversas, registrarInstancia, useInvalidarWa,
  diagnosticarInstancia, assinarPresenca, type Diagnostico,
} from "@/hooks/useWhatsapp";
import { acharProblemas, resumoDoDiagnostico } from "@/lib/diagnosticoWa";
import { idDaConversaAberta, telefoneBonito, horaDaLista } from "@/lib/wa";
import { resumoDasRespostas, resumoDoDossie, dossieExtra } from "@/lib/planilhaLeads";
import {
  situacaoDoContato, estaOnline, estaDigitando, vistoDaMensagem, rotuloDoStatus, marcaDeEnvio,
} from "@/lib/presencaWa";
import {
  novaPendente, aindaPendentes, daConversa, marcarFalha, remover, bolhaDaPendente,
  type Pendente,
} from "@/lib/envioOtimista";
import {
  useFontes, useLeadsBrutos, useResumoBases, criarFonte, sincronizarFonte, marcarAbordado,
  descartarLead, desativarFonte, lerColunas, salvarColunas, useInvalidarLeads,
  type Fonte, type LeadBruto,
} from "@/hooks/useLeadsBrutos";
import { mascaraTelefone, aferirTelefone, nomeDaConversaNova } from "@/lib/novaConversa";
import {
  useTasksWa, criarTaskWa, alternarTaskWa, useInvalidarTasksWa,
} from "@/hooks/useTasksWa";
import {
  useAnotacoes, postarAnotacao, useInvalidarAnotacoes, quandoDaNota,
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

/* OS CHIPS DA CAIXA FILTRAM POR ETAPA, NÃO POR ORIGEM.
   Origem já está impressa em cada linha da lista (o "PDA" cinza embaixo do
   nome) e quase não muda o dia de ninguém — praticamente tudo entra pelo mesmo
   número. Etapa muda: "quem está esperando extrato" é uma pergunta que se faz
   várias vezes por dia, e era a única que a caixa não sabia responder. */
const CHIPS_ETAPA: { chave: "todos" | Estagio; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  ...ESTAGIOS.map((e) => ({ chave: e.chave, rotulo: e.rotulo })),
];

/* Espaço-reservado pra quando não há conversa nenhuma. Não aparece na tela:
   existe pra `lead` nunca ser undefined enquanto a caixa está vazia. */
const LEAD_VAZIO: Lead = {
  id: "", nome: "", telefone: "", origem: "pda", estagio: "chegou",
  ultimaFoi: "nos", horasSemResposta: 0, ultimaHora: "", naoLidas: 0,
  temProximaAcao: false, diasParado: 0, followUpsFeitos: 0, chegouEm: HOJE,
  dossie: { banco: null, descontos: [], inss: null, consignado: null, obs: null },
  conversa: [],
};

export default function AtendimentoPage() {
  const [aba, setAba] = useState<"atendimento" | "funil">("atendimento");
  const [instanciaId, setInstanciaId] = useState<string>(INSTANCIAS[0].id);
  const [filtroEtapa, setFiltroEtapa] = useState<"todos" | Estagio>("todos");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string>(LEADS[0].id);
  const [lembretesMaquete, setLembretesMaquete] = useState<Task[]>(LEMBRETES);
  const [dia, setDia] = useState(HOJE);
  const [tipoTask, setTipoTask] = useState<"todas" | TipoTask>("todas");
  const [feitasFollowUp, setFeitasFollowUp] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
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
  const [taskHora, setTaskHora] = useState("");
  const [salvandoTask, setSalvandoTask] = useState(false);
  const [rascunhoNota, setRascunhoNota] = useState("");
  const [postandoNota, setPostandoNota] = useState(false);
  const [etapaAberta, setEtapaAberta] = useState(false);
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
  const [tarefasAbertas, setTarefasAbertas] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1280);

  const { user } = useAuth();
  const { display: nomeDoAutor } = useUserDisplayNames();
  /* As instâncias vêm da Evolution (nome, status, número e FOTO do perfil); a
     maquete só assume quando ela não respondeu ainda. */
  const { data: instRows = [] } = useInstancias();
  const instancias: Instancia[] = instRows.length > 0 ? instRows.map((i) => instanciaParaCard(i)) : INSTANCIAS;
  const instancia = instancias.find((i) => i.id === instanciaId) ?? instancias[0];
  const invalidarWa = useInvalidarWa();

  /* ── A FONTE DOS DADOS ──
     Se a Evolution já está entregando, a tela usa o banco; enquanto não está,
     usa a maquete. Não é gambiarra: é o mesmo formato dos dois lados (a
     conversão mora em useWhatsapp.ts), e evita a tela vazia de "nenhuma
     conversa" enquanto o número não foi conectado. O selo do cabeçalho diz em
     qual dos dois modos ela está. */
  const { data: conversas = [] } = useConversas(instancia.nome);
  /* AO VIVO É TER NÚMERO REGISTRADO — não é ter conversa.
     Antes era `conversas.length > 0`, e isso fazia um WhatsApp de verdade,
     conectado e configurado, mostrar as conversas INVENTADAS da maquete
     enquanto ninguém tivesse escrito. Caixa vazia é um estado legítimo de um
     número novo; encher a tela de gente que não existe pra disfarçar é o tipo
     de mentira que faz alguém abrir uma conversa e não entender por que o
     telefone não bate. A maquete volta a ser só o que ela sempre foi: o que
     se vê quando NENHUM número está ligado. */
  const aoVivo = instRows.length > 0;

  /* As bases são lidas cedo porque a etiqueta do cartão precisa do NOME delas:
     a conversa guarda o id da base, e id na tela é ruído. Inclui as desligadas
     — a conversa que veio de uma base desligada continua tendo vindo dela. */
  const { data: fontesTodas = [] } = useFontes(instancia.nome, { incluirInativas: true });

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

  const { data: msgsDaAberta = [] } = useMensagens(aoVivo ? idAberto : null);
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
  const digitandoAgora = estaDigitando(presencaViva?.presenca, presencaViva?.presenca_em);

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

  const nomeDaBase = useMemo(
    () => Object.fromEntries(fontesTodas.map((f) => [f.id, f.nome])) as Record<string, string>,
    [fontesTodas]);

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
    if (aoVivo) marcarLida(id).then(invalidarWa).catch(() => {});
  };
  const puladasDe = (l: Lead): Estagio[] => puladas[l.id] ?? l.etapasPuladas ?? [];

  /* Avançar etapa, com a mesma regra da linha do tempo do processo: o que fica
     entre a atual e o destino vira PULADA — não some, e não vira concluída. */
  const avancarEtapa = (l: Lead, alvo: Estagio) => {
    const i = ESTAGIOS.findIndex((e) => e.chave === estagioDe(l));
    const j = ESTAGIOS.findIndex((e) => e.chave === alvo);
    if (j === i) return;

    const antes = puladasDe(l);
    // Indo pra frente, o que fica no meio vira pulada. VOLTANDO, some a marca
    // de pulada de tudo que voltou a estar à frente: uma etapa que o lead ainda
    // vai atravessar não pode continuar carimbada como "pulei essa".
    const puladasNovas = j > i
      ? [...new Set([...antes, ...ESTAGIOS.slice(i + 1, j).map((e) => e.chave)])]
      : antes.filter((c) => ESTAGIOS.findIndex((e) => e.chave === c) < j);

    setEstagios((p) => ({ ...p, [l.id]: alvo }));
    setPuladas((p) => ({ ...p, [l.id]: puladasNovas }));

    if (aoVivo) {
      moverEtapaWa(l.id, alvo, puladasNovas)
        .then(invalidarWa)
        .catch((e) => toast.error("Não consegui mover a etapa: " + (e as Error).message));
    }
  };

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leadsBase
      .filter((l) => filtroEtapa === "todos" || estagioDe(l) === filtroEtapa)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo))
      .sort((a, b) => {
        const ra = a.ultimaFoi === "lead" ? 0 : 1;
        const rb = b.ultimaFoi === "lead" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return b.horasSemResposta - a.horasSemResposta;
      });
  }, [filtroEtapa, busca, leadsBase, estagios]);

  /* Ao vivo os lembretes vêm de `wa_tasks` e sobrevivem ao recarregar; na
     maquete continuam em memória, pra ela seguir servindo pra discutir formato
     sem escrever nada no banco. */
  const { data: lembretesDoBanco = [] } = useTasksWa(aoVivo ? instancia.nome : null);
  const invalidarTasks = useInvalidarTasksWa();
  const { data: anotacoes = [] } = useAnotacoes(idAberto, aoVivo);
  const invalidarAnotacoes = useInvalidarAnotacoes();

  /* ── A OUTRA CAIXA: quem nunca escreveu ── */
  const fontes = useMemo(() => fontesTodas.filter((f) => f.ativa), [fontesTodas]);
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
  const lembretes = aoVivo ? lembretesDoBanco : lembretesMaquete;

  /* Sem conversa nenhuma, `lead` viraria undefined e a tela quebraria em vinte
     lugares que leem `lead.` — inclusive dentro de diálogos fechados, cujo
     conteúdo é montado junto com o resto. O lead vazio segura isso, e
     `semConversas` é quem decide o que aparece. */
  const semConversas = aoVivo && leadsBase.length === 0;
  const lead: Lead = leadsBase.find((l) => l.id === idAberto) ?? lista[0] ?? leadsBase[0] ?? LEAD_VAZIO;
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
  useEffect(() => {
    setPendentes((ps) => {
      if (ps.length === 0) return ps;
      const vivas = aindaPendentes(ps, msgsDaAberta);
      return vivas.length === ps.length ? ps : vivas;
    });
  }, [msgsDaAberta]);

  const pendentesDaAberta = daConversa(pendentes, lead.id);

  /* A CONVERSA DESCE SOZINHA PRA MENSAGEM NOVA.
     Sem isso, a mensagem chegava, o histórico crescia por baixo e quem estava
     olhando continuava vendo o mesmo trecho de sempre — a conversa "não
     atualizava", quando na verdade só não tinha rolado.
     Desce também quando o balão de digitando acende, e quando se troca de
     conversa: abrir uma conversa no meio do histórico é o mesmo desconforto. */
  const fimDaConversa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "end" });
  }, [lead.id]);
  /* SÓ MENSAGEM PUXA A TELA PRA BAIXO. Digitando não entra na conta: o balão
     de reticências acende e apaga o tempo todo enquanto a pessoa pensa, e cada
     piscada arrastaria a conversa — quem estivesse lendo uma mensagem mais
     acima seria jogado pro fim a cada dois segundos. Rolar é interrupção, e só
     mensagem nova justifica. */
  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgsDaAberta.length, pendentesDaAberta.length]);
  /* O tipo é declarado, não inferido: sem isso o array vira uma UNIÃO entre a
     Mensagem completa e o formato mais estreito da bolha pendente, e todo campo
     opcional (dia, midiaPath, duracao) some do que dá pra ler. */
  const conversa: Mensagem[] = [
    ...lead.conversa,
    ...(enviadas[lead.id] ?? []),
    ...pendentesDaAberta.map(bolhaDaPendente),
  ];

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
    // Follow-up não é linha no banco — é conta feita a partir do tempo parado.
    // O "feito" dele é do dia e mora aqui mesmo.
    if (id.startsWith("fu-")) {
      setFeitasFollowUp((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
      return;
    }
    if (aoVivo) {
      const atual = lembretes.find((t) => t.id === id);
      if (!atual) return;
      alternarTaskWa(id, !atual.feita, user?.id ?? null)
        .then(invalidarTasks)
        .catch((e) => toast.error("Não consegui marcar: " + (e as Error).message));
      return;
    }
    setLembretesMaquete((prev) => prev.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t)));
  };

  /* O `window.prompt` que estava aqui aceitava uma linha de texto e mais nada:
     sem detalhe, sem dia, sem hora — e com a cara do sistema operacional no
     meio de uma tela que não é dele. Agora abre um diálogo de verdade, já com
     o dia que está sendo olhado no calendário. */
  const novoLembrete = () => {
    setTaskTitulo("");
    setTaskDetalhe("");
    setTaskDia(dia);
    setTaskHora("");
    setTaskAberta(true);
  };

  const salvarTask = async () => {
    const titulo = taskTitulo.trim();
    if (!titulo) { toast.error("A task precisa de um título."); return; }
    if (!aoVivo) {
      setLembretesMaquete((p) => [...p, {
        id: `lb-${Date.now()}`, tipo: "lembrete", leadId: lead.id, lead: lead.nome,
        titulo, detalhe: taskDetalhe.trim(), data: taskDia, hora: taskHora || null, feita: false,
      }]);
      setTaskAberta(false);
      return;
    }
    setSalvandoTask(true);
    try {
      await criarTaskWa({
        conversaId: lead.id,
        titulo,
        detalhe: taskDetalhe,
        dia: taskDia,
        hora: taskHora || null,
        criadoPor: user?.id ?? null,
      });
      invalidarTasks();
      setTaskAberta(false);
      // Leva o calendário pro dia da task recém-criada: marcar algo pra quinta
      // e continuar olhando a terça faz parecer que não salvou.
      if (taskDia !== dia) setDia(taskDia);
    } catch (e) {
      toast.error("Não consegui salvar: " + (e as Error).message);
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

  const rodarDiagnostico = async () => {
    setDiagnosticando(true);
    setDiagnostico(null);
    try {
      setDiagnostico(await diagnosticarInstancia(instancia.nome));
    } catch (e) {
      toast.error((e as Error).message, { duration: 12_000 });
    } finally {
      setDiagnosticando(false);
    }
  };

  const reconfigurarEventos = async () => {
    try {
      const r = await reaplicarWebhook(instancia.nome);
      toast.success(`Eventos reconfigurados em ${instancia.nome}.`, {
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
  const importarDoAparelho = async () => {
    const t = toast.loading(`Lendo as conversas de ${instancia.nome}…`);
    try {
      const r = await importarConversas(instancia.nome);
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
      invalidarAnotacoes();
    } catch (e) {
      toast.error("Não consegui postar: " + (e as Error).message);
    } finally {
      setPostandoNota(false);
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
      setAnexo(null);
      setRascunho("");
      invalidarWa();
      if (r?.aviso) toast.warning(r.aviso);
    } catch (e) {
      toast.error("Não consegui enviar: " + (e as Error).message);
    } finally {
      setMandandoAnexo(false);
    }
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

  const enviar = async () => {
    if (anexo) { await mandarArquivo(anexo, anexo.name, rascunho.trim() || undefined); return; }
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
          {/* O selo só aparece quando é MAQUETE. Quem abre a tela sem contexto
              precisa saber que aquelas pessoas não existem — mas o contrário
              não precisa de aviso: dado real é o esperado, e um selo verde
              permanente ao lado do título vira enfeite que ninguém mais lê. */}
          {!aoVivo && (
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
            instancia={cartaoDaInstancia}
            todas={instancias}
            onTrocar={setInstanciaId}
            onConectar={abrirConexao}
            onReaplicar={reconfigurarEventos}
            onImportar={importarDoAparelho}
            onDiagnosticar={rodarDiagnostico}
          />

          {/* ── a bancada: quatro painéis, perto mas cada um o seu ──
              Colar tudo numa caixa só apagava a divisão de trabalho: a caixa,
              a conversa, o cliente e o dia são quatro coisas diferentes. Um gap
              curto mantém cada uma como objeto próprio sem espalhar a tela. */}
          <div className="flex-1 min-h-0 flex gap-2">

            {/* ═══ caixa ═══ */}
            {/* A CAIXA ALARGA QUANDO UMA BASE ABRE.
                Na largura de sempre, o que o lead respondeu na landing cabe em
                quarenta caracteres — e é justamente esse texto que decide como
                abrir a conversa. Com a base aberta a coluna vai a 24rem e as
                respostas passam a caber na própria fila, sem precisar abrir
                cada ficha pra descobrir se vale falar com aquela pessoa. */}
            <SpotlightCard sutil className={cn(
              "shrink-0 flex flex-col min-h-0 p-0 overflow-hidden transition-[width] duration-200",
              caixa === "base" && baseAberta ? "w-[24rem]" : "w-[15.5rem]")}>
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
                {caixa === "inbound" && <div className="flex flex-wrap gap-1">
                  {CHIPS_ETAPA.map((c) => {
                    const n = c.chave === "todos"
                      ? leadsBase.length
                      : leadsBase.filter((l) => estagioDe(l) === c.chave).length;
                    return (
                      <button key={c.chave} onClick={() => setFiltroEtapa(c.chave)}
                        className={cn("rounded-full px-2 py-[2px] text-[10px] transition-colors ring-1 flex items-center gap-1",
                          filtroEtapa === c.chave
                            ? "bg-white/[0.10] text-foreground ring-white/20"
                            : "bg-white/[0.03] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                          // Etapa vazia fica apagada mas CLICÁVEL: sumir com ela
                          // mudaria a largura da fileira a cada mensagem que
                          // chega, e o chip que estava no lugar A pularia pro B
                          // debaixo do dedo de quem ia clicar.
                          n === 0 && filtroEtapa !== c.chave && "opacity-45")}>
                        {c.rotulo}
                        {n > 0 && <span className="tabular-nums opacity-60">{n}</span>}
                      </button>
                    );
                  })}
                </div>}
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
                      className={cn("w-full text-left px-2.5 py-2 border-b border-white/[0.04] transition-colors flex gap-2 relative",
                        ativo ? "bg-white/[0.07]" : "hover:bg-white/[0.03]")}>
                      {ativo && <span className="absolute left-0 inset-y-0 w-[2px] bg-foreground/40" />}
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
                        <span className={cn("h-7 w-7 rounded-full grid place-items-center text-[10px] font-semibold ring-1",
                          semResposta ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                                      : "bg-white/[0.05] text-muted-foreground ring-white/10")}>
                          {iniciais(l.nome)}
                        </span>
                        {estaOnline(l.presenca, l.presencaEm) && (
                          <span title="online agora"
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0e1013]" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[12px] font-medium truncate flex-1">{l.nome}</span>
                          <span className="text-[9.5px] text-muted-foreground shrink-0">{l.ultimaHora}</span>
                        </span>
                        {/* DIGITANDO GANHA DA PRÉVIA. Quem está escrevendo agora
                            é notícia mais nova que a última mensagem, e é a
                            informação que muda a decisão de quem lê a fila:
                            espera esse antes de cobrar aquele outro. */}
                        {estaDigitando(l.presenca, l.presencaEm, agoraTique) ? (
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
                              {ESTAGIOS.find((e) => e.chave === estagioDe(l))?.rotulo}
                            </span>
                            <SeloContato origem={l.importada ? undefined : l.origemContato} base={l.base} />
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
              <SpotlightCard sutil className="flex-1 min-w-[17rem] flex flex-col min-h-0 p-0 overflow-hidden bg-black/25">
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
                        onClick={importarDoAparelho}>
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
            {/* Três profundidades de propósito: a caixa e as tasks no nível base, a
                conversa REBAIXADA (é a mesa onde os balões pousam, e escurecer o
                fundo faz eles existirem), o detalhe do cliente OPACO — superfície
                sólida, sem vidro, porque é ficha que se lê — e as tasks no vidro
                mais leve da bancada, que é a lista que muda o dia todo. Sem isso
                os quatro painéis eram a mesma superfície repetida e o olho não
                sabia onde estava. */}
            <SpotlightCard sutil className="flex-1 min-w-[17rem] flex flex-col min-h-0 p-0 overflow-hidden bg-black/25">
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center gap-2.5 shrink-0">
                {/* Mesmo lugar do pingo da lista: sobre a foto, no canto. */}
                <span className="relative shrink-0 self-start block h-8 w-8">
                  <span className="h-8 w-8 rounded-full grid place-items-center text-[11px] font-semibold bg-white/[0.05] ring-1 ring-white/10">
                    {iniciais(lead.nome)}
                  </span>
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
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {t.hora && <span className="text-primary font-semibold tabular-nums mr-1">{horaBonita(t.hora)}</span>}
                            {t.detalhe}
                          </span>
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

              {/* A CHAVE É A CONVERSA, e isso não é detalhe: ela faz a coluna
                  inteira remontar ao trocar de lead, o que reinicia o
                  `AnimatePresence initial={false}` logo abaixo. Sem isso, abrir
                  uma conversa faria as trezentas mensagens do histórico
                  entrarem animadas de uma vez. */}
              <div key={lead.id}
                className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-2">
                {/* `initial={false}` é o que separa "mensagem nova" de "mensagem
                    que já estava aqui": o que existe na primeira pintura entra
                    sem animação, e só o que CHEGA depois ganha o pop. É a
                    diferença entre a tela reagir e a tela se exibir. */}
                <AnimatePresence initial={false}>
                {conversa.map((msg, i) => (
                  <motion.div
                    key={msg.id ?? `i${i}`}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.94, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    // Mola curta e bem amortecida: o balão assenta em ~180ms,
                    // com um respiro de elasticidade no fim. Duração fixa daria
                    // o movimento mecânico de banner; mola solta demais faria o
                    // texto tremer, e texto tremendo é ilegível.
                    transition={{ type: "spring", stiffness: 560, damping: 38, mass: 0.7 }}
                    style={{ originX: msg.de === "lead" ? 0 : 1, originY: 1 }}
                    className="flex flex-col gap-2">
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
                          id={msg.id ?? String(i)}
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
                          <button
                            onClick={() => {
                              const p = pendentesDaAberta.find((x) => x.id === msg.id);
                              if (p) reenviar(p);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-foreground/80 hover:text-foreground underline underline-offset-2">
                            <RotateCcw className="h-3 w-3" /> tentar de novo
                          </button>
                          <button
                            onClick={() => setPendentes((ps) => remover(ps, String(msg.id)))}
                            className="text-[10px] text-muted-foreground/70 hover:text-foreground">
                            descartar
                          </button>
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>

                {/* O BALÃO DE DIGITANDO FICA NO FIM DA CONVERSA, onde a próxima
                    mensagem vai nascer — e não num rótulo no cabeçalho. É onde
                    o olho já está, e é o que ele significa: tem coisa vindo,
                    espera antes de mandar outra.
                    Ele entra e sai com a mesma mola das mensagens, e cresce a
                    partir do canto de baixo à esquerda — de onde o balão do
                    contato nasce. Aparecer instantâneo dava um susco na tela a
                    cada tecla que a pessoa encostava. */}
                <AnimatePresence>
                  {digitandoAgora && (
                    <motion.div
                      layout="position"
                      initial={{ opacity: 0, scale: 0.9, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 4 }}
                      transition={{ type: "spring", stiffness: 560, damping: 38, mass: 0.7 }}
                      style={{ originX: 0, originY: 1 }}
                      className="flex flex-col gap-2">
                      <div className="self-start rounded-2xl rounded-tl-sm bg-white/[0.05] px-3 py-2.5">
                        <span className="flex items-center gap-[3px]">
                          {[0, 150, 300].map((atraso) => (
                            <span key={atraso}
                              style={{ animationDelay: `${atraso}ms` }}
                              className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" />
                          ))}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* A âncora do rolamento. Fica DEPOIS do balão de digitando pra
                    que ele também puxe a tela pra baixo — senão ele nasceria
                    fora do campo de visão justamente quando avisa que tem
                    mensagem vindo. */}
                <div ref={fimDaConversa} />
              </div>

              <div className="border-t border-white/[0.06] shrink-0">
                {/* O anexo escolhido fica VISÍVEL antes de ir. Anexar e mandar
                    no mesmo clique é o jeito de mandar o arquivo errado pro
                    cliente errado, e no WhatsApp não existe desfazer. */}
                {anexo && (
                  <div className="px-3 pt-2.5 flex items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.07] px-2 py-1.5">
                      {anexo.type.startsWith("image/")
                        ? <img src={URL.createObjectURL(anexo)} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                        : <FileText className="h-4 w-4 shrink-0 opacity-70" />}
                      <span className="text-[11.5px] truncate max-w-[180px]" title={anexo.name}>{anexo.name}</span>
                      <button type="button" onClick={() => setAnexo(null)} title="Tirar o anexo"
                        className="h-5 w-5 shrink-0 rounded-full grid place-items-center hover:bg-white/[0.12]">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="px-3 py-2.5 flex items-center gap-1.5">
                  {aoVivo && !gravando && (
                    <>
                      <input
                        ref={seletorArquivo} type="file" className="hidden"
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(e) => { setAnexo(e.target.files?.[0] ?? null); e.target.value = ""; }}
                      />
                      <Button size="sm" variant="ghost" title="Anexar arquivo"
                        className="h-9 w-9 p-0 shrink-0" onClick={() => seletorArquivo.current?.click()}>
                        <Paperclip className="h-4 w-4" />
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
                      onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (e.shiftKey || e.ctrlKey || e.metaKey) return;  // deixa quebrar a linha
                        e.preventDefault();
                        enviar();
                      }}
                      placeholder={anexo ? "Legenda (opcional)…" : `Responder ${lead.nome.split(" ")[0]}…`}
                      className="min-h-9 max-h-[7.5rem] py-[0.45rem] text-[12.5px] resize-none scrollbar-thin"
                    />
                  )}

                  {aoVivo && !anexo && (
                    <GravadorDeAudio
                      onEnviar={enviarAudio}
                      onGravandoChange={setGravando}
                      disabled={mandandoAnexo}
                    />
                  )}

                  {!gravando && (
                    <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={enviar}
                      disabled={mandandoAnexo || (!rascunho.trim() && !anexo)}>
                      {mandandoAnexo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
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
                  {/* A ORIGEM NÃO SE ESCOLHE. Ela responde "quem falou
                      primeiro", e disso o sistema sabe mais que qualquer um:
                      se a primeira mensagem foi dele, ele veio até nós; se
                      saiu daqui, fomos nós até ele. Campo escolhido à mão vira
                      campo em branco — ou, pior, preenchido no chute e depois
                      usado pra decidir onde investir. */}
                  <div className="flex flex-col gap-1 items-start">
                    <span className="text-[9.5px] text-muted-foreground/70">Origem</span>
                    <SeloContato origem={lead.importada ? undefined : lead.origemContato} base={lead.base} tamanho="grande" />
                  </div>
                  <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Chegou em"
                    valor={`${fmtDiaLongo(lead.chegouEm)} · há ${diasEntre(lead.chegouEm, HOJE)} dia${diasEntre(lead.chegouEm, HOJE) === 1 ? "" : "s"}`} />
                </div>

                {/* jornada */}
                <div className="px-3 py-3 border-b border-white/[0.06]">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-2.5">Jornada</p>
                  <JornadaLead
                    atual={estagioDe(lead)}
                    puladas={puladasDe(lead)}
                    tasksDoLead={tasksDoLead}
                    onEscolherEtapa={() => setEtapaAberta(true)}
                    onNovaTask={novoLembrete}
                    onConcluirTask={concluir}
                  />
                </div>

                {/* ANOTAÇÕES — MURAL, NÃO CAMPO.
                    Escrever a segunda coisa num campo único obriga a decidir
                    onde enfiá-la no meio da primeira, e ninguém sabe quem
                    escreveu o quê. Aqui cada nota é uma linha com autor e hora,
                    a mais nova em cima: "o que ficou combinado da última vez" é
                    a pergunta que se faz toda vez que essa conversa reabre. */}
                <div className="px-3 py-2.5 flex flex-col gap-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> Anotações
                    {anotacoes.length > 0 && (
                      <span className="ml-auto tabular-nums opacity-70">{anotacoes.length}</span>
                    )}
                  </p>

                  <Textarea
                    value={rascunhoNota}
                    onChange={(e) => setRascunhoNota(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter quebra linha (nota é texto de recado). Ctrl+Enter
                      // posta — o atalho de quem escreve muitas por dia.
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postarNota(); }
                    }}
                    rows={3}
                    placeholder="O que ficou combinado, o que ela contou, o que conferir depois…"
                    className="text-[11.5px] resize-none" />
                  <Button size="sm" className="h-7 text-[11px] self-end"
                    onClick={postarNota} disabled={postandoNota || !rascunhoNota.trim()}>
                    {postandoNota
                      ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Postando…</>
                      : <>Postar <Plus className="h-3 w-3 ml-1" /></>}
                  </Button>

                  <div className="flex flex-col gap-1.5">
                    {anotacoes.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/60 py-1">Nenhuma anotação ainda.</p>
                    )}
                    {anotacoes.map((n) => (
                      <div key={n.id} className="rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] px-2.5 py-2">
                        <p className="text-[11.5px] leading-snug whitespace-pre-wrap break-words">{n.texto}</p>
                        <p className="text-[9.5px] text-muted-foreground/60 mt-1">
                          {n.autorId ? nomeDoAutor({ id: n.autorId }) : "alguém"} · {quandoDaNota(n.quando)}
                        </p>
                      </div>
                    ))}
                  </div>
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
                            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground mt-2 flex items-center gap-1.5">
                              {ROTULO_TIPO[t.tipo]}
                              {t.hora && (
                                <span className="inline-flex items-center gap-1 rounded px-1 py-[1px] text-[9.5px] font-semibold tabular-nums normal-case tracking-normal bg-primary/15 text-primary">
                                  <Clock className="h-2.5 w-2.5" />{horaBonita(t.hora)}
                                </span>
                              )}
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
                  <dd className="break-all">{diagnostico.webhook?.url || diagnostico.erroWebhook || "—"}</dd>
                  <dt className="text-muted-foreground">eventos</dt>
                  <dd className="break-words">{diagnostico.webhook?.eventos.join(", ") || "—"}</dd>
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

          <DialogFooter>
            <Button variant="ghost" size="sm" className="h-8 text-[12px]"
              onClick={() => setDiagnostico(null)}>Fechar</Button>
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
                if (instConectando) setInstanciaId(instConectando);
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
      <Dialog open={etapaAberta} onOpenChange={setEtapaAberta}>
        <DialogContent className="max-w-sm [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <ArrowRight className="h-4 w-4" /> Mover etapa
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              <span className="text-foreground/80">{lead.nome}</span> está em{" "}
              <span className="text-foreground/80">
                {ESTAGIOS.find((e) => e.chave === estagioDe(lead))?.rotulo}
              </span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            {ESTAGIOS.map((e, i) => {
              const iAtual = ESTAGIOS.findIndex((x) => x.chave === estagioDe(lead));
              const eAtual = e.chave === estagioDe(lead);
              const puladas = i > iAtual + 1 ? i - iAtual - 1 : 0;
              return (
                <button
                  key={e.chave}
                  disabled={eAtual}
                  onClick={() => { avancarEtapa(lead, e.chave); setEtapaAberta(false); }}
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
        </DialogContent>
      </Dialog>

      {/* ── NOVA TASK ──
          Título, detalhe, dia e hora. A hora é opcional porque metade dos
          lembretes não tem hora ("passar o extrato hoje") e obrigar um horário
          faria a atendente inventar um — e um horário inventado vira alarme
          falso na fila do dia. */}
      <Dialog open={taskAberta} onOpenChange={(a) => { if (!salvandoTask) setTaskAberta(a); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <BellRing className="h-4 w-4" /> Nova task
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Sobre <span className="text-foreground/80">{lead.nome}</span>. Ela entra na fila do
              dia que você escolher.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">O que fazer</span>
              <Input
                autoFocus
                value={taskTitulo}
                onChange={(e) => setTaskTitulo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarTask(); } }}
                placeholder="Ligar pra confirmar o extrato"
                className="h-9 text-[13px]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Detalhe <span className="opacity-60">(opcional)</span>
              </span>
              <Textarea
                value={taskDetalhe}
                onChange={(e) => setTaskDetalhe(e.target.value)}
                placeholder="o que ficou combinado, o que conferir"
                className="text-[12.5px] min-h-[62px] resize-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> Dia
                </span>
                <Input type="date" lang="pt-BR" value={taskDia} onChange={(e) => setTaskDia(e.target.value)}
                  className="h-9 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Hora <span className="opacity-60">(opcional)</span>
                </span>
                <Input type="time" lang="pt-BR" value={taskHora} onChange={(e) => setTaskHora(e.target.value)}
                  className="h-9 text-[13px]" />
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setTaskAberta(false)} disabled={salvandoTask}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarTask} disabled={salvandoTask || !taskTitulo.trim()}>
              {salvandoTask
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                : <>Marcar task <Check className="h-3.5 w-3.5 ml-1.5" /></>}
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
function SeloContato({ origem, base, tamanho = "pequeno" }: {
  origem?: "inbound" | "outbound";
  base?: string | null;
  tamanho?: "pequeno" | "grande";
}) {
  if (!origem && !base) return null;
  const g = tamanho === "grande";
  const caixa = g
    ? "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] ring-1"
    : "inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[9px] ring-1";
  const ico = g ? "h-2.5 w-2.5" : "h-2.5 w-2.5";
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
    </>
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

/* ── a jornada do lead ────────────────────────────────────────────────────
   Mesmo trilho da linha do tempo do processo, e de propósito: quem usa as duas
   telas não deveria ter que aprender duas gramáticas pra "onde isso está".
   Ponto cheio com check pra concluída, anel pulsando na atual, oco na pendente,
   e a partícula descendo pelo trecho vivo. Tudo na cor primária do tema — o
   verde de antes era uma cor a mais que não queria dizer nada.

   A ETAPA CORRENTE FICA ABERTA, como lá: é dentro dela que as tasks do lead
   aparecem e é dali que se insere uma nova. Avançar marca como PULADA o que
   ficou pelo caminho, em vez de fingir que foi concluído. */
function JornadaLead({ atual, puladas, tasksDoLead, onEscolherEtapa, onNovaTask, onConcluirTask }: {
  atual: Estagio;
  puladas: Estagio[];
  tasksDoLead: Task[];
  onEscolherEtapa: () => void;
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
                      onClick={onEscolherEtapa}>
                      <ArrowRight className="h-3.5 w-3.5" /> Avançar etapa
                    </Button>
                  )}
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
function CardInstancia({ instancia, todas, onTrocar, onConectar, onReaplicar, onImportar, onDiagnosticar }: {
  instancia: Instancia; todas: Instancia[];
  onTrocar: (id: string) => void;
  onConectar: () => void;
  onReaplicar: () => void;
  onImportar: () => void;
  onDiagnosticar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const on = instancia.status === "conectado";
  return (
    <SpotlightCard sutil className="shrink-0 rounded-xl p-3 flex items-center gap-3">
      {/* A FOTO DO PERFIL É IDENTIDADE, NÃO STATUS. Ela fica neutra: quem diz
          se o número está de pé é o selo ao lado do nome, e só ele. O mesmo
          recado em três lugares — anel colorido, pontinho na foto e selo —
          fazia o card inteiro parecer um alarme aceso. */}
      <div className="h-11 w-11 shrink-0 rounded-full overflow-hidden grid place-items-center text-[13px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
        {instancia.fotoUrl
          ? <img src={instancia.fotoUrl} alt="" className="h-full w-full object-cover"
                 onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : instancia.avatar}
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
                  <span className="h-8 w-8 shrink-0 rounded-full overflow-hidden grid place-items-center text-[10.5px] font-semibold bg-white/[0.05] text-foreground/80 ring-1 ring-white/10">
                    {i.fotoUrl
                      ? <img src={i.fotoUrl} alt="" className="h-full w-full object-cover"
                             onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      : i.avatar}
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
