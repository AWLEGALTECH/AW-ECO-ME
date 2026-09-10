-- MENSAGENS RÁPIDAS: os atalhos de barra do campo de digitar.
--
-- Quem atende repete as mesmas frases o dia inteiro (o pedido do extrato, a
-- explicação do prazo, o "bom dia" da abordagem). Hoje cada um tem a sua no
-- bloco de notas, e a versão boa da frase é a que a pessoa que a escreveu
-- lembra de usar.
--
-- SÃO DE TODO MUNDO, e essa é a escolha central: um atalho criado por alguém
-- aparece para todos, e a frase melhora com o uso em vez de existir em cinco
-- versões particulares. Não é preferência de mesa como o som ou a seção
-- recolhida; é vocabulário do escritório.
--
-- NÃO SÃO POR INSTÂNCIA. "Me manda o extrato" serve no Portal e no escritório,
-- e obrigar a recriar o mesmo atalho em cada número faria três listas curtas
-- em vez de uma boa.
--
-- Diferente de `mensagens_prontas`, que é a régua de follow-up de cada usuário:
-- lá o texto é de UMA rodada de cobrança e é pessoal; aqui é a frase solta que
-- qualquer um usa em qualquer conversa.

create table if not exists public.wa_atalhos (
  id         uuid primary key default gen_random_uuid(),
  -- o que se digita depois da barra, sem a barra
  comando    text not null,
  conteudo   text not null,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Minúsculo, sem espaço e sem acento: é o que se digita correndo, e "/Extrato"
  -- e "/extrato" não podem ser dois atalhos diferentes.
  constraint wa_atalhos_comando_check check (comando ~ '^[a-z0-9][a-z0-9_-]{0,23}$'),
  constraint wa_atalhos_conteudo_check check (length(btrim(conteudo)) > 0)
);

comment on table public.wa_atalhos is
  'Mensagens rapidas do atendimento, acionadas por / no campo de digitar. Compartilhadas por todo o escritorio.';

-- Um comando, uma mensagem. Sem isto, dois atalhos iguais criados ao mesmo
-- tempo por duas pessoas fariam a lista mostrar a mesma barra duas vezes.
create unique index if not exists ix_wa_atalhos_comando on public.wa_atalhos (comando);

drop trigger if exists trg_wa_atalhos_updated on public.wa_atalhos;
create trigger trg_wa_atalhos_updated
  before update on public.wa_atalhos
  for each row execute function public.fn_touch_updated_at();

alter table public.wa_atalhos enable row level security;

-- Quem atende lê e escreve: são de todo mundo, inclusive para corrigir a frase
-- de outro. O módulo é o portão, como no resto do atendimento.
drop policy if exists wa_atalhos_modulo on public.wa_atalhos;
create policy wa_atalhos_modulo on public.wa_atalhos
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));
