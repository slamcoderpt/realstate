-- ============================================================
-- TILWENI · Hardening — políticas `to authenticated` + anon sem SELECT
--
-- PORQUÊ: as políticas das Fatias 0-2 foram criadas sem cláusula `to`, pelo que
-- se aplicam também ao role `anon`. Hoje nenhuma delas devolve linhas a um
-- anónimo (`auth.uid()` é null e `public.current_user_role()` devolve null, logo
-- o USING avalia a null = falso) — verificado antes desta migração. O risco é
-- ESTRUTURAL: basta uma política futura cujo USING seja verdadeiro sem sessão
-- para a tabela ficar pública. Foi exatamente essa a forma do leak anónimo do
-- catálogo (corrigido em 20260720131009_projects.sql): política sem `to` +
-- grant de SELECT ao anon.
--
-- Esta migração fecha as duas metades: restringe as políticas a `authenticated`
-- e retira ao anon os SELECT que não servem nenhum caminho da app. O anon
-- continua a poder autenticar-se (auth.* não passa por estes grants) — o fluxo
-- de aceitação de convite corre no servidor com service role, não com anon.
--
-- Nada aqui altera QUEM vê o quê: só faz a negação acontecer uma camada mais
-- cedo (permission denied, antes da RLS).
-- ============================================================

-- ---------- políticas: {public} -> {authenticated} ----------
alter policy "audit: admin e auditor leem" on public.audit_log to authenticated;
alter policy "email_outbox: admin lê" on public.email_outbox to authenticated;
alter policy "invites: staff lê" on public.invites to authenticated;

alter policy "kyc_submissions: dono lê" on public.kyc_submissions to authenticated;
alter policy "kyc_submissions: staff lê" on public.kyc_submissions to authenticated;
alter policy "kyc_documents: dono lê" on public.kyc_documents to authenticated;
alter policy "kyc_documents: staff lê" on public.kyc_documents to authenticated;

alter policy "profiles: ler o próprio" on public.profiles to authenticated;
alter policy "profiles: staff lê todos" on public.profiles to authenticated;
alter policy "profiles: atualizar o próprio" on public.profiles to authenticated;

alter policy "projects: staff lê todos" on public.projects to authenticated;

-- ---------- grants: anon deixa de ler ----------
-- Nenhuma destas tabelas tem (nem deve ter) leitura anónima. `platform_settings`
-- é o caso menos óbvio: a sua única política já é `to authenticated`, portanto o
-- grant ao anon nunca devolveu nada — é grant morto.
revoke select on public.kyc_submissions from anon;
revoke select on public.invites from anon;
revoke select on public.email_outbox from anon;
revoke select on public.platform_settings from anon;
