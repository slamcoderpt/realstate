-- ============================================================
-- TILWENI Fase A · Fatia 4 — Subscrição (manifestação de interesse)
-- subscriptions + RLS + audit + bucket contracts + settings +
-- alargamento da RLS de projects + revoke de grants de escrita.
-- Escrita: exclusivamente via Server Actions com service role.
-- ============================================================

create type public.subscription_status as enum (
  'interesse', 'contrato_assinado', 'fundos_confirmados', 'cancelada'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status public.subscription_status not null default 'interesse',
  consent_given boolean not null,
  terms_version text not null,
  interest_ip inet,
  contract_path text,
  signed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_ref text,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_consent_required check (consent_given = true)
);

create index subscriptions_project_idx on public.subscriptions (project_id);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- Um investidor só pode ter UMA subscrição ativa (não cancelada) por projeto.
create unique index subscriptions_one_active_per_user_project
  on public.subscriptions (project_id, user_id)
  where status <> 'cancelada';

alter table public.subscriptions enable row level security;

-- Investidor lê as SUAS subscrições.
create policy "subscriptions: dono lê"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Staff lê todas.
create policy "subscriptions: staff lê"
  on public.subscriptions for select
  to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de escrita: só service role.

-- Auditoria (reutiliza audit_row_change da Fatia 0).
create trigger subscriptions_audit
  after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row_change();

-- ---------- Alargar a RLS de projects: investidor vê onde tem subscrição ----------
-- Políticas SELECT permissivas somam-se (OR). Esta adiciona a visibilidade dos
-- projetos onde o investidor tem uma subscrição ativa, mesmo fora de 'subscricao'.
create policy "projects: investidor com subscrição"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.project_id = projects.id
        and s.user_id = auth.uid()
        and s.status <> 'cancelada'
    )
  );

-- ---------- Storage: bucket privado de contratos ----------
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- ---------- settings ----------
insert into public.platform_settings (key, value, description) values
  ('min_subscription_amount', '5000'::jsonb,
   'Montante mínimo por subscrição (€). Evita fracionamento massificado (spec secção 4).')
on conflict (key) do nothing;

-- ---------- Grants (hardening repo-wide): sem escrita para anon/authenticated ----------
-- Nova tabela traz DML completo por default privileges; a RLS é a barreira, mas
-- mantém-se a defesa em profundidade (ver 20260720143649_revoke_anon_writes.sql).
revoke insert, update, delete, truncate on public.subscriptions
  from anon, authenticated;
