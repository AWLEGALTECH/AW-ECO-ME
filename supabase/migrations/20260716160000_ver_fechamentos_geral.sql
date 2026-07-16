-- Permite que usuários NÃO-admin específicos vejam TODOS os fechamentos
-- (quadro geral, ranking da equipe), sem virar admin nem poder editar regras.
--
-- Como a página de fechamentos precisa dos profiles da equipe pra mapear
-- user_id -> nome e montar o seletor, também liberamos a LEITURA de profiles
-- pra quem tem o flag — via função SECURITY DEFINER (evita recursão de RLS).

alter table public.profiles
  add column if not exists ver_fechamentos_geral boolean not null default false;

-- Liga o flag pro Dr. Matheus Enes e pro Diego Ismael.
update public.profiles set ver_fechamentos_geral = true
where id in (
  '4c0f8d67-100e-44fc-beeb-f848fd2c120b',  -- Matheus Ferreira Enes
  '5e184226-53a7-4b7a-a3bd-b987ca93026d'   -- Diego da Gama Ismael
);

-- Helper: o usuário tem permissão de ver o quadro geral? (bypassa RLS)
create or replace function public.fn_pode_ver_fechamentos(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ver_fechamentos_geral from public.profiles where id = uid), false);
$$;

-- Deixa quem tem o flag ler todos os profiles (pra montar equipe/ranking).
drop policy if exists profiles_ver_fechamentos_read on public.profiles;
create policy profiles_ver_fechamentos_read on public.profiles for select to authenticated
  using (public.fn_pode_ver_fechamentos(auth.uid()));
