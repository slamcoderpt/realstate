-- ============================================================
-- TILWENI — Feedback do sócio (ponto 2) · Partilha de lucro / retorno do investidor
--
-- O retorno do investidor é distinto da TIR do projeto: uma fatia do lucro fica
-- para a TILWENI (parâmetro por projeto, default 50%) e o restante é repartido
-- pelos investidores na proporção do que cada um investiu.
--
--   Lucro          = ARV − custo total (aquisição + obra)
--   Fatia TILWENI  = Lucro × tilweni_profit_share_pct
--   Pool investidores = Lucro × (1 − tilweni_profit_share_pct)
--   Retorno do investidor = pool × (investido ÷ total angariado)
--
-- Guardado como fração [0,1]; default 0.50.
-- ============================================================

alter table public.projects
  add column tilweni_profit_share_pct numeric(5,4) not null default 0.5000
    check (tilweni_profit_share_pct >= 0 and tilweni_profit_share_pct <= 1);
