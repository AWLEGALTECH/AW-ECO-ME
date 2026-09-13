-- TROCAR A SITUAÇÃO MEXE NA RÉGUA, E NÃO SÓ NA ETIQUETA.
--
-- A régua de follow-up cobra lead calado. Quem deixa de ser lead (virou
-- cliente, é o advogado do banco, é da equipe) não pode continuar sendo
-- cobrado por WhatsApp como se estivesse no funil: sumir uma seção a pessoa
-- percebe na hora; a cobrança errada ninguém percebe até o constrangimento.
--
-- Por isso a troca desliga a régua do contato quando ele sai de lead. Quando
-- ele VOLTA a lead, a chave volta ao padrão (segue o número), e não a "ligado":
-- ligar cobrança à força é decisão de quem atende, não efeito colateral.

create or replace function public.fn_wa_mudar_situacao(
  p_conversa uuid,
  p_situacao text
)
returns table (ok boolean, erro text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_grupo uuid;
  v_de    text;
begin
  if not (public.fn_is_admin() or public.tem_modulo('atendimento')) then
    return query select false, 'Sem acesso ao atendimento'::text;
    return;
  end if;
  if p_situacao not in ('lead', 'cliente', 'contraparte', 'interno', 'outro') then
    return query select false, format('Situacao desconhecida: %s', p_situacao);
    return;
  end if;

  select grupo_id, situacao into v_grupo, v_de
    from public.wa_conversas where id = p_conversa;
  if not found then
    return query select false, 'Conversa nao encontrada'::text;
    return;
  end if;

  /* Vale para o GRUPO inteiro: a pessoa é uma só, em quantos números estiver. */
  update public.wa_conversas
     set situacao = p_situacao,
         followup_ativo = case
           when v_de = 'lead' and p_situacao <> 'lead' then false   -- saiu do funil: para de cobrar
           when v_de <> 'lead' and p_situacao = 'lead' then null    -- voltou: segue o número
           else followup_ativo
         end
   where id = p_conversa
      or (v_grupo is not null and grupo_id = v_grupo);

  return query select true, null::text;
end $$;
