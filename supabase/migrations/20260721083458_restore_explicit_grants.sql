-- ============================================================
-- TILWENI · Grants explícitos para as tabelas das Fatias 2–4
--
-- PORQUÊ: a imagem local do Postgres passou a ser
-- `public.ecr.aws/supabase/postgres:15.8.1.085`, que já NÃO traz as default
-- privileges que concediam DML no schema `public` a anon/authenticated/
-- service_role. Confirmado em pg_default_acl:
--
--   postgres | public | r | {postgres=arwdDxt, anon=Dxt, authenticated=Dxt,
--                            service_role=Dxt}
--
-- Ou seja: só TRUNCATE/REFERENCES/TRIGGER — sem SELECT/INSERT/UPDATE/DELETE.
--
-- A migração 20260718000000_grants_rls_roles.sql já tinha antecipado isto e
-- fixado a CONVENÇÃO ("cada tabela nova em public deve incluir os seus próprios
-- grants explícitos"), mas só cobriu as tabelas da Fatia 0/1. As Fatias 2 (KYC),
-- 3 (projetos, parcialmente) e 4 (subscrições) ficaram a depender do auto-grant
-- — que deixou de existir. Efeito: 42501 "permission denied" ANTES de a RLS ser
-- avaliada, tanto para o service_role (Server Actions) como para authenticated.
--
-- Esta migração restaura os grants em falta, sem alargar nada face ao desenho
-- original: service_role com DML (é quem escreve; bypassa a RLS mas NÃO os
-- grants), authenticated só com SELECT (a RLS filtra as linhas), anon com o
-- mínimo indispensável. Os revokes de escrita de
-- 20260720143649_revoke_anon_writes.sql mantêm-se em vigor.
-- ============================================================

-- ---------- service_role: DML (Server Actions / testes) ----------
grant select, insert, update, delete on public.kyc_submissions to service_role;
grant select, insert, update, delete on public.kyc_documents   to service_role;
grant select, insert, update, delete on public.subscriptions   to service_role;
-- projects/project_budget_lines/project_photos/project_documents já tinham
-- grants explícitos de service_role em 20260720131009_projects.sql.

-- ---------- authenticated: só SELECT (a RLS restringe as linhas) ----------
grant select on public.kyc_submissions      to authenticated;
grant select on public.kyc_documents        to authenticated;
grant select on public.projects             to authenticated;
grant select on public.project_budget_lines to authenticated;
grant select on public.project_photos       to authenticated;
grant select on public.project_documents    to authenticated;
grant select on public.subscriptions        to authenticated;

-- ---------- anon: mínimo indispensável ----------
-- Só kyc_submissions. As suas policies NÃO têm cláusula `to authenticated`
-- (aplicam-se também a anon) e avaliam a falso para uma sessão sem utilizador
-- (auth.uid() é null), pelo que o comportamento correto é "0 linhas" e não
-- 42501 — é isso que o teste `anónimo NÃO lê submissões` exige.
--
-- Todas as outras tabelas ficam SEM grant a anon de propósito: as suas policies
-- são `to authenticated`, logo anon nunca teria linhas, e a ausência de grant
-- fecha a porta uma camada antes da RLS. É a postura mais defensiva contra a
-- classe de bug que já produziu o leak anónimo do catálogo neste repo.
grant select on public.kyc_submissions to anon;
