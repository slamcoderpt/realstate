-- ============================================================
-- TILWENI · funções de trigger fora da API RPC
--
-- `audit_row_change()` e `handle_new_user()` são funções de TRIGGER: só fazem
-- sentido no contexto de um trigger (`NEW`/`OLD`). Ainda assim, o Supabase
-- expõe tudo o que está em `public` em `/rest/v1/rpc/<nome>`, e os advisors de
-- segurança do projeto assinalavam ambas como SECURITY DEFINER invocáveis por
-- anon e authenticated. Invocá-las por RPC já falhava ("can only be called as a
-- trigger"), mas não há motivo para as manter na superfície da API.
--
-- `current_user_role()` perde o EXECUTE ao anon e a PUBLIC. Revogar só de `anon`
-- não chega: o grant a PUBLIC é uma segunda via de acesso, e o anon continuava a
-- poder invocá-la (confirmado no advisor de produção, que a manteve assinalada
-- depois de um `revoke ... from anon` isolado). `authenticated` MANTÉM-NO por
-- grant explícito: é usada dentro das policies, avaliadas no contexto do
-- utilizador — revogá-la a authenticated partiria a RLS de todas as tabelas.
--
-- SEGURANÇA DO TRIGGER: o Postgres verifica o EXECUTE da função de trigger no
-- CREATE TRIGGER, não a cada disparo. Revogar depois não desliga a auditoria —
-- confirmado pela suite (os testes de audit_log e de criação de utilizador
-- continuam verdes com estes revokes aplicados).
-- ============================================================

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_user_role() from public, anon;

grant execute on function public.current_user_role() to authenticated, service_role;
