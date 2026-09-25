-- O FINDER NOVO LIGA POR CONTA.
--
-- O interruptor do Finder novo era só do navegador (`/finder?nativo=1`), e
-- quem recarregava a página sem o parâmetro caía de novo no pacote antigo.
-- Agora ele mora na conta, junto com o tema e a ordem do menu: liga para uma
-- pessoa e vale em qualquer navegador dela. O navegador ainda pode forçar os
-- dois lados com `?nativo=1` e `?nativo=0`.
alter table public.preferencias_usuario
  add column if not exists finder_nativo boolean not null default false;

-- Primeiro a testar: o Luan.
insert into public.preferencias_usuario (user_id, finder_nativo)
select id, true from public.profiles where email = 'luanasaf2005@gmail.com'
on conflict (user_id) do update set finder_nativo = true;
