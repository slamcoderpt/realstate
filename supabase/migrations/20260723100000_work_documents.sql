-- ============================================================
-- TILWENI — Feedback do sócio (ponto 5) · Documentos/faturas da OBRA
--
-- Uma fatura é um documento; reaproveita-se o mecanismo seguro já usado nos
-- documentos do imóvel, extratos e contratos: bucket privado + URL assinada +
-- auditoria. Até agora a obra só aceitava fotos e vídeos (`work_update_media`);
-- passa a poder anexar DOCUMENTOS (PDF).
--
-- Um documento liga-se, opcionalmente, a UMA rubrica de custo real
-- (`budget_line_id`) e/ou a UMA atualização de obra (`work_update_id`) — ambos
-- anuláveis: pode ficar só ao nível do projeto (a "pasta do projeto").
--
-- RLS igual à obra: staff lê tudo; investidor com subscrição ATIVA vê os
-- documentos do projeto onde investiu. Escrita só por Server Actions (service
-- role). O upload passa pelo servidor (Server Action) — logo os bytes são
-- validados (magic-bytes) antes de subir, como nos extratos.
-- ============================================================

create table public.work_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  budget_line_id uuid references public.project_budget_lines (id) on delete set null,
  work_update_id uuid references public.work_updates (id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index work_documents_project_idx on public.work_documents (project_id, created_at desc);
create index work_documents_line_idx on public.work_documents (budget_line_id);
create index work_documents_update_idx on public.work_documents (work_update_id);

alter table public.work_documents enable row level security;

-- Investidor com subscrição ativa vê os documentos do projeto (reutiliza o
-- helper SECURITY DEFINER da fatia de obra).
create policy "work_docs: investidor com subscrição"
  on public.work_documents for select to authenticated
  using (public.has_active_subscription(project_id));
create policy "work_docs: staff"
  on public.work_documents for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Auditoria (reutiliza audit_row_change).
create trigger work_documents_audit
  after insert or update or delete on public.work_documents
  for each row execute function public.audit_row_change();

-- ---------- Storage: bucket privado de documentos de obra ----------
-- Upload pelo servidor (Server Action) — mas mantém-se o limite de tipo/tamanho
-- no bucket como defesa em profundidade. Só PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('work-docs', 'work-docs', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------- Grants (convenção do repo: cada tabela nova traz os seus) ----------
revoke insert, update, delete, truncate on public.work_documents
  from anon, authenticated;
grant select, insert, update, delete on public.work_documents to service_role;
-- authenticated: só SELECT — a RLS restringe as LINHAS.
grant select on public.work_documents to authenticated;
-- anon: NENHUM grant. Políticas são `to authenticated`.
