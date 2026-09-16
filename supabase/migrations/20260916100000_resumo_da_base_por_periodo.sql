-- "78 NOVOS" NÃO DIZIA NOVOS EM RELAÇÃO A QUÊ.
--
-- O número somava duas coisas que nada na tela separava: ainda-não-abordado E
-- chegou-depois-do-corte (`novos_desde`, que alguém mexeu uma vez há semanas e
-- não lembra). Duas regras somadas num número sem legenda: quem olha não tem
-- como reconstruir o que ele conta.
--
-- Entra `no_periodo`, que responde UMA pergunta: quantos leads CHEGARAM daqui
-- para cá. Sem cruzar com abordagem, sem depender de corte antigo. O cartão
-- passa a dizer "46 esta semana", e "esta semana" qualquer um sabe o que é.
--
-- QUEM DECIDE O COMEÇO DA SEMANA É O NAVEGADOR, e por isso vem como parâmetro:
-- o banco roda em UTC e não sabe o fuso de quem está olhando. Segunda-feira à
-- meia-noite em Manaus não é segunda-feira à meia-noite em UTC, e as quatro
-- horas de diferença jogariam os leads da madrugada de segunda para a semana
-- anterior.
--
-- `novos` e `antigos` ficam: a fila de trabalho continua existindo e outras
-- telas contam com ela. O que muda é o que o cartão da base mostra.
create or replace function public.fn_leads_resumo(p_desde timestamptz default null)
returns table (fonte_id uuid, total bigint, novos bigint, antigos bigint, no_periodo bigint)
language sql
stable
as $$
  select
    f.id,
    count(*) filter (where b.situacao <> 'descartado'),
    count(*) filter (
      where b.situacao = 'novo'
        and (f.novos_desde is null or b.chegou_em is null or b.chegou_em >= f.novos_desde)
    ),
    count(*) filter (
      where b.situacao = 'novo'
        and f.novos_desde is not null
        and b.chegou_em is not null
        and b.chegou_em < f.novos_desde
    ),
    /* Descartado fica de fora aqui também: ele não chegou "para valer". Lead
       sem data de chegada não entra em recorte nenhum — dizer que ele chegou
       esta semana seria inventar. */
    count(*) filter (
      where p_desde is not null
        and b.situacao <> 'descartado'
        and b.chegou_em is not null
        and b.chegou_em >= p_desde
    )
  from public.leads_fontes f
  left join public.leads_brutos b on b.fonte_id = f.id
  group by f.id;
$$;
