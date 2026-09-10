-- LIGA O PRIMEIRO ATENDIMENTO, SEM PEGAR QUEM JÁ ESTAVA CONVERSANDO.
--
-- A grade do PORTAL DIREITO ABERTO estava pintada e as três mensagens escritas
-- desde ontem, mas a linha de `wa_atendimento_config` nunca nasceu (ela só
-- nasce quando alguém liga o interruptor). Sem ela, `fn_wa_faixa_em` devolve
-- nulo e o gatilho volta calado: foi por isso que a lead que escreveu 11:52,
-- dentro do direcionamento, não recebeu nada.
--
-- ── a marca de "esta conversa não é nova" ───────────────────────────────────
-- O gatilho já tem duas travas: `primeiro_atendimento_em` preenchido, e a
-- conversa ter QUALQUER mensagem nossa. A segunda protege quem já foi
-- respondido, mas não protege quem escreveu e nunca teve resposta: são 6
-- conversas no PORTAL DIREITO ABERTO, gente que está na fila há dias e que
-- receberia um "Seja bem-vindo!" na próxima mensagem, como se tivesse acabado
-- de chegar.
--
-- Então, antes de ligar, toda conversa QUE JÁ TROCOU ALGUMA MENSAGEM fica
-- marcada como atendida. Não é dizer que ela recebeu o automático: é dizer que
-- ela não é nova, que é para o que essa coluna serve. Vale para os três
-- números, e não só para o que está sendo ligado agora, para que ligar o
-- próximo mais tarde já nasça igualmente seguro.
--
-- Conversa sem mensagem nenhuma NÃO é marcada: ela é uma linha que existe por
-- importação ou por vínculo, e quando essa pessoa escrever pela primeira vez
-- ela é, aí sim, um lead novo.

update public.wa_conversas c
   set primeiro_atendimento_em = now()
 where c.primeiro_atendimento_em is null
   and exists (select 1 from public.wa_mensagens m where m.conversa_id = c.id);

-- ── o interruptor ──────────────────────────────────────────────────────────
-- Só o PORTAL DIREITO ABERTO: é o único com a grade pintada. O PORTAL DIREITO
-- ABERTO 2 tem duas mensagens salvas e NENHUMA faixa, e ligar ele assim faria
-- toda hora contar como fechada, mandando "estamos fora do horário" às onze da
-- manhã.
--
-- `do nothing` no conflito: se um dia alguém desligar pela tela, rodar esta
-- migração de novo não religa sozinho.
insert into public.wa_atendimento_config (instancia, ativo, fuso)
values ('PORTAL DIREITO ABERTO', true, 'America/Manaus')
on conflict (instancia) do nothing;
