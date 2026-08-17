import { Check, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PessoaOpt { id: string; nome: string | null; email: string | null }

const iniciais = (p: PessoaOpt) =>
  (p.nome || p.email || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();

const primeiroNome = (p: PessoaOpt) => (p.nome || p.email || "?").trim().split(/\s+/)[0];

// Seleção de pessoas em chips. Substitui o <select> nativo, que no tema escuro
// abre com a lista pintada pelo sistema operacional: fundo branco e texto
// quase invisível. Aqui tudo é DOM, então o tema vale, e dá pra marcar vários.
export function SeletorPessoas({
  pessoas, selecionados, onToggle, vazio = "Ninguém ainda",
}: {
  pessoas: PessoaOpt[];
  selecionados: string[];
  onToggle: (id: string) => void;
  vazio?: string;
}) {
  if (!pessoas.length) {
    return <p className="text-[12px] text-muted-foreground py-2">{vazio}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {pessoas.map((p) => {
        const on = selecionados.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            title={p.nome || p.email || ""}
            className={cn(
              "inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 ring-1 transition-all duration-200",
              on
                ? "bg-primary/15 ring-primary/40 text-foreground"
                : "bg-white/[0.03] ring-white/[0.08] text-muted-foreground hover:bg-white/[0.06]",
            )}
          >
            <span className={cn(
              "h-6 w-6 rounded-full grid place-items-center text-[10px] font-semibold shrink-0",
              on ? "bg-primary text-primary-foreground" : "bg-white/[0.06]",
            )}>
              {on ? <Check className="h-3 w-3" /> : iniciais(p)}
            </span>
            <span className="text-[12px] whitespace-nowrap">{primeiroNome(p)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Pilha de avatares pra mostrar os envolvidos em cards e cabeçalhos.
export function AvataresPessoas({ pessoas, max = 4 }: { pessoas: PessoaOpt[]; max?: number }) {
  if (!pessoas.length) return null;
  const mostra = pessoas.slice(0, max);
  const resto = pessoas.length - mostra.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {mostra.map((p) => (
        <span key={p.id} title={p.nome || p.email || ""}
          className="h-6 w-6 rounded-full grid place-items-center text-[9px] font-semibold bg-primary/20 text-primary ring-2 ring-background">
          {iniciais(p)}
        </span>
      ))}
      {resto > 0 && (
        <span className="h-6 w-6 rounded-full grid place-items-center text-[9px] font-semibold bg-white/[0.08] text-muted-foreground ring-2 ring-background">
          +{resto}
        </span>
      )}
    </div>
  );
}

export { iniciais as iniciaisPessoa, primeiroNome as primeiroNomePessoa };
export const IconePessoa = User;
