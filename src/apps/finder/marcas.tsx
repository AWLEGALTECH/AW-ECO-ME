/* AS MARCAS DO FINDER: a logo do Bradesco, a lupa e a órbita que junta as duas.
 *
 * A LOGO DO BRADESCO é vetor (tirado da arte oficial branca, sem fundo) e é
 * desenhada em `currentColor`: fica branca no tema escuro e preta no claro
 * sem arquivo nenhum por tema. O arco e as duas barras são caminhos separados
 * para a animação de detecção desenhar um de cada vez.
 *
 * A ÓRBITA é o desenho do Finder como lobby de análises: a lupa no centro é
 * o Finder, e cada análise é um satélite. Hoje só o Bradesco está em órbita;
 * as vagas tracejadas são as análises que ainda vão entrar. Quando entrar a
 * segunda, ela ocupa uma vaga e o desenho não muda.
 */
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const CURVA = [0.22, 1, 0.36, 1] as const;

const ARCO = "M 543 113.0 C 400.4 126.7, 278.3 213.7, 224.6 339.9 L 219.2 352.4 209.3 356.3 C 165.5 373.4, 109.7 402.0, 100.0 412.4 C 96.5 416.1, 95.9 424.7, 98.9 428.9 C 104.2 436.3, 107.0 436.4, 134.5 429.0 C 180.4 416.6, 202.0 411.6, 203.2 412.8 C 203.8 413.4, 203.7 418.1, 202.9 425.0 C 201.3 439.1, 202.2 480.7, 204.4 496.5 C 209.2 531.3, 221.8 568.2, 239.2 598.5 C 273.7 658.4, 332.1 712.0, 392.4 739.0 C 405.2 744.7, 421.2 736.4, 419.7 724.8 C 419.0 719.6, 416.8 716.5, 411.2 712.6 C 339.2 662.8, 292.3 587.1, 286.0 510.4 C 282.7 471.1, 289.5 424.2, 303.2 391.7 C 305.5 386.2, 304.5 386.6, 328 382.1 C 458.3 356.8, 651.1 374.2, 775 422.4 C 847.4 450.6, 892.5 487.6, 906.6 530.5 C 910.4 541.9, 911.2 565.7, 908.1 577.8 C 902.9 598.3, 891.1 617.3, 869.6 639.7 C 844.4 665.8, 815.9 685.7, 767.1 711.1 C 754.8 717.5, 752.6 720.0, 752.5 727.6 C 752.4 735.0, 756.3 739.1, 764.2 739.7 C 776.7 740.8, 829.1 720.2, 866.5 699.7 C 975.0 640.0, 1019.2 560.1, 988.0 479.8 C 973.6 442.6, 944.0 409.6, 897.8 379.3 C 892.4 375.8, 887.8 373, 887.6 373 C 887.3 373, 883.6 370.9, 879.3 368.3 C 848.3 350.0, 797.4 330.1, 750.9 318.1 C 676.1 298.8, 620.1 291.9, 537.5 292.0 C 471.4 292.0, 440.7 294.5, 347.7 307.7 C 340.9 308.7, 343.1 304.7, 360.6 284.4 C 453.1 177.2, 615.9 141.9, 738.5 202.4 C 764.5 215.3, 777.3 224.1, 798 243.3 C 814.5 258.8, 819.2 260.9, 826.9 257.0 C 832.4 254.2, 834.0 251.5, 833.9 245.0 C 833.9 236.3, 827.0 226.8, 804.0 203.9 C 751.1 151.3, 684.8 121.3, 603.1 113.0 C 591.3 111.8, 555.6 111.8, 543 113.0";
const BARRA_DIR = "M 656.8 659.8 C 652.7 661.9, 642.9 667.2, 635 671.6 C 627.0 676.0, 616.4 681.8, 611.5 684.4 C 606.5 687.1, 598.4 691.6, 593.5 694.4 C 588.5 697.2, 583.2 700.1, 581.8 700.8 C 576.8 703.4, 571.7 708.3, 569.8 712.4 C 568.1 716.3, 568.0 722.2, 568.0 847.8 C 568.0 931.6, 568.3 979.7, 568.9 980.9 C 570.9 984.6, 575.0 985, 618.2 985 C 669.2 985, 671.2 984.6, 675.6 974.1 C 677.2 970.5, 678.7 687.1, 677.3 669.0 C 676.2 654.9, 670.8 652.4, 656.8 659.8";
const BARRA_ESQ = "M 529.7 746.8 C 510.2 757.0, 477.1 775.7, 473.6 778.6 C 465.3 785.2, 465.9 776.8, 465.9 882.9 C 466.0 985.6, 465.7 979.9, 471.6 983.0 C 473.8 984.2, 481.0 984.4, 509.7 984.4 L 545.2 984.4 547.4 981.8 L 549.7 979.1 549.6 861.0 C 549.4 731.8, 549.9 741.0, 543.7 741.0 C 542.3 741.0, 536.0 743.6, 529.7 746.8";

/** A logo do Bradesco. `desenhar` faz o traço aparecer e só então preencher. */
export function LogoBradesco({ className, desenhar = false, atraso = 0 }: {
  className?: string; desenhar?: boolean; atraso?: number;
}) {
  const reduzir = useReducedMotion();
  const anima = desenhar && !reduzir;
  return (
    <svg viewBox="90 100 920 895" className={cn("shrink-0", className)} role="img" aria-label="Bradesco" fill="none">
      {[ARCO, BARRA_DIR, BARRA_ESQ].map((d, i) => (
        <motion.path key={i} d={d} fillRule="evenodd"
          stroke="currentColor" strokeWidth={anima ? 14 : 0} strokeLinejoin="round"
          initial={anima ? { pathLength: 0, fillOpacity: 0 } : false}
          animate={{ pathLength: 1, fillOpacity: 1 }}
          style={{ fill: "currentColor" }}
          transition={{
            pathLength: { duration: 0.7, ease: CURVA, delay: atraso + i * 0.12 },
            fillOpacity: { duration: 0.35, ease: CURVA, delay: atraso + 0.45 + i * 0.12 },
          }}
        />
      ))}
    </svg>
  );
}

/** A logo do Google Drive, nas cores dela (é marca de terceiro: não segue o
 *  tema, como não seguiria em lugar nenhum). Decorativa: sempre vem ao lado
 *  de um texto que diz "Drive". */
export function LogoDrive({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={cn("shrink-0", className)} aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

/** A lupa do Finder, no traço do lucide, com a lente como área própria. */
export function Lupa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </svg>
  );
}

/**
 * A ÓRBITA: lupa no centro, Bradesco num anel que gira devagar, vagas das
 * próximas análises no mesmo anel. `ativa` acelera a leitura do desenho (a
 * lupa cresce) quando há arquivo sendo arrastado por cima.
 */
export function OrbitaDeAnalises({ ativa = false, tamanho = 196, className }: {
  ativa?: boolean; tamanho?: number; className?: string;
}) {
  const r = tamanho / 2;
  const raio = r * 0.78;
  const sat = Math.round(tamanho * 0.2);
  /* Os satélites: o Bradesco e as vagas. O ângulo é o do lugar no anel. */
  const satelites: { angulo: number; tipo: "bradesco" | "vaga" }[] = [
    { angulo: -40, tipo: "bradesco" },
    { angulo: 80, tipo: "vaga" },
    { angulo: 200, tipo: "vaga" },
  ];
  /* O GIRO É CSS, e não do framer. O saguão abre dentro de um
     AnimatePresence com `initial={false}`, que desliga a animação de
     montagem dos filhos: um giro do framer ficava parado na primeira vez que
     o Finder abria e só rodava quando a tela era montada de novo. A animação
     de CSS não passa por isso. `motion-reduce` a desliga para quem pediu. */
  const GIRO = "animate-[spin_48s_linear_infinite] motion-reduce:animate-none";
  const CONTRA = "animate-[spin_48s_linear_infinite_reverse] motion-reduce:animate-none";

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: tamanho, height: tamanho }} aria-hidden>
      {/* anel de fora, parado, só de moldura */}
      <div className="absolute inset-0 rounded-full border border-white/[0.05]" />
      {/* o anel da órbita */}
      <div className={cn("absolute rounded-full border border-dashed border-white/[0.12]", GIRO)}
        style={{ inset: r - raio }}>
        {satelites.map((s, i) => {
          const rad = (s.angulo * Math.PI) / 180;
          const x = raio + raio * Math.cos(rad) - sat / 2;
          const y = raio + raio * Math.sin(rad) - sat / 2;
          return (
            <motion.div key={i} className="absolute" style={{ left: x, top: y, width: sat, height: sat }}
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 34, delay: 0.25 + i * 0.08 }}>
              {/* contra-giro: o satélite viaja no anel sem ficar de cabeça para baixo */}
              <div className={cn("h-full w-full", CONTRA)}>
                {s.tipo === "bradesco" ? (
                  <div className="grid h-full w-full place-items-center rounded-full border border-white/[0.1] bg-card text-foreground">
                    <LogoBradesco className="h-[58%] w-[58%]" />
                  </div>
                ) : (
                  /* VAGA: só o lugar, tracejado e vazio. Um "+" aqui parecia
                     botão de adicionar, e não é. */
                  <div className="grid h-full w-full place-items-center rounded-full border border-dashed border-white/[0.14]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/[0.14]" />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      {/* a lupa, no centro */}
      <motion.div className="absolute grid place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
        style={{ inset: r - tamanho * 0.2 }}
        animate={{ scale: ativa ? 1.12 : 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}>
        <Lupa className="h-[46%] w-[46%] min-h-6 min-w-6" />
      </motion.div>
    </div>
  );
}
