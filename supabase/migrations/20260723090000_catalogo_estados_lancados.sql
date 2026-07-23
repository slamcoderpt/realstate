-- ============================================================
-- TILWENI — Feedback do sócio (ponto 1) · Catálogo com todos os estados
--
-- O investidor passa a ver a FICHA de TODOS os projetos lançados (todos os
-- estados exceto `preparacao`), incluindo os já financiados a 100% — dá noção
-- de escala do portefólio. Antes só via os projetos em `subscricao`.
--
-- Os DETALHES continuam reservados a quem investiu: a obra e os extratos têm
-- políticas próprias (ligadas à subscrição do investidor), que NÃO são tocadas
-- aqui. Esta migração abre apenas a leitura da ficha do imóvel: `projects` e as
-- tabelas que a compõem (rubricas de orçamento, fotos, documentos do imóvel).
--
-- A leitura server-side usa service role (bypassa RLS) com o mesmo gate na
-- aplicação; estas políticas são a barreira efetiva para leituras diretas com
-- a sessão do investidor e a defesa em profundidade.
-- ============================================================

-- ---------- projects: investidor lê estados lançados (!= preparacao) ----------
drop policy if exists "projects: investidor lê subscricao" on public.projects;
create policy "projects: investidor lê lançados"
  on public.projects for select
  to authenticated
  using (status <> 'preparacao');

-- ---------- rubricas de orçamento: herdam a visibilidade da ficha ----------
drop policy if exists "budget_lines: visível se o projeto é visível"
  on public.project_budget_lines;
create policy "budget_lines: visível se o projeto é visível"
  on public.project_budget_lines for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status <> 'preparacao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- fotos do imóvel: herdam a visibilidade da ficha ----------
drop policy if exists "photos: visível se o projeto é visível"
  on public.project_photos;
create policy "photos: visível se o projeto é visível"
  on public.project_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status <> 'preparacao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- documentos do imóvel: herdam a visibilidade da ficha ----------
drop policy if exists "project_docs: visível se o projeto é visível"
  on public.project_documents;
create policy "project_docs: visível se o projeto é visível"
  on public.project_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status <> 'preparacao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );
