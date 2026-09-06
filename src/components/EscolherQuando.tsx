/* ESCOLHER DIA E HORA — sem os controles do sistema operacional.
 *
 * O `<input type="date">` e o `<input type="time">` do navegador funcionam, e
 * é só isso que se pode dizer deles: cada sistema desenha o seu, com a cor, a
 * fonte e o idioma dele. No meio de uma tela escura e cheia de decisões de
 * desenho, o calendário branco do Windows aparecia como um pedaço de outro
 * programa colado ali — e o campo de hora era digitação pura, onde errar um
 * dígito é agendar para outra hora sem perceber.
 *
 * Os dois viram botões que abrem um painel nosso.
 *
 * A HORA NÃO SE DIGITA, SE ESCOLHE. Duas colunas que rolam, hora e minuto, com
 * o valor escolhido em destaque — o mesmo gesto do relógio do celular. As
 * vinte e quatro horas e os sessenta minutos, todos, sem grade e sem atalho de
 * "manhã/tarde": quem precisa das 14h37 tem que poder marcar 14h37, e quem
 * quer 14h00 já chega lá em dois cliques sem precisar de um botão só pra isso.
 */
import { useMemo, useRef, useEffect, useState } from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-09-07" → Date local, sem o pulo de fuso do `new Date("...")`. */
export function diaDoISO(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

export function isoDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * O rótulo do botão do dia.
 *
 * "Hoje" e "amanhã" vêm por extenso porque é assim que a pessoa pensa, e a data
 * vem junto porque é o que ela vai conferir. Só uma das duas seria pior: a
 * palavra sozinha esconde o dia, o número sozinho obriga a contar.
 */
export function rotuloDoDia(iso: string, hojeISO: string): string {
  if (!iso) return "escolher dia";
  const d = diaDoISO(iso);
  const curto = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hoje = diaDoISO(hojeISO);
  const diff = Math.round((d.getTime() - hoje.getTime()) / 86400000);
  if (diff === 0) return `hoje, ${curto}`;
  if (diff === 1) return `amanhã, ${curto}`;
  if (diff === -1) return `ontem, ${curto}`;
  return `${DIAS[d.getDay()]}, ${curto}`;
}

export function SeletorDeDia({ valor, onEscolher, hojeISO, className }: {
  valor: string;
  onEscolher: (iso: string) => void;
  hojeISO: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-9 w-full flex items-center gap-2 rounded-md px-2.5 text-[13px] text-left",
            "ring-1 ring-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] transition-colors",
            aberto && "ring-primary/50",
            className,
          )}>
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{rotuloDoDia(valor, hojeISO)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex gap-1 p-2 pb-0">
          {[["Hoje", 0], ["Amanhã", 1], ["Em 7 dias", 7]].map(([rot, n]) => (
            <button key={rot as string} type="button"
              onClick={() => {
                const d = diaDoISO(hojeISO);
                d.setDate(d.getDate() + (n as number));
                onEscolher(isoDoDia(d));
                setAberto(false);
              }}
              className="flex-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground
                         hover:text-foreground hover:bg-white/[0.06] transition-colors">
              {rot as string}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={valor ? diaDoISO(valor) : undefined}
          defaultMonth={valor ? diaDoISO(valor) : diaDoISO(hojeISO)}
          onSelect={(d) => { if (d) { onEscolher(isoDoDia(d)); setAberto(false); } }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── A HORA ───────────────────────────────────────────────────────────────
   As vinte e quatro horas e os sessenta minutos, sem grade e sem atalho. A
   versão anterior tinha as duas coisas — minuto de cinco em cinco e botões de
   "manhã / tarde" — e as duas partiam do mesmo palpite errado: o de que dá pra
   adivinhar quais horários alguém vai querer. Quem precisa das 14h37 não podia
   escolher, e quem queria 14h00 ganhava um atalho que já estava a dois cliques
   de distância.
   A coluna começa no valor atual e rola: sessenta linhas não são uma caçada
   quando a que interessa já está no meio da tela. */
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function Coluna({ itens, valor, onEscolher, rotulo }: {
  itens: string[]; valor: string; onEscolher: (v: string) => void; rotulo: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  /* O valor atual nasce VISÍVEL. Sem isto, abrir às 17h mostra a lista no zero
     e parece que nada está escolhido — a pessoa rola procurando o próprio
     horário que já estava selecionado.

     A conta é feita à mão em vez de `scrollIntoView` porque aquilo rola TODOS
     os ancestrais roláveis pra deixar o elemento visível, e não só esta coluna
     — foi exatamente esse comportamento que fazia a conversa dar um pulo
     quando chegava mensagem. Dentro de um popover, o estrago seria a página
     inteira se mexer ao abrir o relógio. */
  useEffect(() => {
    const cx = caixa.current;
    const el = cx?.querySelector<HTMLElement>("[data-atual='1']");
    if (!cx || !el) return;
    cx.scrollTop = el.offsetTop - cx.clientHeight / 2 + el.offsetHeight / 2;
  }, [valor]);

  /* A RODA DO MOUSE PRECISA ROLAR ESTA COLUNA.
     Só a barra funcionava, e o motivo não está aqui: este seletor abre dentro
     de um diálogo, e o diálogo do Radix trava a rolagem da página inteira
     enquanto está aberto (`react-remove-scroll`). A trava é feita cancelando
     eventos de roda que não venham de dentro do conteúdo do diálogo — e o
     popover, que é renderizado num portal separado, cai justamente do lado de
     fora dessa permissão. Rolar com o mouse virava um evento cancelado.

     Então a coluna trata a roda ela mesma, antes de qualquer um: converte o
     movimento em `scrollTop` e para o evento ali. `passive: false` é o que
     permite o `preventDefault` — sem isso o navegador ignora o pedido e a
     página se mexeria junto. */
  useEffect(() => {
    const cx = caixa.current;
    if (!cx) return;
    const naRoda = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cx.scrollTop += e.deltaY;
    };
    cx.addEventListener("wheel", naRoda, { passive: false });
    return () => cx.removeEventListener("wheel", naRoda);
  }, []);

  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 text-center pb-1">
        {rotulo}
      </span>

      {/* A LISTA PRECISA PARECER UMA LISTA.
          Ela sempre teve as vinte e quatro horas, mas abria centrada no valor
          atual, mostrava cinco linhas e a barra de rolagem some no tema escuro
          — então parecia que só existiam aquelas cinco. O conteúdo estava
          certo e a tela mentia sobre ele, que é o pior tipo de defeito porque
          ninguém procura a causa: acredita.

          Três coisas resolvem, e as três dizem a mesma coisa por meios
          diferentes: mais linhas visíveis (nove em vez de cinco), o desbotado
          nas duas pontas mostrando que o conteúdo atravessa a borda, e a barra
          de rolagem visível de verdade. */}
      <div className="relative">
        <div ref={caixa}
          className="h-[15rem] w-16 overflow-y-scroll flex flex-col gap-0.5 px-1
                     [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent]
                     [&::-webkit-scrollbar]:w-1.5
                     [&::-webkit-scrollbar-thumb]:rounded-full
                     [&::-webkit-scrollbar-thumb]:bg-muted-foreground/35
                     [&::-webkit-scrollbar-track]:bg-transparent">
          {/* Um respiro em cima e embaixo pra que a PRIMEIRA e a ÚLTIMA linha
              também possam ficar no meio da caixa quando escolhidas — sem ele,
              00 e 23 nunca centralizam e a rolagem parece travar antes do fim. */}
          <span aria-hidden className="shrink-0 h-16" />
          {itens.map((i) => (
            <button key={i} type="button" data-atual={i === valor ? "1" : undefined}
              onClick={() => onEscolher(i)}
              className={cn(
                "shrink-0 rounded-md py-1 text-[13px] tabular-nums transition-colors",
                i === valor
                  ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
              )}>
              {i}
            </button>
          ))}
          <span aria-hidden className="shrink-0 h-16" />
        </div>

        {/* O desbotado das pontas. `pointer-events-none` porque ele cobre
            botões clicáveis: sem isso, a primeira e a última linha visíveis
            deixariam de responder ao clique. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-8
                                     bg-gradient-to-b from-popover to-transparent" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8
                                     bg-gradient-to-t from-popover to-transparent" />
      </div>
    </div>
  );
}

export function SeletorDeHora({ valor, onEscolher, opcional = true, className }: {
  /** "HH:MM" ou vazio */
  valor: string;
  onEscolher: (hhmm: string) => void;
  /** deixa limpar a hora — lembrete sem hora é o dia inteiro */
  opcional?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [h, m] = useMemo(() => {
    const p = (valor || "").split(":");
    return [p[0] || "09", p[1] || "00"];
  }, [valor]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-9 w-full flex items-center gap-2 rounded-md px-2.5 text-[13px] text-left",
            "ring-1 ring-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] transition-colors",
            aberto && "ring-primary/50",
            className,
          )}>
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn("truncate tabular-nums", !valor && "text-muted-foreground")}>
            {valor || "sem hora"}
          </span>
          {valor && opcional && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onEscolher(""); }}
              title="Tirar a hora"
              className="ml-auto shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors">
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex gap-1">
          <Coluna itens={HORAS} valor={h} rotulo="hora"
            onEscolher={(nova) => onEscolher(`${nova}:${m}`)} />
          <span className="self-center text-muted-foreground/40 text-[13px] pt-4">:</span>
          <Coluna itens={MINUTOS} valor={m} rotulo="min"
            onEscolher={(novo) => onEscolher(`${h}:${novo}`)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
