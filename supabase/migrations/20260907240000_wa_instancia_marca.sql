-- A ETIQUETA DE CADA NÚMERO, ESCOLHIDA A MÃO.
--
-- A sigla e a cor do selo que identifica cada número na caixa cruzada eram
-- DERIVADAS: as iniciais do nome, e uma cor tirada de um hash do nome. Isso
-- resolve o problema de arranque — número novo já nasce com etiqueta, sem
-- ninguém configurar nada — e não resolve o de convivência.
--
-- Duas razões pra deixar escolher:
--
-- 1. A COR SORTEADA NÃO É A COR CERTA. Um hash distribui bem e não sabe nada
--    sobre o que aquele número significa. Se o Portal é azul na cabeça de quem
--    trabalha, azul é a cor certa, e nenhuma função vai adivinhar isso.
--
-- 2. A SIGLA DERIVADA ÀS VEZES ERRA A PALAVRA. "Dr. Matheus Enes Corporativo"
--    vira MEC pelas iniciais; quem usa aquele número chama de ECO. A regra
--    automática não tem como saber qual das palavras é a que ficou.
--
-- O AUTOMÁTICO CONTINUA SENDO O PADRÃO, e é isso que faz esta tabela poder
-- ficar vazia: sem linha, a tela deriva do nome como sempre derivou. A linha só
-- existe onde alguém discordou.
create table if not exists public.wa_instancia_marca (
  instancia      text primary key,

  -- Curta de verdade: ela vive num selo de dezoito pixels em cima da foto do
  -- contato. Seis já é o teto do que cabe sem virar borrão.
  apelido        text check (apelido is null or (btrim(apelido) <> '' and length(apelido) <= 6)),

  -- Nome da cor, e não o valor dela. A tela decide o que "sky" significa em
  -- fundo, texto e anel — guardar `#38bdf8` aqui espalharia decisão de tema
  -- pelo banco, e no dia de mexer no tema teria que migrar dado.
  cor            text check (cor is null or cor in
                   ('sky','violet','teal','pink','orange','indigo','emerald','amber','rose','slate')),

  atualizado_por uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);

comment on table public.wa_instancia_marca is
  'A etiqueta de cada numero na tela: sigla curta e cor. Escolhida a mao; sem linha, a tela deriva do nome.';

alter table public.wa_instancia_marca enable row level security;

drop policy if exists "wa_instancia_marca_tudo" on public.wa_instancia_marca;
create policy "wa_instancia_marca_tudo" on public.wa_instancia_marca
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop trigger if exists trg_wa_instancia_marca_updated on public.wa_instancia_marca;
create trigger trg_wa_instancia_marca_updated
  before update on public.wa_instancia_marca
  for each row execute function public.set_updated_at();
