-- ============================================================
-- TILWENI · Hardening repo-wide — revogar DML de escrita a anon/authenticated
--
-- O Supabase concede DML COMPLETO (select/insert/update/delete) a anon e
-- authenticated por default privileges na criação de cada tabela. A RLS já é a
-- barreira efetiva (não há políticas de escrita para investidores → escrita
-- negada), mas isso deixa a segurança dependente só da RLS: se uma migração
-- futura desativar a RLS por engano, ou adicionar uma política de escrita
-- descuidada, anon/authenticated voltariam a poder escrever.
--
-- Esta migração adiciona defesa em profundidade ao NÍVEL DOS GRANTS: revoga
-- insert/update/delete/truncate de anon e authenticated em todas as tabelas de
-- negócio, mantendo:
--   * SELECT (necessário para a RLS devolver 0 linhas em vez de 42501);
--   * service_role com DML completo (é quem escreve, via Server Actions, e faz
--     bypass à RLS por grant).
-- Efeito: uma escrita indevida passa a falhar em "permission denied" ANTES de
-- qualquer avaliação de RLS.
--
-- audit_log NÃO é incluída: já tem a sua imutabilidade própria (revoke de
-- update/delete/truncate a todos + triggers), e os seus INSERTs legítimos vêm
-- de triggers SECURITY DEFINER (owner) e do service_role — nunca de
-- anon/authenticated.
--
-- Nota sobre profiles: a política "profiles: atualizar o próprio" (for update)
-- deixa de ter efeito para authenticated (o grant de UPDATE é revogado). Isto é
-- intencional e consistente com o resto do repo: nenhuma via da app usa o
-- self-update por sessão — todas as escritas de perfil (role, kyc_status,
-- locale) passam por Server Actions com service role. Se um dia for preciso
-- self-update, far-se-á por Server Action, como tudo o resto.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'platform_settings',
    'invites',
    'email_outbox',
    'kyc_submissions',
    'kyc_documents',
    'projects',
    'project_budget_lines',
    'project_photos',
    'project_documents'
  ];
begin
  foreach t in array tables loop
    execute format(
      'revoke insert, update, delete, truncate on public.%I from anon, authenticated',
      t
    );
  end loop;
end $$;
