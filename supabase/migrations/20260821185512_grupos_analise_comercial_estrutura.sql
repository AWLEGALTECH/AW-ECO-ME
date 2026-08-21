-- Grupos de analise comercial.
--
-- A analise comercial de um cliente nao e um bolo so de rubricas: e o conjunto
-- das analises feitas ao longo do tempo, cada uma com sua data e com as
-- rubricas que entraram naquela data. Cada lote desses e um GRUPO.
--
-- A identidade da rubrica tambem nao pode depender do conteudo dela. Enquanto
-- o sistema comparava texto (acao + requerido) para saber o que entrou e o que
-- saiu, preencher um requerido que faltava fazia a rubrica antiga parecer
-- removida e uma nova aparecer no lugar — tirando a acao do mes em que ela
-- realmente foi contratada e lancando de novo no mes corrente.
--
-- Agora cada rubrica nasce dentro de um grupo e carrega id proprio. O grupo
-- guarda quando foi, a quem foi creditado e qual fechamento gerou: remover uma
-- rubrica de dentro dele desconta exatamente no mes em que ela contou, e
-- editar um grupo antigo nunca cria contabilidade nova.

with r as (
  select c.id as cliente_id, e.valor as rub, e.ord,
         coalesce(e.valor->>'adicionada_em', '1970-01-01') as dia,
         coalesce(e.valor->>'creditada_a', '') as cred
  from public.clientes c
  cross join lateral jsonb_array_elements(c.analise_comercial->'rubricas') with ordinality e(valor, ord)
  where jsonb_typeof(c.analise_comercial->'rubricas') = 'array'
),
g as (
  select cliente_id, dia, cred, gen_random_uuid() as grupo_id
  from r group by 1,2,3
),
rub as (
  select r.cliente_id, r.ord,
         r.rub || jsonb_build_object('id', gen_random_uuid(), 'grupo_id', g.grupo_id) as valor
  from r join g on g.cliente_id = r.cliente_id and g.dia = r.dia and g.cred = r.cred
),
novas_rubricas as (
  select cliente_id, jsonb_agg(valor order by ord) as arr from rub group by 1
),
grupos as (
  select g.cliente_id,
         jsonb_agg(jsonb_build_object(
           'id', g.grupo_id,
           'criado_em', nullif(g.dia, '1970-01-01'),
           'creditada_a', nullif(g.cred, ''),
           'fechamento_id', (
             select f.id from public.fechamentos f
              where f.cliente_id = g.cliente_id
                and (g.cred = '' or f.user_id::text = g.cred)
                and to_char(f.data, 'YYYY-MM') = substr(g.dia, 1, 7)
              order by f.data limit 1)
         ) order by g.dia) as arr
  from g group by 1
)
update public.clientes c
set analise_comercial = c.analise_comercial
      || jsonb_build_object('rubricas', nr.arr, 'grupos', gr.arr)
from novas_rubricas nr, grupos gr
where nr.cliente_id = c.id and gr.cliente_id = c.id;
