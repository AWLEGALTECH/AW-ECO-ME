-- A conta passa a dizer de qual banco ela é.
--
-- A tela precisa mostrar a marca da instituição na linha do lançamento, e
-- casar isso pelo texto livre de `instituicao` seria frágil: "Caixa", "caixa
-- economica", "CEF" e "Caixa Econômica Federal" são a mesma coisa pra quem
-- digita e quatro coisas diferentes pra um `===`. Então entra um slug curto e
-- estável, que é o que a tela usa pra escolher a logo. Banco sem slug conhecido
-- cai num genérico — nada quebra.
alter table public.balance_contas
  add column if not exists banco text;

comment on column public.balance_contas.banco is
  'Slug da instituição, usado pela tela pra escolher a marca (ex: caixa, itau, bb, bradesco, nubank). Nulo ou desconhecido cai no ícone genérico.';

-- Tudo que está lançado hoje é da conta da Caixa: o extrato de agosto é dela.
update public.balance_contas
   set nome        = 'Caixa',
       banco       = 'caixa',
       instituicao = 'Caixa Econômica Federal',
       updated_at  = now()
 where nome = 'Conta Principal';
