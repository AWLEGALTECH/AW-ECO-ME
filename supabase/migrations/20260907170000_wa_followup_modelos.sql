-- AS MENSAGENS PADRÃO DA RÉGUA.
--
-- Até aqui a cobrança dizia O QUE FAZER ("tirar o obstáculo") e quem ia escrever
-- escrevia do zero, toda vez. Isso tem um custo que só aparece no volume: cinco
-- pessoas escrevendo a mesma cobrança de cinco jeitos, e a quinta rodada saindo
-- com o texto da primeira porque quem escreveu naquele dia não lembrava em que
-- ponto da régua estava.
--
-- Uma mensagem por RODADA, e não por lead: o que muda entre UP01 e UP05 é o
-- tom, e o tom é uma decisão do escritório, tomada uma vez. O que muda entre
-- dois leads da mesma rodada é o nome, e isso o próprio texto resolve.
--
-- POR ORA ELA É SÓ O MODELO. Nada aqui dispara sozinho: quem manda continua
-- sendo uma pessoa, olhando a conversa. Guardar o texto é o primeiro passo, e
-- é um passo que já vale sozinho — padroniza o que hoje sai diferente toda vez.
create table if not exists public.wa_followup_modelos (
  rodada      int primary key check (rodada between 1 and 5),

  -- Mesma forma da mensagem retida, de propósito: quando isto virar disparo,
  -- o despachante lê as duas do mesmo jeito e não precisa de caminho novo.
  tipo        text not null default 'texto'
              check (tipo in ('texto','imagem','video','documento','audio')),
  texto       text,
  midia_path  text,
  midia_mime  text,
  midia_nome  text,
  duracao     int,

  -- Ligado, esta rodada tem mensagem pronta; desligado, ela existe mas não deve
  -- ser oferecida. Apagar o texto pra "desligar" perderia o que já foi escrito.
  ativo       boolean not null default true,

  atualizado_por uuid references auth.users(id),
  updated_at  timestamptz not null default now(),

  constraint wa_followup_modelos_tem_conteudo check (
    (tipo = 'texto' and coalesce(btrim(texto), '') <> '')
    or (tipo <> 'texto' and midia_path is not null)
  )
);

comment on table public.wa_followup_modelos is
  'Mensagem padrao de cada rodada da regua de follow-up. Uma linha por rodada; por ora e modelo, nao dispara sozinho.';

drop trigger if exists trg_wa_followup_modelos_updated on public.wa_followup_modelos;
create trigger trg_wa_followup_modelos_updated
  before update on public.wa_followup_modelos
  for each row execute function public.set_updated_at();

alter table public.wa_followup_modelos enable row level security;

drop policy if exists "wa_followup_modelos_ler" on public.wa_followup_modelos;
create policy "wa_followup_modelos_ler" on public.wa_followup_modelos
  for select to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop policy if exists "wa_followup_modelos_escrever" on public.wa_followup_modelos;
create policy "wa_followup_modelos_escrever" on public.wa_followup_modelos
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));
