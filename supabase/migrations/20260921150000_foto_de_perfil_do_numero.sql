-- A FOTO DE PERFIL DO NÚMERO, TROCADA PELA PLATAFORMA.
--
-- Pedido do chefe (21/09): trocar a foto do WhatsApp de cada número sem sair
-- do Atendimento. Hoje isso é abrir o celular pareado, ou o painel da
-- Evolution, que nem todo mundo tem.
--
-- O caminho é o mesmo do envio de mídia: a imagem sobe para o bucket pelo
-- navegador (já comprimida para WebP), a edge function assina um link de uma
-- hora e entrega esse link à Evolution, que baixa e aplica. Base64 atravessando
-- a função é o desenho que já estourou o AW-ECO uma vez.
--
-- O bucket `wa-midia` tem lista fechada de prefixos de escrita (ver a
-- migration de 17/09 sobre atalhos/ e atendimento/), e é isso que impede a
-- tela de gravar onde o webhook grava com a chave de serviço. `perfil/` entra
-- na lista pelo mesmo motivo que os outros: é um lugar onde a tela escreve.

drop policy if exists wa_midia_envia on storage.objects;
create policy wa_midia_envia on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wa-midia'
    and (public.fn_is_admin() or public.tem_modulo('atendimento'))
    and (
      name like 'enviados/%'
      or name like 'agendados/%'
      or name like 'atalhos/%'
      or name like 'atendimento/%'
      or name like 'perfil/%'
    )
  );
