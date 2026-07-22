-- ============================================================
-- TILWENI · password_resets — recuperação de palavra-passe
--
-- PORQUÊ tabela própria e não o `recovery` do Supabase Auth: o produto promete
-- SMTP configurado num sítio só e emails que seguem o `preferred_locale` do
-- investidor. O fluxo nativo enviaria por outro canal, noutra língua e fora da
-- `email_outbox` — e o back-office deixaria de ver (e de poder reenviar) metade
-- do correio da plataforma.
--
-- MESMA POSTURA DOS CONVITES: o token viaja no link do email; aqui guarda-se
-- apenas sha256(token). Um vazamento desta tabela não permite forjar uma
-- reposição — é preciso o token em claro, que só o destinatário do email tem.
-- Validade curta (1 hora, imposta na aplicação) e uso único (`used_at`).
--
-- ÂMBITO: repor a palavra-passe NÃO dá acesso. O MFA (TOTP) é obrigatório e é o
-- middleware que o impõe, pelo que quem tenha o link ainda enfrenta o segundo
-- fator. Isso reduz o impacto de um link roubado, não o cuidado devido.
-- ============================================================

create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz not null default now()
);

-- Serve a invalidação dos pedidos anteriores a cada novo pedido (um novo link
-- reforma o anterior) e a listagem cronológica por utilizador.
create index password_resets_user_idx
  on public.password_resets (user_id, created_at desc);

alter table public.password_resets enable row level security;

-- SEM POLÍTICAS, DE PROPÓSITO — não é esquecimento.
--
-- Ninguém lê esta tabela pela API: nem o dono, nem o staff, nem o auditor. O
-- único caminho que lhe toca é o serviço server-side com service role
-- (src/lib/auth/password-reset.ts), que faz bypass a RLS por grant. A RLS fica
-- ligada para que a ausência de políticas signifique "zero linhas para toda a
-- gente" em vez de "tabela sem RLS": se um dia alguém conceder SELECT a
-- `authenticated` por engano, continua a não sair uma única linha.

-- ---------- Grants ----------
-- Convenção de 20260718000000_grants_rls_roles.sql: cada tabela nova declara os
-- seus próprios grants; não se confia no auto-grant do Supabase Cloud, que já
-- divergiu do stack local duas vezes (ver 20260721150000_anon_sem_select_repo_wide.sql).
--
-- Ao contrário de `invites`, aqui NEM SELECT: não há leitura de cliente legítima
-- a esta tabela, portanto o grant não precisa de existir para a RLS se comportar
-- bem. `anon`/`authenticated` levam 42501 antes sequer de chegar à RLS.
revoke all on public.password_resets from anon, authenticated;
grant select, insert, update, delete on public.password_resets to service_role;

-- ---------- Auditoria ----------
-- As outras tabelas sensíveis usam public.audit_row_change(), que grava o
-- snapshot INTEIRO da linha em audit_log.payload. Aqui isso seria um erro.
--
-- `audit_log` é lido por admin E auditor (política "audit: admin e auditor
-- leem"), é append-only e nunca é purgado. Copiar para lá o `token_hash` de um
-- link ainda vivo alargaria a audiência do material da credencial de "ninguém"
-- para "todo o staff com papel de auditoria", para sempre — exactamente aquilo
-- que a ausência de políticas nesta tabela existe para evitar. Um hash não é o
-- token, e 32 bytes aleatórios não se invertem por dicionário, mas o ganho
-- probatório de o gravar é nulo: o que interessa auditar é QUANDO se pediu,
-- PARA QUEM e SE foi usado — tudo isso fica.
--
-- Este trigger é, por isso, o audit_row_change() com uma só diferença: o
-- `token_hash` sai do payload, substituído por uma marca explícita. Redigir em
-- vez de omitir é deliberado — um campo em falta lê-se como bug, '[redacted]'
-- lê-se como decisão.
create or replace function public.audit_password_reset_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  redacted_old jsonb;
  redacted_new jsonb;
  rec jsonb;
begin
  if tg_op <> 'INSERT' then
    redacted_old := jsonb_set(to_jsonb(old), '{token_hash}', '"[redacted]"'::jsonb);
  end if;
  if tg_op <> 'DELETE' then
    redacted_new := jsonb_set(to_jsonb(new), '{token_hash}', '"[redacted]"'::jsonb);
  end if;
  rec := coalesce(redacted_new, redacted_old);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    rec ->> 'id',
    case tg_op
      when 'INSERT' then jsonb_build_object('new', redacted_new)
      when 'DELETE' then jsonb_build_object('old', redacted_old)
      else jsonb_build_object('old', redacted_old, 'new', redacted_new)
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger password_resets_audit
  after insert or update or delete on public.password_resets
  for each row execute function public.audit_password_reset_change();

-- Fora da superfície RPC, como as outras funções de trigger
-- (20260721152000_trigger_functions_sem_rpc.sql). O Postgres verifica o EXECUTE
-- no CREATE TRIGGER, não a cada disparo, pelo que revogar aqui não desliga a
-- auditoria.
revoke execute on function public.audit_password_reset_change()
  from public, anon, authenticated;
