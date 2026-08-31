// A marca da instituição na linha do lançamento.
//
// Cada conta guarda um slug (`balance_contas.banco`) e aqui ele vira desenho.
// São marcas desenhadas em SVG nas cores da instituição — aproximações, não os
// arquivos oficiais: servem pra bater o olho e saber por qual banco o dinheiro
// passou. Se um dia entrar o asset oficial, é só trocar o corpo do case.
//
// Slug desconhecido não quebra nada: cai no genérico, que é um quadradinho com
// a inicial da conta.

import { cn } from "@/lib/utils";

const TAM = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" } as const;

export function LogoBanco({
  banco,
  nome,
  tamanho = "sm",
  className,
}: {
  banco?: string | null;
  nome?: string | null;
  tamanho?: keyof typeof TAM;
  className?: string;
}) {
  const base = cn(TAM[tamanho], "rounded-[4px] shrink-0", className);

  switch ((banco || "").toLowerCase()) {
    case "caixa":
      // Azul e laranja da Caixa, com o corte diagonal que a marca tem.
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Caixa Econômica Federal">
          <rect width="24" height="24" rx="5" fill="#0070AF" />
          <path d="M4 15.5 12.5 4h5.2L9.2 15.5H4Z" fill="#fff" fillOpacity=".92" />
          <path d="M9.6 20 18.1 8.5h2.3L11.9 20H9.6Z" fill="#F7941E" />
        </svg>
      );
    case "itau":
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Itaú">
          <rect width="24" height="24" rx="5" fill="#EC7000" />
          <rect x="9.6" y="6" width="4.8" height="12" rx="2.4" fill="#004990" />
        </svg>
      );
    case "bb":
    case "banco-do-brasil":
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Banco do Brasil">
          <rect width="24" height="24" rx="5" fill="#FAE128" />
          <path d="M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Zm0 4L8.5 12l3.5 3.5L15.5 12 12 8.5Z" fill="#0038A8" />
        </svg>
      );
    case "bradesco":
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Bradesco">
          <rect width="24" height="24" rx="5" fill="#CC092F" />
          <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="2.2" />
        </svg>
      );
    case "nubank":
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Nubank">
          <rect width="24" height="24" rx="5" fill="#820AD1" />
          <path d="M7.5 17V9.2c0-1.6 2-2.3 3-1l5 6.6c1 1.3 3 .6 3-1V7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "especie":
    case "dinheiro":
      return (
        <svg viewBox="0 0 24 24" className={base} role="img" aria-label="Espécie">
          <rect width="24" height="24" rx="5" fill="#16A34A" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      );
    default:
      return (
        <span
          className={cn(base, "grid place-items-center bg-white/[0.08] text-[9px] font-bold text-muted-foreground")}
          aria-label={nome || "conta"}
        >
          {(nome || "?").trim().charAt(0).toUpperCase()}
        </span>
      );
  }
}
