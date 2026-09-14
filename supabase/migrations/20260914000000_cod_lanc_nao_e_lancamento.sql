-- "COD. LANC." NÃO É LANÇAMENTO.
--
-- É a linha de abertura de todo extrato do Bradesco ("31/12/2024 COD. LANC. 0
-- 0,00 0,00"): o saldo de partida, sem dinheiro entrando ou saindo. O parser
-- por código sempre a tratou como abertura. A leitura por IA, não: em dez
-- clientes ela entrou no banco de transações como um lançamento de valor zero,
-- ou pior, com o saldo de abertura no lugar do valor (-101,18 para a Joana,
-- -157,85 para o Edmundo, -63,25 para o Mario Jorge).
--
-- Some daqui. A leitura por IA passou a filtrar essa linha na origem
-- (spy-analisar), então ela não volta.

delete from public.spy_transacao
 where descricao ~* '^COD\.?\s*LANC';
