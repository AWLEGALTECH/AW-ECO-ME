-- O RAMO DE UMA DECISÃO DEIXOU DE SER SÓ "entao"/"senao".
--
-- O passo "Escolha" bifurca em N casos, e o ramo que a execução grava passou a
-- ser o ID DO CASO. A versão anterior desta função tinha, no WHERE do update,
-- `and p_ramo in ('entao','senao')`: com um id de caso ela não gravava nada e
-- NÃO DAVA ERRO, porque um update que casa zero linhas é sucesso em SQL.
--
-- O estrago seria invisível e intermitente. Dentro da mesma rodada o executor
-- guarda a decisão em memória e segue normalmente; o buraco só aparece depois
-- de um passo "esperar", quando a execução volta do zero, lê `decisoes` sem o
-- caso, decide de novo e pode entrar por outra porta. O lead receberia duas
-- recepções diferentes do mesmo fluxo, e o histórico não explicaria por quê.
--
-- A lista fechada era uma guarda contra lixo, e continua havendo uma: ramo e
-- passo não podem ser vazios, e o update tem que ter achado a execução. A
-- diferença é que agora a guarda FALHA ALTO, em vez de não fazer nada.
create or replace function public.fn_wa_automacao_decidir(p_id uuid, p_passo text, p_ramo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  if coalesce(btrim(p_passo), '') = '' or coalesce(btrim(p_ramo), '') = '' then
    raise exception 'decidir: passo e ramo são obrigatórios (passo=%, ramo=%)', p_passo, p_ramo;
  end if;

  update public.wa_automacao_execucoes
     set decisoes = coalesce(decisoes, '{}'::jsonb) || jsonb_build_object(btrim(p_passo), btrim(p_ramo))
   where id = p_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'decidir: execução % não existe', p_id;
  end if;
end
$function$;
