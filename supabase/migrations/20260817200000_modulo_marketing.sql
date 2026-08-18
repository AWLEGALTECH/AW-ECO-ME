-- Módulo Marketing, liberado só pro Luan.
--
-- O acesso é o mesmo mecanismo dos outros módulos: uma linha em
-- user_module_access. Não há tabela nova nem RLS nova porque a aba não guarda
-- nada no banco: as animações são geradas no navegador e baixadas.
--
-- Vale registrar quem mais enxerga: admin recebe todos os módulos por regra do
-- app (useAuth), e hoje o Luan é o único admin. Então "só o Luan" é verdade
-- agora e continua verdade enquanto isso não mudar; no dia em que alguém mais
-- virar admin, essa pessoa também verá a aba.

insert into public.user_module_access (user_id, module_key)
select p.id, 'marketing'
from public.profiles p
where p.email = 'luanasaf2005@gmail.com'
on conflict do nothing;
