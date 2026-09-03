// O FUNDO RABISCADO DA CONVERSA.
//
// O WhatsApp usa um padrão de desenhinhos atrás das mensagens. Ele funciona por
// um motivo que não é estético: o olho reconhece "aqui é conversa" antes de ler
// qualquer palavra. Fundo chapado não faz isso — parece formulário.
//
// Este é desenhado à mão, não copiado: os rabiscos são do mundo do escritório
// (documento, balança, martelo, moeda, cartão, carimbo, clipe, lupa, telefone,
// relógio, pasta, caneta). Ninguém vai notar o que são, e é essa a intenção —
// textura que se olha sem ler. Um padrão temático que se destaca virou papel de
// parede, e papel de parede compete com o que a pessoa escreveu.
//
// SVG inline em vez de data URI: assim os traços usam `currentColor` e a cor
// segue o tema, no claro e no escuro, sem eu manter dois arquivos. E em vez de
// canvas porque o padrão é estático — canvas aqui só traria retina, resize e
// nenhuma vantagem.
//
// A opacidade é baixíssima de propósito (~4%). Mais que isso e o balão de
// mensagem passa a disputar atenção com o fundo.

export function FundoWhatsapp({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.045] ${className}`}
    >
      <defs>
        {/* 220 de lado, com os desenhos espalhados e girados pra a repetição
            não formar fileira — fileira o olho enxerga, e aí vira grade. */}
        <pattern id="rabiscos-wa" width="220" height="220" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
            {/* documento com linhas */}
            <g transform="translate(18 16) rotate(-8)">
              <path d="M0 0h17l5 5v21H0z" />
              <path d="M17 0v5h5M4 12h13M4 17h13M4 22h8" />
            </g>

            {/* balança */}
            <g transform="translate(96 24) rotate(6)">
              <path d="M11 2v22M2 24h18M2 8h18M2 8l-2 6h4zM20 8l-2 6h4z" />
            </g>

            {/* moeda */}
            <g transform="translate(168 14) rotate(-12)">
              <circle cx="10" cy="10" r="9" />
              <path d="M10 5v10M7.5 7.5h5M7.5 12.5h5" />
            </g>

            {/* clipe de papel */}
            <g transform="translate(56 62) rotate(24)">
              <path d="M14 2 4 12a4 4 0 0 0 6 6l9-9a6 6 0 0 0-9-9L2 8" />
            </g>

            {/* martelo do juiz */}
            <g transform="translate(126 70) rotate(-18)">
              <path d="M2 20h16M4 14l10-10M8 2l6 6M1 11l6 6" />
            </g>

            {/* cartão */}
            <g transform="translate(186 74) rotate(10)">
              <rect x="0" y="2" width="24" height="15" rx="2.5" />
              <path d="M0 7h24M4 12h6" />
            </g>

            {/* carimbo */}
            <g transform="translate(20 112) rotate(-6)">
              <path d="M2 22h18M4 18h14v-3H4zM8 15V8a3 3 0 0 1 6 0v7" />
            </g>

            {/* lupa */}
            <g transform="translate(88 122) rotate(16)">
              <circle cx="9" cy="9" r="7.5" />
              <path d="M14.5 14.5 20 20" />
            </g>

            {/* telefone */}
            <g transform="translate(154 126) rotate(-14)">
              <path d="M3 3c0 9 6 15 15 15l3-3-5-3-2 2c-3-1-6-4-7-7l2-2-3-5z" />
            </g>

            {/* relógio */}
            <g transform="translate(30 168) rotate(8)">
              <circle cx="10" cy="10" r="9" />
              <path d="M10 5v6l4 2" />
            </g>

            {/* pasta */}
            <g transform="translate(100 172) rotate(-10)">
              <path d="M0 4h9l3 3h12v14H0z" />
              <path d="M0 11h24" />
            </g>

            {/* caneta */}
            <g transform="translate(174 168) rotate(28)">
              <path d="M2 20l3-8 12-12 5 5-12 12z" />
              <path d="M5 12l5 5" />
            </g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#rabiscos-wa)" />
    </svg>
  );
}
