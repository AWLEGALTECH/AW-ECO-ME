// Retrato do usuário: a foto quando existe, e um monograma quando não existe.
//
// O monograma não é um placeholder cinza. Ele deriva a cor do próprio nome, de
// forma estável, então cada pessoa tem sempre a mesma cor e o olho aprende a
// reconhecer quem é antes de ler. Numa equipe de cinco isso é o suficiente para
// o card grande funcionar sem foto nenhuma.

// Hash estável do nome -> matiz. Qualquer função determinística serve; o que
// importa é que a mesma pessoa nunca troque de cor entre uma carga e outra.
function matiz(semente: string): number {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) % 360;
  return h;
}

/** Duas iniciais: primeiro e último nome. "Luan Ásaf Lima Fernandes" -> LF. */
export function iniciais(nome?: string | null, email?: string | null): string {
  const limpo = (nome ?? "").trim();
  if (limpo) {
    const partes = limpo.split(/\s+/).filter((p) => p.length > 1);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    if (partes.length > 1) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? e.slice(0, 2).toUpperCase() : "?";
}

const TAMANHOS = {
  sm: { box: "h-9 w-9 rounded-lg", txt: "text-[11px]" },
  md: { box: "h-12 w-12 rounded-xl", txt: "text-sm" },
  lg: { box: "h-20 w-20 rounded-2xl", txt: "text-xl" },
  xl: { box: "w-full aspect-[4/3] rounded-xl", txt: "text-4xl" },
} as const;

export function AvatarUsuario({
  nome, email, avatarUrl, tamanho = "md", className = "",
}: {
  nome?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const t = TAMANHOS[tamanho];
  const h = matiz(nome || email || "?");
  const temFoto = !!(avatarUrl && avatarUrl.trim());

  return (
    <div
      className={`${t.box} ${className} relative overflow-hidden shrink-0 grid place-items-center ring-1 ring-white/10`}
      style={temFoto ? undefined : {
        background: `linear-gradient(145deg, hsl(${h} 55% 32%) 0%, hsl(${(h + 40) % 360} 50% 18%) 100%)`,
      }}
    >
      {temFoto ? (
        <img src={avatarUrl!} alt={nome || email || "usuário"} className="h-full w-full object-cover" />
      ) : (
        <span
          className={`${t.txt} font-display font-medium tracking-wide select-none`}
          style={{ color: `hsl(${h} 70% 88%)` }}
        >
          {iniciais(nome, email)}
        </span>
      )}
    </div>
  );
}
