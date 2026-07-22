-- ============================================================
-- TILWENI · MFA opcional
-- ============================================================
-- MFA deixa de ser obrigatória. Regras (impostas no middleware):
--   - quem JÁ tem um fator TOTP verificado → desafio obrigatório no login;
--   - quem NÃO tem fator → no 1º login vê o ecrã de configuração com opção de
--     ignorar; se ignorar, `mfa_prompt_seen` fica true e não é reincomodado;
--   - ativação opcional a partir de /perfil.
--
-- Para o middleware decidir localmente (sem query por navegação), o hook do JWT
-- passa a incluir `has_mfa` (tem fator verificado?) e `mfa_prompt_seen`.

alter table public.profiles
  add column if not exists mfa_prompt_seen boolean not null default false;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
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
