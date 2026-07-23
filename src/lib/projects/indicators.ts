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

/**
 * Retorno estimado de UM investidor — distinto da TIR/ROI do PROJETO. Uma fatia
 * do lucro fica para a TILWENI (`sharePct`, fração por projeto); o restante é o
 * pool dos investidores, repartido na proporção do investido.
 *
 * `grossMargin` negativo (prejuízo estimado) não gera retorno negativo aqui — o
 * pool fica a zero; o risco de capital é comunicado à parte (aviso de risco).
 */
export type InvestorReturnInput = {
  grossMargin: number; // lucro do projeto (ARV − investimento total)
  sharePct: number; // fatia da TILWENI, fração [0,1]
  invested: number; // montante deste investidor
  totalRaised: number; // total angariado (denominador da repartição)
};

export type InvestorReturn = {
  investorPool: number; // lucro × (1 − sharePct)
  amount: number; // retorno estimado deste investidor (€)
  roiPct: number; // retorno ÷ investido (%)
};

export function computeInvestorReturn(
  input: InvestorReturnInput
): InvestorReturn {
  const investorPool = Math.max(0, input.grossMargin) * (1 - input.sharePct);
  const amount =
    input.totalRaised > 0
      ? investorPool * (input.invested / input.totalRaised)
      : 0;
  const roiPct = input.invested > 0 ? (amount / input.invested) * 100 : 0;
  return {investorPool, amount, roiPct};
}
