-- O LOG DA JORNADA PRECISA VER A ETAPA QUE OUTRO GATILHO MUDOU.
--
-- `trg_wa_etapa_log_mudou` era "after update OF etapa": só dispara quando a
-- coluna etapa está na lista SET do comando. Quando o atendente informa a base
-- e o gatilho de jornada (BEFORE) troca a etapa por conta própria, o comando
-- só escreveu `base`, e o log não via a mudança. Foi o que aconteceu na carga:
-- 62 conversas mudaram de etapa e nenhuma passagem foi registrada.
--
-- Passa a ser "after update" com a guarda `is distinct from` que a função já
-- tem. Linha que não mudou de etapa continua sem log.

drop trigger if exists trg_wa_etapa_log_mudou on public.wa_conversas;
create trigger trg_wa_etapa_log_mudou
  after update on public.wa_conversas
  for each row execute function public.fn_wa_etapa_log();

-- A carga que ficou sem registro: uma passagem por conversa cuja etapa atual
-- não tem linha no log. `estimado`, porque a hora em que a pessoa entrou de
-- fato naquela etapa não é agora; a tela já sabe dizer isso.
insert into public.wa_etapa_log (conversa_id, etapa, de, entrou_em, por, estimado)
select c.id, c.etapa,
       (select l.etapa from public.wa_etapa_log l where l.conversa_id = c.id order by l.entrou_em desc limit 1),
       clock_timestamp(), null, true
  from public.wa_conversas c
 where c.etapa is not null
   and not exists (select 1 from public.wa_etapa_log l
                    where l.conversa_id = c.id
                      and l.etapa = c.etapa
                      and l.entrou_em >= coalesce((select max(l2.entrou_em) from public.wa_etapa_log l2
                                                    where l2.conversa_id = c.id and l2.etapa <> c.etapa), '-infinity'));
