-- PREFERÊNCIAS DO USUÁRIO: cor do sistema e ordem do menu, atreladas à conta.
--
-- A paleta vivia só no localStorage do navegador. Limpar cookies, trocar de
-- máquina ou abrir em outro navegador devolvia o sistema à cor padrão, e o
-- usuário tinha que escolher de novo. Preferência é da pessoa, não do
-- navegador: agora mora aqui e o navegador guarda só uma cópia para a
-- primeira pintura da tela.
--
-- A ordem do menu lateral nasce junto, pelo mesmo motivo: cada um organiza o
-- sistema do seu jeito e essa organização acompanha a conta.

create table if not exists public.preferencias_usuario (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  paleta     text check (paleta in ('default', 'midnight-blue', 'vermelho', 'space-gray', 'sei')),
  ordem_menu text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.preferencias_usuario is
  'Preferencias visuais de cada usuario (cor do sistema, ordem do menu). Uma linha por usuario.';
comment on column public.preferencias_usuario.ordem_menu is
  'Rotas do menu lateral na ordem escolhida pelo usuario. Rotas novas entram no lugar padrao; rotas que sumiram sao ignoradas.';

drop trigger if exists set_updated_at_preferencias_usuario on public.preferencias_usuario;
create trigger set_updated_at_preferencias_usuario
  before update on public.preferencias_usuario
  for each row execute function public.set_updated_at();

alter table public.preferencias_usuario enable row level security;

-- Só a própria pessoa lê e escreve a própria linha. Não há leitura de admin:
-- cor e ordem do menu não são dado de gestão.
drop policy if exists preferencias_usuario_propria_leitura on public.preferencias_usuario;
create policy preferencias_usuario_propria_leitura on public.preferencias_usuario
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists preferencias_usuario_propria_insercao on public.preferencias_usuario;
create policy preferencias_usuario_propria_insercao on public.preferencias_usuario
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists preferencias_usuario_propria_alteracao on public.preferencias_usuario;
create policy preferencias_usuario_propria_alteracao on public.preferencias_usuario
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
