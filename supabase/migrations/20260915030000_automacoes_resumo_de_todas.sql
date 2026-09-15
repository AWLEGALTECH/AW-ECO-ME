-- O RESUMO DEIXA DE SER DE UM NÚMERO SÓ.
--
-- A automação sempre foi de um número (é o mesmo eixo da régua e da grade de
-- horário), mas a TELA mostrava só as do número aberto — e isso escondia uma
-- coisa importante: um fluxo salvo em outro número sumia da lista, sem dizer
-- que existia. Quem tivesse dois números acabaria criando o mesmo fluxo duas
-- vezes sem perceber, ou procuraria por um que "desapareceu".
--
-- Agora a lista mostra todos, cada um com a etiqueta do número a que pertence,
-- e o editor tem um seletor explícito. O resumo acompanha: conta as passagens
-- de TODAS as automações, e quem filtra é a tela.
--
-- A permissão continua sendo a mesma do módulo: a política de `wa_automacoes`
-- já decide quem enxerga a tabela, e esta função roda como dona só para poder
-- ler `wa_automacao_execucoes`, que ninguém escreve pela tela.

drop function if exists public.fn_wa_automacoes_resumo(text);

create or replace function public.fn_wa_automacoes_resumo()
returns table (automacao_id uuid, total bigint, hoje bigint, falhas bigint, ultima timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id,
         count(e.id),
         count(e.id) filter (where e.disparada_em >= date_trunc('day', now())),
         count(e.id) filter (where e.status = 'falhou'),
         max(e.disparada_em)
    from public.wa_automacoes a
    left join public.wa_automacao_execucoes e on e.automacao_id = a.id
   group by a.id;
$$;

grant execute on function public.fn_wa_automacoes_resumo() to authenticated, service_role;
