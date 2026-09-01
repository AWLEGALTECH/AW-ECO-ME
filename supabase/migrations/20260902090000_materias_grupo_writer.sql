-- A matéria composta ganha nome de grupo e discriminação por linha.
--
-- Na ficha, um processo aparecia assim:
--
--     📦 BX ANT FINAN/PARC CRED/GASTOS CARTÃO
--
-- Que é como a planilha guardou, mas não é como se lê. Aquilo são três
-- rubricas, e as três juntas têm nome: são exatamente o grupo "Débitos
-- Automáticos" do Writer — a peça que se usa pra atacar esse conjunto.
--
-- Então a ficha passa a mostrar:
--
--     📦 Débitos Automáticos
--        · Gasto com cartão de crédito
--        · Parcela de crédito pessoal
--        · Baixa antecipada de financiamento
--
-- O GRUPO VEM DO WRITER, NÃO DE UMA LISTA NOVA. Os produtos do Writer já
-- carregam quais rubricas cada peça cobre; reproduzir isso aqui criaria duas
-- listas pra manter em dia. Esta coluna só aponta pro nome da peça — e é por
-- isso que o rótulo do grupo é literalmente o `nome` do produto lá.
--
-- Rubrica sem peça correspondente fica sem grupo, e a ficha mostra só as
-- linhas. Inventar grupo pra ela seria pior: daria a impressão de que existe
-- peça pronta onde não existe.

alter table public.materias_catalogo
  add column if not exists grupo_writer text;

comment on column public.materias_catalogo.grupo_writer is
  'O nome do produto do Writer que ataca esta rubrica. Nulo quando ainda não há peça — a ficha então mostra só a lista de rubricas, sem prometer peça que não existe.';

update public.materias_catalogo set grupo_writer = v.grupo
from (values
  -- Débitos Automáticos: as três que a peça cobre juntas
  ('GASTO_C_CRED',         'Débitos Automáticos'),
  ('PARC_CRED_PESS',       'Débitos Automáticos'),
  ('BX_ANT_FIN',           'Débitos Automáticos'),
  -- Tarifas Bancárias
  ('SAQUE_TERMINAL',       'Tarifas Bancárias'),
  ('EMISSAO_EXTRATO',      'Tarifas Bancárias'),
  ('EXTRATO_MOVIMENTO',    'Tarifas Bancárias'),
  -- Juros e encargos indevidos: a peça trata mora e encargos como um bloco só
  ('MORA',                 'Juros e encargos indevidos'),
  ('MORA_C_CREDITO',       'Juros e encargos indevidos'),
  ('MORA_CEL',             'Juros e encargos indevidos'),
  ('MORA_OPERACOES',       'Juros e encargos indevidos'),
  ('ENCARGOS_EXCESSO',     'Juros e encargos indevidos'),
  ('ENCARGOS_DESCOBERTOS', 'Juros e encargos indevidos'),
  ('JUROS_ABUSIVOS',       'Juros e encargos indevidos'),
  -- as de peça única
  ('SEGURO_PRESTAMISTA',   'Seguro Prestamista'),
  ('VIDA_PREV',            'Vida e Previdência'),
  ('TIT_CAP',              'Título de Capitalização'),
  ('CESTA',                'Cesta de Serviços'),
  ('ANUIDADE',             'Anuidade Cartão'),
  ('DIV_ATRASO',           'Dívida em Atraso'),
  ('BLOQUEIO_CONTA',       'Conta Aberta por Fraude')
) as v(chave, grupo)
where materias_catalogo.chave = v.chave;
