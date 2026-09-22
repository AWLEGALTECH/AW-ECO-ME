-- AS CORES DA ETIQUETA VIRAM CORES COMUNS: vermelho, azul, verde, amarelo,
-- rosa, roxo e laranja.
--
-- Pedido do chefe (21/09, noite): "cores que são naturalmente diferentes uma
-- da outra", as mesmas para todo número, sem tons parecidos. A paleta antiga
-- tinha dez nomes de tema (sky, violet, teal, indigo, emerald, amber, rose,
-- slate...) com dois roxos e dois verdes, e a versão de hoje mais cedo tinha
-- trocado por seis nomes que ainda eram de tema (lime). Agora o nome gravado
-- é o da cor que a pessoa vê.
--
-- O CHECK da coluna listava os nomes antigos: gravar um nome novo falharia. A
-- constraint sai PRIMEIRO (a primeira tentativa desta migration traduziu antes
-- de soltar e o CHECK antigo recusou "rosa"), o que está gravado é traduzido
-- para a cor comum mais próxima, e a constraint volta com a lista nova.

alter table public.wa_instancia_marca drop constraint if exists wa_instancia_marca_cor_check;

update public.wa_instancia_marca set cor = case cor
  when 'sky'     then 'azul'
  when 'indigo'  then 'azul'
  when 'violet'  then 'roxo'
  when 'teal'    then 'verde'
  when 'emerald' then 'verde'
  when 'lime'    then 'verde'
  when 'pink'    then 'rosa'
  when 'rose'    then 'vermelho'
  when 'orange'  then 'laranja'
  when 'amber'   then 'amarelo'
  when 'vermelho' then 'vermelho'
  when 'azul'     then 'azul'
  when 'verde'    then 'verde'
  when 'amarelo'  then 'amarelo'
  when 'rosa'     then 'rosa'
  when 'roxo'     then 'roxo'
  when 'laranja'  then 'laranja'
  else null end
where cor is not null;

alter table public.wa_instancia_marca add constraint wa_instancia_marca_cor_check
  check (cor is null or cor in ('vermelho', 'azul', 'verde', 'amarelo', 'rosa', 'roxo', 'laranja'));
