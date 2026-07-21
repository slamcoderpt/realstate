-- ============================================================
-- TILWENI Fase A · Fatia 5 — Obra + Extratos
-- marcos, diário de obra (+media), custo real por rubrica, extratos.
-- RLS: staff lê tudo; investidor com subscrição ATIVA vê obra; extratos só
-- para quem tem fundos_confirmados (registos financeiros da conta dedicada).
-- Escrita: exclusivamente via Server Actions com service role.
-- ============================================================

create type public.milestone_status as enum ('previsto', 'em_curso', 'concluido');
create type public.media_type as enum ('photo', 'video');

-- Helpers de visibilidade (evitam repetir o EXISTS em cada policy).
create or replace function public.has_active_subscription(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.project_id = p_project
      and s.user_id = auth.uid()
      and s.status <> 'cancelada'
  );
$$;

create or replace function public.has_confirmed_subscription(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.project_id = p_project
      and s.user_id = auth.uid()
      and s.status = 'fundos_confirmados'
  );
$$;

-- SECURITY DEFINER: revogar de public/anon/authenticated e conceder só onde é
-- preciso. Estas são usadas DENTRO de policies (executadas no contexto do
-- utilizador), por isso authenticated PRECISA de execute — mas são apenas
-- leituras booleanas sobre as próprias subscrições do chamador, sem escrita.
revoke execute on function public.has_active_subscription(uuid) from public;
revoke execute on function public.has_confirmed_subscription(uuid) from public;
grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;
grant execute on function public.has_confirmed_subscription(uuid) to authenticated, service_role;

-- ---------- project_milestones ----------
create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  planned_date date,
  actual_date date,
  status public.milestone_status not null default 'previsto',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id);
alter table public.project_milestones enable row level security;

create policy "milestones: investidor com subscrição"
  on public.project_milestones for select to authenticated
  using (public.has_active_subscription(project_id));
create policy "milestones: staff"
  on public.project_milestones for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- work_updates ----------
create table public.work_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index work_updates_project_idx on public.work_updates (project_id, published_at desc);
alter table public.work_updates enable row level security;

create policy "work_updates: investidor com subscrição"
  on public.work_updates for select to authenticated
  using (public.has_active_subscription(project_id));
create policy "work_updates: staff"
  on public.work_updates for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- work_update_media ----------
create table public.work_update_media (
  id uuid primary key default gen_random_uuid(),
  work_update_id uuid not null references public.work_updates (id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index work_update_media_update_idx on public.work_update_media (work_update_id);
alter table public.work_update_media enable row level security;

create policy "work_media: herda a visibilidade da atualização"
  on public.work_update_media for select to authenticated
  using (
    exists (
      select 1 from public.work_updates w
      where w.id = work_update_id
        and (public.has_active_subscription(w.project_id)
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- account_statements ----------
create table public.account_statements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  version integer not null default 1 check (version > 0),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, period, version)
);
create index account_statements_project_idx
  on public.account_statements (project_id, period desc, version desc);
alter table public.account_statements enable row level security;

-- Extratos: só investidores com fundos confirmados (e staff).
create policy "statements: investidor com fundos confirmados"
  on public.account_statements for select to authenticated
  using (public.has_confirmed_subscription(project_id));
create policy "statements: staff"
  on public.account_statements for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- custo real por rubrica ----------
alter table public.project_budget_lines
  add column actual_amount numeric(12,2) not null default 0
    check (actual_amount >= 0);

-- ---------- Auditoria ----------
create trigger work_updates_audit
  after insert or update or delete on public.work_updates
  for each row execute function public.audit_row_change();
create trigger account_statements_audit
  after insert or update or delete on public.account_statements
  for each row execute function public.audit_row_change();

-- ---------- Storage ----------
-- work-media aceita upload DIRETO do browser (URL assinada), pelo que a
-- validação de tipo/tamanho tem de viver no bucket — é o único ponto que o
-- servidor de Storage impõe num upload direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('work-media', 'work-media', false, 209715200,
   array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('statements', 'statements', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------- Grants (hardening repo-wide) ----------
-- Defesa em profundidade: mesmo que um auto-grant (Cloud / default privileges)
-- conceda DML, anon/authenticated nunca escrevem nestas tabelas.
revoke insert, update, delete, truncate on public.project_milestones
  from anon, authenticated;
revoke insert, update, delete, truncate on public.work_updates
  from anon, authenticated;
revoke insert, update, delete, truncate on public.work_update_media
  from anon, authenticated;
revoke insert, update, delete, truncate on public.account_statements
  from anon, authenticated;

-- Grants explícitos (CONVENÇÃO de 20260718000000_grants_rls_roles.sql: cada
-- tabela nova traz os seus próprios grants; não confiar no auto-grant).
-- Necessário de facto: a imagem `supabase/postgres:15.8.1.085` já NÃO aplica
-- default privileges de DML no schema public — sem isto, tudo devolve 42501
-- "permission denied" antes sequer de a RLS ser avaliada.
grant select, insert, update, delete on public.project_milestones to service_role;
grant select, insert, update, delete on public.work_updates        to service_role;
grant select, insert, update, delete on public.work_update_media   to service_role;
grant select, insert, update, delete on public.account_statements  to service_role;

-- authenticated: só SELECT — a RLS acima é que restringe as LINHAS.
grant select on public.project_milestones to authenticated;
grant select on public.work_updates       to authenticated;
grant select on public.work_update_media  to authenticated;
grant select on public.account_statements to authenticated;

-- anon: NENHUM grant. Todas as policies acima são `to authenticated`, logo anon
-- não tem sequer política aplicável; sem grant, a porta fecha uma camada antes.
-- (O leak histórico do catálogo veio de uma policy sem `to authenticated`
-- combinada com o auto-grant de SELECT a anon — aqui não existe nem um nem outro.)
