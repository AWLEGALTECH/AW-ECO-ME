/* O POP DE "FOTO ATUALIZADA".
 *
 * Trocar a foto de perfil é uma ação que a pessoa faz uma vez e quer VER que
 * deu certo: a foto nova, redonda, do jeito que vai aparecer para o cliente.
 * Um toast de canto com "trocada" não mostra nada disso. Aqui a foto entra no
 * centro da tela com mola, o selo de confirmado salta por cima dela, e o pop
 * se fecha sozinho. Clicar em cima fecha antes.
 *
 * A foto vem do RECORTE, e não do servidor: é exatamente a imagem que a
 * pessoa acabou de encaixar, sem esperar o WhatsApp devolver a URL nova. A
 * tela inteira também passa a usar essa imagem (ver `fotoLocal` no
 * Atendimento) até a URL de lá chegar.
 */
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export interface FotoTrocada {
  /** nome do número como a tela o chama */
  nome: string;
  /** URL (blob) da imagem recortada */
  foto: string;
  /** o que a função devolveu além de "ok", se devolveu */
  aviso?: string | null;
}

const MOLA = { type: "spring", stiffness: 380, damping: 26 } as const;

export function FotoTrocadaPop({ item, onFechar }: { item: FotoTrocada | null; onFechar: () => void }) {
  // Fecha sozinho. Com aviso fica mais tempo, porque tem o que ler.
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(onFechar, item.aviso ? 7000 : 2600);
    return () => clearTimeout(t);
  }, [item, onFechar]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="foto-trocada"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[120] grid place-items-center pointer-events-none"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            onClick={onFechar}
            initial={{ scale: 0.6, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 6, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
            transition={MOLA}
            className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl px-8 py-6 cursor-pointer
                       bg-[#0e1013]/95 ring-1 ring-white/10 shadow-2xl backdrop-blur-md"
          >
            <span className="relative">
              <motion.img
                src={item.foto} alt=""
                className="h-24 w-24 rounded-full object-cover ring-2 ring-white/15 bg-[#0b0d10]"
                initial={{ scale: 0.82 }} animate={{ scale: 1 }}
                transition={{ ...MOLA, stiffness: 300, damping: 20, delay: 0.05 }}
              />
              {/* O selo SALTA por cima da foto, um instante depois dela: é a
                  ordem em que a pessoa lê "a foto... entrou". */}
              <motion.span
                initial={{ scale: 0, rotate: -35 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.2 }}
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full grid place-items-center
                           bg-emerald-400 text-[#0b0d10] ring-4 ring-[#0e1013]"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            </span>
            <span className="text-center">
              <span className="block text-[14px] font-semibold">Foto atualizada</span>
              <span className="block text-[12px] text-muted-foreground mt-0.5">
                {item.nome} já aparece assim para quem receber mensagem.
              </span>
              {item.aviso && (
                <span className="block mt-2 max-w-[19rem] text-[11px] leading-snug text-amber-200/90">
                  {item.aviso}
                </span>
              )}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
