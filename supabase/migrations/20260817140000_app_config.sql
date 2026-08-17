-- Configuração de aplicação em chave/valor.
--
-- Nasceu da raiz dos projetos no Drive: era um secret da edge function, e
-- secret só quem tem acesso ao painel do Supabase configura. Coisa que o
-- usuário decide (onde ficam as pastas dos projetos) não pode depender disso,
-- senão o botão de criar pasta vive quebrado até alguém de fora resolver.
--
-- Escrita só pela service role: quem grava é a edge function, depois de
-- conferir que a service account enxerga mesmo a pasta.

create table if not exists public.app_config (
  chave text primary key,
  valor text,
  rotulo text,
  atualizado_em timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "app_config leitura autenticada" on public.app_config;
create policy "app_config leitura autenticada" on public.app_config
  for select to authenticated using (true);
