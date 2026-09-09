-- O CATÁLOGO DE MATÉRIAS PERDE O TRAVESSÃO.
--
-- Cinco rótulos usavam "—": "RCC — Reserva de cartão de crédito", "RMC —
-- Reserva de margem consignável", "Mora — cartão de crédito", "Mora — celular",
-- "Mora — operações". Isso sempre foi texto de tela, e com a padronização do
-- Bradesco passou a ser gravado direto em `processos.materia`: o símbolo saiu
-- do catálogo e foi parar na ficha.
--
-- Dois-pontos dizem a mesma coisa. Ver a regra 3.1 do CLAUDE.md.
update public.materias_catalogo
   set rotulo = replace(replace(rotulo, ' — ', ': '), ' – ', ': ')
 where rotulo like '%—%' or rotulo like '%–%';

/* E os processos que já carregavam o símbolo acompanham.
   ⚠️ ISTO ALCANÇA ALÉM DO BRADESCO, de propósito: 44 processos de outros réus
   se chamam "ESPECÍFICA — <tese>" e viram "ESPECÍFICA: <tese>". É troca de
   pontuação, não de classificação: nenhum processo muda de matéria, de produto
   ou de agrupamento por causa desta linha. */
update public.processos
   set materia = replace(replace(materia, ' — ', ': '), ' – ', ': ')
 where materia like '%—%' or materia like '%–%';

-- A trava, pelo mesmo motivo da do nome do requerido: sem ela a regra vale só
-- para o que passou por aqui hoje, e o próximo rótulo cadastrado entra com
-- travessão sem ninguém perceber.
alter table public.materias_catalogo
  drop constraint if exists materias_catalogo_rotulo_sem_travessao;
alter table public.materias_catalogo
  add constraint materias_catalogo_rotulo_sem_travessao
  check (rotulo !~ '[—–]');
