-- A janela de aprendizado do @lid cai de 90 para 15 segundos.
--
-- O aprendizado funciona assim: a tela avisa que abriu a conversa, o servidor
-- carimba a linha e anuncia a nossa presença ao contato; a Evolution responde
-- com a presença DELE em um a três segundos, identificada por um lid que a
-- gente ainda não conhece. Coincidência no tempo é o que amarra o par.
--
-- COM NOVENTA SEGUNDOS O ALVO FICAVA ABERTO O MINUTO INTEIRO. E o batimento
-- reanuncia a presença a cada sessenta, então na prática a janela nunca
-- fechava: qualquer presença de OUTRO contato que chegasse por acaso naquele
-- intervalo seria vinculada ao telefone da conversa aberta. Vínculo errado não
-- dá erro nenhum — ele mostra "digitando" no nome de quem não está digitando, e
-- quem lê a tela decide se insiste com o cliente em cima disso. Silencioso e
-- caro, que é a pior combinação.
--
-- Quinze segundos cobrem a resposta real com folga de cinco vezes, e fecham a
-- porta pelos outros quarenta e cinco de cada minuto.
--
-- A trava mais forte continua sendo a outra: telefone que já tem lid não ganha
-- outro. Se a presença desconhecida chega enquanto uma conversa já vinculada
-- está aberta, ela é de outra pessoa — e vincular ali seria trocar as
-- identidades das duas.

create or replace function public.fn_wa_aprender_lid(p_instancia text, p_lid text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tel text;
  v_qtd int;
begin
  if p_lid is null or p_lid = '' or p_instancia is null then
    return null;
  end if;

  select telefone into v_tel
    from public.wa_lids
   where instancia = p_instancia and lid = p_lid;
  if found then
    return v_tel;
  end if;

  select count(*), min(telefone) into v_qtd, v_tel
    from public.wa_conversas
   where instancia = p_instancia
     and presenca_pedida_em > now() - interval '15 seconds';

  if v_qtd <> 1 then
    select count(*), min(telefone) into v_qtd, v_tel
      from public.wa_conversas
     where instancia = p_instancia
       and ultima_em > now() - interval '15 seconds';
  end if;

  if v_qtd <> 1 or v_tel is null then
    return null;
  end if;

  if exists (select 1 from public.wa_lids
              where instancia = p_instancia and telefone = v_tel) then
    return null;
  end if;

  insert into public.wa_lids (instancia, lid, telefone)
       values (p_instancia, p_lid, v_tel)
  on conflict (instancia, lid) do nothing;

  return v_tel;
end $$;
