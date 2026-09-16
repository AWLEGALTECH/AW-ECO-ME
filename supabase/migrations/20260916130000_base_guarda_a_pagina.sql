-- DE ONDE OS LEADS DESTA BASE VÊM.
--
-- A base guardava a planilha (o destino) e não a página (a origem). Na prática
-- quem trabalha a base precisa abrir a landing o tempo todo: para conferir o
-- que exatamente foi perguntado, para mandar o link a alguém, para ver se o
-- formulário ainda está de pé depois de uma campanha. Sem o link aqui, isso
-- vira "procura no navegador de quem lembrar".
alter table public.leads_fontes
  add column if not exists pagina text;

comment on column public.leads_fontes.pagina is
  'A landing page que alimenta esta base. É a origem; a planilha é o destino.';

update public.leads_fontes
   set pagina = 'https://empresarial-dr-matheus.vercel.app/'
 where nome = 'Leads Empresariais' and coalesce(pagina, '') = '';
