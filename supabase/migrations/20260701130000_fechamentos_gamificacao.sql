-- Gamificação de Fechamentos & Comissões.
-- Adiciona: autoria por usuário (quem fechou), regras/normas por mês
-- (valor base, multiplicadores base/especial + condição, meta geral) e
-- metas + bônus individuais por pessoa por mês.

-- 1. AUTORIA — vincula cada fechamento a um usuário (profiles).
alter table public.fechamentos
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- Backfill: os 21 fechamentos existentes são todos da Adria Mota.
update public.fechamentos
   set user_id = 'abbcb508-ceab-4b33-88bd-41ca3ce72e9a'
 where user_id is null;

create index if not exists fechamentos_user_idx on public.fechamentos (user_id);

-- 2. REGRAS DO MÊS — estende fechamentos_meses com os parâmetros gerais.
--    A comissão individual = ações × valor_base × multiplicador_vigente + bônus.
--    multiplicador_vigente = (mult_especial_min não-nulo e ações >= min)
--                            ? mult_especial : mult_base   (base individual).
alter table public.fechamentos_meses
  add column if not exists valor_base        numeric(10,2) not null default 5,
  add column if not exists mult_base         numeric(6,2)  not null default 1,
  add column if not exists mult_especial     numeric(6,2)  not null default 1,
  add column if not exists mult_especial_min int,          -- nulo = sem tier especial
  add column if not exists meta_geral        int           not null default 0;

-- 3. METAS/BÔNUS POR PESSOA POR MÊS.
create table if not exists public.fechamentos_metas (
  mes        text not null,               -- 'YYYY-MM'
  user_id    uuid not null references public.profiles(id) on delete cascade,
  meta       int  not null default 0,     -- meta individual de ações no mês
  bonus      numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (mes, user_id)
);

alter table public.fechamentos_metas enable row level security;
drop policy if exists fechamentos_metas_all on public.fechamentos_metas;
create policy fechamentos_metas_all on public.fechamentos_metas
  for all to authenticated using (true) with check (true);
