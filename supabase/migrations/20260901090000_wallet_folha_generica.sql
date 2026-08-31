-- Folha e comissões viram rubrica, não pessoa.
--
-- "Bolsa da estagiária" e "Comissão da estagiária" amarravam o custo fixo a
-- quem ocupa a cadeira hoje. Contratar a segunda pessoa obrigaria a criar um
-- fixo novo, e aí o custo de folha do escritório passaria a estar espalhado em
-- duas linhas que ninguém soma — ou, pior, alguém renomearia a linha da
-- estagiária e o histórico dela ficaria com o nome de outra pessoa.
--
-- Como rubrica, quem entra na equipe entra no mesmo bolo: o valor sobe, a
-- linha é a mesma, e a série histórica de "quanto custa a folha" continua
-- inteira.
--
-- Renomear é seguro porque a materialização amarra o lançamento ao fixo pelo
-- id (origem_ref = '<id>|YYYY-MM'), nunca pela descrição. O que já foi gerado
-- continua apontando pra cá.
--
-- Valores seguem os de hoje, que são só os da estagiária: R$ 700,00 de folha e
-- R$ 600,00 de comissões. Sobem no lápis quando a equipe crescer.

update public.balance_recorrentes
   set descricao = 'Folha de pagamento', updated_at = now()
 where descricao = 'Bolsa da estagiária';

update public.balance_recorrentes
   set descricao = 'Comissões', updated_at = now()
 where descricao = 'Comissão da estagiária';
