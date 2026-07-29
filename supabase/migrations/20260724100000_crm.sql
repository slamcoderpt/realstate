-- ============================================================
-- TILWENI — CRM de investidores (Fatia A · pipeline + kanban)
--
-- Captação e qualificação de prospects ANTES do funil de convite→registo→KYC.
-- Só staff (admin / project_manager). Escrita exclusivamente via Server Actions
-- com service role; a RLS é a barreira de leitura. Reutiliza audit_row_change.
--
-- Fatia A: leads + atividades + kanban. A conversão em convite (ligar
-- converted_invite_id/converted_user_id) fica para a Fatia B — as colunas já
-- existem aqui para não voltar a mexer no esquema.
-- ============================================================

create type public.crm_stage as enum (
  'novo', 'contactado', 'qualificado', 'reuniao',
  'convite_enviado', 'convertido', 'perdido'
);

create type public.crm_source as enum (
  'referencia', 'evento', 'website', 'linkedin', 'outro'
);

create type public.crm_investor_profile as enum (
  'retail', 'qualificado', 'institucional'
);

create type public.crm_activity_type as enum (
  'nota', 'chamada', 'email', 'reuniao', 'mudanca_estado'
);

-- ---------- crm_leads ----------
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null default '',
  source public.crm_source not null default 'outro',
  stage public.crm_stage not null default 'novo',
  owner_id uuid references auth.users (id) on delete set null,
  investor_profile public.crm_investor_profile,
  estimated_ticket numeric(12,2) check (estimated_ticket is null or estimated_ticket >= 0),
  notes text not null default '',
  tags text[] not null default '{}',
  -- Ligações de conversão (preenchidas na Fatia B).
  converted_invite_id uuid references public.invites (id) on delete set null,
  converted_user_id uuid references auth.users (id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_leads_stage_idx on public.crm_leads (stage);
create index crm_leads_owner_idx on public.crm_leads (owner_id);
create index crm_leads_email_idx on public.crm_leads (email);

alter table public.crm_leads enable row level security;

create policy "crm_leads: staff lê"
  on public.crm_leads for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- crm_activities ----------
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  type public.crm_activity_type not null default 'nota',
  body text not null default '',
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_activities_lead_idx on public.crm_activities (lead_id, created_at desc);
create index crm_activities_due_idx on public.crm_activities (due_at) where due_at is not null;

alter table public.crm_activities enable row level security;

create policy "crm_activities: staff lê"
  on public.crm_activities for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- Auditoria ----------
create trigger crm_leads_audit
  after insert or update or delete on public.crm_leads
  for each row execute function public.audit_row_change();
create trigger crm_activities_audit
  after insert or update or delete on public.crm_activities
  for each row execute function public.audit_row_change();

-- ---------- Grants (convenção do repo: cada tabela nova traz os seus) ----------
revoke insert, update, delete, truncate on public.crm_leads
  from anon, authenticated;
revoke insert, update, delete, truncate on public.crm_activities
  from anon, authenticated;
grant select, insert, update, delete on public.crm_leads      to service_role;
grant select, insert, update, delete on public.crm_activities to service_role;
-- authenticated: só SELECT — a RLS restringe as LINHAS (staff).
grant select on public.crm_leads      to authenticated;
grant select on public.crm_activities to authenticated;
-- anon: NENHUM grant. Políticas são `to authenticated`.
