-- A JORNADA DE CLIENTE PRECISA CABER NAS TRAVAS.
--
-- A migração anterior criou a etapa 'cliente_novo' e a jornada 'cliente', e a
-- primeira virada de lead em cliente bateu na parede:
--
--   new row for relation "wa_conversas" violates check constraint
--   "wa_conversas_etapa_check"
--
-- Havia DUAS travas e o erro só mostrou a primeira, porque a segunda nem chegou
-- a ser avaliada. `jornada` também só aceitava 'padrao' e 'bradesco', e teria
-- estourado no instante seguinte à correção da outra.
--
-- As travas estavam certas em existir: é elas que impedem uma etapa escrita
-- errado de entrar e sumir do funil sem que ninguém veja. O que faltava era
-- incluir o degrau novo nas duas.

alter table public.wa_conversas
  drop constraint if exists wa_conversas_etapa_check;

alter table public.wa_conversas
  add constraint wa_conversas_etapa_check check (
    etapa is null or etapa = any (array[
      -- régua padrão
      'chegou', 'triagem', 'extrato', 'proposta', 'fechado',
      -- régua Bradesco
      'na_base', 'aguardando_extrato', 'aguardando_analise',
      'aguardando_documentos', 'aguardando_assinatura', 'assinado',
      -- saída do funil, nas duas
      'perdido',
      /* DEPOIS DO FUNIL. Quem virou cliente não está mais numa etapa de lead:
         o atendimento dele começa de novo, do outro lado, com outras perguntas. */
      'cliente_novo'
    ])
  );

alter table public.wa_conversas
  drop constraint if exists wa_conversas_jornada_check;

alter table public.wa_conversas
  add constraint wa_conversas_jornada_check check (
    jornada = any (array['padrao', 'bradesco', 'cliente'])
  );
