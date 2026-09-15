/* O TEXTO DA BOLHA, COM OS LINKS CLICÁVEIS E O CARTÃO DE PRÉVIA.
 *
 * Duas coisas, e a primeira é a que importa: link azul que abre. Antes disso, a
 * única forma de abrir um endereço que o lead mandou era selecionar com o mouse
 * e copiar, dentro de uma bolha que às vezes tem três linhas de texto colado.
 *
 * ───────────────────────────── a prévia é bônus ─────────────────────────────
 *
 * O cartão com título, imagem e site vem depois, e sozinho: a bolha aparece na
 * hora com o link já clicável, e o cartão entra quando (e se) a leitura do
 * endereço responder. Segurar a mensagem esperando um site de terceiro
 * responder seria trocar o certo pelo enfeite.
 *
 * E a prévia é do PRIMEIRO link, como no WhatsApp: cinco links virariam cinco
 * cartões, e a conversa sumiria embaixo deles.
 */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { pedacosDoTexto, linkParaPrevia, dominioDoLink, linkEncurtado } from "@/lib/links";
import { usePreviaDeLink } from "@/hooks/usePreviaDeLink";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

/**
 * O texto, com cada endereço virando âncora.
 *
 * `pedacosDoTexto` devolve uma lista, e não HTML: montar HTML com texto que vem
 * de fora (a mensagem é escrita pelo lead) é como se escreve um buraco de
 * segurança sem perceber. Aqui cada pedaço vira um nó do React, e o navegador
 * escapa tudo sozinho.
 */
export function TextoComLinks({ texto, nossa, className }: {
  texto: string;
  /** muda só a cor: no nosso balão o azul padrão some no fundo claro */
  nossa?: boolean;
  className?: string;
}) {
  const pedacos = pedacosDoTexto(texto);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {pedacos.map((p, i) => {
        if (p.tipo === "texto") return <React.Fragment key={i}>{p.texto}</React.Fragment>;
        return (
          <a
            key={i}
            href={p.href}
            target="_blank"
            /* `noopener` é o que impede a página aberta de mexer nesta pela
               `window.opener`; `noreferrer` não conta de onde o clique veio.
               Os dois valem mais aqui que em qualquer lugar: o endereço foi
               escrito por quem está do outro lado da conversa. */
            rel="noopener noreferrer"
            /* O clique não pode subir: a bolha inteira às vezes está dentro de
               algo clicável, e abrir o link e selecionar a conversa ao mesmo
               tempo é o tipo de coisa que parece defeito. */
            onClick={(e) => e.stopPropagation()}
            title={p.href}
            className={cn(
              "underline underline-offset-2 decoration-1 break-all transition-colors",
              nossa
                ? "text-foreground/90 decoration-foreground/40 hover:decoration-foreground"
                : "text-sky-300 decoration-sky-300/40 hover:decoration-sky-300",
            )}>
            {p.texto}
          </a>
        );
      })}
    </span>
  );
}

/**
 * O cartão do primeiro link, quando ele tem prévia.
 *
 * Nada aparece enquanto não há resposta, e nada aparece quando a resposta é
 * "não tem prévia": um retângulo cinza dizendo que não deu certo ocupa o mesmo
 * espaço do cartão e não serve para nada. O link continua ali, clicável.
 */
export function PreviaDoLink({ texto, nossa, aoVivo = true }: {
  texto: string;
  nossa?: boolean;
  /** com a aba escondida não vale gastar chamada com enfeite */
  aoVivo?: boolean;
}) {
  const href = linkParaPrevia(texto);
  const { data: previa } = usePreviaDeLink(href, aoVivo);

  if (!href || !previa || previa.erro) return null;
  const { titulo, descricao, imagem, site } = previa;
  if (!titulo && !descricao && !imagem) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA}
        className={cn(
          "mt-1.5 block overflow-hidden rounded-xl ring-1 transition-colors",
          nossa
            ? "bg-black/20 ring-white/[0.10] hover:bg-black/30"
            : "bg-white/[0.04] ring-white/[0.08] hover:bg-white/[0.07]",
        )}>
        {imagem && (
          /* A imagem vem de site de terceiro: se ela não carregar, o espaço
             dela some em vez de virar um retângulo quebrado com ícone de foto
             faltando. */
          <img
            src={imagem}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            className="w-full max-h-40 object-cover bg-black/20"
          />
        )}
        <span className="block px-2.5 py-2">
          {titulo && (
            <span className="block text-[12px] font-medium leading-snug line-clamp-2">{titulo}</span>
          )}
          {descricao && (
            <span className="block text-[10.5px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">
              {descricao}
            </span>
          )}
          <span className="flex items-center gap-1 text-[9.5px] text-muted-foreground/60 mt-1">
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{site || dominioDoLink(href)}</span>
          </span>
        </span>
      </motion.a>
    </AnimatePresence>
  );
}

/** O link sozinho, encurtado, para lugares apertados (prévia de lista). */
export function LinkCurto({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={href}
      className="text-sky-300 underline underline-offset-2 decoration-1">
      {linkEncurtado(href)}
    </a>
  );
}
