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
 * o valor escolhido em destaque — o mesmo gesto do relógio do celular. Digitar
 * é rápido pra quem já sabe a hora exata; escolher é seguro pra todo mundo, e
 * quem sabe a hora exata continua chegando lá em dois cliques.
 *
 * ATALHOS ANTES DA ROLAGEM. "Agora", "daqui a 1h", "amanhã de manhã": quase
 * todo agendamento de atendimento cai num punhado de horários repetidos, e
 * obrigar a rolar até 14 quando o que se quer é "de tarde" é trabalho à toa.
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
   Minutos de cinco em cinco. Sessenta linhas por coluna transformariam a
   escolha numa caçada, e ninguém marca cobrança para as 14h37. Quem precisar
   de um minuto exato ainda pode digitar no campo. */
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function Coluna({ itens, valor, onEscolher, rotulo }: {
  itens: string[]; valor: string; onEscolher: (v: string) => void; rotulo: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  /* O valor atual nasce VISÍVEL. Sem isto, abrir às 17h mostra a lista no zero
     e parece que nada está escolhido — a pessoa rola procurando o próprio
     horário que já estava selecionado. */
  useEffect(() => {
    const el = caixa.current?.querySelector<HTMLElement>("[data-atual='1']");
    el?.scrollIntoView({ block: "center" });
  }, [valor]);

  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 text-center pb-1">
        {rotulo}
      </span>
      <div ref={caixa} className="h-[9.5rem] w-14 overflow-y-auto scrollbar-thin flex flex-col gap-0.5 px-1">
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
    return [p[0] || "09", (p[1] || "00")];
  }, [valor]);

  /* O minuto digitado fora da grade (14:37, vindo de um agendamento antigo)
     não pode sumir da coluna, senão a tela mostraria 14:35 para uma hora que
     na verdade é 14:37. */
  const minutos = MINUTOS.includes(m) ? MINUTOS : [...MINUTOS, m].sort();

  const atalhos: Array<[string, string]> = [
    ["Manhã", "09:00"], ["Meio-dia", "12:00"], ["Tarde", "14:00"], ["Fim do dia", "17:00"],
  ];

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
        <div className="flex gap-1 pb-2">
          {atalhos.map(([rot, hh]) => (
            <button key={rot} type="button"
              onClick={() => { onEscolher(hh); setAberto(false); }}
              className={cn("rounded-md px-2 py-1 text-[11px] transition-colors",
                valor === hh
                  ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]")}>
              {rot}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border-t border-white/[0.06] pt-2">
          <Coluna itens={HORAS} valor={h} rotulo="hora"
            onEscolher={(nova) => onEscolher(`${nova}:${m}`)} />
          <span className="self-center text-muted-foreground/40 text-[13px] pt-4">:</span>
          <Coluna itens={minutos} valor={m} rotulo="min"
            onEscolher={(novo) => onEscolher(`${h}:${novo}`)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
