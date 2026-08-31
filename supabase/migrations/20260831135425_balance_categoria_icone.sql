-- Cada categoria carrega o nome do seu icone (lucide). A tela mapeia nome ->
-- componente; categoria nova sem icone cai num generico, entao nada quebra.
-- `judicial` marca o que vem de processo: essas sao as categorias que a baixa
-- do Tracker usa, e a tela agrupa separado das despesas de estrutura.
alter table public.balance_categorias
  add column if not exists icone    text,
  add column if not exists judicial boolean not null default false;

update public.balance_categorias set icone = v.icone, judicial = v.jud
from (values
  ('Honorário de êxito',      'entrada', 'Trophy',           true),
  ('Acordo recebido',         'entrada', 'Handshake',        true),
  ('Honorário sucumbencial',  'entrada', 'Gavel',            true),
  ('Honorário contratual',    'entrada', 'FileSignature',    true),
  ('Consultoria',             'entrada', 'MessagesSquare',   false),
  ('Aporte de sócio',         'entrada', 'PiggyBank',        false),
  ('Reembolso',               'entrada', 'Undo2',            false),
  ('Repasse ao cliente',      'saida',   'Users',            true),
  ('Custas e diligências',    'saida',   'Landmark',         true),
  ('Perícia',                 'saida',   'Microscope',       true),
  ('Salário',                 'saida',   'Wallet',           false),
  ('Bônus de fechamento',     'saida',   'Sparkles',         false),
  ('Pró-labore',              'saida',   'BadgeDollarSign',  false),
  ('Aluguel',                 'saida',   'Building2',        false),
  ('Energia, água e internet','saida',   'Plug',             false),
  ('Software e assinaturas',  'saida',   'MonitorSmartphone',false),
  ('Marketing e tráfego',     'saida',   'Megaphone',        false),
  ('Imposto e taxa',          'saida',   'Receipt',          false),
  ('Tarifa bancária',         'saida',   'CreditCard',       false),
  ('Outras despesas',         'saida',   'CircleDashed',     false)
) as v(nome, tipo, icone, jud)
where balance_categorias.nome = v.nome and balance_categorias.tipo = v.tipo;

-- categorias judiciais que faltavam no primeiro plano de contas
insert into public.balance_categorias (nome, tipo, grupo, fixa, ordem, icone, judicial) values
  ('Alvará recebido',        'entrada', 'Receita processual', true,  15, 'Landmark',  true),
  ('Cumprimento de sentença','entrada', 'Receita processual', false, 25, 'Scale',     true),
  ('Depósito judicial',      'saida',   'Processual',         false, 85, 'Banknote',  true),
  ('Preposto e diligente',   'saida',   'Processual',         false, 95, 'UserCheck', true)
on conflict (nome, tipo) do nothing;

update public.balance_categorias set icone = 'CircleDashed' where icone is null;
