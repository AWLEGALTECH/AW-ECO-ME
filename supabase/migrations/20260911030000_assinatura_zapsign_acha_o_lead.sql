-- A ASSINATURA DO ZAPSIGN VOLTA A MOVER A JORNADA DO LEAD.
--
-- O almyr assinou às 12:12 e a jornada ficou parada em "Aguardando assinatura".
-- Só andou às 12:21, quando alguém confirmou o pré-cliente na mão.
--
-- ── por que ─────────────────────────────────────────────────────────────────
-- Existem DUAS cópias do webhook do ZapSign publicadas neste projeto, as duas
-- chamadas "zapsign-webhook" no painel:
--
--   * slug `zapsign-webhook` — a que eu tinha editado para mover a jornada.
--     Ninguém chama. Zero invocações no log.
--   * slug `smooth-service`  — nome automático de quando foi criada, em julho.
--     É a que está configurada lá no ZapSign, e é a que recebeu o POST das
--     12:12 (o log mostra `POST | 200 | .../smooth-service?token=...`).
--
-- Ou seja: o passo da jornada foi parar na cópia errada. A correção de verdade
-- é publicar o código na `smooth-service`, que é o endereço que o ZapSign tem.
-- O slug não pode mudar: mudar quebraria a integração do lado deles.
--
-- ── e o casamento por nome ──────────────────────────────────────────────────
-- Aproveitando, a busca fica menos frágil. Duas coisas a derrubavam:
--
--   1. ACENTO. O nome vem do contrato, que veio do nosso kit, então costuma
--      bater igual. Mas basta alguém ter digitado "JOSE" onde o cadastro diz
--      "JOSÉ" para a comparação falhar, e falhar em silêncio.
--   2. CHEGAR TARDE. A busca só olhava pré-clientes em 'aguardando_assinatura'.
--      Se alguém confirma o pré-cliente antes de o webhook chegar (foi o que
--      aconteceu aqui, nove minutos depois), ele já não está nesse status e a
--      busca não acha mais ninguém. Agora também procura pelo CLIENTE, que é o
--      que o pré-cliente vira ao ser confirmado.
--
-- Continua sendo só para frente: `fn_wa_avancar_bradesco` não volta etapa nem
-- ressuscita lead perdido, então casar demais não estraga nada.

create or replace function public.fn_wa_assinatura_zapsign(p_nome text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r     record;
  n     int := 0;
  v_alvo text;
begin
  v_alvo := lower(btrim(public.unaccent(coalesce(p_nome, ''))));
  if v_alvo = '' then return 0; end if;

  for r in
    -- pelo pré-cliente que está esperando a assinatura
    select c.id
      from public.pre_clientes p
      join public.wa_conversas c
        on c.pre_cliente_id = p.id
        or (c.pre_cliente_id is null
            and public.fn_wa_tel8(c.telefone) = public.fn_wa_tel8(p.telefone)
            and length(public.fn_wa_tel8(p.telefone)) = 8)
     where p.status = 'aguardando_assinatura'
       and lower(btrim(public.unaccent(p.nome))) = v_alvo
    union
    -- ou pelo cliente já cadastrado, para quando o webhook chega depois da
    -- confirmação feita na mão
    select c.id
      from public.clientes cl
      join public.wa_conversas c on c.cliente_id = cl.id
     where lower(btrim(public.unaccent(cl.nome))) = v_alvo
  loop
    if public.fn_wa_avancar_bradesco(r.id, 'assinado') then n := n + 1; end if;
  end loop;
  return n;
end $function$;
