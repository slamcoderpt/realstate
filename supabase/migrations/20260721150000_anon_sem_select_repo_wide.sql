-- ============================================================
-- TILWENI · anon sem SELECT em NENHUMA tabela de `public`
--
-- PORQUÊ agora: ao aplicar as Fatias 2-5 a produção descobriu-se que os dois
-- ambientes divergiam. A imagem local (15.8.1.085) já não traz as default
-- privileges permissivas, mas a de produção traz — e concede DML completo a
-- `anon` em cada tabela criada. Os revokes anteriores tiravam só a ESCRITA
-- (20260720143649) e o SELECT de quatro tabelas nomeadas (20260721102758),
-- pelo que produção ficou com SELECT ao anon em 12 tabelas — incluindo
-- `audit_log`, `profiles`, `subscriptions` e `account_statements` — enquanto
-- localmente eram zero. Os testes não podiam apanhar isto: correm contra o
-- local, onde o grant nunca chegou a existir.
--
-- Nada vazava: todas as políticas de `public` são `to authenticated`, logo o
-- anon obtém 0 linhas. Mas era exatamente a metade que sobra da forma que já
-- produziu o leak anónimo do catálogo (política sem `to` + grant ao anon), e o
-- ambiente onde isso importa é produção.
--
-- Em vez de enumerar tabelas — que foi o que deixou lacunas das duas vezes
-- anteriores — esta migração varre `public` inteira. É idempotente e vale para
-- tabelas futuras SÓ se for reexecutada, por isso a convenção continua a ser a
-- de 20260718000000_grants_rls_roles.sql: cada tabela nova declara os seus
-- próprios grants, e não inclui `anon`.
--
-- Nenhum caminho da app lê tabelas sem sessão: o login e a aceitação de convite
-- usam `auth.*` (que não passa por estes grants) ou service role no servidor.
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;
