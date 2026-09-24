import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import coresDoTailwind from "tailwindcss/colors";

/* ═══ BRANCO E PRETO QUE OBEDECEM AO TEMA ═══
 *
 * O sistema nasceu escuro, e o escuro foi escrito à mão: são mais de mil
 * `bg-white/[0.03]`, `border-white/[0.08]`, `ring-white/10` e `bg-black/40`
 * espalhados pelas telas, cada um querendo dizer "um tico mais claro que o
 * fundo" ou "um poço mais fundo que o fundo". Num tema branco, branco sobre
 * branco some e preto a 40% vira mancha.
 *
 * Em vez de editar mil classes, a COR de cada uma passa a vir de variável. Nos
 * temas escuros as variáveis valem exatamente o que a classe sempre valeu
 * (branco é 255 255 255, o fator é 1, o teto é 1), então nada muda lá. No tema
 * branco (`[data-theme="branco"]` no index.css):
 *   - o "branco" das sobreposições vira PRETO: o que era um véu claro sobre o
 *     preto vira um véu cinza sobre o branco, que é o mesmo gesto do avesso;
 *   - contorno ganha um fator a mais e um teto, porque uma borda a 6% some no
 *     branco e uma a 70% vira traço de caneta;
 *   - o preto encolhe numa curva: poço (20%) quase some, e véu de diálogo
 *     (80%) continua escurecendo o bastante para separar o que está na frente.
 *
 * TEXTO FICA DE FORA de propósito: `text-white` quase sempre está sobre um
 * preenchimento colorido (botão, selo), e ali branco é branco em qualquer tema.
 */
const BRANCO = (k: string, teto: string) =>
  `rgb(var(--aw-branco) / min(calc(<alpha-value> * var(${k})), var(${teto})))`;
const PRETO =
  "rgb(var(--aw-preto) / calc(<alpha-value> * (var(--aw-preto-p) + var(--aw-preto-q) * <alpha-value>)))";

const FUNDO = { white: BRANCO("--aw-branco-k", "--aw-branco-teto"), black: PRETO };
const CONTORNO = { white: BRANCO("--aw-branco-kc", "--aw-branco-teto-c"), black: PRETO };

/* ═══ TEXTO COLORIDO CLARO, QUE ESCURECE NO BRANCO ═══
 *
 * `text-emerald-400`, `text-amber-300` e parentes são o jeito da casa de dizer
 * "deu certo", "atenção", "atrasado". Foram escolhidos para brilhar sobre o
 * preto; sobre o branco, âmbar 300 é ilegível. Cada tom de 50 a 500 vira uma
 * variável: no escuro ela vale o próprio tom, no branco vale o tom escuro da
 * mesma cor (700, ou 800 para os quase brancos). A cor continua dizendo a
 * mesma coisa, só que agora dá para ler. */
const MATIZES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
  "slate", "gray", "zinc", "neutral", "stone",
] as const;
const TONS_CLAROS = ["50", "100", "200", "300", "400", "500"] as const;
/* amarelos e verdes-limão só ficam legíveis no branco a partir do 700 */
const CLARINHOS = new Set(["amber", "yellow", "lime", "orange"]);
function tomNoBranco(matiz: string, tom: string): string {
  if (tom === "500") return CLARINHOS.has(matiz) ? "700" : "600";
  if (tom === "300" || tom === "400") return "700";
  return "800";
}
function rgbDe(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}
const paleta = coresDoTailwind as unknown as Record<string, Record<string, string>>;
const TEXTO_CLARO: Record<string, Record<string, string>> = {};
const VARS_ESCURO: Record<string, string> = {};
const VARS_BRANCO: Record<string, string> = {};
for (const m of MATIZES) {
  TEXTO_CLARO[m] = {};
  for (const t of TONS_CLAROS) {
    const nome = `--aw-tx-${m}-${t}`;
    TEXTO_CLARO[m][t] = `rgb(var(${nome}) / <alpha-value>)`;
    VARS_ESCURO[nome] = rgbDe(paleta[m][t]);
    VARS_BRANCO[nome] = rgbDe(paleta[m][tomNoBranco(m, t)]);
  }
}
const textoQueEscurece = plugin(({ addBase }) => {
  addBase({
    ":root": VARS_ESCURO,
    '[data-theme="branco"]': VARS_BRANCO,
    /* o que precisa continuar escuro no tema branco (o visor de foto e vídeo,
       por exemplo) volta a ter o texto claro por dentro */
    '[data-theme="branco"] [data-sempre-escuro]': VARS_ESCURO,
  });
});

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    fontFamily: {
      sans:    ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      body:    ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      display: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      serif:   ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      mono:    ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
    },
    extend: {
      backgroundColor: FUNDO,
      gradientColorStops: FUNDO,
      fill: FUNDO,
      borderColor: CONTORNO,
      ringColor: CONTORNO,
      divideColor: CONTORNO,
      outlineColor: CONTORNO,
      stroke: CONTORNO,
      textColor: TEXTO_CLARO,
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        /* Neon accent colors directly available as Tailwind classes */
        neon: {
          purple: "hsl(270 100% 62%)",
          cyan:   "hsl(190 100% 52%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        "neon-purple": "0 0 14px hsla(270,100%,62%,0.35), 0 0 48px hsla(270,100%,62%,0.12)",
        "neon-cyan":   "0 0 14px hsla(190,100%,52%,0.35), 0 0 48px hsla(190,100%,52%,0.10)",
      },
      backgroundImage: {
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)",
        "neon-gradient":  "linear-gradient(135deg, hsl(270,100%,62%), hsl(190,100%,52%))",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "fade-in":        "fade-in 0.4s ease-out",
        shimmer:          "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography"), textoQueEscurece],
} satisfies Config;
