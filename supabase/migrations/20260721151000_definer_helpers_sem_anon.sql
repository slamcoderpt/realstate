-- ============================================================
-- TILWENI · helpers SECURITY DEFINER sem EXECUTE para o anon
--
-- PORQUÊ: `20260721082116_obra_extratos.sql` fez `revoke execute ... from
-- public` nos dois helpers de visibilidade e concedeu-os a `authenticated`.
-- Isso basta na imagem local, mas NÃO em produção: o Supabase concede EXECUTE
-- **explicitamente** a `anon` (além do grant a PUBLIC), e revogar de PUBLIC não
-- remove um grant explícito. Resultado: em produção o `anon` podia invocar
-- has_active_subscription / has_confirmed_subscription por RPC, enquanto
-- localmente não. É a mesma armadilha já documentada em
-- 20260720154105_confirm_subscription_funds_atomic.sql, onde a correção foi
-- revogar dos TRÊS (public, anon, authenticated).
--
-- Impacto real era nulo — ambas resolvem `auth.uid()`, que é null sem sessão,
-- pelo que devolviam sempre `false`. Mas são SECURITY DEFINER (bypassam RLS) e
-- não há razão para as expor a quem nunca as pode usar.
--
-- `authenticated` MANTÉM o EXECUTE: as funções são usadas dentro de policies,
-- avaliadas no contexto do utilizador. São leituras booleanas sobre as próprias
-- subscrições do chamador.
-- ============================================================

revoke execute on function public.has_active_subscription(uuid) from anon;
revoke execute on function public.has_confirmed_subscription(uuid) from anon;

grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;
grant execute on function public.has_confirmed_subscription(uuid) to authenticated, service_role;
