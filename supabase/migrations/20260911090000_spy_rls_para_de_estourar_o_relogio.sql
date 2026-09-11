-- O BANCO DE TRANSAÇÕES DO SPY VOLTA A ABRIR.
--
-- Chamado do Diego: "BANCO DE DESCONTOS CONSOLIDADO NÃO ESTÁ CARREGANDO,
-- INVIABILIZANDO A PESQUISA DE RÚBRICAS NOVAS COMO 'OPERAÇÕES VENCIDAS'".
--
-- ─────────────────────────────── o que acontecia ────────────────────────────
--
-- A política dizia `using (fn_tem_modulo('spy'))`, com a função NUA. Escrita
-- assim, o Postgres a avalia UMA VEZ POR LINHA, mesmo ela sendo STABLE e mesmo
-- não dependendo de linha nenhuma: ela não fala sobre a linha, mas o
-- planejador não tem como saber disso e não a tira do laço.
--
-- Uma chamada custa 2ms. Em `spy_analise`, com 78 linhas, ninguém percebe. Em
-- `spy_transacao`, com 71.765, são 2ms × 71.765 e a conta fecha em NOVE
-- SEGUNDOS. O papel `authenticated` tem `statement_timeout = 8s`.
--
-- Ou seja: toda requisição da tela estourava o relógio antes de responder. A
-- primeira delas é a contagem, e o código do navegador lê o `count` sem olhar o
-- erro: contagem que falha vira zero, zero vira "não há o que carregar", e a
-- tela desenha um banco vazio sem reclamar de nada. Daí "não está carregando".
--
-- Medido, com a identidade do Diego e RLS ligada:
--
--   select count(*) from spy_transacao
--     com a função nua ............. 9.687 ms   (estoura os 8s)
--     dentro de (select ...) ..........  84 ms
--
-- ─────────────────────────────── o que muda aqui ────────────────────────────
--
-- A REGRA É A MESMA. `(select fn_tem_modulo('spy'))` permite exatamente quem
-- `fn_tem_modulo('spy')` permitia: ninguém ganha nem perde acesso. O que muda é
-- só ONDE a conta é feita: dentro de um subselect escalar ela vira um InitPlan,
-- calculado uma vez antes da varredura, e o resultado é reusado em todas as
-- linhas.
--
-- As três tabelas do módulo levam o mesmo tratamento porque têm a mesma
-- política. `spy_analise` e `spy_flag` são pequenas hoje e não doem; ficam
-- iguais para que a próxima que crescer não repita a história.
--
-- FICA SABIDO, e não é mexido aqui: `audit_log` tem o mesmo formato de problema
-- com `auth.uid()` nu (medido: 1.638 ms para 4.025 linhas). Ainda cabe nos 8s,
-- mas cresce todo dia. É outro chamado, com outro risco, e não se conserta de
-- carona neste.

drop policy if exists "spy_transacao_modulo" on public.spy_transacao;
create policy "spy_transacao_modulo" on public.spy_transacao
  for all to authenticated
  using ((select public.fn_tem_modulo('spy')))
  with check ((select public.fn_tem_modulo('spy')));

drop policy if exists "spy_analise_modulo" on public.spy_analise;
create policy "spy_analise_modulo" on public.spy_analise
  for all to authenticated
  using ((select public.fn_tem_modulo('spy')))
  with check ((select public.fn_tem_modulo('spy')));

drop policy if exists "spy_flag_modulo" on public.spy_flag;
create policy "spy_flag_modulo" on public.spy_flag
  for all to authenticated
  using ((select public.fn_tem_modulo('spy')))
  with check ((select public.fn_tem_modulo('spy')));
