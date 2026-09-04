-- ANOTAÇÕES QUE SE ACUMULAM, E A ORIGEM QUE NINGUÉM ESCOLHE.
--
-- ANOTAÇÕES. Era um campo de texto só: escrever a segunda coisa exigia decidir
-- onde enfiá-la no meio da primeira, e apagar sem querer não deixava rastro.
-- Vira lista: cada nota é uma linha, com quem escreveu e quando. Um atendimento
-- é uma sequência de conversas ao longo de semanas, e o que importa quase
-- sempre é "o que foi combinado da última vez" — pergunta que um bloco de texto
-- corrido responde mal.
--
-- ORIGEM. Deixar a atendente escolher entre marketing/planilha/outros era pedir
-- que ela informasse algo que o sistema já sabe melhor que ela: quem mandou a
-- primeira mensagem. Se foi o lead, ele veio até nós — é marketing. Se fomos
-- nós, foi prospecção ativa. Campo escolhido à mão vira campo em branco, ou
-- pior: preenchido no chute e depois usado pra decidir onde investir.
--
-- A coluna nasce em `wa_conversas` e não é calculada na hora porque a resposta
-- não pode mudar: a conversa que começou com a gente continua sendo prospecção
-- ativa depois que o lead responde, e uma consulta "quem falou primeiro" feita
-- em cima da lista de mensagens depende de a primeira mensagem nunca ser
-- apagada.

create table if not exists public.wa_anotacoes (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.wa_conversas(id) on delete cascade,
  texto       text not null,
  autor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint wa_anotacoes_texto_nao_vazio check (length(btrim(texto)) > 0)
);

create index if not exists wa_anotacoes_conversa_idx
  on public.wa_anotacoes (conversa_id, created_at desc);

alter table public.wa_anotacoes enable row level security;

drop policy if exists wa_anotacoes_modulo on public.wa_anotacoes;
create policy wa_anotacoes_modulo on public.wa_anotacoes
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

comment on table public.wa_anotacoes is
  'Notas do atendimento, uma por linha. Substituiu o campo único de observações — o que importa é "o que ficou combinado da última vez".';

-- ── origem da conversa ──

alter table public.wa_conversas
  add column if not exists origem text not null default 'marketing';

do $$ begin
  alter table public.wa_conversas
    add constraint wa_conversas_origem_check check (origem in ('marketing', 'ativa'));
exception when duplicate_object then null; end $$;

comment on column public.wa_conversas.origem is
  'marketing = o lead mandou a primeira mensagem (veio até nós); ativa = nós abrimos a conversa. Definido na criação, nunca escolhido à mão.';

-- Backfill: quem tem primeira mensagem nossa foi prospecção ativa. As conversas
-- criadas pelo "+" já são todas assim — a primeira mensagem delas saiu daqui.
update public.wa_conversas c
   set origem = 'ativa'
 where exists (
   select 1 from public.wa_mensagens m
    where m.conversa_id = c.id
    order by m.criada_em asc
    limit 1
 ) and (
   select m.direcao from public.wa_mensagens m
    where m.conversa_id = c.id
    order by m.criada_em asc
    limit 1
 ) = 'saida';
