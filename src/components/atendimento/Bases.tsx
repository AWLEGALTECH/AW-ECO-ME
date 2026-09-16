/* BASES — a aba larga, no topo, ao lado de Atendimento e Programadas.
 *
 * ELA MOROU NA CAIXA, E ERA O LUGAR ERRADO. A caixa é uma coluna de 15rem
 * feita para uma fila de conversas: nome, prévia, hora. Uma base não é isso.
 * São centenas de pessoas com meia dúzia de respostas cada uma, e o trabalho
 * ali é COMPARAR — quem respondeu o quê, quem já falou com a gente, quem
 * ainda não. Comparar em 15rem de largura significa ler uma linha de cada vez,
 * que é o oposto de comparar.
 *
 * Aqui a tela inteira é da base: as colunas escolhidas viram colunas de
 * verdade, lado a lado, e dá para percorrer 708 linhas com o olho em vez de
 * com o dedo.
 *
 * ─────────────────────────── a base vem INTEIRA ──────────────────────────
 *
 * A lista antiga trazia só quem faltava abordar. Como fila estava certa, mas
 * 708 linhas viravam 78 na tela e as outras 630 não existiam em lugar nenhum.
 * Agora vem todo mundo, separado por duas etiquetas que dizem o número ANTES
 * de filtrar: "já escreveram 71" ao lado de "nunca escreveram 637" é a leitura
 * da base num relance, e some assim que o filtro é aplicado.
 *
 * QUEM ESCREVEU CONTA EM QUALQUER NÚMERO. O lead não sabe que o escritório tem
 * dois WhatsApp: ele responde no que estiver à mão. Uma base ligada no OUTBOUND
 * cheia de gente que já conversa no INBOUND foi o que motivou isto existir.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Database, Plus, Search, RefreshCw, ChevronLeft, Loader2, Columns3, Power,
  Phone, Copy, MessageSquarePlus, Trash2, Check, CalendarDays, X, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTodasAsFontes, useBaseCompleta, useResumoBases, type Fonte, type LeadDaBase } from "@/hooks/useLeadsBrutos";
import { saudeDaBase } from "@/lib/bases";
import { dossieExtra } from "@/lib/planilhaLeads";
import { telefoneBonito, horaDaLista } from "@/lib/wa";
import { mesmaInstancia, apelidoDeInstancia } from "@/lib/instancias";
import {
  ATALHOS, periodoDoAtalho, rotuloDoPeriodo, dentroDoPeriodo, type Atalho,
} from "@/lib/periodoDaBase";
import type { Instancia } from "@/lib/atendimentoMock";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

type Filtro = "todos" | "escreveram" | "nunca";

export default function Bases({
  instancias, apelidos, corDe, nomeDe, sincronizando,
  onLigarPlanilha, onPuxar, onColunas, onDesligar, onAbordar, onDescartar, onAbrirConversa,
  onAlternarAviso,
}: {
  instancias: Instancia[];
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  /** id da base que está sendo puxada agora, para o ícone girar */
  sincronizando: string | null;
  onLigarPlanilha: () => void;
  onPuxar: (f: Fonte) => void;
  onColunas: (f: Fonte) => void;
  onDesligar: (f: Fonte) => void;
  /** manda a primeira mensagem (ou só abre a conversa) pelo número escolhido */
  onAbordar: (lead: LeadDaBase, texto: string, porQual: string, enviar: boolean) => Promise<void>;
  onDescartar: (lead: LeadDaBase) => Promise<void>;
  onAbrirConversa: (conversaId: string) => void;
  onAlternarAviso: (f: Fonte, ligado: boolean) => void;
}) {
  const { data: fontes = [] } = useTodasAsFontes();
  const { data: resumos = {} } = useResumoBases(fontes.length > 0);
  const [filtroDeNumero, setFiltroDeNumero] = useState<string | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const visiveis = useMemo(
    () => (filtroDeNumero ? fontes.filter((f) => mesmaInstancia(f.instancia, filtroDeNumero)) : fontes),
    [fontes, filtroDeNumero]);

  const aberta = fontes.find((f) => f.id === abertaId) ?? null;

  if (aberta) {
    return (
      <BaseAberta
        fonte={aberta}
        instancias={instancias}
        apelidos={apelidos}
        corDe={corDe}
        nomeDe={nomeDe}
        puxando={sincronizando === aberta.id}
        onVoltar={() => setAbertaId(null)}
        onPuxar={() => onPuxar(aberta)}
        onColunas={() => onColunas(aberta)}
        onDesligar={() => onDesligar(aberta)}
        onAbordar={onAbordar}
        onDescartar={onDescartar}
        onAbrirConversa={onAbrirConversa}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Bases</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            As planilhas ligadas, de todos os números. Uma base é quem deixou o contato e ainda
            não virou conversa.
          </p>
        </div>
        <Button size="sm" className="h-8 text-[12px] shrink-0" onClick={onLigarPlanilha}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ligar planilha
        </Button>
      </div>

      {/* DE QUAL NÚMERO. Só com mais de um: com um só a pergunta não existe. */}
      {instancias.length > 1 && fontes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => setFiltroDeNumero(null)}
            className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
              filtroDeNumero === null ? "bg-white/[0.09] text-foreground ring-white/[0.14]"
                                      : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
            Todas ({fontes.length})
          </button>
          {instancias.map((i) => {
            const n = fontes.filter((f) => mesmaInstancia(f.instancia, i.nome)).length;
            if (n === 0) return null;
            const cor = corDe(i.nome);
            const ativo = mesmaInstancia(filtroDeNumero, i.nome);
            return (
              <button key={i.id} type="button" onClick={() => setFiltroDeNumero(ativo ? null : i.nome)}
                className={cn("flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                  ativo ? "bg-white/[0.09] text-foreground ring-white/[0.14]"
                        : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
                <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide",
                  ativo ? cn(cor.fundo, cor.texto) : "bg-white/[0.08] text-muted-foreground")}>
                  {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                </span>
                <span className="truncate max-w-[9rem]">{nomeDe(i.nome)}</span>
                <span className="tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="flex-1 grid place-items-center py-16">
          <div className="text-center flex flex-col items-center gap-3">
            <Database className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-[12.5px] font-medium">
              {fontes.length === 0 ? "Nenhuma base ligada ainda." : "Nenhuma base neste número."}
            </p>
            <p className="text-[11.5px] text-muted-foreground max-w-sm leading-relaxed">
              Uma base é uma planilha do Google que enche sozinha: cada linha nova vira um lead
              aqui, de minuto em minuto.
            </p>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onLigarPlanilha}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Ligar planilha
            </Button>
          </div>
        </div>
      ) : (
        <LayoutGroup id="cartoes-de-base">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence initial={false}>
              {visiveis.map((f, i) => (
                <CartaoDaBase
                  key={f.id}
                  fonte={f}
                  resumo={resumos[f.id]}
                  atraso={Math.min(i * 0.04, 0.24)}
                  apelido={apelidos.get(f.instancia) ?? apelidoDeInstancia(f.instancia)}
                  cor={corDe(f.instancia)}
                  nomeDoNumero={nomeDe(f.instancia)}
                  puxando={sincronizando === f.id}
                  onAbrir={() => setAbertaId(f.id)}
                  onPuxar={() => onPuxar(f)}
                  onAlternarAviso={(v) => onAlternarAviso(f, v)}
                />
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}

/* ══════════════════ o cartão de uma base ══════════════════════════════════ */

function CartaoDaBase({ fonte: f, resumo, atraso, apelido, cor, nomeDoNumero, puxando, onAbrir, onPuxar, onAlternarAviso }: {
  fonte: Fonte;
  resumo?: { novos: number; total: number; antigos: number };
  atraso: number;
  apelido: string;
  cor: { fundo: string; texto: string; anel: string };
  nomeDoNumero: string;
  puxando: boolean;
  onAbrir: () => void;
  onPuxar: () => void;
  onAlternarAviso: (v: boolean) => void;
}) {
  const saude = saudeDaBase(f, horaDaLista);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      transition={{ ...MOLA, delay: atraso }}
      className="rounded-xl border border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <button type="button" onClick={onAbrir} className="w-full text-left px-3 py-3">
        <span className="flex items-start gap-2.5">
          <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center ring-1 bg-primary/[0.10] text-primary ring-primary/25">
            <Database className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide shrink-0", cor.fundo, cor.texto)}
                title={nomeDoNumero}>
                {apelido}
              </span>
              {saude && <span title={saude.titulo} className={cn("h-1.5 w-1.5 rounded-full shrink-0", saude.cor)} />}
            </span>
            <span className="block text-[13px] font-medium truncate mt-1" title={f.nome}>{f.nome}</span>
          </span>
        </span>

        {/* OS DOIS NÚMEROS QUE IMPORTAM, e não um só. "78 novos" sozinho
            esconde o tamanho da base; "708 na base" sozinho esconde o
            trabalho que espera. */}
        <span className="flex items-baseline gap-3 mt-2.5">
          <span className="flex items-baseline gap-1">
            <span className={cn("text-[19px] font-semibold tabular-nums leading-none",
              (resumo?.novos ?? 0) > 0 ? "text-primary" : "text-muted-foreground/60")}>
              {resumo?.novos ?? 0}
            </span>
            <span className="text-[10px] text-muted-foreground/70">novos</span>
          </span>
          <span className="text-[10.5px] tabular-nums text-muted-foreground/60">
            {resumo?.total ?? 0} na base
          </span>
        </span>

        {f.ultimo_erro && (
          <span className="block text-[10px] text-amber-200/80 leading-snug mt-2 line-clamp-2">
            {f.ultimo_erro}
          </span>
        )}
      </button>

      {/* ── O AVISO DE LEAD NOVO ──
          Fica no cartão, e não escondido num menu: é um interruptor que muda o
          que a equipe inteira recebe no sino, e quem liga precisa conseguir ver
          depois que ligou. */}
      <div className="px-3 pb-2 pt-0.5">
        <label className="flex items-center gap-2 cursor-pointer group/aviso">
          <Switch
            checked={f.notificar}
            onCheckedChange={(v) => onAlternarAviso(v)}
            aria-label="Avisar no sino quando chegar lead novo"
          />
          <span className="min-w-0 flex-1">
            <span className={cn("flex items-center gap-1 text-[11px] transition-colors",
              f.notificar ? "text-foreground" : "text-muted-foreground group-hover/aviso:text-foreground")}>
              <Bell className="h-3 w-3 shrink-0" /> Avisar no sino
            </span>
            <span className="block text-[9.5px] text-muted-foreground/60 leading-snug">
              {f.notificar
                ? "A equipe recebe o nome de quem se cadastrar aqui."
                : "Ninguém é avisado quando chega lead nesta base."}
            </span>
          </span>
        </label>
      </div>

      <div className="px-3 pb-2.5 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2">
        <span className="text-[9.5px] text-muted-foreground/50 truncate">
          {f.ultimo_sync ? `lida ${horaDaLista(f.ultimo_sync)}` : "nunca lida"}
        </span>
        <button type="button" onClick={onPuxar} disabled={puxando} title="Ler a planilha agora"
          className="h-6 w-6 shrink-0 grid place-items-center rounded-md text-muted-foreground/60
                     hover:text-foreground hover:bg-white/[0.06] transition-colors">
          <RefreshCw className={cn("h-3.5 w-3.5", puxando && "animate-spin")} />
        </button>
      </div>
    </motion.div>
  );
}

/* ══════════════════ a base aberta, na largura toda ════════════════════════ */

function BaseAberta({
  fonte: f, instancias, apelidos, corDe, nomeDe, puxando,
  onVoltar, onPuxar, onColunas, onDesligar, onAbordar, onDescartar, onAbrirConversa,
}: {
  fonte: Fonte;
  instancias: Instancia[];
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  puxando: boolean;
  onVoltar: () => void;
  onPuxar: () => void;
  onColunas: () => void;
  onDesligar: () => void;
  onAbordar: (lead: LeadDaBase, texto: string, porQual: string, enviar: boolean) => Promise<void>;
  onDescartar: (lead: LeadDaBase) => Promise<void>;
  onAbrirConversa: (conversaId: string) => void;
}) {
  const { data: leads = [], isLoading } = useBaseCompleta(f.id);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<LeadDaBase | null>(null);
  const [atalho, setAtalho] = useState<Atalho>("tudo");
  const [escolhido, setEscolhido] = useState<DateRange | undefined>();
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  const periodo = useMemo(() => periodoDoAtalho(atalho, escolhido), [atalho, escolhido]);

  /* O PERÍODO RECORTA ANTES DE TUDO. Os contadores das etiquetas contam DENTRO
     do recorte, senão eles diriam 708 enquanto a tabela mostra 22, e o número
     do botão passaria a mentir justamente sobre o que ele filtra. */
  const noPeriodo = useMemo(
    () => leads.filter((l) => dentroDoPeriodo(l.chegou_em, periodo)),
    [leads, periodo]);

  const contagem = useMemo(() => ({
    total: noPeriodo.length,
    escreveram: noPeriodo.filter((l) => l.escreveu).length,
    nunca: noPeriodo.filter((l) => !l.escreveu).length,
  }), [noPeriodo]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return noPeriodo
      .filter((l) => filtro === "todos" || (filtro === "escreveram" ? l.escreveu : !l.escreveu))
      .filter((l) => !t || (l.nome ?? "").toLowerCase().includes(t) || l.telefone.includes(t));
  }, [noPeriodo, filtro, busca]);

  /* QUANTOS CHEGARAM EM CADA DIA, dentro do recorte. É a resposta da pergunta
     que motiva o filtro de data existir ("a landing rendeu mais ontem ou
     hoje?"), e ela cabe numa linha de barrinhas. Só aparece com mais de um dia
     à vista: um dia só não tem com o que comparar. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of noPeriodo) {
      if (!l.chegou_em) continue;
      const d = format(new Date(l.chegou_em), "dd/MM");
      mapa.set(d, (mapa.get(d) ?? 0) + 1);
    }
    return [...mapa.entries()].reverse();
  }, [noPeriodo]);

  /* AS COLUNAS SÃO AS QUE A PESSOA ESCOLHEU NA BASE, e viram colunas de
     verdade: é o ganho inteiro de sair da coluna estreita. Sem escolha, mostra
     as primeiras que a planilha trouxer, porque uma tabela de uma coluna só não
     é tabela. */
  const colunas = useMemo(() => {
    if (f.colunas_exibidas && f.colunas_exibidas.length > 0) return f.colunas_exibidas.slice(0, 4);
    const primeiro = leads.find((l) => l.bruto && Object.keys(l.bruto).length > 0);
    return dossieExtra(primeiro?.bruto ?? null, null).slice(0, 3).map((c) => c.rotulo);
  }, [f.colunas_exibidas, leads]);

  const valorDaColuna = (l: LeadDaBase, coluna: string): string => {
    const achado = dossieExtra(l.bruto, [coluna])[0];
    return achado?.valor ?? "";
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      {/* ── cabeçalho ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onVoltar}
          className="h-7 w-7 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide",
              corDe(f.instancia).fundo, corDe(f.instancia).texto)}>
              {apelidos.get(f.instancia) ?? apelidoDeInstancia(f.instancia)}
            </span>
            <span className="text-[10px] text-muted-foreground/60 truncate">{nomeDe(f.instancia)}</span>
          </span>
          <span className="block text-[14px] font-medium truncate">{f.nome}</span>
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onPuxar} disabled={puxando}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", puxando && "animate-spin")} /> Ler agora
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onColunas}>
            <Columns3 className="h-3.5 w-3.5 mr-1.5" /> Colunas
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-rose-400"
            onClick={onDesligar}>
            <Power className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {f.ultimo_erro && (
        <div className="rounded-lg bg-amber-400/10 ring-1 ring-amber-400/25 px-3 py-2">
          <p className="text-[11px] text-amber-200/90 leading-snug break-words">{f.ultimo_erro}</p>
        </div>
      )}

      {/* ── O PERÍODO ──
          Atalhos primeiro, calendário para a exceção: quase toda pergunta é
          "hoje", "ontem" ou "a semana", e abrir um calendário para responder
          "hoje" seria três cliques para uma palavra. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        {ATALHOS.map((a) => (
          <button key={a.chave} type="button"
            onClick={() => { setAtalho(a.chave); setEscolhido(undefined); }}
            className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
              atalho === a.chave ? "bg-white/[0.09] text-foreground ring-white/[0.14]"
                                 : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
            {a.rotulo}
          </button>
        ))}

        <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
          <PopoverTrigger asChild>
            <button type="button"
              className={cn("flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                atalho === "escolhido" ? "bg-primary/[0.14] text-primary ring-primary/30"
                                       : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
              <CalendarDays className="h-3 w-3" />
              {atalho === "escolhido" ? rotuloDoPeriodo(atalho, escolhido) : "Escolher"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            {/* DUAS PONTAS: clica no começo, clica no fim. Um calendário de
                data única obrigaria dois campos e a pessoa a entender qual é
                qual. */}
            <Calendar
              mode="range"
              locale={ptBR}
              numberOfMonths={2}
              selected={escolhido}
              onSelect={(r) => {
                setEscolhido(r);
                setAtalho(r?.from ? "escolhido" : "tudo");
                /* Fecha só quando as duas pontas estão escolhidas: fechar na
                   primeira obrigaria a reabrir para dizer o fim. */
                if (r?.from && r?.to) setCalendarioAberto(false);
              }}
              initialFocus
            />
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-2">
              <span className="text-[10.5px] text-muted-foreground">
                {escolhido?.from ? rotuloDoPeriodo("escolhido", escolhido) : "Clique no primeiro e no último dia"}
              </span>
              {escolhido?.from && (
                <button type="button"
                  onClick={() => { setEscolhido(undefined); setAtalho("tudo"); setCalendarioAberto(false); }}
                  className="flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3 w-3" /> limpar
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {periodo && (
          <span className="text-[10px] text-muted-foreground/60 ml-1">
            {noPeriodo.length} de {leads.length}
          </span>
        )}
      </div>

      {/* ── QUANTOS CHEGARAM EM CADA DIA ──
          É a resposta da pergunta que motiva o filtro de data existir. Só
          aparece com mais de um dia à vista: um dia só não tem com o que
          comparar, e a linha viraria uma barra solta sem sentido. */}
      <AnimatePresence initial={false}>
        {porDia.length > 1 && porDia.length <= 45 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={MOLA}
            className="overflow-hidden">
            <div className="flex items-end gap-[3px] h-12 px-0.5">
              {porDia.map(([dia, n]) => {
                const maior = Math.max(...porDia.map(([, x]) => x));
                return (
                  <span key={dia} title={`${dia}: ${n} lead${n === 1 ? "" : "s"}`}
                    className="flex-1 min-w-[3px] flex flex-col items-center justify-end gap-1 group">
                    <span className="text-[8.5px] tabular-nums text-muted-foreground/0 group-hover:text-muted-foreground/80 transition-colors">
                      {n}
                    </span>
                    <span className="w-full rounded-t bg-primary/25 group-hover:bg-primary/50 transition-colors"
                      style={{ height: `${Math.max(3, (n / maior) * 32)}px` }} />
                  </span>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground/50 px-0.5 mt-0.5">
              <span>{porDia[0]?.[0]}</span>
              <span>{porDia[porDia.length - 1]?.[0]}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── as duas etiquetas, com o número antes de filtrar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {([
            ["todos", "Todos", contagem.total],
            ["escreveram", "Já escreveram", contagem.escreveram],
            ["nunca", "Nunca escreveram", contagem.nunca],
          ] as const).map(([k, rot, n]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={cn("rounded-full px-2.5 py-1 text-[11px] ring-1 transition-colors flex items-center gap-1.5",
                filtro === k
                  ? k === "escreveram" ? "bg-emerald-400/[0.14] text-emerald-300 ring-emerald-400/30"
                  : k === "nunca" ? "bg-primary/[0.14] text-primary ring-primary/30"
                  : "bg-white/[0.09] text-foreground ring-white/[0.14]"
                  : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
              {rot}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60 ml-1" />}
        </div>
        <span className="flex-1" />
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="nome ou telefone"
            className="h-8 pl-7 text-[12px] bg-transparent border-white/[0.08]" />
        </div>
      </div>

      {/* ── a tabela ── */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin rounded-xl border border-white/[0.07]">
        {isLoading && leads.length === 0 ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
          </div>
        ) : lista.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/70 text-center py-16">
            {busca.trim() ? "Ninguém com esse nome aqui."
              : filtro === "escreveram" ? "Ninguém desta base escreveu ainda."
              : filtro === "nunca" ? "Todo mundo desta base já escreveu."
              : "Esta base está vazia."}
          </p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-[#101216]">
              <tr className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
                <th className="font-normal px-3 py-2">Quem</th>
                {colunas.map((c) => (
                  <th key={c} className="font-normal px-3 py-2 hidden lg:table-cell">{c}</th>
                ))}
                <th className="font-normal px-3 py-2 text-right whitespace-nowrap">Chegou</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l, i) => (
                <motion.tr
                  key={l.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, ease: CURVA, delay: Math.min(i * 0.004, 0.2) }}
                  onClick={() => setAberto(l)}
                  className="border-t border-white/[0.05] hover:bg-white/[0.04] cursor-pointer transition-colors">
                  <td className="px-3 py-2 min-w-[12rem]">
                    <span className="block text-[12px] font-medium truncate">
                      {l.nome?.trim() || telefoneBonito(l.telefone)}
                    </span>
                    <span className="flex items-center gap-1 mt-0.5">
                      {l.escreveu ? (
                        <span className="rounded px-1.5 py-[1px] text-[9px] bg-emerald-400/10 text-emerald-300/90 ring-1 ring-emerald-400/25">
                          já escreveu
                        </span>
                      ) : (
                        <span className="rounded px-1.5 py-[1px] text-[9px] bg-primary/10 text-primary/90 ring-1 ring-primary/20">
                          nunca escreveu
                        </span>
                      )}
                      {/* EM QUAL NÚMERO, quando não é o da base. É a informação
                          que mais muda o gesto seguinte: responder por um
                          número novo a quem já fala em outro parte a conversa
                          em duas. */}
                      {l.conversa_instancia && !mesmaInstancia(l.conversa_instancia, f.instancia) && (
                        <span className="rounded px-1.5 py-[1px] text-[9px] bg-white/[0.06] text-muted-foreground ring-1 ring-white/[0.10]">
                          {apelidos.get(l.conversa_instancia) ?? apelidoDeInstancia(l.conversa_instancia)}
                        </span>
                      )}
                    </span>
                  </td>
                  {colunas.map((c) => (
                    <td key={c} className="px-3 py-2 text-[11px] text-muted-foreground hidden lg:table-cell max-w-[14rem]">
                      <span className="block truncate" title={valorDaColuna(l, c)}>{valorDaColuna(l, c)}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-[10px] text-muted-foreground/60 text-right whitespace-nowrap">
                    {l.chegou_em ? horaDaLista(l.chegou_em) : ""}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {aberto && (
          <FichaDoLeadNaBase
            lead={aberto}
            colunas={f.colunas_exibidas}
            instancias={instancias}
            instanciaDaBase={f.instancia}
            apelidos={apelidos}
            corDe={corDe}
            nomeDe={nomeDe}
            onFechar={() => setAberto(null)}
            onAbordar={onAbordar}
            onDescartar={onDescartar}
            onAbrirConversa={onAbrirConversa}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════ a ficha, em painel lateral ════════════════════════════ */

/**
 * PAINEL LATERAL, e não um balão preso à linha.
 *
 * Na coluna estreita a ficha nascia ao lado da linha clicada, porque não havia
 * outro lugar. Na tela larga isso passa a atrapalhar: o balão cobre justamente
 * as colunas que se estava comparando. O painel entra pela direita, a tabela
 * continua inteira, e quem trabalha a base em sequência fecha um e abre o
 * seguinte sem perder o lugar.
 */
function FichaDoLeadNaBase({
  lead, colunas, instancias, instanciaDaBase, apelidos, corDe, nomeDe,
  onFechar, onAbordar, onDescartar, onAbrirConversa,
}: {
  lead: LeadDaBase;
  colunas: string[] | null;
  instancias: Instancia[];
  instanciaDaBase: string;
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  onFechar: () => void;
  onAbordar: (lead: LeadDaBase, texto: string, porQual: string, enviar: boolean) => Promise<void>;
  onDescartar: (lead: LeadDaBase) => Promise<void>;
  onAbrirConversa: (conversaId: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  /* O NÚMERO JÁ VEM ESCOLHIDO, no lugar certo: se o lead já fala com a gente
     em algum número, é por lá que se continua. */
  const [porQual, setPorQual] = useState(lead.conversa_instancia || instanciaDaBase);

  const nome = lead.nome?.trim() || telefoneBonito(lead.telefone);
  const extras = dossieExtra(lead.bruto, colunas);

  const fazer = async (enviar: boolean) => {
    setOcupado(true);
    try { await onAbordar(lead, texto.trim(), porQual, enviar); onFechar(); }
    finally { setOcupado(false); }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-black/40" />
      <motion.aside
        initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
        transition={MOLA}
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[26rem] bg-[#101216] border-l border-white/[0.08]
                   flex flex-col shadow-[0_0_48px_rgba(0,0,0,0.6)]">
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.07]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate" title={nome}>{nome}</p>
              <button type="button"
                onClick={() => navigator.clipboard.writeText(telefoneBonito(lead.telefone)).catch(() => {})}
                className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-3 w-3" /> {telefoneBonito(lead.telefone)}
                <Copy className="h-2.5 w-2.5 opacity-60" />
              </button>
            </div>
            <button type="button" onClick={onFechar}
              className="h-7 w-7 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>

          {lead.escreveu && lead.conversa_achada && (
            <button type="button" onClick={() => { onAbrirConversa(lead.conversa_achada!); onFechar(); }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5
                         bg-emerald-400/[0.10] text-emerald-300 ring-1 ring-emerald-400/25
                         hover:bg-emerald-400/[0.18] transition-colors text-[11.5px]">
              Já conversa com a gente{lead.conversa_instancia ? ` em ${nomeDe(lead.conversa_instancia)}` : ""}. Abrir
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 flex flex-col gap-3">
          {(lead.respostas || extras.length > 0) && (
            <div className="rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] px-3 py-2">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1.5">
                O que respondeu na landing
              </p>
              {lead.respostas && (
                <p className="text-[11.5px] leading-snug whitespace-pre-wrap break-words">{lead.respostas}</p>
              )}
              {extras.length > 0 && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
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
            </div>
          )}

          {/* ── POR QUAL NÚMERO ── */}
          {instancias.length > 1 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-1.5">
                Mandar por qual número
              </p>
              <div className="grid gap-1">
                {instancias.map((i) => {
                  const cor = corDe(i.nome);
                  const eu = mesmaInstancia(i.nome, porQual);
                  const jaFala = lead.conversa_instancia && mesmaInstancia(i.nome, lead.conversa_instancia);
                  return (
                    <button key={i.id} type="button" onClick={() => setPorQual(i.nome)}
                      className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ring-1 transition-colors",
                        eu ? "ring-primary/35 bg-primary/[0.08]" : "ring-transparent hover:bg-white/[0.05]")}>
                      <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide shrink-0",
                        eu ? cn(cor.fundo, cor.texto) : "bg-white/[0.08] text-muted-foreground")}>
                        {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                      </span>
                      <span className="text-[11.5px] truncate min-w-0 flex-1">{nomeDe(i.nome)}</span>
                      {jaFala && (
                        <span className="text-[9.5px] text-emerald-300/90 shrink-0 whitespace-nowrap">já fala aqui</span>
                      )}
                      {eu && <Check className="h-3 w-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Primeira mensagem</p>
            <Textarea
              value={texto} onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder="Olá! Vi que você deixou seu contato…"
              className="text-[12px] bg-transparent border-white/[0.08] resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/[0.07] flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={ocupado}
            className="h-8 text-[11.5px] text-muted-foreground hover:text-rose-400"
            onClick={async () => { setOcupado(true); try { await onDescartar(lead); onFechar(); } finally { setOcupado(false); } }}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Descartar
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="h-8 text-[11.5px]" disabled={ocupado}
            onClick={() => fazer(false)}>
            Só abrir
          </Button>
          <Button size="sm" className="h-8 text-[11.5px]" disabled={ocupado || !texto.trim()}
            onClick={() => fazer(true)}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" /> Mandar mensagem</>}
          </Button>
        </div>
      </motion.aside>
    </>
  );
}
