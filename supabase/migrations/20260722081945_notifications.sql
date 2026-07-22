-- ============================================================
-- TILWENI Fase A · Fatia 6 — Notificações in-app + RPC de settings
--
-- A spec (secções 3, 5.5, 5.6) promete "in-app + email"; até aqui só existia
-- email. Uma notificação é PESSOAL: só o dono a lê — nem staff, nem auditor.
--
-- Guarda-se `type` + `payload`, NÃO texto renderizado. A cópia vive no i18n
-- (namespace `Notifications`), pelo que uma notificação antiga acompanha a
-- mudança de idioma do utilizador em vez de ficar congelada na língua que ele
-- usava no dia em que foi criada. É também a razão para não haver colunas
-- title/body: seriam cópia duplicada entre a BD e as mensagens.
-- ============================================================

create type public.notification_type as enum (
  'kyc_approved',
  'kyc_rejected',
  'subscription_confirmed',
  'work_update',
  'statement'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- Índice parcial para a contagem de não-lidas do sino, que corre em cada pedido.
create index notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: dono lê"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

-- Sem política de escrita: marcar como lida passa por Server Action com service
-- role, como todas as escritas deste repo.

-- ---------- Grants ----------
revoke insert, update, delete, truncate on public.notifications
  from anon, authenticated;
revoke select on public.notifications from anon;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ============================================================
-- RPC para escrever platform_settings
--
-- PORQUÊ existir: `platform_settings.value` é `jsonb NOT NULL` e o "sem limite"
-- de `max_investors_per_project` é o jsonb `null`. Via PostgREST não há forma de
-- o escrever — `{value: null}` é serializado como SQL NULL e falha com 23502.
-- Isto já mordeu o repo uma vez (o reset dos testes de subscrição era um no-op
-- silencioso, ver tests/integration/subscriptions.test.ts). O back-office de
-- definições precisa de escrever jsonb null, logo precisa deste caminho.
--
-- O valor entra como TEXTO e é convertido aqui: a string 'null' torna-se jsonb
-- null, e não SQL NULL. Um JSON inválido rebenta no cast, que é o que se quer.
-- ============================================================
create or replace function public.set_platform_setting(
  p_key text,
  p_value_json text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_settings
  set value = p_value_json::jsonb,
      updated_at = now()
  where key = p_key;
  if not found then
    raise exception 'definição % não existe', p_key;
  end if;
end;
$$;

-- SECURITY DEFINER: revogar dos TRÊS (revogar só de PUBLIC não remove o grant
-- explícito que o Supabase dá a anon/authenticated — armadilha já documentada
-- em 20260721151000_definer_helpers_sem_anon.sql). Só o service_role executa;
-- a autorização de "quem é admin" é feita na Server Action.
revoke execute on function public.set_platform_setting(text, text)
  from public, anon, authenticated;
grant execute on function public.set_platform_setting(text, text)
  to service_role;
