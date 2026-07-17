-- ============================================================
-- TILWENI Fase A · Fatia 0 — Fundações
-- profiles, platform_settings, audit_log (append-only) + triggers
-- ============================================================

-- ---------- Tipos ----------
create type public.user_role as enum ('investor', 'project_manager', 'admin', 'auditor');
create type public.kyc_status as enum ('pending', 'submitted', 'approved', 'rejected');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'investor',
  kyc_status public.kyc_status not null default 'pending',
  preferred_locale text not null default 'pt' check (preferred_locale in ('pt', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Função security definer para consultar o role sem recursão de RLS.
-- O owner (postgres) tem BYPASSRLS, portanto o select interno não reavalia
-- as políticas de profiles — é isto que quebra a recursão.
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "profiles: ler o próprio"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: staff lê todos"
  on public.profiles for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Investidor pode atualizar apenas campos não sensíveis do próprio perfil.
-- role e kyc_status são protegidos por trigger (abaixo); alterações de role/kyc
-- fazem-se por Server Action com service role.
create policy "profiles: atualizar o próprio"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Default-deny: só roles de confiança podem mexer em role/kyc_status.
-- Usamos current_user (o contexto efetivo de privilégio que o PostgREST
-- assume via SET ROLE) em vez de uma claim do JWT: uma claim ausente ou
-- malformada faria a proteção desaparecer silenciosamente, enquanto
-- current_user não pode ser forjado sem já se ter o privilégio.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.role := old.role;
    new.kyc_status := old.kyc_status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Auto-criação de perfil quando nasce um auth.user
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'locale', 'pt')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- platform_settings ----------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "settings: autenticados leem"
  on public.platform_settings for select
  to authenticated
  using (true);

-- Sem políticas de escrita: escritas só via service role (Server Actions).

insert into public.platform_settings (key, value, description) values
  ('max_investors_per_project', 'null'::jsonb,
   'Nº máximo de investidores por projeto — definir após parecer jurídico (Fase 0)'),
  ('invite_validity_days', '14'::jsonb,
   'Validade dos convites nominativos, em dias'),
  ('budget_deviation_alert_pct', '10'::jsonb,
   'Limiar (%) de desvio orçamental que dispara alerta interno'),
  ('risk_notice', jsonb_build_object(
     'pt', 'O investimento envolve risco de perda total do capital investido, é ilíquido e não beneficia de qualquer garantia de retorno.',
     'en', 'This investment involves the risk of total loss of invested capital, is illiquid and carries no guarantee of return.'
   ),
   'Aviso de risco padronizado, incluído em todas as comunicações a investidores');

-- ---------- audit_log (append-only) ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit: admin e auditor leem"
  on public.audit_log for select
  using (public.current_user_role() in ('admin', 'auditor'));

-- Imutabilidade, camada 1: sem grants de UPDATE/DELETE/TRUNCATE para os roles
-- do PostgREST (incl. service_role, que tem BYPASSRLS mas continua sujeito a
-- grants). TRUNCATE é essencial aqui: os grants por omissão do Supabase em
-- public incluem-no, RLS não se aplica a TRUNCATE e um trigger FOR EACH ROW
-- não dispara — sem este revoke, o service_role apagava o log inteiro.
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- Imutabilidade, camada 2 (cinto-e-suspensórios): o owner da tabela (postgres)
-- não é travado por grants, logo só os triggers o impedem.
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log é append-only: % não permitido', tg_op;
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

-- TRUNCATE só admite triggers FOR EACH STATEMENT.
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.reject_audit_mutation();

-- Trigger genérico de auditoria para tabelas sensíveis
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rec jsonb;
begin
  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key'),
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger platform_settings_audit
  after insert or update or delete on public.platform_settings
  for each row execute function public.audit_row_change();
