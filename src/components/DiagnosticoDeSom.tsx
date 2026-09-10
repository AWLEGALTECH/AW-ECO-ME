import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Volume2, Loader2, AlertTriangle, CheckCircle2, Info, ClipboardCopy } from "lucide-react";
import {
  FORMATOS, suporteDe, lerAchados, resumoParaColar, type Achados, type Suporte,
} from "@/lib/diagnosticoSom";
import { tocarSomNotificacao } from "@/lib/som";

/* O TESTE DE SOM QUE RODA NA MÁQUINA DE QUEM ESTÁ RECLAMANDO.
 *
 * "Aqui não sai som" contra "aqui sai" é uma discussão sem fim, porque os dois
 * lados estão dizendo a verdade. Este painel troca a discussão por fatos
 * colhidos ali: o navegador sabe este formato, conseguiu decodificar este
 * arquivo, o relógio andou, o volume está aberto.
 *
 * A pergunta decisiva é a última: se o relógio andou e o volume está aberto, o
 * navegador ESTÁ tocando, e o som está saindo em outro lugar. Isso muda o que
 * a pessoa vai mexer, e é o que nenhum print de tela conta.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

const COR_SUPORTE: Record<Suporte, string> = {
  sim: "text-emerald-400",
  talvez: "text-amber-300",
  nao: "text-rose-400",
};
const TEXTO_SUPORTE: Record<Suporte, string> = { sim: "toca", talvez: "talvez", nao: "não toca" };

export function DiagnosticoDeSom() {
  const [rodando, setRodando] = useState(false);
  const [achados, setAchados] = useState<Achados | null>(null);

  const rodar = async () => {
    setRodando(true);
    const el = document.createElement("audio");

    // 1. o que o navegador diz saber tocar
    const suporte: Record<string, Suporte> = {};
    for (const f of FORMATOS) suporte[f.mime] = suporteDe(el.canPlayType(f.mime));

    // 2. o Web Audio, que é o caminho dos avisos do sistema
    let webAudio: Achados["webAudio"] = "falhou";
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      webAudio = ac.state === "suspended" ? "suspenso" : "ok";
      ac.close().catch(() => {});
    } catch { webAudio = "falhou"; }

    // 3. quantas saídas o sistema tem (sem pedir permissão: só o número)
    let saidas: number | null = null;
    try {
      const ds = await navigator.mediaDevices?.enumerateDevices();
      saidas = ds ? ds.filter((d) => d.kind === "audiooutput").length : null;
    } catch { saidas = null; }

    /* 4. UM ÁUDIO DE VERDADE DA BASE, e não um arquivo de exemplo. O que
       interessa é este formato, servido por este servidor, com esta assinatura:
       um mp3 de teste passaria mesmo com o Opus quebrado. */
    let carregou: boolean | null = null;
    let erroCodigo: number | null = null;
    let andou: boolean | null = null;

    const { data: linha } = await (supabase.from("wa_mensagens" as never) as never as {
      select: (c: string) => any;
    }).select("midia_path")
      .eq("tipo", "audio").not("midia_path", "is", null)
      .order("criada_em", { ascending: false }).limit(1).maybeSingle();

    const caminho = (linha as { midia_path?: string } | null)?.midia_path;
    if (caminho) {
      const { data: assinada } = await supabase.storage.from("wa-midia").createSignedUrl(caminho, 120);
      if (assinada?.signedUrl) {
        carregou = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), 8000);
          el.preload = "auto";
          el.src = assinada.signedUrl;
          el.oncanplay = () => { clearTimeout(t); resolve(true); };
          el.onerror = () => { clearTimeout(t); erroCodigo = el.error?.code ?? null; resolve(false); };
          el.load();
        });
      }
    }

    if (carregou) {
      // Tocar mudo: o teste não pode gritar na sala. O que se mede é o RELÓGIO,
      // e ele anda igual com o volume em zero.
      el.muted = true;
      try {
        await el.play();
        const antes = el.currentTime;
        await new Promise((r) => setTimeout(r, 900));
        andou = el.currentTime > antes;
      } catch { andou = false; }
      el.pause();
      el.muted = false;
    }

    // O volume do tocador de verdade da tela, não o do elemento de teste.
    const tocador = document.querySelector("audio");
    setAchados({
      suporte, webAudio, carregou, erroCodigo, andou, saidas,
      volume: tocador ? tocador.volume : el.volume,
      mudo: tocador ? tocador.muted : el.muted,
    });
    setRodando(false);
  };

  const copiar = () => {
    if (!achados) return;
    const txt = resumoParaColar(achados, `${navigator.userAgent}`);
    navigator.clipboard.writeText(txt)
      .then(() => toast.success("Resumo copiado. É só colar na conversa."))
      .catch(() => toast.error("Não consegui copiar. Dá pra tirar um print."));
  };

  const vereditos = achados ? lerAchados(achados) : [];

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            O som das conversas não sai nesta máquina?
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 max-w-xl leading-snug">
            O bling das notificações tocar não quer dizer que está tudo bem: ele é sintetizado aqui dentro
            e não precisa de decodificador. O áudio do cliente é um arquivo, e precisa. Este teste separa
            uma coisa da outra.
          </p>
        </div>
        <Button size="sm" onClick={rodar} disabled={rodando} className="shrink-0">
          {rodando ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Testando…</>
                   : "Testar o som aqui"}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {achados && (
          <motion.div
            key="resultado" layout
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={MOLA}
            className="space-y-2.5 overflow-hidden">

            {vereditos.map((v, i) => {
              const Ico = v.gravidade === "erro" ? AlertTriangle : v.gravidade === "aviso" ? Info : CheckCircle2;
              const cor = v.gravidade === "erro" ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-200"
                : v.gravidade === "aviso" ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100"
                : "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100";
              return (
                <motion.div key={v.titulo} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOLA, delay: i * 0.05 }}
                  className={`rounded-lg border px-3 py-2.5 ${cor}`}>
                  <p className="text-[12.5px] font-semibold flex items-start gap-2">
                    <Ico className="h-4 w-4 shrink-0 mt-px" /> {v.titulo}
                  </p>
                  <p className="text-[11.5px] opacity-85 mt-1 leading-snug pl-6">{v.detalhe}</p>
                  {v.passos.length > 0 && (
                    <ol className="mt-1.5 pl-6 space-y-1">
                      {v.passos.map((p, k) => (
                        <li key={k} className="text-[11.5px] opacity-90 leading-snug flex gap-1.5">
                          <span className="opacity-60 tabular-nums shrink-0">{k + 1}.</span>{p}
                        </li>
                      ))}
                    </ol>
                  )}
                </motion.div>
              );
            })}

            <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">O que a máquina respondeu</p>
              <dl className="space-y-1">
                {FORMATOS.map((f) => (
                  <div key={f.mime} className="flex items-baseline gap-2 text-[11.5px]">
                    <dt className="text-muted-foreground flex-1 min-w-0 truncate">{f.rotulo}</dt>
                    <dd className={`shrink-0 font-medium ${COR_SUPORTE[achados.suporte[f.mime] ?? "nao"]}`}>
                      {TEXTO_SUPORTE[achados.suporte[f.mime] ?? "nao"]}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">Baixou e decodificou um áudio real</dt>
                  <dd className={`shrink-0 font-medium ${achados.carregou ? "text-emerald-400" : "text-rose-400"}`}>
                    {achados.carregou === null ? "sem áudio na base" : achados.carregou ? "sim" : "não"}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">O tempo andou ao tocar</dt>
                  <dd className={`shrink-0 font-medium ${achados.andou ? "text-emerald-400" : "text-rose-400"}`}>
                    {achados.andou === null ? "não testado" : achados.andou ? "sim" : "não"}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">Volume do tocador</dt>
                  <dd className="shrink-0 font-medium tabular-nums">
                    {Math.round(achados.volume * 100)}%{achados.mudo ? " (mudo)" : ""}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 mt-2.5">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={copiar}>
                  <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" /> Copiar resumo
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => tocarSomNotificacao()}>
                  Tocar o bling do sistema
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
