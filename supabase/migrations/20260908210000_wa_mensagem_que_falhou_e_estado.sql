-- "ERROR" DA EVOLUTION VIRA UM ESTADO, EM VEZ DE VIRAR NADA.
--
-- O que aconteceu hoje, e é o motivo desta migração existir: a instância
-- PORTAL DIREITO ABERTO reconectou às 19:35, perdeu a tabela de contatos, e
-- passou a endereçar os destinatários pelo telefone cru em vez do @lid — com o
-- nono dígito comido (`5592993000259` virou `559293000259@s.whatsapp.net`, um
-- número que não existe). A Evolution respondeu `status: "ERROR"` em ONZE
-- mensagens seguidas, para seis clientes diferentes.
--
-- E o sistema jogou as onze no lixo. O mapa de status do `wa-webhook` conhecia
-- SERVER_ACK, DELIVERY_ACK, READ e PLAYED; o que não estava no mapa caía num
-- `continue` silencioso. As mensagens ficaram paradas em "enviada" para sempre
-- — um risquinho na tela, idêntico ao de uma mensagem que saiu. Seis pessoas
-- esperando resposta de mensagens que nunca chegaram, e ninguém reenvia o que
-- parece enviado.
--
-- O vocabulário `falhou` JÁ EXISTIA de ponta a ponta (`marcaDeEnvio`,
-- `rotuloDoStatus`, o triângulo âmbar na bolha, o botão "tentar de novo").
-- Faltava só o webhook poder dizer a palavra, e esta função poder gravá-la.
--
-- ───────────────────── por que não é só mais um degrau ─────────────────────
--
-- A regra desta função é que status só ANDA PRA FRENTE: a Evolution reentrega
-- fora de ordem, e um "entregue" atrasado chegando depois do "lida" faria a
-- mensagem deslerse na cara de quem está olhando. `falhou` não cabe nessa
-- escada, porque ele não é um degrau — é uma notícia sobre a mesma etapa.
--
-- Então ele entra com DUAS regras próprias:
--
-- 1. `falhou` só grava por cima de "nada" ou de "enviada". Se a mensagem já
--    tinha DELIVERY_ACK, ela chegou no aparelho — e um ERROR atrasado não pode
--    desfazer uma entrega confirmada. Perder a entrega seria trocar um defeito
--    (silêncio) por outro (mentira no sentido contrário).
--
-- 2. Entrega e leitura de verdade PODEM sobrepor `falhou`. Ele pesa 1, igual a
--    "enviada". Se a Evolution errou o ERROR — ou se a mensagem saiu numa
--    retentativa dela — o "entregue" que vier depois corrige a tela sozinho.
--    Um estado de erro que não sabe voltar atrás vira um alarme falso preso.
-- ── 1. o schema precisa conhecer a palavra ─────────────────────────────────
--
-- `falhou` era um estado SÓ DE TELA: ele vivia na lista de pendentes do
-- navegador, para a bolha que nunca chegou a virar linha. Por isso o CHECK da
-- coluna nunca precisou dele — e por isso a primeira tentativa desta migração
-- foi recusada pelo banco, que estava certo em recusar. A partir daqui o
-- estado passa a existir também no histórico, porque agora ele descreve uma
-- mensagem que EXISTE e não chegou.
alter table public.wa_mensagens drop constraint if exists wa_mensagens_status_check;
alter table public.wa_mensagens add constraint wa_mensagens_status_check
  check (status is null or status = any (array['enviada','entregue','lida','tocada','falhou']));

-- ── 2. quem grava o estado ─────────────────────────────────────────────────
create or replace function public.fn_wa_status_mensagem(p_id_whatsapp text, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  /* `falhou` pesa o mesmo que `enviada`: as duas descrevem a mesma etapa (saiu
     da nossa mão), e o que as separa é a notícia, não o avanço. */
  v_peso constant jsonb := '{"enviada":1,"falhou":1,"entregue":2,"lida":3,"tocada":4}';
begin
  if p_id_whatsapp is null or p_status is null then return; end if;

  if p_status = 'falhou' then
    update public.wa_mensagens m
       set status = 'falhou', status_em = now()
     where m.id_whatsapp = p_id_whatsapp
       /* Nada ou "enviada". Nunca por cima de entrega confirmada. */
       and coalesce(m.status, '') in ('', 'enviada');
    return;
  end if;

  update public.wa_mensagens m
     set status = p_status, status_em = now()
   where m.id_whatsapp = p_id_whatsapp
     and coalesce((v_peso->>coalesce(m.status, ''))::int, 0) < coalesce((v_peso->>p_status)::int, 0);
end $function$;

comment on function public.fn_wa_status_mensagem(text, text) is
  'Move o status de uma mensagem enviada. So anda pra frente; "falhou" e a excecao, que grava sobre "enviada" e cede a uma entrega confirmada.';

/* ── as onze de hoje ────────────────────────────────────────────────────────
   Elas já receberam o ERROR e o evento cru ficou gravado em `wa_eventos` —
   é de lá que sai a correção, e não de um palpite sobre quais falharam.
   Sem isto, as onze continuariam com o risquinho de sempre até alguém
   reparar, que é justamente o que não aconteceu por duas horas. */
update public.wa_mensagens m
   set status = 'falhou', status_em = now()
 where coalesce(m.status, '') in ('', 'enviada')
   and exists (
     select 1 from public.wa_eventos e
      where e.evento = 'messages.update'
        and e.corpo->>'status' = 'ERROR'
        and e.corpo->>'keyId' = m.id_whatsapp
   );
