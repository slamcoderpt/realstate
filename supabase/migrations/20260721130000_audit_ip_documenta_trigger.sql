-- ============================================================
-- TILWENI · `audit_log.ip` — quem o preenche, e quem NÃO o pode preencher
--
-- A coluna `ip` existe desde a Fatia 0 (spec Fase A §4: "Campos: ator, ação,
-- entidade, payload JSONB, IP, timestamp") mas nenhum escritor a preenchia.
-- Passa a ser preenchida ao nível da APLICAÇÃO, onde o pedido HTTP existe:
-- as rotas que auditam consultas de documentos (/api/statements/[id],
-- /api/subscriptions/contract/[id], /api/projects/document/[id],
-- /api/kyc/document/[id]) leem-no de `x-forwarded-for`/`x-real-ip` através de
-- src/lib/auth/request.ts.
--
-- DECISÃO CONSCIENTE: `public.audit_row_change()` continua a gravar ip = NULL.
-- Não é um esquecimento nem algo a corrigir depois — é estrutural. O trigger
-- corre dentro da transação da BD, onde NÃO existe pedido HTTP nem cabeçalhos:
-- não há IP que ele possa saber. Passá-lo exigiria que cada escritor pusesse o
-- valor num GUC de sessão (`set_config`) antes de cada DML, o que só funciona
-- para caminhos que passam por código nosso — e o valor do trigger é
-- precisamente cobrir também os que não passam (SQL direto, jobs, correções
-- manuais). Um IP forjado ou herdado da última sessão seria pior que ausente.
--
-- Como ler o log em consequência: linhas com `action` in ('insert','update',
-- 'delete') vêm do trigger e têm ip NULL por construção — são o registo do que
-- MUDOU. Linhas com `action` = 'view_document' vêm da aplicação e carregam IP —
-- são o registo de quem CONSULTOU. `ip IS NULL` nunca significa que um escritor
-- aplicacional falhou em preenchê-lo.
--
-- (Limitação relacionada, já documentada em 20260717141427_foundations.sql: o
-- trigger também grava actor_id = auth.uid(), NULL sob service_role.)
-- ============================================================

comment on column public.audit_log.ip is
  'IP do cliente (primeira entrada de x-forwarded-for, fallback x-real-ip). '
  'Preenchido apenas pelos escritores aplicacionais (src/lib/auth/request.ts). '
  'NULL nas linhas escritas pelo trigger audit_row_change(), que corre sem '
  'contexto de pedido HTTP e por isso não tem IP para gravar — por construção, '
  'não por omissão.';

comment on function public.audit_row_change() is
  'Auditoria genérica de alterações de linha. Grava ip = NULL: corre dentro da '
  'transação da BD, sem pedido HTTP nem cabeçalhos. O IP vive nos escritores '
  'aplicacionais (consultas de documentos); ver a migração '
  '20260721130000_audit_ip_documenta_trigger.sql.';
