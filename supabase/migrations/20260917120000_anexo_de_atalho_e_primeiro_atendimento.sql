-- ANEXO DE MENSAGEM RÁPIDA E DE PRIMEIRO ATENDIMENTO NUNCA SUBIU.
--
-- A política de INSERT do bucket `wa-midia` listava dois prefixos, `enviados/`
-- e `agendados/`, e a aplicação usa QUATRO. Os dois que faltavam morriam na
-- RLS, com "new row violates row-level security policy" aparecendo na tela
-- como "Não consegui subir <arquivo>".
--
--   enviados/…                     envio direto            (estava na lista)
--   agendados/<conversa>/…         mensagem agendada       (estava na lista)
--   agendados/modelos/<rodada>/…   modelo de follow-up     (passava por tabela)
--   atalhos/<comando>/…            MENSAGEM RÁPIDA (/)     ← barrado
--   atendimento/<inst>/<faixa>/…   PRIMEIRO ATENDIMENTO    ← barrado
--
-- Não era caso raro nem de vídeo: o bucket tem ZERO objetos nesses dois
-- prefixos desde que existem, e nenhum atalho ou mensagem de primeiro
-- atendimento tem anexo gravado. Qualquer arquivo, de qualquer tipo e
-- tamanho, sempre falhou nos dois lugares. A queixa chegou como "não dá pra
-- salvar vídeo" porque vídeo foi o que a pessoa tentou.
--
-- A lista de prefixos continua existindo, e continua fechada de propósito: o
-- mesmo bucket guarda o que o webhook grava com a chave de serviço (`fotos/` e
-- as pastas por id de conversa), e a tela não tem o que escrever lá. O que
-- muda é que ela passa a cobrir tudo que a aplicação realmente usa.
drop policy if exists wa_midia_envia on storage.objects;

create policy wa_midia_envia
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wa-midia'
    and (fn_is_admin() or tem_modulo('atendimento'))
    and (
      name like 'enviados/%'
      or name like 'agendados/%'
      or name like 'atalhos/%'
      or name like 'atendimento/%'
    )
  );
