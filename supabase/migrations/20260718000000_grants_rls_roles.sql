-- ============================================================
-- TILWENI · Grants explícitos para os roles do PostgREST
-- ============================================================
-- Porque isto existe: a RLS filtra LINHAS, mas o Postgres exige também um GRANT
-- ao nível da TABELA para o role sequer lhe poder tocar. Em produção (Supabase
-- Cloud) estes grants são aplicados automaticamente a anon/authenticated/
-- service_role à criação da tabela; num stack local fresco (`supabase start` no
-- CI) NÃO são, pelo que sem estes GRANTs explícitos as queries devolvem 42501
-- "permission denied" em vez de passarem pela RLS.
--
-- Nota crítica sobre service_role: faz bypass à RLS mas NÃO aos grants de tabela.
-- A migração de fundações faz `revoke … from service_role` no audit_log a contar
-- que o grant-base do Cloud existisse; num stack local esse grant nunca é dado,
-- pelo que temos de o conceder aqui explicitamente (menos a imutabilidade do
-- audit_log). A RLS continua a ser a barreira real; o grant só abre a porta.
--
-- CONVENÇÃO para migrações futuras: cada tabela nova em `public` deve incluir os
-- seus próprios grants explícitos (não confiar no auto-grant do Cloud).

-- ---------- service_role (Server Actions / testes) ----------
-- Acesso total (bypassa RLS) EXCETO a imutabilidade do audit_log.
grant select, insert, update, delete on public.profiles          to service_role;
grant select, insert, update, delete on public.platform_settings to service_role;
grant select, insert, update, delete on public.invites           to service_role;
grant select, insert, update, delete on public.email_outbox      to service_role;
grant select, insert                 on public.audit_log         to service_role; -- append-only

-- ---------- authenticated (utilizador com sessão) ----------
-- Leitura (a RLS restringe as linhas) + update do próprio perfil.
grant select         on public.platform_settings to authenticated;
grant select, update on public.profiles          to authenticated;
grant select         on public.audit_log         to authenticated;
grant select         on public.invites           to authenticated;
grant select         on public.email_outbox      to authenticated;

-- ---------- anon (sem sessão) ----------
-- Só onde a RLS deve devolver 0 linhas (e não um 42501). O middleware exige
-- sessão em quase tudo; estes grants existem para o comportamento correto da RLS.
grant select on public.platform_settings to anon;
grant select on public.invites           to anon;
grant select on public.email_outbox      to anon;

-- audit_log e profiles: sem grants a anon (nunca lidos sem sessão).
-- audit_log mantém-se append-only: nenhum UPDATE/DELETE/TRUNCATE a ninguém aqui
-- (ver revokes na migração de fundações + trigger de imutabilidade).
