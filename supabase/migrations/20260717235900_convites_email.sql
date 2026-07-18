-- ============================================================
-- TILWENI Fase A · Fatia 1 — Convites + Email
-- invites (token hasheado) + email_outbox (fila com retry) + RLS + audit
-- ============================================================

-- Nota: emails são normalizados (lowercase/trim) na aplicação antes de gravar,
-- pelo que se usa `text` simples (sem a extensão citext, que no Supabase vive no
-- schema `extensions` e complicaria a resolução do tipo nas migrações).

-- ---------- Tipos ----------
create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.email_status as enum ('queued', 'sending', 'sent', 'failed', 'dead');

-- ---------- invites ----------
-- O token viaja no link do email; aqui guarda-se apenas sha256(token). Um
-- vazamento desta tabela não permite forjar aceitações — é preciso o token em
-- claro, que só o destinatário do email tem.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  role public.user_role not null default 'investor',
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_ip inet,
  terms_version text,
  created_at timestamptz not null default now()
);

create index invites_email_idx on public.invites (email);
create index invites_status_idx on public.invites (status);

alter table public.invites enable row level security;

-- Leitura: apenas staff. Sem políticas de escrita — convites nascem e mudam de
-- estado exclusivamente via Server Actions com service role (que faz bypass a RLS
-- por grant), com validação de negócio e atribuição de ator no audit log.
create policy "invites: staff lê"
  on public.invites for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- email_outbox ----------
-- Fila de email desacoplada do request: garante que nenhum envio se perde e que
-- fica registado (relevante para o log de convites). Processada por um poller
-- (pg_cron → Route Handler) com backoff exponencial e dead-letter.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  to_name text,
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Índice para o poller: apanha rapidamente o que está pronto a enviar.
create index email_outbox_due_idx
  on public.email_outbox (next_attempt_at)
  where status in ('queued', 'failed');

alter table public.email_outbox enable row level security;

-- Leitura: apenas admin (dead-letter/monitorização no back-office). Escrita só
-- via service role. Sem audit trigger de propósito: o poller atualiza estado a
-- cada passagem e inundaria o audit_log — a fila é operacional, não probatória.
create policy "email_outbox: admin lê"
  on public.email_outbox for select
  using (public.current_user_role() = 'admin');

-- ---------- Auditoria ----------
-- Reutiliza public.audit_row_change (Fatia 0). Só invites é auditado.
create trigger invites_audit
  after insert or update or delete on public.invites
  for each row execute function public.audit_row_change();

-- ---------- Settings ----------
-- Versão dos textos legais aceites no convite (risco + iliquidez + termos).
-- O invites.terms_version regista qual a versão que o investidor aceitou.
insert into public.platform_settings (key, value, description) values
  ('terms_version', '"2026-07"'::jsonb,
   'Versão atual dos textos legais (risco/iliquidez/termos) apresentados na aceitação de convite');
