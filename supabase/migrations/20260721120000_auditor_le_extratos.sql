-- ============================================================
-- TILWENI · `auditor` read-only sobre extratos da conta dedicada
--
-- PORQUÊ: a spec da Fase A (secção 4, Segurança/Auditoria) prevê
-- "`auditor` read-only sobre extratos e documentos fiscais". O valor existe no
-- enum `user_role` desde a Fatia 0 e o `audit_log` já tem política para ele
-- ("audit: admin e auditor leem"), mas `account_statements` só admitia
-- `admin`/`project_manager` — o auditor não conseguia ler aquilo que a spec lhe
-- atribui explicitamente.
--
-- ÂMBITO (deliberadamente estreito): só `account_statements`. NÃO obra
-- (`project_milestones`, `work_updates`, `work_update_media`), NÃO KYC, NÃO
-- projetos, NÃO subscrições. Os extratos são o registo fiscal; qualquer leitura
-- mais larga da frase da spec alargaria a superfície sem mandato.
--
-- POLÍTICA SEPARADA, não alargamento da de staff: `auditor` NÃO é staff. O
-- predicado da aplicação (`STAFF_ROLES` em src/lib/auth/staff.ts) continua a
-- excluí-lo, logo `requireStaff()` e o layout (admin) mantêm-se fechados. Uma
-- política com nome próprio deixa essa distinção legível no `pg_policies` em vez
-- de a esconder dentro de um `in (...)` chamado "staff".
--
-- `to authenticated` é obrigatório: uma política sem cláusula `to` aplica-se
-- também ao role `anon`. Foi essa a forma do leak anónimo do catálogo, e a
-- migração 20260721102758 acabou de retirar os últimos casos — não reintroduzir.
--
-- Sem exceção de auditoria: um auditor que consulte um extrato via
-- /api/statements/[id] é registado no `audit_log` como qualquer outro ator.
-- ============================================================

create policy "statements: auditor lê"
  on public.account_statements for select to authenticated
  using (public.current_user_role() = 'auditor');
