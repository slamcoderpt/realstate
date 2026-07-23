-- ============================================================
-- Performance · envolver auth.uid() em (select auth.uid()) nas políticas RLS
--
-- O advisor `auth_rls_initplan` assinala políticas que reavaliam `auth.<fn>()`
-- por CADA linha. Envolver a chamada num subselect `(select auth.uid())` faz o
-- planeador avaliá-la UMA vez por query (initplan), não por linha — ganho a
-- escala, sem qualquer alteração de semântica.
--
-- Recriam-se aqui, com nome e comportamento idênticos, apenas as políticas
-- assinaladas. As políticas de staff (via `current_user_role()`) e as que usam
-- os helpers `has_*_subscription()` não são tocadas.
-- ============================================================

-- ---------- profiles ----------
drop policy if exists "profiles: ler o próprio" on public.profiles;
create policy "profiles: ler o próprio"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: atualizar o próprio" on public.profiles;
create policy "profiles: atualizar o próprio"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------- kyc_submissions ----------
drop policy if exists "kyc_submissions: dono lê" on public.kyc_submissions;
create policy "kyc_submissions: dono lê"
  on public.kyc_submissions for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- kyc_documents ----------
drop policy if exists "kyc_documents: dono lê" on public.kyc_documents;
create policy "kyc_documents: dono lê"
  on public.kyc_documents for select to authenticated
  using (
    exists (
      select 1 from public.kyc_submissions s
      where s.id = kyc_documents.submission_id
        and s.user_id = (select auth.uid())
    )
  );

-- ---------- notifications ----------
drop policy if exists "notifications: dono lê" on public.notifications;
create policy "notifications: dono lê"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- subscriptions ----------
drop policy if exists "subscriptions: dono lê" on public.subscriptions;
create policy "subscriptions: dono lê"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- projects (investidor com subscrição) ----------
drop policy if exists "projects: investidor com subscrição" on public.projects;
create policy "projects: investidor com subscrição"
  on public.projects for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.project_id = projects.id
        and s.user_id = (select auth.uid())
        and s.status <> 'cancelada'
    )
  );
