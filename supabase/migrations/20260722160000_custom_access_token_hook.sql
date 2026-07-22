-- ============================================================
-- TILWENI · Custom Access Token Hook — role + kyc_status no JWT
-- ============================================================
-- Injeta `user_role` e `kyc_status` nos claims do access token, para o
-- middleware e a casca (AppShell) os lerem LOCALMENTE (descodificando o JWT já
-- validado por getUser), em vez de consultarem `profiles` a cada navegação.
--
-- Fronteira de segurança inalterada: a RLS continua a decidir o acesso aos dados
-- lendo o role da BD (current_user_role), NÃO do JWT. Estes claims servem apenas
-- gating de UI/redirect. Os claims são assinados pelo Supabase (não forjáveis).
-- Trade-off: staleness — mudanças de role/kyc só entram no token no próximo
-- refresh/login. O middleware compensa o KYC confirmando na BD quando o claim
-- diz "não aprovado" (ver 20260722160000 no middleware).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_role text;
  v_kyc text;
begin
  select role::text, kyc_status::text
    into v_role, v_kyc
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{kyc_status}', to_jsonb(v_kyc));
    event := jsonb_set(event, '{claims}', claims);
  end if;

  return event;
end;
$$;

-- Só o GoTrue (supabase_auth_admin) invoca o hook; mais ninguém.
revoke execute on function public.custom_access_token_hook(jsonb)
  from anon, authenticated, public;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- O hook lê `profiles` em nome do supabase_auth_admin (role interno do Auth).
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
create policy "auth_admin lê profiles para os claims do token"
  on public.profiles for select
  to supabase_auth_admin
  using (true);
