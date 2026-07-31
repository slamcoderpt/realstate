-- ============================================================
-- TILWENI — CRM: origem «Programa João Gonçalves» + campo Agente/Intermediário
--
-- Pedido do sócio (2026-07-31):
--  1. mais uma ORIGEM no pipeline: o Programa João Gonçalves;
--  2. um campo À PARTE (não é origem) para registar o agente/intermediário que
--     trouxe o investidor — serve de base ao pagamento de comissão, se houver.
--
-- O agente fica em `crm_leads` como texto livre e não como entidade própria:
-- hoje só é preciso saber A QUEM se paga; modelar agentes/comissões dá tabela
-- nova e não é o que foi pedido.
-- ============================================================

-- Nova origem. Colocada antes de 'outro' para 'outro' continuar a ser o último
-- valor do enum (a UI lista as origens por esta ordem).
-- Nota: o valor novo só pode ser USADO depois desta transação fechar — daí esta
-- migração não o referir em mais lado nenhum (nem em defaults nem em updates).
alter type public.crm_source add value if not exists 'programa_joao_goncalves' before 'outro';

-- Agente/intermediário que trouxe o lead. Vazio = veio por via direta.
alter table public.crm_leads
  add column if not exists agent_name text not null default '';

comment on column public.crm_leads.agent_name is
  'Agente/intermediário que trouxe o investidor (texto livre). Base para comissão; vazio = sem intermediário.';

-- Índice parcial: as consultas úteis são «leads deste agente» e «leads com
-- agente» (para comissões). As linhas sem agente — a maioria — ficam de fora.
create index if not exists crm_leads_agent_idx
  on public.crm_leads (agent_name)
  where agent_name <> '';
