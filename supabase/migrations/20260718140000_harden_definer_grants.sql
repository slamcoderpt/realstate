-- ============================================================
-- TILWENI · Endurecimento de funções SECURITY DEFINER (advisor 0028/0029)
-- ============================================================
-- audit_row_change() e handle_new_user() são funções de TRIGGER: não fazem
-- sentido como RPC. Sem isto ficam invocáveis via /rest/v1/rpc por anon/
-- authenticated (fora do contexto de trigger dão erro, mas expor superfície
-- desnecessária é mau). Os triggers continuam a disparar normalmente — não
-- dependem do EXECUTE do role que provoca a mudança.
--
-- current_user_role() é deixada INTACTA de propósito: é chamada dentro das
-- políticas RLS (invites/email_outbox/audit_log), logo tem de ser executável
-- por anon/authenticated, senão a avaliação da política falha. Só devolve o
-- role do próprio chamador — não há fuga de informação.

revoke execute on function public.audit_row_change() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
