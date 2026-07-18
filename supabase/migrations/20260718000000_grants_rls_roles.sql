-- ============================================================
-- TILWENI · Grants explícitos para os roles do PostgREST
-- ============================================================
-- Porque isto existe: a RLS filtra LINHAS, mas o Postgres exige também um GRANT
-- ao nível da TABELA para o role (anon/authenticated) sequer lhe poder tocar.
-- Em produção (Supabase Cloud) estes grants são aplicados automaticamente à
-- criação da tabela; num stack local fresco (`supabase start` no CI) NÃO são,
-- pelo que sem estes GRANTs explícitos as leituras devolvem 42501 "permission
-- denied" em vez de passarem pela RLS (que devolveria 0 linhas). Tornamos os
-- grants explícitos e determinísticos em todos os ambientes.
--
-- A RLS continua a ser a barreira real: o grant só abre a porta para a política
-- decidir. Onde a política não dá match, o role vê 0 linhas (não um erro).
--
-- CONVENÇÃO para migrações futuras: cada tabela nova em `public` deve incluir os
-- seus próprios grants explícitos (não confiar no auto-grant do Cloud).

-- Leitura (a RLS restringe as linhas efetivamente visíveis):
grant select on public.platform_settings to anon, authenticated;
grant select on public.profiles           to authenticated;
grant select on public.audit_log          to authenticated;
grant select on public.invites            to anon, authenticated;
grant select on public.email_outbox       to anon, authenticated;

-- Escrita permitida pela RLS do próprio perfil (o trigger protege role/kyc):
grant update on public.profiles to authenticated;

-- Nota: audit_log mantém-se append-only — nenhum grant de INSERT/UPDATE/DELETE/
-- TRUNCATE é dado a anon/authenticated aqui (ver revokes na migração de
-- fundações, que se mantêm intactos). invites e email_outbox não recebem grants
-- de escrita: nascem e mudam de estado apenas via service role (Server Actions).
