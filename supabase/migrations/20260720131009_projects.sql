-- ============================================================
-- TILWENI Fase A · Fatia 3 — Catálogo de Projetos
-- projects + budget_lines + documents + photos + RLS + audit +
-- buckets privados (project-photos, project-docs) + settings.
--
-- Investidor lê apenas projetos em 'subscricao' (catálogo privado). Fatia 4
-- alargará a RLS para incluir projetos onde o investidor tem subscrição.
-- Escrita: exclusivamente via Server Actions com service role.
--
-- Nota RLS/anon: o catálogo é visível a todo o investidor convidado+KYC, i.e.
-- a uma sessão AUTENTICADA — nunca a anon. As políticas de visibilidade por
-- estado são `to authenticated`; o role staff é filtrado por current_user_role()
-- (null para anon → falso). A RLS é a ÚNICA barreira efetiva (ver nota nos grants).
-- ============================================================

create type public.project_status as enum (
  'preparacao', 'subscricao', 'subscrito', 'em_curso', 'concluido', 'liquidado'
);

create type public.project_doc_type as enum (
  'caderneta_predial', 'licenca', 'orcamento_empreiteiro', 'apolice_seguro', 'outro'
);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  description text not null default '',
  status public.project_status not null default 'preparacao',
  acquisition_cost numeric(12,2) not null default 0 check (acquisition_cost >= 0),
  works_budget numeric(12,2) not null default 0 check (works_budget >= 0),
  arv numeric(12,2) not null default 0 check (arv >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  subscribed_amount numeric(12,2) not null default 0 check (subscribed_amount >= 0),
  investor_count integer not null default 0 check (investor_count >= 0),
  estimated_irr numeric(5,2) not null default 0,
  term_months integer not null default 0 check (term_months >= 0),
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index projects_status_idx on public.projects (status);

alter table public.projects enable row level security;

-- Investidor (sessão autenticada) lê projetos em subscricao (catálogo privado).
create policy "projects: investidor lê subscricao"
  on public.projects for select
  to authenticated
  using (status = 'subscricao');

-- Staff lê todos.
create policy "projects: staff lê todos"
  on public.projects for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de escrita: só service role.

-- ---------- project_budget_lines ----------
create table public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  phase text not null default '',
  budget_amount numeric(12,2) not null default 0 check (budget_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_budget_lines_project_idx
  on public.project_budget_lines (project_id);

alter table public.project_budget_lines enable row level security;

-- Herdam a visibilidade do projeto pai.
create policy "budget_lines: visível se o projeto é visível"
  on public.project_budget_lines for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- project_photos ----------
create table public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_photos_project_idx on public.project_photos (project_id);

alter table public.project_photos enable row level security;

create policy "photos: visível se o projeto é visível"
  on public.project_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- project_documents ----------
create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  doc_type public.project_doc_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index project_documents_project_idx
  on public.project_documents (project_id);

alter table public.project_documents enable row level security;

create policy "project_docs: visível se o projeto é visível"
  on public.project_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- Auditoria (reutiliza audit_row_change da Fatia 0) ----------
create trigger projects_audit
  after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();

create trigger project_documents_audit
  after insert or update or delete on public.project_documents
  for each row execute function public.audit_row_change();

-- ---------- Grants (convenção do repo; ver 20260718000000_grants_rls_roles.sql) ----------
-- NOTA importante: o Supabase concede DML COMPLETO a anon/authenticated (e
-- service_role) via ALTER DEFAULT PRIVILEGES na criação da tabela. Não há aqui um
-- `grant select` a anon/authenticated porque seria um no-op — não restringe nada.
-- A RLS é a ÚNICA barreira efetiva: não existem políticas de escrita → toda a
-- escrita por anon/authenticated é NEGADA pela RLS, e a leitura é `to authenticated`
-- (anon não vê o catálogo). Quem escreve é o service_role, via Server Actions, que
-- bypassa a RLS. O grant explícito abaixo garante o DML do service_role também num
-- stack local fresco onde o auto-grant possa não ter corrido.
grant select, insert, update, delete on public.projects             to service_role;
grant select, insert, update, delete on public.project_budget_lines to service_role;
grant select, insert, update, delete on public.project_photos       to service_role;
grant select, insert, update, delete on public.project_documents    to service_role;

-- ---------- Storage: buckets privados ----------
-- Fotos e documentos servidos server-side com URLs assinadas. Documentos passam
-- por Route Handler auditado (como no KYC). Sem políticas em storage.objects.
insert into storage.buckets (id, name, public) values
  ('project-photos', 'project-photos', false),
  ('project-docs', 'project-docs', false)
on conflict (id) do nothing;

-- ---------- settings ----------
insert into public.platform_settings (key, value, description) values
  ('show_subscription_progress', 'true'::jsonb,
   'Mostrar progresso de subscrição (% subscrito, montante, contagem agregada) na ficha e catálogo. Decisão do utilizador; contraria a spec anti-crowdfunding original; validar no parecer da Fase 0.')
on conflict (key) do nothing;
