/* O AVISO DE QUE ESTA AÇÃO FOI (OU É) UM REAJUIZAMENTO.
 *
 * Existe porque o par de processos conta uma história que nenhum dos dois conta
 * sozinho. Quem abre o ANTIGO precisa saber que ele não morreu, foi
 * reprotocolado, senão cobra um processo extinto ou, pior, manda reajuizar de
 * novo o que já voltou. Quem abre o NOVO precisa saber de onde ele veio, porque
 * o motivo da extinção anterior é exatamente o que não pode se repetir.
 *
 * Fica ACIMA do cabeçalho, e não numa aba lá embaixo, pelo mesmo motivo do
 * aviso de processo pago: é informação que muda o que a pessoa vai fazer nos
 * próximos dez segundos, e informação assim não pode depender de rolagem.
 *
 * As duas direções têm cores diferentes de propósito. O antigo é âmbar (algo
 * terminou aqui, olhe para o lado); o novo é primário (isto está vivo e tem
 * história). Iguais, o olho não distinguiria em qual das duas pontas está.
 */
import { Link } from "react-router-dom";
import { RotateCcw, ArrowRight, ArrowLeft } from "lucide-react";

export interface ProcessoLigado {
  id: string;
  numero_processo: string | null;
  fase_processual?: string | null;
}

function Linha({
  tom, titulo, frase, alvo, rotuloDoLink, seta,
}: {
  tom: "amber" | "primary";
  titulo: string;
  frase: string;
  alvo: ProcessoLigado;
  rotuloDoLink: string;
  seta: "ida" | "volta";
}) {
  const cor = tom === "amber"
    ? { anel: "ring-amber-400/30", fundo: "bg-amber-400/[0.07]", texto: "text-amber-300", icone: "text-amber-400" }
    : { anel: "ring-primary/30", fundo: "bg-primary/[0.07]", texto: "text-primary", icone: "text-primary" };
  const Seta = seta === "ida" ? ArrowRight : ArrowLeft;

  return (
    <div className={`flex items-start gap-3 rounded-xl ring-1 ${cor.anel} ${cor.fundo} px-4 py-3`}>
      <span className={`h-8 w-8 shrink-0 grid place-items-center rounded-lg ring-1 ${cor.anel} ${cor.fundo}`}>
        <RotateCcw className={`h-4 w-4 ${cor.icone}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] uppercase tracking-[0.14em] font-medium ${cor.texto}`}>{titulo}</p>
        <p className="text-[13px] text-foreground/90 mt-0.5 leading-snug">{frase}</p>
        <Link
          to={`/processos/${alvo.id}`}
          className={`mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${cor.texto} hover:underline underline-offset-2`}
        >
          {seta === "volta" && <Seta className="h-3.5 w-3.5 shrink-0" />}
          {/* O número inteiro, sem corte: é o que se copia para consultar no
              tribunal, e um CNJ pela metade não serve para nada. */}
          <span className="font-mono break-all">{alvo.numero_processo || "sem número"}</span>
          {seta === "ida" && <Seta className="h-3.5 w-3.5 shrink-0" />}
        </Link>
        <span className="sr-only">{rotuloDoLink}</span>
      </div>
    </div>
  );
}

/**
 * Os dois lados, quando existirem.
 *
 * `origem` é o processo de onde ESTE veio; `reajuizadoEm` são os que nasceram
 * DESTE. São vários no plural porque a mesma ação pode cair mais de uma vez ao
 * longo dos anos, e esconder o segundo faria a tela mentir justamente no caso
 * em que mais importa não mentir.
 */
export function AvisoReajuizamento({ origem, reajuizadoEm }: {
  origem?: ProcessoLigado | null;
  reajuizadoEm?: ProcessoLigado[];
}) {
  const filhos = reajuizadoEm ?? [];
  if (!origem && filhos.length === 0) return null;

  return (
    <div className="space-y-2">
      {filhos.map((f) => (
        <Linha
          key={f.id}
          tom="amber"
          titulo="Este processo foi reajuizado"
          frase="Foi extinto sem mérito e o pedido voltou para o fórum com número novo. Acompanhe pelo processo novo."
          alvo={f}
          rotuloDoLink="Abrir o processo novo"
          seta="ida"
        />
      ))}
      {origem && (
        <Linha
          tom="primary"
          titulo="Veio de reajuizamento"
          frase="Esta ação é o reprotocolo de um processo extinto sem mérito. Vale conferir por que o anterior caiu."
          alvo={origem}
          rotuloDoLink="Abrir o processo de origem"
          seta="volta"
        />
      )}
    </div>
  );
}
