/* AUTOMAÇÕES — a aba onde o fluxo se vê.
 *
 * O pedido foi "um n8n só de aparência": uma tela onde dê para ver, editar e
 * montar o que acontece sozinho, sem precisar abrir o banco para descobrir.
 *
 * ───────────────────────── por que uma coluna, e não um grafo ───────────────
 *
 * Ferramenta de fluxo costuma dar uma tela infinita e caixinhas que se arrastam
 * e se ligam por fios. Aqui o fluxo é uma FILA: gatilho em cima, passos
 * embaixo, um embaixo do outro. Não é preguiça de desenhar o grafo: é o formato
 * do trabalho. "Chegou lead novo, manda a mensagem, espera dois dias, se não
 * respondeu manda de novo" é uma linha reta, e uma tela que permite arrastar
 * pede arrastar — e aí a pessoa passa a arrumar o desenho em vez de escrever a
 * regra. O ramo que existe de verdade (quem respondeu sai) é um PASSO, não uma
 * bifurcação.
 *
 * O preço disso é não dar para fazer fluxo em árvore. O ganho é que o fluxo
 * inteiro se lê de cima para baixo, no celular, sem nenhum gesto.
 *
 * ────────────────────────────── as três telas ───────────────────────────────
 *
 *   LISTA      todos os fluxos do número, com o interruptor e o que já rodou
 *   FLUXO      o canvas: gatilho, passos, e o inspetor do que está selecionado
 *   EXECUÇÕES  quem passou por aqui, quando, e no que deu
 *
 * ──────────────────────── ligar é o gesto perigoso ──────────────────────────
 *
 * Salvar não manda mensagem nenhuma. LIGAR manda. Por isso o interruptor abre
 * um aviso que diz, em número, o que vai acontecer: quantas mensagens o fluxo
 * manda por pessoa, em quanto tempo, e quantas pessoas por dia no máximo. Um
 * "tem certeza?" sem números não informa nada.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Plus, Power, Trash2, Copy, Send, Timer, Split, Milestone, ListTodo,
  Database, MessageSquareText, Hourglass, BadgeCheck, ChevronLeft, Save,
  Workflow, History, Check, Loader2, X, Zap, Layers, RefreshCw, Play,
  GitFork, Braces,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  GATILHOS_DEF, PASSOS_DEF, defDoGatilho, defDoPasso, passoNovo, novoIdDePasso,
  impedimentos, podeLigar, esperaBonita, resumoDoPasso, fraseDoGatilho,
  etapasOferecidas, resumoDoFluxo, CONDICOES_PADRAO, MAX_PASSOS, ROTULO_STATUS,
  CONDICOES_DEF, OPERADORES, ROTULO_OPERADOR, CONDICAO_PADRAO, VARIAVEIS_FIXAS,
  TIPOS_DENTRO_DE_RAMO, fraseDaCondicao, operadorPrecisaDeValor,
  type Automacao, type Gatilho, type GatilhoDef, type Passo, type TipoDePasso,
  type ConfigDoGatilho, type Condicoes, type Condicao, type TipoDeCondicao,
  type Operador, type ColunaDaBase,
} from "@/lib/automacoes";
import {
  todosOsPassos, encontrarPasso, rotuloDaPosicao,
  atualizarPasso as atualizarNaArvore, removerPasso as removerDaArvore,
  inserirPasso as inserirNaArvore,
  type Ramo,
} from "@/lib/fluxoDePassos";
import {
  useAutomacoes, useResumoAutomacoes, useExecucoes, useColunasDasBases,
  criarAutomacao, salvarAutomacao, alternarAutomacao, apagarAutomacao, duplicarAutomacao,
  testarAutomacao,
  type Rascunho,
} from "@/hooks/useAutomacoes";
import {
  useTodasAsFontes, useResumoBases, useInvalidarLeads, criarFonte, testarPlanilha, type Fonte,
} from "@/hooks/useLeadsBrutos";
import { idDaPlanilha } from "@/lib/planilhaLeads";
import { saudeDaBase } from "@/lib/bases";
import { GuiaDaPlanilha } from "@/components/GuiaDaPlanilha";
import {
  diagnosticarPlanilha, linhasLidas,
  type DiagnosticoDaPlanilha, type RespostaDaLeitura,
} from "@/lib/diagnosticoPlanilha";
import { horaDaLista } from "@/lib/wa";
import { mesmaInstancia, apelidoDeInstancia } from "@/lib/instancias";
import type { Instancia } from "@/lib/atendimentoMock";

/* A MOLA É A MESMA EM TUDO QUE MUDA DE TAMANHO. Com duração fixa, o cartão
   chega ao fim e para seco; o que tem peso desacelera. */
const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

const ICONE_DO_GATILHO: Record<string, React.ComponentType<{ className?: string }>> = {
  Database, Milestone, MessageSquareText, Hourglass, BadgeCheck,
};
const ICONE_DO_PASSO: Record<string, React.ComponentType<{ className?: string }>> = {
  Send, Timer, Split, GitFork, Milestone, ListTodo,
};

const TOM: Record<string, string> = {
  primary: "bg-primary/[0.12] text-primary ring-primary/25",
  amber:   "bg-amber-400/[0.12] text-amber-400 ring-amber-400/25",
  sky:     "bg-sky-400/[0.12] text-sky-400 ring-sky-400/25",
  violet:  "bg-violet-400/[0.12] text-violet-400 ring-violet-400/25",
  emerald: "bg-emerald-400/[0.12] text-emerald-400 ring-emerald-400/25",
  zinc:    "bg-white/[0.06] text-muted-foreground ring-white/[0.10]",
};

/* ══════════════════ a aba inteira ═════════════════════════════════════════ */

export default function Automacoes({
  instancias, instanciaPadrao, apelidos, corDe, nomeDe, userId, aoVivo, fonteInicial,
}: {
  /** todos os números do escritório: um fluxo pode viver em qualquer um deles */
  instancias: Instancia[];
  /** o número aberto na aba, que é o palpite inicial de um fluxo novo */
  instanciaPadrao: string;
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  userId?: string | null;
  aoVivo: boolean;
  /** quando a aba é aberta pelo botão de uma base, o fluxo novo já nasce nela */
  fonteInicial?: string | null;
}) {
  const { data: automacoes = [], refetch } = useAutomacoes();
  const { data: resumo = {} } = useResumoAutomacoes(aoVivo);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  /* Filtro da lista, não do fluxo. Nulo é "todos", que é o padrão: a lista
     existe justamente para ninguém perder de vista um fluxo ligado em outro
     número. */
  const [filtro, setFiltro] = useState<string | null>(null);

  /* As bases de TODOS os números: a lista mostra fluxos de qualquer número, e
     buscar só as do número aberto faria o cartão de um fluxo vizinho escrever
     "outra base" no lugar do nome que ele tem. */
  const { data: todasAsFontes = [] } = useTodasAsFontes();
  const nomeDaBase = useMemo(() => {
    const m = new Map(todasAsFontes.map((f) => [f.id, f.nome]));
    return (id: string) => m.get(id) ?? "base desligada";
  }, [todasAsFontes]);

  /* Abrir a aba pelo botão de uma base já começa um fluxo daquela base: quem
     clicou ali não quer a lista, quer automatizar aquela planilha. */
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (jaAbriu.current || !fonteInicial) return;
    jaAbriu.current = true;
    setCriando(true);
  }, [fonteInicial]);

  const aberta = automacoes.find((a) => a.id === abertaId) ?? null;

  if (criando || aberta) {
    return (
      <Editor
        instancias={instancias}
        instanciaPadrao={instanciaPadrao}
        apelidos={apelidos}
        corDe={corDe}
        nomeDe={nomeDe}
        userId={userId}
        aoVivo={aoVivo}
        automacao={aberta}
        fonteInicial={criando ? fonteInicial ?? null : null}
        onVoltar={() => { setCriando(false); setAbertaId(null); refetch(); }}
        onCriada={(id) => { setCriando(false); setAbertaId(id); refetch(); }}
      />
    );
  }

  const visiveis = filtro ? automacoes.filter((a) => mesmaInstancia(a.instancia, filtro)) : automacoes;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <div className="px-3 py-3 flex items-center justify-between gap-2 border-b border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Automações</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            O que acontece sozinho quando um lead chega ou se mexe.
          </p>
        </div>
        <Button size="sm" className="h-8 text-[12px] shrink-0" onClick={() => setCriando(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova automação
        </Button>
      </div>

      {/* ── DE QUAL NÚMERO ──
          Só aparece com mais de um número. Com um só, a pergunta não existe e a
          barra seria enfeite ocupando altura. */}
      {instancias.length > 1 && automacoes.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap border-b border-white/[0.06]">
          <button type="button" onClick={() => setFiltro(null)}
            className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
              filtro === null ? "bg-white/[0.09] text-foreground ring-white/[0.14]"
                              : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
            Todos ({automacoes.length})
          </button>
          {instancias.map((i) => {
            const n = automacoes.filter((a) => mesmaInstancia(a.instancia, i.nome)).length;
            const cor = corDe(i.nome);
            const ativo = mesmaInstancia(filtro, i.nome);
            return (
              <button key={i.id} type="button" onClick={() => setFiltro(ativo ? null : i.nome)}
                title={nomeDe(i.nome)}
                className={cn("flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                  ativo ? "bg-white/[0.09] text-foreground ring-white/[0.14]"
                        : "bg-white/[0.03] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.06]")}>
                <span className={cn("rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide",
                  ativo ? cn(cor.fundo, cor.texto) : "bg-white/[0.08] text-muted-foreground")}>
                  {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                </span>
                <span className="truncate max-w-[8rem]">{nomeDe(i.nome)}</span>
                <span className="tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {visiveis.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: CURVA }}
          className="px-4 py-12 text-center flex flex-col items-center gap-3">
          <span className="h-11 w-11 rounded-xl grid place-items-center bg-primary/[0.10] text-primary ring-1 ring-primary/20">
            <Workflow className="h-5 w-5" />
          </span>
          <div className="max-w-sm">
            <p className="text-[13px] font-medium">
              {filtro ? `Nenhuma automação em ${nomeDe(filtro)}` : "Nenhuma automação ainda"}
            </p>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
              Um exemplo: toda vez que a base de leads empresariais receber uma linha nova,
              a pessoa recebe a primeira mensagem sozinha, dentro do horário de atendimento.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => setCriando(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Criar {filtro ? "uma aqui" : "a primeira"}
          </Button>
        </motion.div>
      ) : (
        <div className="p-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visiveis.map((a, i) => (
              <CartaoDeFluxo
                key={a.id}
                automacao={a}
                ordem={i}
                resumo={resumo[a.id]}
                nomeDaBase={nomeDaBase}
                apelido={apelidos.get(a.instancia) ?? apelidoDeInstancia(a.instancia)}
                cor={corDe(a.instancia)}
                nomeDoNumero={nomeDe(a.instancia)}
                mostrarNumero={instancias.length > 1}
                onAbrir={() => setAbertaId(a.id)}
                onRecarregar={refetch}
                userId={userId}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ o cartão na lista ═════════════════════════════════════ */

function CartaoDeFluxo({
  automacao: a, ordem, resumo, nomeDaBase, apelido, cor, nomeDoNumero, mostrarNumero,
  onAbrir, onRecarregar, userId,
}: {
  automacao: Automacao;
  ordem: number;
  resumo?: { total: number; hoje: number; falhas: number; ultima: string | null };
  nomeDaBase: (id: string) => string;
  apelido: string;
  cor: { fundo: string; texto: string; anel: string };
  nomeDoNumero: string;
  /** com um número só, dizer de quem é o fluxo é ruído: não há outro de quem ser */
  mostrarNumero: boolean;
  onAbrir: () => void;
  onRecarregar: () => void;
  userId?: string | null;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const def = defDoGatilho(a.gatilho);
  const Ico = ICONE_DO_GATILHO[def.icone] ?? Zap;
  const r = resumoDoFluxo(a.passos);
  const travas = impedimentos(a);

  const ligar = async () => {
    setOcupado(true);
    try {
      await alternarAutomacao(a.id, !a.ativa);
      toast.success(a.ativa ? "Automação desligada." : "Automação ligada.");
      onRecarregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
      setConfirmar(false);
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ ...MOLA, delay: Math.min(ordem * 0.05, 0.3) }}
        className={cn(
          "rounded-xl border bg-white/[0.02] overflow-hidden transition-colors",
          a.ativa ? "border-primary/25" : "border-white/[0.08]")}>
        <button type="button" onClick={onAbrir} className="w-full text-left px-3 pt-3 pb-2">
          <div className="flex items-start gap-2">
            <span className={cn("h-7 w-7 shrink-0 rounded-lg grid place-items-center ring-1", TOM[def.chave === "lead_novo_na_base" ? "primary" : "zinc"])}>
              <Ico className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <p className="text-[12.5px] font-medium truncate">{a.nome}</p>
                {mostrarNumero && (
                  <span title={`Roda no número ${nomeDoNumero}`}
                    className={cn("shrink-0 rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide", cor.fundo, cor.texto)}>
                    {apelido}
                  </span>
                )}
              </span>
              <p className="text-[10.5px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
                {fraseDoGatilho(a.gatilho, a.gatilho_config, nomeDaBase)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <Etiqueta>{r.mensagens} mensagem{r.mensagens === 1 ? "" : "s"}</Etiqueta>
            {r.duracaoMin > 0 && <Etiqueta>{esperaBonita(r.duracaoMin)} de fluxo</Etiqueta>}
            {(resumo?.total ?? 0) > 0 && (
              <Etiqueta tom="primary">{resumo!.total} passaram</Etiqueta>
            )}
            {(resumo?.falhas ?? 0) > 0 && (
              <Etiqueta tom="rose">{resumo!.falhas} falharam</Etiqueta>
            )}
          </div>
        </button>

        <div className="px-3 py-2 border-t border-white/[0.06] flex items-center justify-between gap-2 bg-white/[0.01]">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              checked={a.ativa}
              disabled={ocupado || (!a.ativa && travas.length > 0)}
              onCheckedChange={() => (a.ativa ? ligar() : setConfirmar(true))}
              aria-label={a.ativa ? "Desligar automação" : "Ligar automação"}
            />
            <span className={cn("text-[11px] truncate", a.ativa ? "text-primary" : "text-muted-foreground")}>
              {ocupado ? "salvando" : a.ativa ? "ligada" : travas.length > 0 ? "falta preencher" : "desligada"}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <BotaoIcone titulo="Duplicar" onClick={async () => {
              try { await duplicarAutomacao(a, userId); toast.success("Fluxo duplicado."); onRecarregar(); }
              catch (e) { toast.error((e as Error).message); }
            }}><Copy className="h-3.5 w-3.5" /></BotaoIcone>
            <BotaoIcone titulo="Apagar" perigo onClick={async () => {
              try { await apagarAutomacao(a.id); toast.success("Fluxo apagado."); onRecarregar(); }
              catch (e) { toast.error((e as Error).message); }
            }}><Trash2 className="h-3.5 w-3.5" /></BotaoIcone>
          </div>
        </div>
      </motion.div>

      <ConfirmarLigar
        aberto={confirmar}
        onOpenChange={setConfirmar}
        automacao={a}
        nomeDaBase={nomeDaBase}
        ocupado={ocupado}
        onConfirmar={ligar}
      />
    </>
  );
}

function Etiqueta({ children, tom = "zinc" }: { children: React.ReactNode; tom?: "zinc" | "primary" | "rose" }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-[1px] text-[10px] ring-1 whitespace-nowrap tabular-nums",
      tom === "primary" ? "bg-primary/[0.12] text-primary ring-primary/25"
        : tom === "rose" ? "bg-rose-400/[0.12] text-rose-400 ring-rose-400/25"
        : "bg-white/[0.04] text-muted-foreground ring-white/[0.08]")}>
      {children}
    </span>
  );
}

function BotaoIcone({ children, titulo, onClick, perigo }: {
  children: React.ReactNode; titulo: string; onClick: () => void; perigo?: boolean;
}) {
  return (
    <button type="button" title={titulo} onClick={onClick}
      className={cn("h-7 w-7 grid place-items-center rounded-md transition-colors",
        perigo ? "text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10"
               : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]")}>
      {children}
    </button>
  );
}

/* ══════════════════ o aviso de ligar ══════════════════════════════════════ */

/**
 * O "tem certeza?" com NÚMEROS.
 *
 * Um aviso que diz só "isso vai mandar mensagens automáticas" não informa
 * ninguém. O que a pessoa precisa saber antes de ligar é quantas mensagens cada
 * lead vai receber, em quanto tempo, e quantos leads por dia no máximo — porque
 * é essa multiplicação que separa "bom" de "o número foi derrubado".
 */
function ConfirmarLigar({ aberto, onOpenChange, automacao: a, nomeDaBase, ocupado, onConfirmar }: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  automacao: Automacao;
  nomeDaBase: (id: string) => string;
  ocupado: boolean;
  onConfirmar: () => void;
}) {
  const r = resumoDoFluxo(a.passos);
  return (
    <AlertDialog open={aberto} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">Ligar “{a.nome}”?</AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] leading-relaxed">
            A partir de agora, {fraseDoGatilho(a.gatilho, a.gatilho_config, nomeDaBase)}, sem ninguém aprovar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06] text-[12px]">
          <Linha rotulo="Mensagens por pessoa" valor={String(r.mensagens)} />
          {r.duracaoMin > 0 && <Linha rotulo="Duração do fluxo" valor={esperaBonita(r.duracaoMin)} />}
          <Linha rotulo="No máximo por dia" valor={`${a.condicoes.teto_dia} pessoas`} />
          <Linha
            rotulo="Horário"
            valor={a.condicoes.so_horario_comercial ? "só na grade de atendimento" : "a qualquer hora"} />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Quem já está na base não recebe nada: o fluxo só vale para o que acontecer daqui para frente.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-[12px]">Agora não</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onConfirmar(); }} disabled={ocupado} className="text-[12px]">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Power className="h-3.5 w-3.5 mr-1" />}
            Ligar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium tabular-nums text-right">{valor}</span>
    </div>
  );
}

/* ══════════════════ o editor: canvas + inspetor ═══════════════════════════ */

function Editor({
  instancias, instanciaPadrao, apelidos, corDe, nomeDe, userId, aoVivo, automacao,
  fonteInicial, onVoltar, onCriada,
}: {
  instancias: Instancia[];
  instanciaPadrao: string;
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  userId?: string | null;
  aoVivo: boolean;
  automacao: Automacao | null;
  fonteInicial: string | null;
  onVoltar: () => void;
  onCriada: (id: string) => void;
}) {
  const [nome, setNome] = useState(automacao?.nome ?? "");
  /* O NÚMERO É ESCOLHA, E NÃO HERANÇA. Antes ele vinha calado da aba aberta:
     dava para acertar por acaso e para errar sem aviso nenhum. */
  const [instancia, setInstancia] = useState(automacao?.instancia ?? instanciaPadrao);
  /* As bases são DO NÚMERO ESCOLHIDO. Trocar o número troca a lista, porque
     planilha é ligada a um número e marcar a base de outro seria marcar algo
     que nunca vai disparar.

     A busca traz todas e o filtro é aqui: a mesma consulta serve à lista de
     fluxos, que precisa dos nomes de bases de qualquer número para escrever a
     frase do gatilho. */
  const { data: todasAsFontes = [] } = useTodasAsFontes();
  const fontes = useMemo(
    () => todasAsFontes.filter((f) => mesmaInstancia(f.instancia, instancia)),
    [todasAsFontes, instancia]);
  const nomeDaBase = useMemo(() => {
    const m = new Map(todasAsFontes.map((f) => [f.id, f.nome]));
    return (id: string) => m.get(id) ?? "base desligada";
  }, [todasAsFontes]);
  const [gatilho, setGatilho] = useState<Gatilho>(automacao?.gatilho ?? "lead_novo_na_base");
  const [cfg, setCfg] = useState<ConfigDoGatilho>(
    automacao?.gatilho_config ?? (fonteInicial ? { fonte_ids: [fonteInicial] } : {}),
  );
  const [condicoes, setCondicoes] = useState<Condicoes>(automacao?.condicoes ?? CONDICOES_PADRAO);
  const [passos, setPassos] = useState<Passo[]>(
    automacao?.passos ?? [{ ...passoNovo("mensagem"), texto: "" }],
  );
  const [selecionado, setSelecionado] = useState<string>("gatilho");
  const [subAba, setSubAba] = useState<"fluxo" | "execucoes">("fluxo");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [telefoneDoTeste, setTelefoneDoTeste] = useState("");
  const [disparando, setDisparando] = useState(false);

  /* O que está salvo, para o botão só aparecer quando há o que salvar. Comparar
     o objeto inteiro é mais honesto que um `sujo = true` espalhado por dez
     handlers, que sempre esquece um. */
  const guardado = useRef(JSON.stringify({
    nome: automacao?.nome ?? "", instancia: automacao?.instancia ?? instanciaPadrao,
    gatilho: automacao?.gatilho ?? "lead_novo_na_base",
    cfg: automacao?.gatilho_config ?? (fonteInicial ? { fonte_ids: [fonteInicial] } : {}),
    condicoes: automacao?.condicoes ?? CONDICOES_PADRAO,
    passos: automacao?.passos ?? [{ ...passoNovo("mensagem"), texto: "" }],
  }));
  const agora = JSON.stringify({ nome, instancia, gatilho, cfg, condicoes, passos });
  const mudou = agora !== guardado.current || !automacao;

  /* AS COLUNAS DAS BASES DESTE FLUXO. Servem a duas coisas: a bandeja que
     insere `{Funcionários}` no texto, e a conferência de que uma variável
     escrita à mão existe mesmo em alguma base. Sem base escolhida não há o que
     buscar, e aí a conferência não acontece em vez de acusar tudo. */
  const idsDasBases = useMemo(() => {
    if (gatilho !== "lead_novo_na_base") return [];
    const ids = cfg.fonte_ids ?? [];
    return ids.length > 0 ? ids : (cfg.bases_todas ? fontes.map((f) => f.id) : []);
  }, [gatilho, cfg.fonte_ids, cfg.bases_todas, fontes]);
  const { data: colunas = [], isLoading: carregandoColunas } = useColunasDasBases(idsDasBases);

  const rascunho: Rascunho = { nome, instancia, gatilho, gatilho_config: cfg, condicoes, passos };
  /* Enquanto as colunas não chegaram, a conferência de variável fica de fora:
     acusar `{Funcionários}` de não existir por meio segundo faria a lista do
     que falta piscar uma acusação falsa. */
  const travas = impedimentos(rascunho, idsDasBases.length > 0 && !carregandoColunas
    ? colunas.map((c) => c.coluna) : null);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Dê um nome à automação."); return; }
    setSalvando(true);
    try {
      if (automacao) {
        await salvarAutomacao(automacao.id, rascunho);
        guardado.current = agora;
        toast.success("Fluxo salvo.", { description: `Roda em ${nomeDe(instancia)}.` });
      } else {
        const id = await criarAutomacao(rascunho, userId);
        toast.success("Fluxo criado. Ligue quando estiver pronto.", {
          description: `Vai rodar em ${nomeDe(instancia)}.`,
        });
        onCriada(id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const dispararTeste = async () => {
    if (!automacao) return;
    setDisparando(true);
    try {
      await testarAutomacao(automacao.id, telefoneDoTeste);
      setTestando(false);
      setSubAba("execucoes");
      toast.success("Teste na fila.", {
        description: "A mensagem sai no próximo minuto. Acompanhe em Execuções.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDisparando(false);
    }
  };

  const trocarPasso = (id: string, mudanca: Partial<Passo>) =>
    setPassos((ps) => atualizarNaArvore(ps, id, mudanca));

  /* O teto conta a árvore inteira, e não a fila de cima: dois passos dentro de
     um lado ocupam a tela tanto quanto dois passos soltos. */
  const inserirPasso = (tipo: TipoDePasso, indice: number, dentroDe?: { id: string; ramo: Ramo } | null) => {
    if (todosOsPassos(passos).length >= MAX_PASSOS) {
      toast.error(`No máximo ${MAX_PASSOS} passos, contando os de dentro do “Se”.`);
      return;
    }
    const novo = passoNovo(tipo);
    setPassos((ps) => inserirNaArvore(ps, novo, { indice, dentroDe }));
    setSelecionado(novo.id);
  };

  const removerPasso = (id: string) => {
    setPassos((ps) => removerDaArvore(ps, id));
    setSelecionado("gatilho");
  };

  const passoAberto = encontrarPasso(passos, selecionado);
  const cabeMais = todosOsPassos(passos).length < MAX_PASSOS;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── cabeçalho ── */}
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
        <button type="button" onClick={onVoltar}
          className="h-7 w-7 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do fluxo (ex.: Primeiro contato dos leads empresariais)"
          className="h-8 text-[12.5px] bg-transparent border-white/[0.08] flex-1 min-w-0"
        />
        {/* TESTAR SÓ DEPOIS DE SALVO, e só com passo escrito: testar um
            rascunho mandaria para o WhatsApp de alguém uma coisa que ainda não
            existe. Só aparece quando não há nada pendente de salvar. */}
        {automacao && !mudou && passos.length > 0 && (
          <Button size="sm" variant="outline" className="h-8 text-[12px] shrink-0"
            onClick={() => setTestando(true)}>
            <Play className="h-3.5 w-3.5 mr-1" /> Testar agora
          </Button>
        )}
        <AnimatePresence>
          {mudou && (
            <motion.div
              initial={{ opacity: 0, scale: 0.94, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.94, width: 0 }}
              transition={MOLA}
              className="overflow-hidden shrink-0">
              <Button size="sm" className="h-8 text-[12px]" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Salvar
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── sub-abas ── */}
      {automacao && (
        <LayoutGroup id="automacao-subabas">
          <div className="px-3 pt-2 flex items-center gap-1">
            {([["fluxo", "Fluxo", Workflow], ["execucoes", "Execuções", History]] as const).map(([k, rot, Ico]) => (
              <button key={k} type="button" onClick={() => setSubAba(k)}
                className={cn("relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] transition-colors",
                  subAba === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {subAba === k && (
                  /* UM indicador que desliza, e não um fundo que acende em cada
                     botão: assim o olho segue o mesmo objeto de um lado ao outro. */
                  <motion.span layoutId="aba-automacao" transition={MOLA}
                    className="absolute inset-0 rounded-md bg-white/[0.08]" />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Ico className="h-3.5 w-3.5" /> {rot}
                </span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      )}

      <DialogDoTeste
        aberto={testando} onOpenChange={setTestando}
        nome={nome} nomeDoNumero={nomeDe(instancia)}
        telefone={telefoneDoTeste} onTrocarTelefone={setTelefoneDoTeste}
        mensagens={resumoDoFluxo(passos).mensagens}
        ocupado={disparando} onDisparar={dispararTeste}
      />

      {subAba === "execucoes" && automacao ? (
        <Execucoes automacaoId={automacao.id} aoVivo={aoVivo}
          ligadaEm={automacao.ativa ? (automacao.ligada_em ?? null) : null} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* ── canvas ── */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-4">
            <div className="mx-auto w-full max-w-md flex flex-col items-stretch">
              <NoDoGatilho
                gatilho={gatilho}
                cfg={cfg}
                nomeDaBase={nomeDaBase}
                nomeDoNumero={nomeDe(instancia)}
                aberto={selecionado === "gatilho"}
                onAbrir={() => setSelecionado("gatilho")}
              />

              <Conector onInserir={(t) => inserirPasso(t, 0)} podeInserir={cabeMais} />

              <LayoutGroup id="passos-do-fluxo">
                <AnimatePresence initial={false} mode="popLayout">
                  {passos.map((p, i) => (
                    <React.Fragment key={p.id}>
                      <NoDoPasso
                        passo={p}
                        numero={`Passo ${i + 1}`}
                        aberto={selecionado === p.id}
                        onAbrir={() => setSelecionado(p.id)}
                        onRemover={() => removerPasso(p.id)}
                      />
                      {p.tipo === "se" && (
                        <OsDoisLados
                          passo={p}
                          selecionado={selecionado}
                          cabeMais={cabeMais}
                          numeroDoPai={i + 1}
                          onAbrir={setSelecionado}
                          onRemover={removerPasso}
                          onInserir={(tipo, ramo, indice) => inserirPasso(tipo, indice, { id: p.id, ramo })}
                        />
                      )}
                      <Conector
                        onInserir={(t) => inserirPasso(t, i + 1)}
                        podeInserir={cabeMais}
                        fim={i === passos.length - 1}
                      />
                    </React.Fragment>
                  ))}
                </AnimatePresence>
              </LayoutGroup>

              {passos.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  Um fluxo sem passos não faz nada. Use o sinal de mais acima.
                </p>
              )}
            </div>
          </div>

          {/* ── inspetor ── */}
          <div className="lg:w-[330px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06] overflow-y-auto scrollbar-thin">
            <AnimatePresence mode="wait">
              <motion.div
                key={selecionado}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: CURVA }}
                className="p-3">
                {selecionado === "gatilho" ? (
                  <InspetorDoGatilho
                    gatilho={gatilho} cfg={cfg} fontes={fontes} condicoes={condicoes}
                    instancias={instancias} instancia={instancia}
                    apelidos={apelidos} corDe={corDe} nomeDe={nomeDe}
                    ativa={!!automacao?.ativa}
                    onTrocarInstancia={(n) => {
                      setInstancia(n);
                      /* As bases marcadas eram do número anterior e nunca
                         disparariam aqui. Limpar é mais honesto que deixar uma
                         marcação que não vale mais. */
                      if (cfg.fonte_ids?.length) setCfg({ ...cfg, fonte_ids: [] });
                    }}
                    onTrocarGatilho={(g) => { setGatilho(g); setCfg({}); }}
                    onTrocarCfg={setCfg}
                    onTrocarCondicoes={setCondicoes}
                  />
                ) : passoAberto ? (
                  <InspetorDoPasso
                    passo={passoAberto}
                    rotulo={rotuloDaPosicao(passos, passoAberto.id)}
                    colunas={colunas}
                    carregandoColunas={carregandoColunas}
                    temBase={idsDasBases.length > 0}
                    onTrocar={(m) => trocarPasso(passoAberto.id, m)}
                    onRemover={() => removerPasso(passoAberto.id)}
                  />
                ) : null}

                {travas.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                    <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
                      Falta para poder ligar
                    </p>
                    <ul className="mt-1 space-y-1">
                      {travas.map((t) => (
                        <li key={t} className="text-[10.5px] text-muted-foreground leading-snug flex items-start gap-1.5">
                          <Pendente className="mt-[5px]" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ os nós do canvas ══════════════════════════════════════ */

function NoDoGatilho({ gatilho, cfg, nomeDaBase, nomeDoNumero, aberto, onAbrir }: {
  gatilho: Gatilho; cfg: ConfigDoGatilho; nomeDaBase: (id: string) => string;
  nomeDoNumero: string; aberto: boolean; onAbrir: () => void;
}) {
  const def = defDoGatilho(gatilho);
  const Ico = ICONE_DO_GATILHO[def.icone] ?? Zap;
  /* A pergunta da base sem resposta aparece NO CARTÃO, e não só no inspetor:
     o inspetor fica ao lado no computador e embaixo no celular, e é justamente
     no celular que ela passaria batida. */
  const faltaBase = def.campo === "bases" && !cfg.bases_todas && (cfg.fonte_ids ?? []).length === 0;
  return (
    <motion.button
      type="button" layout onClick={onAbrir} transition={MOLA}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        "text-left rounded-xl border px-3 py-2.5 transition-colors",
        aberto ? "border-primary/40 bg-primary/[0.06]"
               : "border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.04]")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("h-8 w-8 shrink-0 rounded-lg grid place-items-center ring-1", TOM.primary)}>
          <Ico className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
            Quando · em {nomeDoNumero}
          </p>
          <p className="text-[12.5px] font-medium">{def.rotulo}</p>
          {/* O QUE FALTA SE DIZ NUMA LINHA, NÃO NUM BLOCO PINTADO. O cartão
              inteiro de âmbar gritava a mesma coisa que este ponto diz: falta
              responder. Um sinal discreto no lugar certo é lido; um aviso
              grande e colorido passa a ser mobília em dois dias. */}
          <p className={cn("text-[10.5px] leading-snug mt-0.5 flex items-center gap-1",
            faltaBase ? "text-amber-400/90" : "text-muted-foreground")}>
            {faltaBase && <Pendente />}
            {faltaBase ? "Escolha em qual base" : fraseDoGatilho(gatilho, cfg, nomeDaBase)}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

function NoDoPasso({ passo, numero, aberto, onAbrir, onRemover, miudo }: {
  passo: Passo; numero: string; aberto: boolean; onAbrir: () => void; onRemover: () => void;
  /** dentro de um lado do "Se": cabe menos, então o cartão encolhe */
  miudo?: boolean;
}) {
  const def = defDoPasso(passo.tipo);
  const Ico = ICONE_DO_PASSO[def.icone] ?? Send;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={MOLA}
      className={cn(
        "group rounded-xl border transition-colors",
        aberto ? "border-primary/40 bg-primary/[0.06]" : "border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.04]")}>
      <div className={cn("flex items-start gap-2.5", miudo ? "px-2 py-1.5 gap-2" : "px-3 py-2.5")}>
        <button type="button" onClick={onAbrir} className="flex items-start gap-2.5 min-w-0 flex-1 text-left">
          <span className={cn("shrink-0 rounded-lg grid place-items-center ring-1",
            miudo ? "h-6 w-6" : "h-8 w-8", TOM[def.tom])}>
            <Ico className={miudo ? "h-3 w-3" : "h-4 w-4"} />
          </span>
          <div className="min-w-0 flex-1">
            {!miudo && (
              <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">{numero}</p>
            )}
            <p className={cn("font-medium", miudo ? "text-[11px]" : "text-[12.5px]")}>{def.rotulo}</p>
            <p className={cn("text-muted-foreground leading-snug mt-0.5 line-clamp-2",
              miudo ? "text-[10px]" : "text-[10.5px]")}>
              {resumoDoPasso(passo)}
            </p>
          </div>
        </button>
        <button type="button" onClick={onRemover} title="Remover passo"
          className="h-6 w-6 shrink-0 grid place-items-center rounded-md text-muted-foreground/50
                     opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-400 hover:bg-rose-400/10 transition-all">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * OS DOIS LADOS DO "SE", lado a lado.
 *
 * Um lado é uma fila igual à de cima, só que estreita. Ficam lado a lado no
 * computador e empilhados no celular: a comparação entre o que acontece num
 * caso e no outro é o que a pessoa vem ver aqui, e um em cima do outro numa
 * tela larga jogaria o segundo para fora do campo de visão.
 *
 * Um lado vazio não é erro de preenchimento: "se já escreveu, não manda nada"
 * é uma regra legítima, e por isso o vazio diz o que significa em vez de
 * mostrar um aviso.
 */
function OsDoisLados({ passo, selecionado, cabeMais, numeroDoPai, onAbrir, onRemover, onInserir }: {
  passo: Passo;
  selecionado: string;
  cabeMais: boolean;
  numeroDoPai: number;
  onAbrir: (id: string) => void;
  onRemover: (id: string) => void;
  onInserir: (tipo: TipoDePasso, ramo: Ramo, indice: number) => void;
}) {
  const lados: { ramo: Ramo; rotulo: string; lista: Passo[]; cor: string }[] = [
    { ramo: "entao", rotulo: "sim", lista: passo.entao ?? [], cor: "text-emerald-400/90 ring-emerald-400/20" },
    { ramo: "senao", rotulo: "não", lista: passo.senao ?? [], cor: "text-rose-400/90 ring-rose-400/20" },
  ];
  return (
    <motion.div layout transition={MOLA} className="relative flex flex-col items-center">
      <span className="h-3 w-px bg-violet-400/30" />
      <div className="w-full grid gap-2 sm:grid-cols-2">
        {lados.map((l, k) => (
          <motion.div
            key={l.ramo} layout
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...MOLA, delay: k * 0.05 }}
            className="rounded-xl ring-1 ring-white/[0.07] bg-white/[0.015] p-1.5">
            <p className={cn("text-[9.5px] uppercase tracking-[0.12em] px-1 pb-1 rounded-t", l.cor)}>
              {l.rotulo}
            </p>
            <LayoutGroup id={`ramo-${passo.id}-${l.ramo}`}>
              <AnimatePresence initial={false} mode="popLayout">
                {l.lista.map((p, i) => (
                  <React.Fragment key={p.id}>
                    <NoDoPasso
                      passo={p} miudo
                      numero={`Passo ${numeroDoPai} · ${l.rotulo} ${i + 1}`}
                      aberto={selecionado === p.id}
                      onAbrir={() => onAbrir(p.id)}
                      onRemover={() => onRemover(p.id)}
                    />
                    <ConectorDoRamo
                      podeInserir={cabeMais}
                      onInserir={(t) => onInserir(t, l.ramo, i + 1)}
                    />
                  </React.Fragment>
                ))}
              </AnimatePresence>
            </LayoutGroup>
            {l.lista.length === 0 && (
              <ConectorDoRamo
                vazio={l.ramo === "entao" ? "nada acontece deste lado" : "nada acontece deste lado"}
                podeInserir={cabeMais}
                onInserir={(t) => onInserir(t, l.ramo, 0)}
              />
            )}
          </motion.div>
        ))}
      </div>
      <span className="h-3 w-px bg-violet-400/30" />
    </motion.div>
  );
}

/**
 * O "+" de dentro de um lado.
 *
 * Não oferece "Se": um nível só. A lista curta aqui também é um favor ao olho,
 * porque este menu abre numa coluna que tem metade da largura.
 */
function ConectorDoRamo({ onInserir, podeInserir, vazio }: {
  onInserir: (t: TipoDePasso) => void; podeInserir: boolean; vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <motion.div layout transition={MOLA} className="group/ramo relative flex flex-col items-center py-0.5">
      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={MOLA}
            className="w-full rounded-lg border border-white/[0.10] bg-black/50 backdrop-blur p-1 my-1">
            {PASSOS_DEF.filter((p) => TIPOS_DENTRO_DE_RAMO.includes(p.chave)).map((p, i) => {
              const Ico = ICONE_DO_PASSO[p.icone] ?? Send;
              return (
                <motion.button
                  key={p.chave} type="button"
                  initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, ease: CURVA, delay: i * 0.03 }}
                  onClick={() => { onInserir(p.chave); setAberto(false); }}
                  className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-white/[0.06] transition-colors">
                  <span className={cn("h-4 w-4 shrink-0 rounded grid place-items-center ring-1", TOM[p.tom])}>
                    <Ico className="h-2.5 w-2.5" />
                  </span>
                  <span className="text-[10.5px] truncate">{p.rotulo}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : podeInserir ? (
          <motion.button
            type="button" onClick={() => setAberto(true)}
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
            transition={MOLA}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md py-1 text-muted-foreground/70",
              "hover:text-foreground hover:bg-white/[0.05] transition-colors",
              vazio ? "w-full" : "h-4 w-4 opacity-0 group-hover/ramo:opacity-100 focus:opacity-100")}>
            <Plus className="h-2.5 w-2.5 shrink-0" />
            {vazio && <span className="text-[10px]">{vazio}</span>}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A linha entre dois nós, com o sinal de mais no meio.
 *
 * O "+" só aparece no hover da própria linha: visível o tempo todo, a coluna
 * vira uma fileira de botões e o fluxo some no meio deles.
 */
function Conector({ onInserir, podeInserir, fim }: {
  onInserir: (t: TipoDePasso) => void; podeInserir: boolean; fim?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <motion.div layout transition={MOLA} className="relative group/conector flex flex-col items-center py-1">
      <span className={cn("w-px bg-white/[0.12]", aberto ? "h-2" : "h-5")} />

      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={MOLA}
            className="w-full rounded-xl border border-white/[0.10] bg-black/40 backdrop-blur p-1.5 my-1">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
                O que acontece aqui
              </span>
              <button type="button" onClick={() => setAberto(false)}
                className="h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid gap-1">
              {PASSOS_DEF.map((p, i) => {
                const Ico = ICONE_DO_PASSO[p.icone] ?? Send;
                return (
                  <motion.button
                    key={p.chave} type="button"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: CURVA, delay: i * 0.04 }}
                    onClick={() => { onInserir(p.chave); setAberto(false); }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] transition-colors">
                    <span className={cn("h-6 w-6 shrink-0 rounded-md grid place-items-center ring-1", TOM[p.tom])}>
                      <Ico className="h-3 w-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11.5px] font-medium">{p.rotulo}</span>
                      <span className="block text-[10px] text-muted-foreground leading-snug">{p.descricao}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          podeInserir && (
            <motion.button
              type="button" onClick={() => setAberto(true)} title="Inserir passo aqui"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              transition={MOLA}
              className="h-5 w-5 grid place-items-center rounded-full ring-1 ring-white/[0.12] bg-black/40
                         text-muted-foreground opacity-0 group-hover/conector:opacity-100 focus:opacity-100
                         hover:text-primary hover:ring-primary/40 transition-all">
              <Plus className="h-3 w-3" />
            </motion.button>
          )
        )}
      </AnimatePresence>

      {!fim && <span className={cn("w-px bg-white/[0.12]", aberto ? "h-2" : "h-5")} />}
      {fim && !aberto && <span className="h-5 w-px bg-gradient-to-b from-white/[0.12] to-transparent" />}
    </motion.div>
  );
}

/* ══════════════════ inspetores ════════════════════════════════════════════ */

/**
 * O sinal de "falta responder isto".
 *
 * Um ponto de 5px, e não um triângulo com fundo pintado. A tela tem três
 * lugares que apontam a mesma pendência (o cartão do gatilho, a pergunta e a
 * lista do que falta); com bloco colorido em cada um, o editor ficava amarelo
 * inteiro e o aviso deixava de ser aviso.
 */
function Pendente({ className }: { className?: string }) {
  return (
    <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full bg-amber-400/80", className)}
      aria-hidden />
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-1.5">{children}</p>;
}

function InspetorDoGatilho({
  gatilho, cfg, fontes, condicoes, instancias, instancia,
  apelidos, corDe, nomeDe, ativa,
  onTrocarInstancia, onTrocarGatilho, onTrocarCfg, onTrocarCondicoes,
}: {
  gatilho: Gatilho; cfg: ConfigDoGatilho; fontes: Fonte[]; condicoes: Condicoes;
  instancias: Instancia[]; instancia: string;
  apelidos: Map<string, string>;
  corDe: (nome: string) => { fundo: string; texto: string; anel: string };
  nomeDe: (nome: string) => string;
  ativa: boolean;
  onTrocarInstancia: (nome: string) => void;
  onTrocarGatilho: (g: Gatilho) => void;
  onTrocarCfg: (c: ConfigDoGatilho) => void;
  onTrocarCondicoes: (c: Condicoes) => void;
}) {
  return (
    <div className="space-y-4">
      {/* ── EM QUAL NÚMERO ──
          Primeiro de tudo, porque é a pergunta ANTERIOR às outras: as bases
          oferecidas abaixo são as deste número, e a mensagem vai sair por ele. */}
      <div>
        <Titulo>Roda no número</Titulo>
        {instancias.length <= 1 ? (
          <p className="text-[11.5px] font-medium">{nomeDe(instancia)}</p>
        ) : (
          <div className="grid gap-1">
            {instancias.map((i) => {
              const cor = corDe(i.nome);
              const eu = mesmaInstancia(i.nome, instancia);
              return (
                <button key={i.id} type="button" onClick={() => onTrocarInstancia(i.nome)}
                  className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ring-1 transition-colors",
                    eu ? "ring-primary/35 bg-primary/[0.08]" : "ring-transparent hover:bg-white/[0.05]")}>
                  <span className={cn("shrink-0 rounded px-1 py-[1px] text-[8.5px] font-bold tracking-wide",
                    eu ? cn(cor.fundo, cor.texto) : "bg-white/[0.08] text-muted-foreground")}>
                    {apelidos.get(i.nome) ?? apelidoDeInstancia(i.nome)}
                  </span>
                  <span className="text-[11.5px] truncate">{nomeDe(i.nome)}</span>
                  {eu && <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />}
                </button>
              );
            })}
            {ativa && (
              <p className="text-[10px] text-amber-400/80 leading-snug px-2 pt-1">
                Este fluxo está ligado. Trocar o número muda de quem ele passa a escutar,
                a partir de agora.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── O QUE DISPARA, e logo abaixo A PERGUNTA QUE ELE FAZ ──
          A configuração de cada gatilho abre DENTRO da lista, colada no item
          escolhido. Ela ficava no fim do painel, depois dos cinco gatilhos, e
          isso a jogava para fora da tela: o cartão dizia "escolha em qual base"
          e o toque não revelava nada, porque a resposta estava abaixo da
          dobra. */}
      <div className="pt-1 border-t border-white/[0.06]">
        <Titulo>O que dispara</Titulo>
        <div className="grid gap-1">
          {GATILHOS_DEF.map((g, i) => {
            const Ico = ICONE_DO_GATILHO[g.icone] ?? Zap;
            const eu = g.chave === gatilho;
            /* A entrada escalonada é do BLOCO, e não do botão: o botão é um
               elemento comum, e `transition` nele só viraria aviso no console.
               O bloco é quem anima, e é ele que muda de altura quando a
               pergunta do gatilho abre embaixo. */
            return (
              <motion.div key={g.chave} layout
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOLA, delay: i * 0.04 }}>
                <button
                  type="button" onClick={() => onTrocarGatilho(g.chave)}
                  className={cn("w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ring-1 transition-colors",
                    eu ? "ring-primary/35 bg-primary/[0.08]" : "ring-transparent hover:bg-white/[0.05]")}>
                  <Ico className={cn("h-3.5 w-3.5 shrink-0", eu ? "text-primary" : "text-muted-foreground")} />
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium">{g.rotulo}</span>
                    <span className="block text-[10px] text-muted-foreground leading-snug">{g.descricao}</span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {eu && g.campo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={MOLA}
                      className="overflow-hidden">
                      <div className="pl-2 pr-0.5 pt-1.5 pb-1">
                        <ConfigDoGatilho
                          campo={g.campo} cfg={cfg} fontes={fontes}
                          instancia={instancia} nomeDe={nomeDe}
                          onTrocarCfg={onTrocarCfg}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="pt-1 border-t border-white/[0.06]">
        <Titulo>Travas</Titulo>
        <label className="flex items-start gap-2 py-1.5 cursor-pointer">
          <Switch
            checked={condicoes.so_horario_comercial}
            onCheckedChange={(v) => onTrocarCondicoes({ ...condicoes, so_horario_comercial: v })}
          />
          <span className="min-w-0">
            <span className="block text-[11.5px]">Só no horário de atendimento</span>
            <span className="block text-[10px] text-muted-foreground leading-snug">
              Fora da grade, a mensagem espera a próxima abertura em vez de sair de madrugada.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-2 pt-2">
          <Input
            type="number" min={1} max={1000}
            value={condicoes.teto_dia}
            onChange={(e) => onTrocarCondicoes({ ...condicoes, teto_dia: Number(e.target.value) })}
            className="h-8 text-[12px] bg-transparent border-white/[0.08] w-20 tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground leading-snug">
            pessoas por dia, no máximo
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1.5">
          É a rede de segurança: se a planilha ganhar 600 linhas de uma vez, saem as primeiras e o
          resto fica para amanhã.
        </p>
      </div>
    </div>
  );
}

/** A pergunta que o gatilho escolhido faz, aberta logo abaixo dele. */
function ConfigDoGatilho({ campo, cfg, fontes, instancia, nomeDe, onTrocarCfg }: {
  campo: NonNullable<GatilhoDef["campo"]>;
  cfg: ConfigDoGatilho;
  fontes: Fonte[];
  instancia: string;
  nomeDe: (nome: string) => string;
  onTrocarCfg: (c: ConfigDoGatilho) => void;
}) {
  const marcadas = new Set(cfg.fonte_ids ?? []);
  const etapasMarcadas = new Set(cfg.etapas ?? []);
  const todasAsBases = !!cfg.bases_todas && marcadas.size === 0;
  const semResposta = !cfg.bases_todas && marcadas.size === 0;

  if (campo === "bases") {
    return (
      <EscolhaDaBase
        cfg={cfg} fontes={fontes} instancia={instancia} nomeDe={nomeDe}
        onTrocarCfg={onTrocarCfg}
      />
    );
  }

  if (campo === "etapas") {
    return (
      <div className="rounded-lg px-2.5 py-2 ring-1 ring-white/[0.07] bg-white/[0.02]">
        <Titulo>Ao entrar em</Titulo>
        <div className="flex flex-wrap gap-1">
          {etapasOferecidas().map((e) => {
            const marcada = etapasMarcadas.has(e.chave);
            return (
              <button key={e.chave} type="button"
                onClick={() => {
                  const nova = new Set(etapasMarcadas);
                  if (marcada) nova.delete(e.chave); else nova.add(e.chave);
                  onTrocarCfg({ ...cfg, etapas: [...nova] });
                }}
                className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                  marcada ? "bg-primary/[0.14] text-primary ring-primary/30"
                          : "bg-white/[0.04] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.07]")}>
                {e.rotulo}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1.5">
          Sem nenhuma marcada, vale para qualquer mudança de etapa.
        </p>
      </div>
    );
  }

  if (campo === "texto") {
    return (
      <div className="rounded-lg px-2.5 py-2 ring-1 ring-white/[0.07] bg-white/[0.02]">
        <Titulo>Só quando a mensagem contiver</Titulo>
        <Input
          value={cfg.contendo ?? ""}
          onChange={(e) => onTrocarCfg({ ...cfg, contendo: e.target.value })}
          placeholder="deixe vazio para qualquer mensagem"
          className="h-8 text-[12px] bg-transparent border-white/[0.08]"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg px-2.5 py-2 ring-1 ring-white/[0.07] bg-white/[0.02]">
      <Titulo>Dias de silêncio</Titulo>
      <Input
        type="number" min={1} max={365}
        value={cfg.dias ?? 3}
        onChange={(e) => onTrocarCfg({ ...cfg, dias: Number(e.target.value) })}
        className="h-8 text-[12px] bg-transparent border-white/[0.08] w-24 tabular-nums"
      />
      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1.5">
        Conta a partir da nossa última mensagem. Quem respondeu não entra.
      </p>
    </div>
  );
}

/**
 * EM QUAL BASE, com as bases desenhadas como elas já são na caixa Base.
 *
 * Mesmo ícone de banco de dados, mesmo jeito de contar ("N na base", "N
 * novos"). Não é enfeite: a pessoa acabou de ver essa mesma planilha na outra
 * aba, e um segundo desenho para a mesma coisa faria duvidar se é a mesma
 * coisa.
 *
 * E LIGAR PLANILHA MORA AQUI TAMBÉM. Quem está montando um fluxo de base e
 * descobre que a planilha ainda não está ligada não deveria ter que sair da
 * aba, achar a caixa Base, ligar, e voltar para retomar o que estava fazendo.
 * A regra é a mesma da outra tela (`criarFonte` e `idDaPlanilha`, os dois
 * compartilhados); o formulário é mais curto de propósito, porque aqui o
 * objetivo é o fluxo enxergar a base, e a escolha de colunas pertence a onde
 * os cartões de lead são desenhados.
 */
function EscolhaDaBase({ cfg, fontes, instancia, nomeDe, onTrocarCfg }: {
  cfg: ConfigDoGatilho;
  fontes: Fonte[];
  instancia: string;
  nomeDe: (nome: string) => string;
  onTrocarCfg: (c: ConfigDoGatilho) => void;
}) {
  const { data: resumoBases = {} } = useResumoBases(true);
  const invalidarLeads = useInvalidarLeads();
  const [ligando, setLigando] = useState(false);
  const [link, setLink] = useState("");
  const [apelidoDaBase, setApelidoDaBase] = useState("");
  const [aba, setAba] = useState("");
  const [salvando, setSalvando] = useState(false);
  /* O que a leitura de teste disse. Nulo enquanto ninguém tentou. */
  const [diag, setDiag] = useState<DiagnosticoDaPlanilha | null>(null);

  const marcadas = new Set(cfg.fonte_ids ?? []);
  const todasAsBases = !!cfg.bases_todas && marcadas.size === 0;
  const semResposta = !cfg.bases_todas && marcadas.size === 0;

  /**
   * TESTA, E SÓ DEPOIS LIGA.
   *
   * O erro mais comum de todos é a planilha não estar compartilhada com a conta
   * de serviço, e antes disso ele só aparecia DEPOIS: a base entrava na lista, a
   * fila vinha vazia, e o motivo ficava numa frase do Google no cabeçalho da
   * fonte, que quem estava ligando já não estava olhando.
   *
   * Agora a leitura acontece no clique. Se ela não abre, nada é criado e a tela
   * mostra o que copiar e onde colar. Se abre mas está vazia, liga do mesmo
   * jeito: quem liga a base antes do primeiro lead está fazendo a coisa certa.
   */
  const ligarPlanilha = async () => {
    const planilhaId = idDaPlanilha(link);
    if (!planilhaId) { toast.error("Cole o link da planilha."); return; }
    setSalvando(true);
    setDiag(null);
    try {
      const resposta = await testarPlanilha(planilhaId, aba);
      const d = diagnosticarPlanilha(resposta as RespostaDaLeitura);
      if (d.impede) { setDiag(d); return; }

      const id = await criarFonte({
        nome: apelidoDaBase.trim() || "Leads da landing",
        planilhaId,
        // A aba lida DE VERDADE, e não a digitada: se o nome não existia, a
        // função leu outra e é essa que vale daqui em diante.
        aba: (resposta.aba as string) || aba,
        instancia,
      });
      invalidarLeads();
      /* A base recém-ligada já entra ESCOLHIDA: quem a ligou daqui a ligou
         para este fluxo, e obrigar a marcá-la em seguida seria pedir a mesma
         resposta duas vezes. */
      onTrocarCfg({ ...cfg, bases_todas: false, fonte_ids: [...marcadas, id] });
      setLigando(false);
      setLink(""); setApelidoDaBase(""); setAba(""); setDiag(null);

      const n = linhasLidas(resposta as RespostaDaLeitura);
      toast.success("Planilha ligada.", {
        description: n > 0
          ? `Li ${n} linha(s). Os leads entram na caixa Base e já valem para este fluxo.`
          : "Ela ainda não tem linhas. Assim que a landing gravar a primeira, ela aparece.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-lg px-2.5 py-2 ring-1 ring-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2">
        <Titulo>Em qual base</Titulo>
        {semResposta && fontes.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400/90 -mt-1">
            <Pendente /> falta escolher
          </span>
        )}
      </div>

      {fontes.length === 0 ? (
        /* Sem base neste número, a saída é uma só: adicionar. Havia aqui um
           atalho sugerindo levar o fluxo para o número que tem base, e ele era
           informação a mais no caminho de quem já sabe o que quer fazer. */
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground leading-snug">
            {nomeDe(instancia)} ainda não tem planilha ligada.
          </p>
          <BotaoAdicionarBase onClick={() => setLigando(true)} />
        </div>
      ) : (
        <div className="-mx-2.5 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {/* QUALQUER BASE é a primeira linha, com o mesmo formato das outras:
              ela é uma escolha do mesmo tipo, e num formato diferente pareceria
              um botão de outra coisa. */}
          <LinhaDaBase
            icone={Layers}
            nome="Qualquer base deste número"
            abaixo={`${fontes.length} ligada${fontes.length === 1 ? "" : "s"} hoje, e as que vierem depois`}
            marcada={todasAsBases}
            onClick={() => onTrocarCfg({ ...cfg, bases_todas: true, fonte_ids: [] })}
          />

          {fontes.map((f) => {
            const r = resumoBases[f.id];
            const saude = saudeDaBase(f, horaDaLista);
            return (
              <LinhaDaBase
                key={f.id}
                icone={Database}
                nome={f.nome}
                novos={r?.novos ?? 0}
                total={r?.total ?? 0}
                saude={saude}
                quando={f.ultimo_sync ? horaDaLista(f.ultimo_sync) : "nunca"}
                marcada={marcadas.has(f.id)}
                onClick={() => {
                  const nova = new Set(marcadas);
                  if (marcadas.has(f.id)) nova.delete(f.id); else nova.add(f.id);
                  onTrocarCfg({ ...cfg, bases_todas: false, fonte_ids: [...nova] });
                }}
              />
            );
          })}

          <div className="px-2.5 py-1.5">
            <BotaoAdicionarBase onClick={() => setLigando(true)} />
          </div>
        </div>
      )}

      <Dialog open={ligando} onOpenChange={(a) => { if (!salvando) setLigando(a); }}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Database className="h-4 w-4" /> Ligar planilha
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              Os leads dela entram na caixa <span className="text-foreground/80">Base</span> de{" "}
              <span className="text-foreground/80">{nomeDe(instancia)}</span> e passam a valer para
              este fluxo. A planilha continua sendo a dona dos dados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Link da planilha</span>
              <Input value={link} onChange={(e) => { setLink(e.target.value); setDiag(null); }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="h-9 text-[12px]" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Apelido</span>
                <Input value={apelidoDaBase} onChange={(e) => setApelidoDaBase(e.target.value)}
                  placeholder="Leads empresariais" className="h-9 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Aba <span className="opacity-60">(opcional)</span>
                </span>
                <Input value={aba} onChange={(e) => { setAba(e.target.value); setDiag(null); }}
                  placeholder="Leads" className="h-9 text-[13px]" />
              </label>
            </div>
            <AnimatePresence initial={false} mode="wait">
              {diag ? (
                <motion.div
                  key={diag.tipo}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={MOLA}>
                  <GuiaDaPlanilha diagnostico={diag} />
                </motion.div>
              ) : (
                <motion.p
                  key="dica"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-[10.5px] text-muted-foreground/70 leading-snug">
                  Eu testo a leitura antes de ligar. Se a planilha não estiver compartilhada com o
                  sistema, eu digo aqui o que copiar e onde colar.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setLigando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={ligarPlanilha} disabled={salvando || !link.trim()}>
              {salvando
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Testando…</>
                : diag ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Testar de novo</>
                       : <>Testar e ligar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * UMA BASE, DESENHADA COMO ELA JÁ É NA CAIXA.
 *
 * Mesma caixinha de 24px com o ícone, mesmo nome em 12.5px truncado, mesmo
 * selo de "N novos" e mesma linha de "N na base" embaixo, mesmo pingo de saúde
 * e mesma hora do último puxão à direita. O que muda é só o gesto: ali o clique
 * abre a fila, aqui o clique escolhe.
 */
function LinhaDaBase({ icone: Ico, nome, abaixo, novos, total, saude, quando, marcada, onClick }: {
  icone: React.ComponentType<{ className?: string }>;
  nome: string;
  /** frase no lugar dos números, para a linha que não é uma planilha de verdade */
  abaixo?: string;
  novos?: number;
  total?: number;
  saude?: { cor: string; titulo: string };
  quando?: string;
  marcada: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn("w-full px-2.5 py-2.5 text-left transition-colors",
        marcada ? "bg-primary/[0.07]" : "bg-transparent hover:bg-white/[0.03]")}>
      <div className="flex items-start gap-2">
        <span className={cn("h-6 w-6 mt-[1px] shrink-0 rounded-md grid place-items-center ring-1 transition-colors",
          marcada ? "bg-primary/15 text-primary ring-primary/25"
                  : "bg-white/[0.05] text-muted-foreground ring-white/[0.10]")}>
          <Ico className="h-3.5 w-3.5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium truncate" title={nome}>{nome}</span>
          {abaixo ? (
            <span className="block text-[10px] text-muted-foreground/70 leading-snug mt-0.5">{abaixo}</span>
          ) : (
            <span className="flex flex-col items-start gap-1 mt-1">
              <span className={cn(
                "rounded px-1.5 py-[1px] text-[10px] font-semibold tabular-nums ring-1 whitespace-nowrap",
                (novos ?? 0) > 0
                  ? "bg-primary/15 text-primary ring-primary/25"
                  : "bg-white/[0.05] text-muted-foreground ring-white/[0.08]")}>
                {novos ?? 0} novo{(novos ?? 0) === 1 ? "" : "s"}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/70 whitespace-nowrap">
                {total ?? 0} na base
              </span>
            </span>
          )}
        </span>

        <span className="flex flex-col items-end gap-1 shrink-0">
          <span className="flex items-center gap-1.5 h-4">
            {saude && (
              <span title={saude.titulo} className={cn("h-1.5 w-1.5 rounded-full shrink-0", saude.cor)} />
            )}
            {marcada && <Check className="h-3.5 w-3.5 text-primary" />}
          </span>
          {quando && (
            <span className="text-[9px] text-muted-foreground/60 whitespace-nowrap">{quando}</span>
          )}
        </span>
      </div>
    </button>
  );
}

/** O mesmo "+ Adicionar base" que fecha a lista na caixa Base. */
function BotaoAdicionarBase({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5
                 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
      <Plus className="h-3 w-3 shrink-0" />
      <span className="text-[11px]">Adicionar base</span>
    </button>
  );
}

const VARIAVEIS_DA_CONVERSA = [
  { marca: "{nome}", rotulo: "nome", exemplo: "Maria" },
  { marca: "{horario}", rotulo: "horário", exemplo: "08:00" },
];

/**
 * A BANDEJA DE VARIÁVEIS: as duas de sempre, e as colunas da base do fluxo.
 *
 * As duas primeiras vêm da conversa e existem sempre. As outras são o
 * cabeçalho da planilha, lido das últimas linhas que chegaram, com o valor de
 * um lead de verdade no `title`: "Funcionários" não diz nada, "5 a 20
 * funcionários" diz tudo sobre o que vai sair na mensagem.
 *
 * Arrastar e clicar fazem a mesma coisa. Clicar existe porque no celular não
 * se arrasta, e foi assim que a bandeja nasceu.
 */
function BandejaDeVariaveis({ colunas, carregando, temBase, onInserir }: {
  colunas: ColunaDaBase[]; carregando: boolean; temBase: boolean;
  onInserir: (marca: string) => void;
}) {
  const marcas = [
    ...VARIAVEIS_DA_CONVERSA,
    ...colunas.map((c) => ({ marca: `{${c.coluna}}`, rotulo: c.coluna, exemplo: c.exemplo ?? "" })),
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Braces className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
          Arraste ou toque para inserir
        </span>
        {carregando && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/60" />}
      </div>
      <div className="flex flex-wrap gap-1">
        <AnimatePresence initial={false}>
          {marcas.map((v, i) => {
            const daBase = i >= VARIAVEIS_DA_CONVERSA.length;
            return (
              /* Quem anima é a div; o botão por dentro é comum, porque
                 `onDragStart` de HTML e o do framer-motion são coisas
                 diferentes com o mesmo nome, e num `motion.button` ganha o do
                 framer, que não tem `dataTransfer`. */
              <motion.div
                key={v.marca} layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ ...MOLA, delay: Math.min(i * 0.02, 0.15) }}
                className="min-w-0 max-w-full">
                <button
                  type="button" draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", v.marca);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onInserir(v.marca)}
                  title={v.exemplo ? `Na mensagem vira “${v.exemplo}”` : "Esta coluna está em branco nos últimos leads"}
                  className={cn(
                    "cursor-grab active:cursor-grabbing rounded-md ring-1 px-2 py-1 text-[10.5px] font-medium transition-colors max-w-full truncate",
                    daBase
                      ? "bg-white/[0.05] text-foreground/80 ring-white/[0.12] hover:bg-white/[0.09]"
                      : "bg-primary/[0.10] text-primary ring-primary/25 hover:bg-primary/[0.18]")}>
                  {v.rotulo}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-snug">
        {!temBase
          ? "Escolha a base no gatilho para as colunas dela aparecerem aqui."
          : colunas.length === 0 && !carregando
            ? "Esta base ainda não tem nenhuma linha, então as colunas dela não dão para saber."
            : "Coluna em branco some da frase, junto com a vírgula antes dela. Nunca sai um buraco."}
      </p>
    </div>
  );
}

function InspetorDoPasso({ passo, rotulo, colunas, carregandoColunas, temBase, onTrocar, onRemover }: {
  passo: Passo; rotulo: string;
  colunas: ColunaDaBase[]; carregandoColunas: boolean; temBase: boolean;
  onTrocar: (m: Partial<Passo>) => void; onRemover: () => void;
}) {
  const def = defDoPasso(passo.tipo);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const inserirVariavel = (marca: string) => {
    const el = areaRef.current;
    const t = passo.texto ?? "";
    if (!el) { onTrocar({ texto: `${t}${marca}` }); return; }
    const i = el.selectionStart ?? t.length;
    const j = el.selectionEnd ?? i;
    onTrocar({ texto: `${t.slice(0, i)}${marca}${t.slice(j)}` });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(i + marca.length, i + marca.length);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Titulo>{rotulo}</Titulo>
          <p className="text-[12.5px] font-medium -mt-1">{def.rotulo}</p>
        </div>
        <BotaoIcone titulo="Remover passo" perigo onClick={onRemover}>
          <Trash2 className="h-3.5 w-3.5" />
        </BotaoIcone>
      </div>

      {passo.tipo === "mensagem" && (
        <div className="space-y-2">
          <Textarea
            ref={areaRef}
            value={passo.texto ?? ""}
            onChange={(e) => onTrocar({ texto: e.target.value })}
            onDrop={(e) => {
              const marca = e.dataTransfer.getData("text/plain");
              if (marca.startsWith("{")) { e.preventDefault(); inserirVariavel(marca); }
            }}
            rows={7}
            placeholder="Olá {nome}, tudo bem? Vi que você deixou seu contato…"
            className="text-[12px] bg-transparent border-white/[0.08] resize-none leading-relaxed"
          />
          <BandejaDeVariaveis
            colunas={colunas} carregando={carregandoColunas} temBase={temBase}
            onInserir={inserirVariavel}
          />
        </div>
      )}

      {passo.tipo === "se" && (
        <EditorDaCondicao
          condicao={passo.condicao ?? CONDICAO_PADRAO}
          colunas={colunas} carregando={carregandoColunas} temBase={temBase}
          onTrocar={(c) => onTrocar({ condicao: c })}
        />
      )}

      {passo.tipo === "esperar" && (
        <div>
          <Titulo>Quanto tempo</Titulo>
          <div className="flex flex-wrap gap-1 mb-2">
            {[
              { rotulo: "5 min", min: 5 }, { rotulo: "1 hora", min: 60 },
              { rotulo: "1 dia", min: 1440 }, { rotulo: "2 dias", min: 2880 },
              { rotulo: "7 dias", min: 10080 },
            ].map((a) => (
              <button key={a.rotulo} type="button" onClick={() => onTrocar({ minutos: a.min })}
                className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                  Number(passo.minutos) === a.min
                    ? "bg-amber-400/[0.14] text-amber-400 ring-amber-400/30"
                    : "bg-white/[0.04] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.07]")}>
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={1}
              value={passo.minutos ?? 60}
              onChange={(e) => onTrocar({ minutos: Number(e.target.value) })}
              className="h-8 text-[12px] bg-transparent border-white/[0.08] w-24 tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground">
              minutos, ou seja {esperaBonita(Number(passo.minutos ?? 0))}
            </span>
          </div>
        </div>
      )}

      {passo.tipo === "parar_se_respondeu" && (
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          Se o lead escreveu qualquer coisa depois de o fluxo começar, ele sai daqui e não recebe o resto.
          É o que impede alguém que já está conversando com você de continuar levando mensagem de robô.
        </p>
      )}

      {passo.tipo === "mover_etapa" && (
        <div>
          <Titulo>Mover para</Titulo>
          <div className="flex flex-wrap gap-1">
            {etapasOferecidas().map((e) => (
              <button key={e.chave} type="button" onClick={() => onTrocar({ etapa: e.chave })}
                className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                  passo.etapa === e.chave
                    ? "bg-emerald-400/[0.14] text-emerald-400 ring-emerald-400/30"
                    : "bg-white/[0.04] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.07]")}>
                {e.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {passo.tipo === "tarefa" && (
        <div className="space-y-2">
          <div>
            <Titulo>O que fazer</Titulo>
            <Input
              value={passo.titulo ?? ""}
              onChange={(e) => onTrocar({ titulo: e.target.value })}
              placeholder="Ligar para o lead"
              className="h-8 text-[12px] bg-transparent border-white/[0.08]"
            />
          </div>
          <div>
            <Titulo>Para quando</Titulo>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={365}
                value={passo.dias ?? 1}
                onChange={(e) => onTrocar({ dias: Number(e.target.value) })}
                className="h-8 text-[12px] bg-transparent border-white/[0.08] w-20 tabular-nums"
              />
              <span className="text-[11px] text-muted-foreground">
                dia(s) depois, ou seja {Number(passo.dias ?? 0) <= 0 ? "hoje" : Number(passo.dias) === 1 ? "amanhã" : `em ${passo.dias} dias`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A PERGUNTA DO "SE".
 *
 * Três perguntas, e a primeira é a que motivou tudo: "o lead já nos escreveu?".
 * O lead preenche o formulário, o formulário dá o WhatsApp do escritório, e ele
 * manda mensagem antes de o robô rodar. Responder a esse com a primeira
 * mensagem, como se ele nunca tivesse falado, é o que a fila reta fazia.
 *
 * A comparação por coluna usa a MESMA bandeja da mensagem: as colunas vêm da
 * base escolhida no gatilho, com o valor de um lead real no título. Digitar o
 * nome da coluna à mão também funciona, para quem sabe o que quer.
 */
function EditorDaCondicao({ condicao, colunas, carregando, temBase, onTrocar }: {
  condicao: Condicao; colunas: ColunaDaBase[]; carregando: boolean; temBase: boolean;
  onTrocar: (c: Condicao) => void;
}) {
  const tipo = condicao.tipo ?? "ja_escreveu";
  const op = (condicao.op ?? "contem") as Operador;
  const exemplo = colunas.find((c) => c.coluna === (condicao.campo || "").trim())?.exemplo ?? null;

  return (
    <div className="space-y-3">
      <div>
        <Titulo>A pergunta</Titulo>
        <div className="grid gap-1">
          {CONDICOES_DEF.map((c, i) => {
            const eu = c.chave === tipo;
            return (
              <motion.div key={c.chave} layout
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOLA, delay: i * 0.04 }}>
                <button type="button"
                  onClick={() => onTrocar(
                    c.chave === "campo"
                      ? { tipo: "campo", campo: condicao.campo ?? "", op, valor: condicao.valor ?? "" }
                      : { tipo: c.chave as TipoDeCondicao })}
                  className={cn("w-full rounded-lg px-2 py-1.5 text-left ring-1 transition-colors",
                    eu ? "ring-violet-400/35 bg-violet-400/[0.08]" : "ring-transparent hover:bg-white/[0.05]")}>
                  <span className="block text-[11.5px] font-medium">{c.rotulo}</span>
                  <span className="block text-[10px] text-muted-foreground leading-snug">{c.descricao}</span>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {tipo === "campo" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={MOLA}
            className="overflow-hidden">
            <div className="space-y-2 pt-0.5">
              <div>
                <Titulo>Qual coluna</Titulo>
                <Input
                  value={condicao.campo ?? ""}
                  onChange={(e) => onTrocar({ ...condicao, tipo: "campo", campo: e.target.value })}
                  placeholder="Funcionários"
                  className="h-8 text-[12px] bg-transparent border-white/[0.08]"
                />
                <div className="pt-1.5">
                  <BandejaDeVariaveis
                    colunas={colunas} carregando={carregando} temBase={temBase}
                    onInserir={(marca) => onTrocar({
                      ...condicao, tipo: "campo", campo: marca.replace(/^\{|\}$/g, ""),
                    })}
                  />
                </div>
              </div>

              <div>
                <Titulo>Como comparar</Titulo>
                <div className="flex flex-wrap gap-1">
                  {OPERADORES.map((o) => (
                    <button key={o} type="button"
                      onClick={() => onTrocar({ ...condicao, tipo: "campo", op: o })}
                      className={cn("rounded-full px-2 py-1 text-[10.5px] ring-1 transition-colors",
                        op === o ? "bg-violet-400/[0.14] text-violet-400 ring-violet-400/30"
                                 : "bg-white/[0.04] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.07]")}>
                      {ROTULO_OPERADOR[o]}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {operadorPrecisaDeValor(op) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={MOLA}
                    className="overflow-hidden">
                    <Titulo>Com o quê</Titulo>
                    <Input
                      value={condicao.valor ?? ""}
                      onChange={(e) => onTrocar({ ...condicao, tipo: "campo", valor: e.target.value })}
                      placeholder={exemplo || "50"}
                      className="h-8 text-[12px] bg-transparent border-white/[0.08]"
                    />
                    <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
                      {exemplo
                        ? `Não diferencia maiúscula. Um lead desta base tem “${exemplo}” aqui.`
                        : "Não diferencia maiúscula."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-1 border-t border-white/[0.06]">
        <p className="text-[10.5px] text-muted-foreground leading-relaxed">
          O fluxo lê <span className="text-violet-400/90">{fraseDaCondicao(condicao)}</span> e segue por
          um lado só. O outro não acontece.
        </p>
      </div>
    </div>
  );
}

/**
 * TESTAR AGORA: o fluxo inteiro, num número que você escolhe.
 *
 * Existe por causa de um silêncio. O primeiro teste de uma automação foi assim:
 * o lead entrou na planilha às 16:19:41, a automação foi ligada às 16:20:21, e
 * nada aconteceu — a trava de "só vale daqui pra frente" barrou por quarenta
 * segundos de diferença. A trava está certa (ligar um fluxo na base do Bradesco
 * dispararia 692 mensagens), mas ela não tem como saber que aquilo era um teste.
 *
 * O aviso de que a mensagem SAI DE VERDADE está em letra grande de propósito:
 * "testar" em quase todo sistema quer dizer simular, e aqui não quer.
 */
function DialogDoTeste({
  aberto, onOpenChange, nome, nomeDoNumero, telefone, onTrocarTelefone,
  mensagens, ocupado, onDisparar,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  nome: string;
  nomeDoNumero: string;
  telefone: string;
  onTrocarTelefone: (v: string) => void;
  mensagens: number;
  ocupado: boolean;
  onDisparar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!ocupado) onOpenChange(a); }}>
      <DialogContent className="max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <Play className="h-4 w-4" /> Testar “{nome}”
          </DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            O fluxo roda inteiro no número que você digitar, agora, saindo por{" "}
            <span className="text-foreground/80">{nomeDoNumero}</span>.
          </DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">WhatsApp de destino</span>
          <Input
            value={telefone}
            onChange={(e) => onTrocarTelefone(e.target.value)}
            placeholder="92 99999 9999"
            inputMode="tel"
            className="h-9 text-[13px] tabular-nums"
          />
        </label>

        <div className="rounded-lg ring-1 ring-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[12px] font-medium flex items-center gap-1.5">
            <Pendente /> A mensagem sai de verdade
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-1">
            {mensagens === 1
              ? "Uma mensagem vai chegar nesse WhatsApp"
              : `${mensagens} mensagens vão chegar nesse WhatsApp`}
            , como o lead receberia. O teste não espera o horário de atendimento e
            não precisa que o fluxo esteja ligado.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onDisparar} disabled={ocupado || telefone.replace(/\D/g, "").length < 10}>
            {ocupado
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Disparando…</>
              : <><Play className="h-3.5 w-3.5 mr-1.5" /> Rodar o fluxo</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════ execuções ═════════════════════════════════════════════ */

const TOM_DO_STATUS: Record<string, string> = {
  concluida: "text-emerald-400 ring-emerald-400/25 bg-emerald-400/[0.10]",
  falhou:    "text-rose-400 ring-rose-400/25 bg-rose-400/[0.10]",
  parada:    "text-sky-400 ring-sky-400/25 bg-sky-400/[0.10]",
  pendente:  "text-amber-400 ring-amber-400/25 bg-amber-400/[0.10]",
  rodando:   "text-primary ring-primary/25 bg-primary/[0.10]",
};

function Execucoes({ automacaoId, aoVivo, ligadaEm }: {
  automacaoId: string;
  aoVivo: boolean;
  /** quando o fluxo foi ligado; nulo quando está desligado */
  ligadaEm: string | null;
}) {
  const { data: execs = [], isLoading } = useExecucoes(automacaoId, aoVivo);

  if (isLoading) {
    return (
      <div className="flex-1 grid place-items-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (execs.length === 0) {
    /* VAZIO PRECISA DIZER POR QUÊ. Lista vazia é indistinguível de coisa
       quebrada, e neste caso o motivo quase sempre é a trava do "só vale daqui
       pra frente": quem ligou o fluxo depois de o lead entrar fica olhando uma
       tela em branco sem nenhuma pista. */
    return (
      <div className="flex-1 px-5 py-10 text-center">
        <p className="text-[12.5px] font-medium">Ninguém passou por este fluxo ainda.</p>
        {ligadaEm ? (
          <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-2 max-w-sm mx-auto">
            Ele vale para o que acontecer depois de{" "}
            <span className="text-foreground/80">
              {new Date(ligadaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            , quando foi ligado. Quem já estava na base antes disso não entra, de propósito.
            Para ver o fluxo funcionando agora, use o botão Testar agora.
          </p>
        ) : (
          <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-2 max-w-sm mx-auto">
            Este fluxo está desligado, então nada dispara sozinho. O botão Testar agora roda
            ele mesmo assim, num número que você escolher.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2.5 space-y-1.5">
      <AnimatePresence initial={false}>
        {execs.map((e, i) => (
          <motion.div
            key={e.id} layout
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ ...MOLA, delay: Math.min(i * 0.02, 0.2) }}
            className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium truncate min-w-0">
                {e.nome_do_lead || e.telefone || "lead sem nome"}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {e.teste && (
                  <span className="rounded-full px-1.5 py-[1px] text-[9.5px] ring-1 ring-white/[0.12] bg-white/[0.05] text-muted-foreground">
                    teste
                  </span>
                )}
                <span className={cn("rounded-full px-1.5 py-[1px] text-[9.5px] ring-1", TOM_DO_STATUS[e.status])}>
                  {ROTULO_STATUS[e.status]}
                </span>
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              {new Date(e.disparada_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {e.detalhe ? ` · ${e.detalhe}` : ""}
            </p>
            {e.erro && (
              <p className="text-[10px] text-rose-400/90 leading-snug mt-1">{e.erro}</p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
