-- ============================================================
-- TILWENI Fase A · Fatia 2 — KYC
-- kyc_submissions + kyc_documents + RLS (staff-read) + audit +
-- bucket de Storage privado `kyc` (acesso só service role) + settings.
--
-- Escrita das submissões: exclusivamente via Server Actions com service role
-- (bypassa RLS por grant), com validação de negócio e atribuição de ator.
-- Investidores só LEEM as suas próprias linhas.
-- ============================================================

-- ---------- Tipos ----------
create type public.citizen_type as enum ('pt', 'foreign');
create type public.kyc_verification_method as enum ('document', 'cmd');
create type public.kyc_submission_status as enum ('submitted', 'approved', 'rejected');
create type public.kyc_doc_type as enum ('cartao_cidadao', 'id', 'comprovativo_morada');

-- ---------- kyc_submissions ----------
create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  citizen_type public.citizen_type not null,
  verification_method public.kyc_verification_method not null default 'document',
  nif text not null,
  full_name text not null,
  status public.kyc_submission_status not null default 'submitted',
  consent_given boolean not null,
  consent_version text not null,
  submitted_ip inet,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  -- Consentimento é obrigatório: uma submissão sem consentimento é inválida.
  constraint kyc_consent_required check (consent_given = true)
);

create index kyc_submissions_user_idx on public.kyc_submissions (user_id);
create index kyc_submissions_status_idx on public.kyc_submissions (status);

alter table public.kyc_submissions enable row level security;

-- Investidor lê as SUAS submissões.
create policy "kyc_submissions: dono lê"
  on public.kyc_submissions for select
  using (auth.uid() = user_id);

-- Staff lê todas.
create policy "kyc_submissions: staff lê"
  on public.kyc_submissions for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de INSERT/UPDATE/DELETE: escrita só via service role.

-- ---------- kyc_documents ----------
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.kyc_submissions (id) on delete cascade,
  doc_type public.kyc_doc_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index kyc_documents_submission_idx on public.kyc_documents (submission_id);

alter table public.kyc_documents enable row level security;

-- Investidor lê metadados dos documentos das SUAS submissões.
create policy "kyc_documents: dono lê"
  on public.kyc_documents for select
  using (
    exists (
      select 1 from public.kyc_submissions s
      where s.id = submission_id and s.user_id = auth.uid()
    )
  );

-- Staff lê todos.
create policy "kyc_documents: staff lê"
  on public.kyc_documents for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- Auditoria (reutiliza audit_row_change da Fatia 0) ----------
create trigger kyc_submissions_audit
  after insert or update or delete on public.kyc_submissions
  for each row execute function public.audit_row_change();

create trigger kyc_documents_audit
  after insert or update or delete on public.kyc_documents
  for each row execute function public.audit_row_change();

-- ---------- Storage: bucket privado `kyc` ----------
-- Sem políticas em storage.objects para este bucket: por defeito, anon e
-- authenticated ficam sem acesso. Todo o I/O (upload e leitura) é feito
-- server-side com service role, que bypassa RLS de storage. A visualização
-- passa por um Route Handler que audita a consulta antes de emitir URL assinada.
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- ---------- platform_settings do KYC ----------
insert into public.platform_settings (key, value, description) values
  ('kyc_consent_version', '"v1"'::jsonb,
   'Versão do texto de consentimento de tratamento de dados/documentos de KYC'),
  ('kyc_max_file_mb', '8'::jsonb,
   'Tamanho máximo por ficheiro de KYC (MB)'),
  ('kyc_allowed_mime', '["application/pdf","image/jpeg","image/png"]'::jsonb,
   'Tipos de ficheiro aceites no upload de KYC')
on conflict (key) do nothing;
