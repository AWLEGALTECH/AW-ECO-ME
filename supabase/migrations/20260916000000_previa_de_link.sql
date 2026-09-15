-- A PRÉVIA DO LINK, GUARDADA UMA VEZ SÓ.
--
-- O WhatsApp mostra título, descrição e imagem embaixo do link. A prévia dele é
-- feita no aparelho de quem ENVIA e vem junto da mensagem — mas ela não chega
-- até aqui: das 29 mensagens com link que este banco tem, nenhuma traz
-- `extendedTextMessage` com título ou miniatura. Conferido antes de construir.
--
-- Então a prévia é nossa: uma função lê o endereço, pega as etiquetas Open Graph
-- e guarda AQUI. O cache não é otimização, é o que torna a coisa aceitável: sem
-- ele, cada vez que alguém rolasse a conversa o sistema bateria de novo no site
-- de terceiro, e um link que aparece em vinte conversas viraria vinte visitas.
--
-- ─────────────────── o que fica gravado quando não dá certo ─────────────────
--
-- Linha com `erro` também é resposta. Sem ela, um link que não tem prévia
-- (PDF, site fora do ar, página que exige login) seria buscado de novo a cada
-- render, para sempre, e nunca daria em nada. `buscada_em` diz quando tentamos,
-- e é o que permite tentar de novo daqui a um tempo sem tentar toda hora.

create table if not exists public.wa_link_previa (
  /* A chave é o ENDEREÇO NORMALIZADO, e não um id: a mesma URL em duas
     conversas é a mesma prévia. */
  url          text primary key,
  titulo       text,
  descricao    text,
  imagem       text,
  site         text,
  /* o que impediu; quando preenchido, os outros campos vêm vazios */
  erro         text,
  buscada_em   timestamptz not null default now()
);

comment on table public.wa_link_previa is
  'Cache das previas de link das conversas (Open Graph). Escrita pela edge function link-previa; linha com erro tambem e resposta, e evita buscar de novo o que nao tem previa.';

create index if not exists ix_wa_link_previa_velhas
  on public.wa_link_previa (buscada_em);

alter table public.wa_link_previa enable row level security;

/* Leitura para quem atende: a prévia aparece na bolha da conversa, e quem vê a
   conversa vê a prévia. Escrita é só do executor, com a chave de serviço —
   uma tela que pudesse gravar aqui poderia inventar título e descrição para um
   link que leva a outro lugar, que é a forma mais barata de fazer alguém
   clicar no que não quer. */
drop policy if exists wa_link_previa_leitura on public.wa_link_previa;
create policy wa_link_previa_leitura on public.wa_link_previa
  for select to authenticated
  using ((select public.fn_is_admin()) or (select public.tem_modulo('atendimento')));
