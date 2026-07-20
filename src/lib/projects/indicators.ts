/**
 * Indicadores financeiros de um projeto, calculados a partir dos valores base
 * inseridos pelo gestor. Puro e sem I/O — a TIR estimada é inserida pelo gestor
 * (o seu cálculo rigoroso depende do calendário de fluxos, fora do âmbito desta
 * fatia); aqui derivam-se investimento total, margem bruta e ROI.
 */

export type IndicatorInput = {
  acquisitionCost: number;
  worksBudget: number;
  arv: number;
};

export type Indicators = {
  totalInvestment: number;
  grossMargin: number;
  roiPct: number;
};

export function computeIndicators(input: IndicatorInput): Indicators {
  const totalInvestment = input.acquisitionCost + input.worksBudget;
  const grossMargin = input.arv - totalInvestment;
  const roiPct =
    totalInvestment > 0 ? (grossMargin / totalInvestment) * 100 : 0;
  return {totalInvestment, grossMargin, roiPct};
}
