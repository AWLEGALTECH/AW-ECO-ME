-- Duas correcoes na tela de Equipe.
--
-- 1. ULTIMO ACESSO ESTAVA MENTINDO.
--    auth.users.last_sign_in_at so muda quando a pessoa digita a senha de
--    novo. Quem fica logado tem o token renovado silenciosamente, e o campo
--    congela na ultima vez que houve login de verdade — dois usuarios
--    apareciam sumidos ha mais de um mes enquanto trabalhavam no sistema
--    naquele mesmo dia.
--    O sinal certo e auth.sessions.updated_at, que acompanha a renovacao do
--    token, ou seja, a sessao viva. Fica o maior entre os dois, porque um
--    login recentissimo pode ainda nao ter gerado renovacao.
--
-- 2. O UPLOAD DE FOTO NUNCA FUNCIONOU.
--    O painel do usuario ja envia a foto para o bucket 'avatars' desde
--    sempre, mas o bucket nunca foi criado — toda tentativa falhava com
--    "Bucket not found". Por isso os cinco usuarios estao sem foto.

create or replace function public.fn_admin_usuarios()
returns table (
  id                uuid,
  email             text,
  nome              text,
  avatar_url        text,
  role              text,
  approved          boolean,
  created_at        timestamptz,
  ultimo_acesso     timestamptz,
  modulos           int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fn_is_admin() then
    raise exception 'apenas administradores';
  end if;

  return query
  select p.id, p.email, p.nome, p.avatar_url, p.role, p.approved, p.created_at,
         greatest(
           u.last_sign_in_at,
           (select max(s.updated_at) from auth.sessions s where s.user_id = p.id)
         ),
         (select count(*)::int from public.user_module_access a where a.user_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
   order by p.nome nulls last, p.email;
end;
$function$;

grant execute on function public.fn_admin_usuarios() to authenticated;

-- ── Bucket das fotos ────────────────────────────────────────────────────────
-- Publico na leitura: a foto aparece em card e em lista, e um bucket privado
-- exigiria URL assinada em cada render, com validade, para uma imagem que nao
-- e segredo nenhum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Cada um manda na sua propria pasta. O caminho e '<user_id>/avatar.<ext>',
-- entao a primeira pasta do caminho e a dona do arquivo.
drop policy if exists "avatars_leitura_publica" on storage.objects;
create policy "avatars_leitura_publica" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_dono_insere" on storage.objects;
create policy "avatars_dono_insere" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_dono_atualiza" on storage.objects;
create policy "avatars_dono_atualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_dono_apaga" on storage.objects;
create policy "avatars_dono_apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
