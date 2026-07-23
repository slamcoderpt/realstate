-- ============================================================
-- Hardening · fixar o search_path do custom_access_token_hook
--
-- O advisor `function_search_path_mutable` assinala o hook por ter um
-- search_path mutável por role. Todas as referências já são qualificadas
-- (`public.profiles`, `auth.mfa_factors`), pelo que fixar o path NÃO altera
-- comportamento — apenas fecha o vetor de injeção por search_path e o aviso.
-- Path explícito `public, auth` (os dois schemas que o hook toca), em vez de
-- vazio, por prudência sobre uma função crítica do fluxo de autenticação.
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, auth
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_uid uuid := (event ->> 'user_id')::uuid;
  v_role text;
  v_kyc text;
  v_seen boolean;
  v_has_mfa boolean;
begin
  select role::text, kyc_status::text, mfa_prompt_seen
    into v_role, v_kyc, v_seen
  from public.profiles
  where id = v_uid;

  -- Tem pelo menos um fator TOTP verificado? (supabase_auth_admin lê auth.*)
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = v_uid and f.status = 'verified'
  ) into v_has_mfa;

  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{kyc_status}', to_jsonb(v_kyc));
    claims := jsonb_set(claims, '{mfa_prompt_seen}', to_jsonb(coalesce(v_seen, false)));
  end if;
  claims := jsonb_set(claims, '{has_mfa}', to_jsonb(coalesce(v_has_mfa, false)));

  return jsonb_set(event, '{claims}', claims);
end;
$$;
