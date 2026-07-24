-- ============================================================
-- TILWENI — Feedback dos sócios (ronda 2, R2.1) · Resultados concretizados
--
-- Nos projetos fechados (concluido/liquidado) mostra-se o RESULTADO em vez da
-- estimativa: TIR concretizada (anual) e prazo real. Ambos anuláveis — o staff
-- preenche ao concluir/liquidar; enquanto null, a app continua a mostrar as
-- estimativas.
-- ============================================================

alter table public.projects
  add column realized_irr numeric(5,2),
  add column actual_term_months integer
    check (actual_term_months is null or actual_term_months >= 0);
