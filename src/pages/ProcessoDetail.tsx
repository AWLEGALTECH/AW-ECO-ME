import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { podeGravarLinha } from "@/lib/linhaTemporal";
import {
  chaveDeRequerido, nomesDaLista, listaDosNomes, nomesDasChaves, mesmasChaves, fonteDoRequerido,
} from "@/lib/requeridos";
import { DialogBaixaTracker, type AlvoBaixa } from "@/components/DialogBaixaTracker";
import { valorPrevistoDoProcesso, ganhoDoProcesso } from "@/lib/baixaTracker";
import { PinButton } from "@/components/PinButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  ProcessoTimeline, STATUS_PROCESSUAIS, ICONE_TIPO, LABEL_TIPO, montarEtapasPadrao, type Etapa, type SentencaEtapa,
} from "@/components/ProcessoTimeline";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Save, Check, ChevronsUpDown, Copy, Pencil, History, Loader2,
  FileText, MapPin, User, SquareArrowOutUpRight, Package, X,
  Handshake, Activity, ListTodo, Paperclip, Landmark, Trophy, Scale,
  Building2, ArrowUpFromLine, UserRound, Gavel, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ehSegundoGrau, exigeOrgaoJulgador, normalizarOrgao, diasNoSegundoGrau, ORGAOS_SUGERIDOS,
} from "@/lib/segundoGrau";

const EASE = [0.22, 1, 0.36, 1] as const;

/* QUAIS AVISOS DE PROCEDÊNCIA JÁ FORAM LIDOS.
 *
 * O aviso ("herdado do contrato, ninguém conferiu") é útil na primeira vez que
 * se abre o processo e vira ruído da segunda em diante. Como linha fixa embaixo
 * do réu, ele ocupava espaço permanente pra dizer uma coisa que só precisava
 * ser dita uma vez.
 *
 * Guardado POR PROCESSO, e não como um "não mostrar mais" global: cada processo
 * tem a sua procedência, e fechar o aviso de um não diz nada sobre os outros
 * onze que também vieram de contrato.
 *
 * NO NAVEGADOR, e não na conta: é preferência de leitura de quem está sentado
 * ali, igual às seções retráteis da ficha do atendimento.
 */
const AVISOS_LIDOS = "aw:processo:origem-do-requerido:lidos";

function avisosLidos(): string[] {
  try { return JSON.parse(localStorage.getItem(AVISOS_LIDOS) || "[]") as string[]; }
  catch { return []; }
}

interface ProcessoForm {
  id?: string;
  numero_processo: string;
  cliente_id: string;
  materia: string;
  /* Chaves de `requeridos_catalogo`. Array porque litisconsórcio existe: quatro
     processos da carteira têm dois réus de verdade (Estado + DETRAN, IMMU + a
     locadora, Instituto Pro-Saúde + CENUSA, Banco Master + Avancard). */
  requeridos: string[];
  requerido_origem: string | null;
  /* Chaves de `materias_catalogo`. A matéria virou o nome do PRODUTO do Writer
     ("Débitos Automáticos"), e as rubricas são o que aquele produto está
     cobrando neste processo. Antes as duas coisas estavam espremidas na mesma
     string, separadas por barra, em 137 grafias diferentes. */
  materia_rubricas: string[];
  data_ultimo_andamento: string;
  prazo_processual: string;
  fase_processual: string;
  tipo_pendencia: string;
  status_tarefa: string;
  vara_juizo_origem: string;
  observacoes: string;
  valor_causa: string;
  comarca_uf: string;
  parceiro: string;
  /* Segundo grau (chamado "Criar campo na ficha do processo"): quando subiu,
     em qual câmara ou turma está e quem relata. O órgão é obrigatório para
     entrar num status de acórdão. */
  segundo_grau_data_subida: string;
  segundo_grau_orgao: string;
  segundo_grau_relator: string;
}

interface ClienteOption { id: string; nome: string }

const EMPTY: ProcessoForm = {
  numero_processo: "",
  cliente_id: "",
  materia: "",
  requeridos: [],
  requerido_origem: null,
  materia_rubricas: [],
  data_ultimo_andamento: "",
  prazo_processual: "",
  fase_processual: "",
  tipo_pendencia: "",
  status_tarefa: "",
  vara_juizo_origem: "",
  observacoes: "",
  valor_causa: "",
  comarca_uf: "",
  parceiro: "",
  segundo_grau_data_subida: "",
  segundo_grau_orgao: "",
  segundo_grau_relator: "",
};

// Capas dos produtos do Writer (Bradesco). Cada processo herda a capa do
// produto correspondente à sua MATÉRIA. Como as matérias têm dezenas de
// variações e erros de digitação ("SAQUE TEMRINAL", "CAPTALIZAÇÃO"...), o
// casamento é por PALAVRA-CHAVE normalizada, não por string exata.
const CAPAS = {
  debitos: { src: "/processo-capas/debitos-automaticos.jpg", nome: "Débitos Automáticos" },
  tarifas: { src: "/processo-capas/tarifas-bancarias.jpg", nome: "Tarifas Bancárias" },
  juros: { src: "/processo-capas/juros-encargos.jpg", nome: "Juros e Encargos Indevidos" },
  prestamista: { src: "/processo-capas/seguro-prestamista.jpg", nome: "Seguro Prestamista" },
  vidaPrev: { src: "/processo-capas/vida-previdencia.jpg", nome: "Vida e Previdência" },
  capitalizacao: { src: "/processo-capas/titulo-capitalizacao.jpg", nome: "Título de Capitalização" },
  cesta: { src: "/processo-capas/cesta-servicos.jpg", nome: "Cesta de Serviços" },
  anuidade: { src: "/processo-capas/anuidade-cartao.jpg", nome: "Anuidade Cartão" },
  cartaoProtegido: { src: "/processo-capas/seguro-cartao-protegido.jpg", nome: "Seguro Cartão Protegido" },
  dividaAtraso: { src: "/processo-capas/divida-atraso.jpg", nome: "Dívida em Atraso" },
  contaFraude: { src: "/processo-capas/conta-fraude.jpg", nome: "Conta Aberta por Fraude" },
  /* O Mix tem capa própria no Writer, e ela estava faltando aqui: eu tinha
     concluído que não existia olhando só a pasta, sem olhar a fonte. As capas
     moram em base64 dentro de `writer-app/src/products.js`, e esta saiu de lá.
     Conferido: as doze batem byte a byte com as do Writer. */
  mix: { src: "/processo-capas/mix-bradesco.jpg", nome: "Mix Bradesco" },
} as const;

// Remove acentos, sobe pra maiúsculo e colapsa espaços — deixa a matéria pronta
// pra comparação por substring.
const normMateria = (m?: string | null) =>
  (m ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ") // "/", ".", "-", "+" viram espaço p/ casar rubricas
    .replace(/\s+/g, " ")
    .trim();

// Retorna a capa do produto Bradesco correspondente à matéria — ou undefined
// quando não há produto seguro pra associar (aí o processo fica sem capa).
// Ordem das regras importa: da mais específica pra mais genérica.
/* O NOME DO PRODUTO ACHA A CAPA DIRETO, e isso vem antes de tudo.
 *
 * Desde a padronização, a matéria dos processos do Bradesco É o nome do produto
 * ("Débitos Automáticos", "Tarifas Bancárias"). A escada de palavras-chave
 * abaixo foi escrita para o texto ANTIGO, cheio de barra e de erro de digitação,
 * e ela não reconhece os nomes novos: "DEBITOS AUTOMATICOS" não contém "BX ANT"
 * nem "PARC CRED", e "TARIFAS BANCARIAS" não contém "SAQUE TERMINAL". Sem este
 * mapa, 103 processos (74 de Débitos + 29 de Tarifas) perderiam a capa no dia
 * em que o nome ficou certo.
 *
 * A escada continua viva porque os processos que NÃO são do Bradesco seguem com
 * o texto livre, e é ela que ainda os cobre. */
const CAPA_DO_PRODUTO: Record<string, { src: string; nome: string }> = {
  "DEBITOS AUTOMATICOS": CAPAS.debitos,
  "TARIFAS BANCARIAS": CAPAS.tarifas,
  "JUROS E ENCARGOS INDEVIDOS": CAPAS.juros,
  "SEGURO PRESTAMISTA": CAPAS.prestamista,
  "VIDA E PREVIDENCIA": CAPAS.vidaPrev,
  "TITULO DE CAPITALIZACAO": CAPAS.capitalizacao,
  "CESTA DE SERVICOS": CAPAS.cesta,
  "ANUIDADE CARTAO": CAPAS.anuidade,
  "SEGURO CARTAO PROTEGIDO": CAPAS.cartaoProtegido,
  "DIVIDA EM ATRASO": CAPAS.dividaAtraso,
  "CONTA ABERTA POR FRAUDE": CAPAS.contaFraude,
  "MIX BRADESCO": CAPAS.mix,
};

function capaParaMateria(materia?: string | null): { src: string; nome: string } | undefined {
  const t = normMateria(materia);
  if (!t) return undefined;
  const doProduto = CAPA_DO_PRODUTO[t];
  if (doProduto) return doProduto;
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));

  // Conta aberta por fraude: a matéria não é uma rubrica de extrato, é o tipo
  // da ação, então as variações que o pessoal escreve giram em torno de FRAUDE
  // e de CONTA/VÍNCULO. Vem primeiro porque "CONTA" sozinha é palavra genérica
  // demais e a regra precisa da combinação pra não roubar matéria alheia.
  if (
    (has("FRAUDE", "FRAUDULENT") && has("CONTA", "ABERTURA", "VINCULO")) ||
    has("CONTA NAO RECONHECIDA", "INEXISTENCIA DE RELACAO", "VINCULO INEXISTENTE")
  )
    return CAPAS.contaFraude;
  // "DIV. EM ATRASO" chega aqui normalizada como "DIV EM ATRASO". Vem antes das
  // demais porque "ATRASO" é palavra que nenhuma outra rubrica usa — e depois
  // dela ficariam regras genéricas ("MORA", "ENCARGO") que roubariam a matéria.
  if (has("DIV EM ATRASO", "DIVIDA EM ATRASO", "DIVIDA ATRASO", "DIV ATRASO")) return CAPAS.dividaAtraso;
  if (has("CAPITALIZ", "CAPTALIZ")) return CAPAS.capitalizacao;
  if (has("PRESTAMISTA")) return CAPAS.prestamista;
  if (has("VIDA E PREVID", "PREVIDENCIA")) return CAPAS.vidaPrev;
  if (has("CARTAO PROTEGIDO", "CREDITO PROTEGIDO") || (t.includes("SEGURO") && t.includes("CARTAO")))
    return CAPAS.cartaoProtegido;
  if (has("ANUIDADE")) return CAPAS.anuidade;
  if (has("CESTA", "PACOTE")) return CAPAS.cesta;
  if (has("SAQUE TERMINAL", "SAQUE TEMRINAL", "EMISSAO EXTRATO", "EXTRATO MOVIMENTO")) return CAPAS.tarifas;
  if (has("MORA", "ENCARGO") || (t.includes("JUROS") && t.includes("ABUSIV"))) return CAPAS.juros;
  if (
    has(
      "BX ANT", "BX.ANT", "BXANT", "ANT FINAN", "ANTECIPACAO FINAN",
      "PARC CRED", "PARCELA CRED", "PARCELA DE CRED", "PARCELA CREDITO",
      "GASTOS CARTAO", "GASTOS COM CARTAO", "GASTOS DE CARTAO", "ADIANT",
    )
  )
    return CAPAS.debitos;

  return undefined;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => {
  if (!d) return "não informado";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const ymdToDate = (s?: string): Date | undefined => {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};
const dateToYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Linha da tabela read-only (rótulo → valor). */
function Row({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-2.5 border-b border-border/40", full && "md:col-span-2")}>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* Texto editável no lugar, como a data e o status do card de situação: mostra o
   valor, vira campo ao clicar, grava no Enter ou ao sair, descarta no Esc. */
function CampoInline({ valor, placeholder, onSalvar, sugestoes, listaId, transformar }: {
  valor: string;
  placeholder: string;
  onSalvar: (v: string) => void;
  sugestoes?: readonly string[];
  listaId?: string;
  transformar?: (v: string) => string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const descartar = useRef(false);
  useEffect(() => { if (!editando) setTexto(valor); }, [valor, editando]);
  const salvar = () => {
    setEditando(false);
    if (descartar.current) { descartar.current = false; return; }
    const v = transformar ? transformar(texto) : texto.trim();
    if (v !== valor) onSalvar(v);
  };
  if (!editando) {
    return (
      <button onClick={() => setEditando(true)} className="mt-1.5 block max-w-full truncate text-left text-sm font-semibold hover:text-primary transition-colors">
        {valor || <span className="font-normal text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }
  return (
    <>
      <Input
        autoFocus
        value={texto}
        list={listaId}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") { descartar.current = true; setEditando(false); }
        }}
        className="mt-1.5 h-8 text-sm"
        placeholder={placeholder}
      />
      {sugestoes && listaId && (
        <datalist id={listaId}>{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
      )}
    </>
  );
}

/* Data editável no lugar. Campo de data nativo, e não o calendário em balão:
   data retroativa se DIGITA (08/08/2026), em vez de voltar mês a mês. */
function DataInline({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  if (!editando) {
    return (
      <button onClick={() => setEditando(true)} className="mt-1.5 block text-left text-sm font-semibold tabular-nums hover:text-primary transition-colors">
        {valor ? fmtData(valor) : <span className="font-normal text-muted-foreground">definir</span>}
      </button>
    );
  }
  return (
    <Input
      type="date"
      autoFocus
      defaultValue={valor}
      onChange={(e) => { if (e.target.value) onSalvar(e.target.value); }}
      onBlur={() => setEditando(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditando(false); }}
      className="mt-1.5 h-8 text-sm w-auto"
    />
  );
}

export default function ProcessoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "novo";

  const [form, setForm] = useState<ProcessoForm>(EMPTY);
  const [saved, setSaved] = useState<ProcessoForm>(EMPTY);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  /* O catálogo de réus, chave → nome de tela. Vem inteiro numa consulta: são
     ~80 linhas, e a alternativa (buscar o nome de cada chave quando precisar)
     seria uma ida ao banco pra traduzir duas palavras. */
  const [reusCatalogo, setReusCatalogo] = useState<Record<string, string>>({});
  /* Chave de rubrica -> rótulo de tela. Mesmo desenho do catálogo de réus. */
  const [materiasCatalogo, setMateriasCatalogo] = useState<Record<string, string>>({});
  /* O texto do campo enquanto se edita. Separado de `form.requeridos` porque
     ali moram CHAVES, e quem digita digita NOME — converter a cada tecla e
     reconverter para mostrar faria "Banco  Bradesco " virar outra coisa
     debaixo do cursor. */
  const [reusTexto, setReusTexto] = useState("");
  const reusNomes = nomesDaLista(reusTexto);
  const [avisoOrigem, setAvisoOrigem] = useState(false);

  /* As rubricas que valem a pena mostrar embaixo do nome da matéria.
     Fora as que repetem o próprio nome: processo de rubrica única sem produto
     no Writer se chama pelo rótulo dela, e a linha embaixo seria eco. */
  const rubricasDaFicha = form.materia_rubricas
    .map((c) => materiasCatalogo[c] ?? c)
    .filter((r) => r.trim().toLowerCase() !== form.materia.trim().toLowerCase());
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [fichaOpen, setFichaOpen] = useState(isNew);
  // Etapas da timeline vivem aqui (estado elevado): alimentam o card de situação
  // e são carregadas/persistidas na coluna `linha_temporal` do banco.
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  // Snapshot do que já está salvo, pra não regravar no carregamento inicial.
  const linhaSalvaRef = useRef<string>("");
  // Trava de segurança: guarda o id do processo cuja linha já está em `etapas`.
  // `etapas` nasce vazio e só é preenchido quando o load termina; sem esta
  // trava, uma leitura lenta deixava o autosave disparar antes e gravar
  // `linha_temporal: []` — apagando a história do processo. Guardar o id (e não
  // um booleano) também evita salvar a linha de um processo em cima de outro
  // ao trocar de processo sem desmontar a tela.
  const linhaProntaRef = useRef<string | null>(null);
  const [fixadoGeral, setFixadoGeral] = useState(false);
  const [fixadoPessoal, setFixadoPessoal] = useState(false);
  // A baixa não é gravada pela timeline: ela abre esta confirmação e o banco
  // faz status e lançamento numa transação só.
  const [baixa, setBaixa] = useState<AlvoBaixa | null>(null);
  /* Status de acórdão pedido sem câmara ou turma gravada: fica aqui esperando
     a pessoa dizer qual é. Só depois o status entra. */
  const [pedidoOrgao, setPedidoOrgao] = useState<string | null>(null);
  /* A mesma janela, aberta pelo "Editar" do card: sem status pendente, e sem
     obrigar o órgão. */
  const [sgEditando, setSgEditando] = useState(false);
  const [sgDraft, setSgDraft] = useState({ orgao: "", data: "", relator: "" });
  /* O que o DJEN diz sobre o segundo grau deste processo (órgão e primeira
     publicação que o cita). Sugestão para um clique, nunca preenchimento
     automático: "TURMA RECURSAL" sem número aparece em despacho de primeiro
     grau e não diz qual turma. */
  const [sugestaoDjen, setSugestaoDjen] = useState<{ orgao: string; data: string | null } | null>(null);

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("id, nome").order("nome");
    if (data) setClientes(data);
  }, []);

  const loadMaterias = useCallback(async () => {
    const { data } = await (supabase.from("materias_catalogo" as never) as never as {
      select: (c: string) => Promise<{ data: { chave: string; rotulo: string }[] | null }>;
    }).select("chave, rotulo");
    if (data) setMateriasCatalogo(Object.fromEntries(data.map((m) => [m.chave, m.rotulo])));
  }, []);

  const loadReus = useCallback(async () => {
    const { data } = await (supabase.from("requeridos_catalogo" as never) as never as {
      select: (c: string) => Promise<{ data: { chave: string; nome: string }[] | null }>;
    }).select("chave, nome");
    if (data) setReusCatalogo(Object.fromEntries(data.map((r) => [r.chave, r.nome])));
  }, []);

  const loadProcesso = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase.from("processos").select("*").eq("id", id).single();
    if (data) {
      const f: ProcessoForm = {
        id: data.id,
        numero_processo: data.numero_processo ?? "",
        cliente_id: data.cliente_id,
        materia: data.materia ?? "",
        requeridos: Array.isArray((data as { requeridos?: string[] }).requeridos)
          ? ((data as { requeridos?: string[] }).requeridos as string[]) : [],
        requerido_origem: (data as { requerido_origem?: string | null }).requerido_origem ?? null,
        materia_rubricas: Array.isArray((data as { materia_rubricas?: string[] }).materia_rubricas)
          ? ((data as { materia_rubricas?: string[] }).materia_rubricas as string[]) : [],
        data_ultimo_andamento: data.data_ultimo_andamento ?? "",
        prazo_processual: data.prazo_processual ?? "",
        fase_processual: data.fase_processual ?? "",
        tipo_pendencia: data.tipo_pendencia ?? "",
        status_tarefa: data.status_tarefa ?? "",
        vara_juizo_origem: data.vara_juizo_origem ?? "",
        observacoes: data.observacoes ?? "",
        valor_causa: data.valor_causa != null ? String(data.valor_causa) : "",
        comarca_uf: data.comarca_uf ?? "",
        parceiro: data.parceiro ?? "",
        segundo_grau_data_subida: (data as { segundo_grau_data_subida?: string | null }).segundo_grau_data_subida ?? "",
        segundo_grau_orgao: (data as { segundo_grau_orgao?: string | null }).segundo_grau_orgao ?? "",
        segundo_grau_relator: (data as { segundo_grau_relator?: string | null }).segundo_grau_relator ?? "",
      };
      setForm(f);
      setSaved(f);
      const ltRaw = Array.isArray(data.linha_temporal) ? (data.linha_temporal as Etapa[]) : [];
      // Todo processo mostra as "Movimentações & demandas": se ainda não há uma
      // linha salva, monta a padrão a partir do status atual. O efeito de
      // persistência então grava a linha no banco (ref abaixo reflete o vazio).
      const base = ltRaw.length > 0
        ? ltRaw.map((e) => ({ ...e, tasks: e.tasks ?? [] }))
        : montarEtapasPadrao(data.fase_processual);
      linhaSalvaRef.current = JSON.stringify(ltRaw.map((e) => ({ ...e, tasks: e.tasks ?? [] })));
      // Mescla a sentença já registrada no Tracker na milestone "Sentença"
      // (backfill dos processos já sentenciados e mencionados no tracker).
      const { data: sent } = await supabase.from("sentencas" as never).select("valor, data_sentenca, honorarios, observacoes").eq("processo_id", data.id as never).maybeSingle();
      let semeada = base;
      const sr = sent as { valor?: number; data_sentenca?: string; honorarios?: number | null; observacoes?: string | null } | null;
      if (sr) {
        const idx = base.findIndex((e) => e.titulo === "Sentença");
        // Ter sentença NÃO conclui a milestone sozinho: ela vira a etapa atual
        // (com o card) e as seguintes voltam a pendente — só o usuário avança
        // (recurso/trânsito). Só aplica se ainda não há card registrado.
        if (idx >= 0 && !base[idx].sentenca) {
          const dataBR = sr.data_sentenca ? sr.data_sentenca.split("-").reverse().join("/") : undefined;
          const sentenca: SentencaEtapa = {
            resultado: "procedente",
            valor: Number(sr.valor) || 0,
            data: sr.data_sentenca ?? "",
            honorarios: sr.honorarios != null ? Number(sr.honorarios) : undefined,
            obs: sr.observacoes ?? undefined,
          };
          semeada = base.map((e, i) => {
            if (i < idx) return { ...e, status: "concluida" as const, inicio: e.inicio ?? "pré-sistema", conclusao: e.conclusao ?? "pré-sistema" };
            if (i === idx) return { ...e, status: "atual" as const, inicio: dataBR ?? e.inicio ?? "pré-sistema", conclusao: undefined, statusProcessual: undefined, sentenca };
            return { ...e, status: "pendente" as const, inicio: undefined, conclusao: undefined, statusProcessual: undefined };
          });
        }
      }
      setEtapas(semeada);
      linhaProntaRef.current = data.id;
      setFixadoGeral(!!(data as { fixado_geral?: boolean }).fixado_geral);
      const { data: pin } = await supabase.from("processo_fixados").select("processo_id").eq("processo_id", data.id).maybeSingle();
      setFixadoPessoal(!!pin);
    }
    setLoading(false);
  }, [id, isNew]);

  const togglePinPessoal = async () => {
    if (!id || isNew) return;
    if (fixadoPessoal) {
      setFixadoPessoal(false);
      await supabase.from("processo_fixados").delete().eq("processo_id", id);
    } else {
      if (!user) { toast.error("Faça login para fixar."); return; }
      setFixadoPessoal(true);
      await supabase.from("processo_fixados").insert({ user_id: user.id, processo_id: id });
    }
  };
  const togglePinGeral = async () => {
    if (!id || isNew) return;
    const novo = !fixadoGeral;
    setFixadoGeral(novo);
    const { error } = await supabase.from("processos").update({ fixado_geral: novo }).eq("id", id);
    if (error) { toast.error("Não foi possível fixar"); setFixadoGeral(!novo); }
  };

  // Registra a sentença no Tracker (só vitórias). Chamado pela timeline ao
  // preencher a milestone "Sentença".
  const registrarSentenca = async (s: SentencaEtapa) => {
    if (isNew || !id || s.resultado === "improcedente") return;
    const campos = {
      valor: s.valor,
      data_sentenca: s.data,
      honorarios: s.honorarios ?? null,
      observacoes: s.obs ?? null,
    };
    const sb = supabase.from("sentencas" as never);
    const { data: existente } = await sb.select("id").eq("processo_id", id as never).maybeSingle();
    const { error } = existente
      ? await supabase.from("sentencas" as never).update({ ...campos, updated_at: new Date().toISOString() } as never).eq("processo_id", id as never)
      : await supabase.from("sentencas" as never).insert({ ...campos, processo_id: id, status: "ganha", created_by: user?.id ?? null } as never);
    if (error) toast.error("Não foi possível registrar no Tracker");
    else toast.success("Sentença registrada no Tracker 🏆");
  };

  useEffect(() => {
    document.title = isNew ? "Novo Processo · AW ECO ME" : "Processo · AW ECO ME";
    loadClientes();
    loadReus();
    loadMaterias();
    loadProcesso();
  }, [loadClientes, loadReus, loadMaterias, loadProcesso, isNew]);

  /* O CAMPO SÓ SE REESCREVE FORA DA EDIÇÃO. O catálogo costuma chegar depois do
     processo, e sem este efeito o campo ficaria mostrando `BANCO_BRADESCO` até
     alguém recarregar. Com `editing` na guarda, ele nunca reescreve por cima de
     quem está digitando — que seria o defeito oposto e pior. */
  useEffect(() => {
    if (editing) return;
    setReusTexto(listaDosNomes(nomesDasChaves(form.requeridos, reusCatalogo)));
  }, [form.requeridos, reusCatalogo, editing]);

  /* O balão sai ao abrir o processo, e só quando NÃO foi o tribunal que
     respondeu: dizer "conferido no tribunal" em 406 fichas seria avisar sobre o
     caso normal. O que merece um aviso é o herdado de contrato, que ninguém
     conferiu, e o preenchido à mão. */
  useEffect(() => {
    const vale = !!id && !!form.requerido_origem && form.requerido_origem !== "djen";
    setAvisoOrigem(vale && !avisosLidos().includes(id!));
  }, [id, form.requerido_origem]);

  /* Lê no DJEN o que ele diz do segundo grau. Uma ida ao banco por processo
     aberto, sobre umas quatro publicações; barato. */
  useEffect(() => {
    const numero = form.numero_processo.trim();
    if (isNew || !numero) { setSugestaoDjen(null); return; }
    let vivo = true;
    (async () => {
      const { data } = await (supabase.rpc as unknown as (fn: string, args: Record<string, string>) =>
        Promise<{ data: { orgao: string | null; data: string | null }[] | null }>)("fn_segundo_grau_do_djen", { p_numero: numero });
      if (!vivo) return;
      const linha = Array.isArray(data) ? data[0] : null;
      setSugestaoDjen(linha?.orgao ? { orgao: linha.orgao, data: linha.data ?? null } : null);
    })();
    return () => { vivo = false; };
  }, [form.numero_processo, isNew]);

  const fecharAvisoOrigem = () => {
    setAvisoOrigem(false);
    if (!id) return;
    try {
      const lidos = avisosLidos();
      if (!lidos.includes(id)) localStorage.setItem(AVISOS_LIDOS, JSON.stringify([...lidos, id]));
    } catch { /* sem storage, o aviso volta na próxima abertura e tudo bem */ }
  };

  // Persiste a linha temporal no banco sempre que as etapas mudam (tarefa nova,
  // pendência, avanço, status). Debounce curto; ignora se nada mudou vs o salvo.
  useEffect(() => {
    // Enquanto o processo não terminou de carregar, `etapas` é só o vazio
    // inicial do useState — gravar isso apagaria a linha do banco.
    if (!podeGravarLinha(linhaProntaRef.current, id, isNew)) return;
    const atual = JSON.stringify(etapas);
    if (atual === linhaSalvaRef.current) return;
    const t = window.setTimeout(async () => {
      const { error } = await supabase.from("processos").update({ linha_temporal: etapas }).eq("id", id);
      if (!error) linhaSalvaRef.current = atual;
    }, 800);
    return () => window.clearTimeout(t);
  }, [etapas, id, isNew]);

  // Status é UMA coisa só: o status da etapa ATUAL (timeline) manda no
  // fase_processual do processo (ficha + lista). Se mudou embaixo (ex.: ao
  // adicionar uma tarefa), reflete no card e no status real. A ficha, ao
  // editar a fase, alinha a etapa (em handleSave), então não há reversão.
  useEffect(() => {
    if (isNew || !id) return;
    const s = etapas.find((e) => e.status === "atual")?.statusProcessual;
    if (s && s !== form.fase_processual) patchProcesso({ fase_processual: s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, form.fase_processual]);

  const handleSave = async () => {
    if (!form.numero_processo.trim()) { toast.error("Número do processo é obrigatório"); return; }
    if (!form.cliente_id) { toast.error("Cliente é obrigatório"); return; }
    setSaving(true);

    /* RÉU NOVO ENTRA NO CATÁLOGO ANTES DE ENTRAR NO PROCESSO. Sem isto, a
       chave gravada no processo não teria linha correspondente e a ficha
       mostraria `BANCO_XPTO` em vez de "Banco XPTO" — o uuid-na-tela de novo,
       com outro nome. */
    const reusMudaram = !mesmasChaves(form.requeridos, saved?.requeridos);
    if (reusMudaram && form.requeridos.length > 0) {
      const novas = form.requeridos.filter((c) => !reusCatalogo[c]);
      if (novas.length > 0) {
        const linhas = novas.map((c) => ({ chave: c, nome: reusNomes.find((n) => chaveDeRequerido(n) === c) ?? c }));
        await (supabase.from("requeridos_catalogo" as never) as never as {
          upsert: (v: unknown, o: unknown) => Promise<unknown>;
        }).upsert(linhas, { onConflict: "chave" });
        setReusCatalogo((a) => ({ ...a, ...Object.fromEntries(linhas.map((l) => [l.chave, l.nome])) }));
      }
    }

    const payload = {
      numero_processo: form.numero_processo.trim(),
      cliente_id: form.cliente_id,
      materia: form.materia.trim() || null,
      requeridos: form.requeridos.length > 0 ? form.requeridos : null,
      /* A ORIGEM SÓ VIRA "manual" QUANDO A LISTA REALMENTE MUDOU. Gravar
         "manual" em todo salvamento apagaria a procedência de 406 processos
         conferidos no tribunal — e com ela a possibilidade de reprocessar só o
         que veio de palpite. */
      ...(reusMudaram ? { requerido_origem: form.requeridos.length > 0 ? "manual" : null } : {}),
      data_ultimo_andamento: form.data_ultimo_andamento || null,
      prazo_processual: form.prazo_processual || null,
      fase_processual: form.fase_processual.trim() || null,
      tipo_pendencia: form.tipo_pendencia.trim() || null,
      status_tarefa: form.status_tarefa.trim() || null,
      vara_juizo_origem: form.vara_juizo_origem.trim() || null,
      observacoes: form.observacoes.trim() || null,
      valor_causa: form.valor_causa ? parseMoneyBR(form.valor_causa) : null,
      comarca_uf: form.comarca_uf.trim() || null,
      parceiro: form.parceiro.trim() || null,
      segundo_grau_data_subida: form.segundo_grau_data_subida || null,
      segundo_grau_orgao: form.segundo_grau_orgao.trim() ? normalizarOrgao(form.segundo_grau_orgao) : null,
      segundo_grau_relator: form.segundo_grau_relator.trim() || null,
    };

    /* O CAST EXISTE POR CAUSA DO `types.ts` DESATUALIZADO, não por causa do
       payload. O arquivo gerado não conhece `requeridos` nem
       `requerido_origem` — nem `linha_temporal` e `fixado_geral`, que já eram
       castadas aqui pelo mesmo motivo. Regenerar o types.ts resolve os quatro
       de uma vez e é dívida antiga; até lá, o cast fica LOCAL ao insert/update,
       para o resto do arquivo continuar tipado de verdade. */
    const gravavel = payload as never;

    let error: unknown;
    if (isNew) {
      const res = await supabase.from("processos").insert(gravavel).select("id").single();
      error = res.error;
      if (!error && res.data) { setSaving(false); toast.success("Processo criado"); navigate(`/processos/${res.data.id}`); return; }
    } else {
      const res = await supabase.from("processos").update(gravavel).eq("id", id!);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      const code = (error as { code?: string }).code;
      toast.error(code === "23505" ? "Número de processo já cadastrado" : "Erro ao salvar");
      return;
    }
    toast.success("Processo atualizado");
    setSaved(form);
    setEditing(false);
    // Editou a fase na ficha → alinha o status da etapa atual (mesma coisa).
    setEtapas((prev) => prev.map((e) => (e.status === "atual" ? { ...e, statusProcessual: form.fase_processual.trim() || undefined } : e)));
  };

  const cancelarEdicao = () => {
    setForm(saved);
    setEditing(false);
  };

  // Edição rápida (inline) de um campo direto no card de situação, persistindo
  // só aquele campo. String vazia vira null no banco.
  const patchProcesso = async (patch: Partial<Pick<ProcessoForm,
    "data_ultimo_andamento" | "fase_processual" | "segundo_grau_data_subida" | "segundo_grau_orgao" | "segundo_grau_relator">>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (isNew || !id) return;
    const dbPatch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) dbPatch[k] = v ? v : null;
    const { error } = await supabase.from("processos").update(dbPatch).eq("id", id);
    if (error) { toast.error("Não foi possível salvar a alteração"); return; }
    setSaved((s) => ({ ...s, ...patch }));
  };

  const copiarNumero = async () => {
    if (!form.numero_processo) return;
    try {
      await navigator.clipboard.writeText(form.numero_processo);
      toast.success("Número copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const clienteSelecionado = clientes.find((c) => c.id === form.cliente_id);
  const valorNum = form.valor_causa ? parseMoneyBR(form.valor_causa) : 0;
  const localizacao = [form.vara_juizo_origem, form.comarca_uf].filter(Boolean).join(" · ");
  const capa = capaParaMateria(form.materia);

  // ── Card de situação — dados derivados da timeline (estado elevado) ──
  const etapaAtual = etapas.find((e) => e.status === "atual");
  const statusProcValue = etapaAtual?.statusProcessual ?? form.fase_processual ?? "";
  const aplicarStatus = (v: string) => {
    // mantém timeline e ficha em sincronia: atualiza a etapa atual e o campo.
    if (etapaAtual) {
      setEtapas((prev) => prev.map((e) => (e.id === etapaAtual.id ? { ...e, statusProcessual: v } : e)));
    }
    patchProcesso({ fase_processual: v });
  };
  /* ACÓRDÃO NÃO ENTRA SEM CÂMARA OU TURMA. É o pedido do chamado: quando o
     processo avança para um status de acórdão, é obrigatório dizer em qual
     órgão ele está. Vale para os dois lugares que trocam status (o card de
     situação e a timeline): a troca fica pendente até a pessoa responder, e
     cancelar deixa o status como estava. Devolve true quando interceptou. */
  const interceptarStatus = (v: string): boolean => {
    if (!exigeOrgaoJulgador(v) || form.segundo_grau_orgao.trim()) return false;
    setSgDraft({
      orgao: sugestaoDjen?.orgao ?? "",
      data: form.segundo_grau_data_subida || sugestaoDjen?.data || "",
      relator: form.segundo_grau_relator,
    });
    setPedidoOrgao(v);
    return true;
  };
  const setStatusProc = (v: string) => { if (interceptarStatus(v)) return; aplicarStatus(v); };
  const abrirEdicaoSg = () => {
    setSgDraft({
      orgao: form.segundo_grau_orgao || sugestaoDjen?.orgao || "",
      data: form.segundo_grau_data_subida || sugestaoDjen?.data || "",
      relator: form.segundo_grau_relator,
    });
    setSgEditando(true);
  };
  const fecharSg = () => { setPedidoOrgao(null); setSgEditando(false); };
  const confirmarOrgao = async () => {
    const orgao = normalizarOrgao(sgDraft.orgao);
    // Com status de acórdão esperando, o órgão é obrigatório. Na edição
    // livre, pode salvar só a data ou só o relator.
    if (pedidoOrgao && !orgao) return;
    await patchProcesso({
      segundo_grau_orgao: orgao,
      segundo_grau_data_subida: sgDraft.data,
      segundo_grau_relator: sgDraft.relator.trim(),
    });
    if (pedidoOrgao) aplicarStatus(pedidoOrgao);
    fecharSg();
  };
  const usarSugestaoDjen = () => {
    if (!sugestaoDjen) return;
    patchProcesso({
      ...(form.segundo_grau_orgao.trim() ? {} : { segundo_grau_orgao: sugestaoDjen.orgao }),
      ...(form.segundo_grau_data_subida || !sugestaoDjen.data ? {} : { segundo_grau_data_subida: sugestaoDjen.data }),
    });
  };
  const mostrarSegundoGrau = ehSegundoGrau(statusProcValue) || !!form.segundo_grau_orgao || !!form.segundo_grau_data_subida;
  const diasSg = diasNoSegundoGrau(form.segundo_grau_data_subida);
  const sugestaoUtil = sugestaoDjen && (
    (!form.segundo_grau_orgao.trim() && sugestaoDjen.orgao) ||
    (!form.segundo_grau_data_subida && sugestaoDjen.data));
  // Dias no status atual — contados da última movimentação (não guardamos a data
  // exata em que o processo entrou no status).
  const diasNoStatus = (() => {
    const base = ymdToDate(form.data_ultimo_andamento);
    if (!base) return null;
    base.setHours(0, 0, 0, 0);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((hoje.getTime() - base.getTime()) / 86400000));
  })();
  const textoDias =
    diasNoStatus === null ? null
      : diasNoStatus === 0 ? "há menos de 1 dia"
        : diasNoStatus === 1 ? "há 1 dia" : `há ${diasNoStatus} dias`;
  const allTasks = etapas.flatMap((e) => e.tasks ?? []);
  const nTarefas = allTasks.filter((t) => t.tipo !== "pendencia" && !t.desfecho).length;
  const nPendencias = allTasks.filter((t) => t.tipo === "pendencia" && !t.desfecho).length;

  return (
    <div className="space-y-5">
      {/* ── Barra de ações ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/processos"))} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {!isNew && (
            <PinButton
              fixadoPessoal={fixadoPessoal}
              fixadoGeral={fixadoGeral}
              onTogglePessoal={togglePinPessoal}
              onToggleGeral={togglePinGeral}
            />
          )}
          <Button variant="outline" onClick={() => setFichaOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        </div>
      </div>

      {/* ── HERO — identidade estática do processo ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <SpotlightCard className="relative overflow-hidden">
        {/* Capa do produto (teste, só neste processo) — sangra até a borda do
            card e derrete num degradê na esquerda, sem corte seco. */}
        {capa && (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[54%] sm:w-[46%]"
            style={{
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 55%, #000 100%)",
              maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 55%, #000 100%)",
            }}
          >
            <img src={capa.src} alt={`Capa: ${capa.nome}`} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="relative z-10 max-w-[62%] sm:max-w-[66%]">
          {/* Nº do processo — protagonista, com balança à esquerda */}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Nº do processo</p>
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 md:h-8 md:w-8 text-primary shrink-0" />
            <h1 className="font-mono text-2xl md:text-[1.9rem] font-bold tracking-tight leading-tight break-words text-foreground">
              {form.numero_processo || (isNew ? "novo processo" : "sem número")}
            </h1>
            {form.numero_processo && (
              <button onClick={copiarNumero} className="text-muted-foreground/70 hover:text-primary transition-colors shrink-0" title="Copiar número">
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Matéria, Vara e Cliente — mesma importância */}
          <div className="mt-5 space-y-2.5">
            {/* ── A MATÉRIA, E O QUE ELA ESTÁ COBRANDO ──
                O nome é o do PRODUTO do Writer ("Débitos Automáticos"), e as
                rubricas vêm em linhas embaixo. Antes as duas coisas viviam
                espremidas na mesma string, separadas por barra: `BX ANT
                FINAN/PARC CRED/GASTOS CARTÃO`, `GASTOS CARTÃO/PARC CRED/ BX ANT
                FINAN` e `PARCELA /GASTOS CARTÃO/BX ANT FINAN` eram o MESMO
                processo com três nomes, e nenhum agrupamento funcionava.

                A rubrica só aparece quando diz algo além do nome. Nos processos
                de rubrica única sem produto no Writer o nome JÁ é o rótulo dela,
                e repetir viraria eco. */}
            <div className="flex items-start gap-2 text-[15px] min-w-0">
              <Package className="h-4 w-4 text-primary/70 shrink-0 mt-[3px]" />
              <div className="min-w-0">
                <span className="block font-medium">{form.materia || "Matéria não informada"}</span>
                {rubricasDaFicha.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {rubricasDaFicha.map((r) => (
                      <li key={r} className="flex items-start gap-2 text-[12.5px] text-muted-foreground leading-snug">
                        {/* Ponto, e não traço: o traço é o símbolo que não se
                            usa aqui, e como marcador de lista ele ainda por
                            cima se confunde com hífen de palavra composta. */}
                        <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        <span className="min-w-0 break-words">{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── CONTRA QUEM É ESTA AÇÃO ──
                Vem logo depois da matéria porque as duas juntas são a frase que
                identifica o processo: "cesta de tarifas contra o Bradesco". Até
                aqui a ficha dizia só a primeira metade, e a segunda morava num
                campo do CLIENTE — que erra por construção quando o cliente tem
                mais de um processo (a ALBANIZA tem sete, contra cinco réus
                diferentes, e o campo guardava um).

                O ícone é o do banco, e não a balança: 283 dos 428 são contra o
                Bradesco, e a balança já é o processo inteiro. */}
            <div className="flex items-start gap-2 text-[15px] min-w-0">
              <Landmark className="h-4 w-4 text-primary/70 shrink-0 mt-[3px]" />
              <div className="min-w-0">
                {/* BLOCO, e não inline. Como `<span>`, o nome dividia a linha
                    com o balão logo abaixo (que é inline-block) e os dois se
                    sobrepunham: o aviso aparecia por cima do nome do réu. */}
                {form.requeridos.length > 0 ? (
                  <span className="block font-medium break-words">
                    {nomesDasChaves(form.requeridos, reusCatalogo).join("  ·  ")}
                  </span>
                ) : (
                  <span className="block text-muted-foreground">Requerido não informado</span>
                )}
                {/* A PROCEDÊNCIA É UM BALÃO QUE SE FECHA, NÃO UMA LINHA FIXA.
                    Ela é útil na primeira vez que se abre o processo e vira
                    ruído da segunda em diante: como linha permanente embaixo do
                    réu, ocupava espaço para sempre dizendo algo que só precisa
                    ser dito uma vez. Fechado, fica lido para aquele processo.

                    Só aparece quando NÃO foi o tribunal que respondeu. Avisar
                    "conferido no tribunal" em 406 fichas seria alarmar sobre o
                    caso normal; quem precisa de atenção é o herdado de contrato,
                    que ninguém conferiu. */}
                <AnimatePresence>
                  {avisoOrigem && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.96 }}
                      transition={{ duration: 0.24, ease: EASE, delay: 0.15 }}
                      className="relative mt-2 block w-fit max-w-[22rem] rounded-lg border border-white/[0.12]
                                 bg-white/[0.05] py-1.5 pl-2.5 pr-7 text-[11px] leading-snug text-muted-foreground"
                    >
                      {/* O bico aponta pro nome do réu, pra ficar claro de onde
                          o aviso está saindo. Mesma cor do balão: alfa igual
                          sobre o mesmo fundo dá a mesma cor composta, então ele
                          não vira um quadradinho de outro tom. */}
                      <span
                        aria-hidden
                        className="absolute -top-[5px] left-4 h-2 w-2 rotate-45 border-l border-t
                                   border-white/[0.12] bg-white/[0.05]"
                      />
                      {fonteDoRequerido(form.requerido_origem)}
                      <button
                        onClick={fecharAvisoOrigem}
                        title="Ok, entendi"
                        aria-label="Fechar aviso"
                        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground/60
                                   hover:bg-white/10 hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[15px]">
              <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium">{localizacao || "Vara e comarca não informadas"}</span>
            </div>
            <div className="flex items-center gap-2 text-[15px] min-w-0">
              <User className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium truncate">
                {clienteSelecionado ? clienteSelecionado.nome : <span className="text-muted-foreground">Cliente não vinculado</span>}
              </span>
              {clienteSelecionado && (
                <Link
                  to={`/clientes/${clienteSelecionado.id}`}
                  title="Abrir perfil do cliente"
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <SquareArrowOutUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {form.parceiro && (
              <div className="flex items-center gap-2 text-[15px] min-w-0">
                <Handshake className="h-4 w-4 text-primary/70 shrink-0" />
                <span className="font-medium truncate">Parceria com {form.parceiro}</span>
              </div>
            )}
          </div>

          {/* Valor da causa e, ao lado, o que o processo ganhou.
              A causa é o que se pediu; o ganho é o que o juízo deu ou o que se
              acertou — e são números diferentes na maioria das vezes. Ficam
              lado a lado porque é justamente a comparação entre os dois que
              alguém quer fazer ao abrir a capa. Processo em andamento não
              mostra ganho nenhum: capa não inventa vitória. */}
          {(() => {
            const g = ganhoDoProcesso(etapas, form.fase_processual);
            return (
              <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor da causa</p>
                  <p className={cn("text-xl font-semibold tabular-nums mt-0.5",
                    g ? "text-foreground/70" : "text-emerald-400")}>
                    {valorNum ? brl(valorNum) : "Não informado"}
                  </p>
                </div>

                {g && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      {g.recebido ? <Landmark className="h-3 w-3 text-emerald-400" />
                                  : <Trophy className="h-3 w-3 text-emerald-400/70" />}
                      {g.recebido ? "Recebido" : "Ganho"}
                    </p>
                    <p className="text-xl font-semibold text-emerald-400 tabular-nums mt-0.5">
                      {brl(g.valor)}
                    </p>
                    <span className={cn(
                      "inline-flex items-center gap-1 mt-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium ring-1",
                      g.via === "acordo"
                        ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                        : "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25")}>
                      {g.via === "acordo" ? <Handshake className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
                      {g.rotulo}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </SpotlightCard>
      </motion.div>

      {/* ── Segundo grau: quando subiu, em qual câmara ou turma está e quem relata.
          Aparece quando o status é de segundo grau ou quando já há algo gravado;
          um processo em contestação não tem o que mostrar aqui. Fica ANTES da
          situação atual de propósito: quem bate o olho na ficha já vê que este
          processo subiu. ── */}
      <AnimatePresence initial={false}>
        {mostrarSegundoGrau && (
          <motion.div key="segundo-grau" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Gavel className="h-3.5 w-3.5 text-primary" />
                    Segundo grau
                  </CardTitle>
                  {/* Os três campos de uma vez, numa janela: é o caminho para
                      preencher retroativo sem clicar caixa por caixa. */}
                  <Button variant="ghost" size="sm" onClick={abrirEdicaoSg} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1. Quando subiu */}
                  <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <ArrowUpFromLine className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider">Subiu em</span>
                    </div>
                    <DataInline
                      valor={form.segundo_grau_data_subida}
                      onSalvar={(v) => patchProcesso({ segundo_grau_data_subida: v })}
                    />
                    {diasSg !== null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {diasSg === 0 ? "subiu hoje" : diasSg === 1 ? "há 1 dia no segundo grau" : `há ${diasSg} dias no segundo grau`}
                      </p>
                    )}
                  </div>

                  {/* 2. Câmara ou turma (obrigatório para acórdão) */}
                  <div className={cn("rounded-xl border bg-white/[0.02] p-3.5",
                    exigeOrgaoJulgador(statusProcValue) && !form.segundo_grau_orgao ? "border-amber-400/40" : "border-border/50")}>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider">Câmara ou turma</span>
                    </div>
                    <CampoInline
                      valor={form.segundo_grau_orgao}
                      placeholder="definir"
                      listaId="orgaos-segundo-grau"
                      sugestoes={ORGAOS_SUGERIDOS}
                      transformar={normalizarOrgao}
                      onSalvar={(v) => patchProcesso({ segundo_grau_orgao: v })}
                    />
                    {!form.segundo_grau_orgao && (
                      <p className="mt-1 text-[11px] text-muted-foreground">obrigatório para entrar em acórdão</p>
                    )}
                  </div>

                  {/* 3. Relator */}
                  <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <UserRound className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider">Relator</span>
                    </div>
                    <CampoInline
                      valor={form.segundo_grau_relator}
                      placeholder="definir"
                      onSalvar={(v) => patchProcesso({ segundo_grau_relator: v })}
                    />
                  </div>
                </div>

                {sugestaoUtil && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-2.5 text-[12.5px]">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-foreground/85">
                      O DJEN cita a <span className="font-semibold">{sugestaoDjen!.orgao}</span>
                      {sugestaoDjen!.data ? <> desde {fmtData(sugestaoDjen!.data)}</> : null}.
                    </span>
                    <button onClick={usarSugestaoDjen}
                            className="ml-auto rounded-lg px-2.5 py-1 text-[12px] font-medium bg-primary/[0.12] text-primary ring-1 ring-primary/20 hover:bg-primary/[0.18] transition-colors">
                      Usar
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Situação atual — infos prioritárias (1 e 2 editáveis) + ícones das tarefas ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
            Situação atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Última movimentação — editável (calendário) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <History className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Última movimentação</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="mt-1.5 text-sm font-semibold tabular-nums text-left hover:text-primary transition-colors">
                    {form.data_ultimo_andamento ? fmtData(form.data_ultimo_andamento) : "definir"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={ymdToDate(form.data_ultimo_andamento)}
                    onSelect={(d) => patchProcesso({ data_ultimo_andamento: d ? dateToYmd(d) : "" })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. Status processual — editável (segue o status da etapa atual) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Status processual</span>
              </div>
              <Select value={statusProcValue} onValueChange={setStatusProc}>
                <SelectTrigger className="mt-1 h-auto border-0 bg-transparent shadow-none px-0 py-0 text-sm font-semibold text-primary focus:ring-0 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-50">
                  <SelectValue placeholder="definir" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {textoDias && (
                <p className="mt-1 text-[11px] text-muted-foreground">{textoDias} neste status</p>
              )}
            </div>

            {/* 3. Tarefas pendentes (ação + monitoramento em aberto) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ListTodo className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Tarefas pendentes</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{nTarefas}</p>
            </div>

            {/* 4. Pendências (documentos/providências em aberto) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Pendências</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{nPendencias}</p>
            </div>
          </div>

          {/* Ícones minimizados de cada tarefa do processo */}
          {allTasks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
              {allTasks.map((t) => {
                const TaskIcon = ICONE_TIPO[t.tipo];
                return (
                  <span
                    key={t.id}
                    title={`${LABEL_TIPO[t.tipo]}: ${t.titulo}`}
                    className={cn(
                      "h-7 w-7 rounded-lg grid place-items-center ring-1 shrink-0",
                      t.desfecho ? "bg-white/[0.02] ring-white/10 opacity-50" : "bg-primary/10 ring-primary/20",
                    )}
                  >
                    <TaskIcon className={cn("h-3.5 w-3.5", t.desfecho ? "text-muted-foreground" : "text-primary")} />
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Câmara ou turma antes do acórdão: o status pedido espera aqui. */}
      <Dialog open={!!pedidoOrgao || sgEditando} onOpenChange={(o) => { if (!o) fecharSg(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {pedidoOrgao ? "Em qual câmara ou turma está o processo?" : "Segundo grau"}
            </DialogTitle>
            <DialogDescription>
              {pedidoOrgao
                ? <>Para marcar <span className="font-medium text-foreground">{pedidoOrgao}</span> é preciso dizer qual órgão vai julgar. Fica salvo na ficha.</>
                : "Quando subiu, em qual câmara ou turma está e quem relata. Pode ser retroativo."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label={pedidoOrgao ? "Câmara ou turma *" : "Câmara ou turma"}>
              <Input
                autoFocus
                value={sgDraft.orgao}
                list="orgaos-segundo-grau-dialogo"
                onChange={(e) => setSgDraft({ ...sgDraft, orgao: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmarOrgao(); }}
                placeholder="2ª TURMA RECURSAL, PRIMEIRA CÂMARA CÍVEL..."
              />
              <datalist id="orgaos-segundo-grau-dialogo">{ORGAOS_SUGERIDOS.map((s) => <option key={s} value={s} />)}</datalist>
              {sugestaoDjen && sugestaoDjen.orgao !== normalizarOrgao(sgDraft.orgao) && (
                <button onClick={() => setSgDraft({ ...sgDraft, orgao: sugestaoDjen.orgao, data: sgDraft.data || sugestaoDjen.data || "" })}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-primary hover:underline">
                  <Sparkles className="h-3 w-3" /> O DJEN cita a {sugestaoDjen.orgao}. Usar
                </button>
              )}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Subiu em">
                <Input type="date" value={sgDraft.data} onChange={(e) => setSgDraft({ ...sgDraft, data: e.target.value })} />
              </Field>
              <Field label="Relator">
                <Input value={sgDraft.relator} onChange={(e) => setSgDraft({ ...sgDraft, relator: e.target.value })} placeholder="opcional" />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={fecharSg}>Cancelar</Button>
            <Button onClick={() => void confirmarOrgao()} disabled={!!pedidoOrgao && !sgDraft.orgao.trim()} className="gap-2">
              <Check className="h-4 w-4" /> {pedidoOrgao ? "Salvar e avançar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movimentações & demandas: a timeline */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.16 }}>
        {etapas.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <ProcessoTimeline
                etapas={etapas} setEtapas={setEtapas} onRegistrarSentenca={registrarSentenca}
                antesDeStatus={interceptarStatus}
                onPedirBaixa={(via) => setBaixa({
                  processoId: id!,
                  clienteId: form.cliente_id || null,
                  numeroProcesso: form.numero_processo || null,
                  clienteNome: clientes.find((c) => c.id === form.cliente_id)?.nome ?? null,
                  via,
                  valorPrevisto: valorPrevistoDoProcesso(etapas, via),
                })}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 py-5 text-muted-foreground">
              <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <History className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Movimentações & demandas</p>
                <p className="text-xs">As informações móveis do processo (andamentos, prazos e demandas) chegam na próxima atualização.</p>
              </div>
              <span className="ml-auto text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded-full px-2 py-1 shrink-0">Em breve</span>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* ── Ficha completa do processo — ver e editar (popzão) ── */}
      <Dialog open={fichaOpen} onOpenChange={(o) => { setFichaOpen(o); if (!o && editing && !isNew) cancelarEdicao(); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha do processo</DialogTitle>
            <DialogDescription>
              {editing ? "Edite os campos e salve as alterações." : "Todos os dados do processo."}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="flex justify-end -mt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          )}

          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nº do Processo *">
                <Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="0000000-00.0000.0.00.0000" className="font-mono" />
              </Field>
              <Field label="Cliente *">
                <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {clienteSelecionado ? clienteSelecionado.nome : "Selecionar cliente..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar cliente..." />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente.</CommandEmpty>
                        <CommandGroup>
                          {clientes.map((c) => (
                            <CommandItem key={c.id} value={c.nome} onSelect={() => { setForm({ ...form, cliente_id: c.id }); setClientePopoverOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", form.cliente_id === c.id ? "opacity-100" : "opacity-0")} />
                              {c.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="Matéria">
                <Input value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="RCC, CESTA, RMC..." />
              </Field>
              {/* O campo aceita nome, e não chave: quem preenche escreve "Banco
                  Bradesco". A lista de sugestões é o catálogo inteiro, então
                  digitar "brad" já oferece as duas Bradesco — que são PJs
                  diferentes e não podem ser escolhidas no chute. */}
              <Field label="Requerido">
                <Input
                  value={reusTexto}
                  list="requeridos-conhecidos"
                  onChange={(e) => {
                    setReusTexto(e.target.value);
                    setForm({ ...form, requeridos: nomesDaLista(e.target.value).map(chaveDeRequerido) });
                  }}
                  placeholder="Banco Bradesco (dois réus? separe por vírgula)"
                />
                <datalist id="requeridos-conhecidos">
                  {Object.values(reusCatalogo).sort().map((n) => <option key={n} value={n} />)}
                </datalist>
                {form.requerido_origem && (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{fonteDoRequerido(form.requerido_origem)}</p>
                )}
              </Field>
              <Field label="Fase Processual">
                <Input value={form.fase_processual} onChange={(e) => setForm({ ...form, fase_processual: e.target.value })} placeholder="AG. SENTENÇA, ARQUIVADO..." />
              </Field>
              <Field label="Data Último Andamento">
                <Input type="date" value={form.data_ultimo_andamento} onChange={(e) => setForm({ ...form, data_ultimo_andamento: e.target.value })} />
              </Field>
              <Field label="Prazo Processual">
                <Input type="date" value={form.prazo_processual} onChange={(e) => setForm({ ...form, prazo_processual: e.target.value })} />
              </Field>
              <Field label="Tipo de Pendência">
                <Input value={form.tipo_pendencia} onChange={(e) => setForm({ ...form, tipo_pendencia: e.target.value })} placeholder="Ex.: contestação, réplica..." />
              </Field>
              <Field label="Status da Tarefa">
                <Select value={form.status_tarefa || "__none__"} onValueChange={(v) => setForm({ ...form, status_tarefa: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    <SelectItem value="EM CONFECÇÃO">EM CONFECÇÃO</SelectItem>
                    <SelectItem value="CONCLUÍDO">CONCLUÍDO</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Vara/Juízo de Origem">
                <Input value={form.vara_juizo_origem} onChange={(e) => setForm({ ...form, vara_juizo_origem: e.target.value })} placeholder="3ª VC" />
              </Field>
              <Field label="Comarca/UF">
                <Input value={form.comarca_uf} onChange={(e) => setForm({ ...form, comarca_uf: e.target.value })} placeholder="MANAUS/AM" />
              </Field>
              <Field label="Valor da Causa (R$)">
                <Input inputMode="decimal" value={form.valor_causa} onChange={(e) => setForm({ ...form, valor_causa: e.target.value })} placeholder="0,00" />
              </Field>
              <Field label="Parceiro">
                <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} placeholder="Nome do parceiro" />
              </Field>
              <Field label="Subiu ao 2º grau em">
                <Input type="date" value={form.segundo_grau_data_subida} onChange={(e) => setForm({ ...form, segundo_grau_data_subida: e.target.value })} />
              </Field>
              <Field label="Câmara ou turma (2º grau)">
                <Input value={form.segundo_grau_orgao} list="orgaos-segundo-grau-ficha" onChange={(e) => setForm({ ...form, segundo_grau_orgao: e.target.value })} placeholder="2ª TURMA RECURSAL" />
                <datalist id="orgaos-segundo-grau-ficha">{ORGAOS_SUGERIDOS.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Relator (2º grau)">
                <Input value={form.segundo_grau_relator} onChange={(e) => setForm({ ...form, segundo_grau_relator: e.target.value })} placeholder="opcional" />
              </Field>
              <Field label="Observações" full>
                <Textarea rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas sobre o processo…" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <Row label="Nº do Processo"><span className="font-mono">{form.numero_processo || "não informado"}</span></Row>
              <Row label="Cliente">{clienteSelecionado?.nome || "não informado"}</Row>
              <Row label="Matéria">{form.materia || "não informado"}</Row>
              {rubricasDaFicha.length > 0 && (
                <Row label="Rubricas">{rubricasDaFicha.join(" · ")}</Row>
              )}
              <Row label="Requerido">
                {form.requeridos.length > 0
                  ? nomesDasChaves(form.requeridos, reusCatalogo).join(" · ")
                  : "não informado"}
              </Row>
              <Row label="Fase Processual">{form.fase_processual || "não informado"}</Row>
              <Row label="Último Andamento">{fmtData(form.data_ultimo_andamento)}</Row>
              <Row label="Prazo Processual">{form.prazo_processual ? fmtData(form.prazo_processual) : "não informado"}</Row>
              <Row label="Tipo de Pendência">{form.tipo_pendencia || "não informado"}</Row>
              <Row label="Status da Tarefa">{form.status_tarefa || "não informado"}</Row>
              <Row label="Vara/Juízo de Origem">{form.vara_juizo_origem || "não informado"}</Row>
              <Row label="Comarca/UF">{form.comarca_uf || "não informado"}</Row>
              <Row label="Valor da Causa">{valorNum ? brl(valorNum) : "não informado"}</Row>
              <Row label="Parceiro">{form.parceiro || "não informado"}</Row>
              <Row label="Subiu ao 2º grau em">{form.segundo_grau_data_subida ? fmtData(form.segundo_grau_data_subida) : "não informado"}</Row>
              <Row label="Câmara ou turma">{form.segundo_grau_orgao || "não informado"}</Row>
              <Row label="Relator">{form.segundo_grau_relator || "não informado"}</Row>
              <Row label="Observações" full>
                <span className="whitespace-pre-wrap font-normal">{form.observacoes || "não informado"}</span>
              </Row>
            </div>
          )}

          {editing && (
            <DialogFooter>
              {!isNew && <Button variant="ghost" onClick={cancelarEdicao} disabled={saving}>Cancelar</Button>}
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── baixa no Tracker ──
          Não fica dentro da timeline de propósito: ela só avisa que alguém
          escolheu um status de baixa; quem conhece o processo, o cliente e o
          valor é esta tela. */}
      <DialogBaixaTracker
        alvo={baixa}
        onFechar={() => setBaixa(null)}
        /* O banco carimbou o status dentro da transação; recarregar lê o que
           ficou gravado em vez de a tela adivinhar. */
        onBaixado={() => { loadProcesso(); }}
      />
    </div>
  );
}
