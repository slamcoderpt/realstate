import {describe, it, expect} from 'vitest';
import {
  annualizeRate,
  computeIndicators,
  computeInvestorReturn,
  deannualizeRate
} from '@/lib/projects/indicators';

describe('computeIndicators', () => {
  it('calcula investimento, margem e ROI a partir dos valores base', () => {
    const r = computeIndicators({
      acquisitionCost: 120000,
      worksBudget: 48000,
      arv: 245000
    });
    expect(r.totalInvestment).toBe(168000);
    expect(r.grossMargin).toBe(77000); // 245000 - 168000
    expect(r.roiPct).toBeCloseTo(45.83, 1); // 77000/168000*100
  });

  it('ROI é 0 quando não há investimento', () => {
    const r = computeIndicators({
      acquisitionCost: 0,
      worksBudget: 0,
      arv: 0
    });
    expect(r.roiPct).toBe(0);
  });

  it('margem pode ser negativa (ARV abaixo do investimento)', () => {
    const r = computeIndicators({
      acquisitionCost: 100000,
      worksBudget: 50000,
      arv: 140000
    });
    expect(r.grossMargin).toBe(-10000);
    expect(r.roiPct).toBeCloseTo(-6.67, 1);
  });
});

describe('annualizeRate / deannualizeRate', () => {
  it('anualiza uma taxa do período: 45.8% em 9 meses ≈ 65.3% ao ano', () => {
    // (1.458)^(12/9) − 1 ≈ 0.6533
    expect(annualizeRate(45.8, 9)).toBeCloseTo(65.33, 1);
  });

  it('12 meses é neutro (taxa do período = taxa anual)', () => {
    expect(annualizeRate(21, 12)).toBeCloseTo(21, 6);
    expect(deannualizeRate(21, 12)).toBeCloseTo(21, 6);
  });

  it('deannualize é o inverso de annualize', () => {
    const period = deannualizeRate(annualizeRate(45.8, 9), 9);
    expect(period).toBeCloseTo(45.8, 6);
  });

  it('prazo 0 devolve a própria taxa (sem base para anualizar)', () => {
    expect(annualizeRate(30, 0)).toBe(30);
    expect(deannualizeRate(30, 0)).toBe(30);
  });
});

describe('computeInvestorReturn', () => {
  it('reparte o pool na proporção do investido, após a fatia da TILWENI', () => {
    // Lucro 100k, 50% p/ TILWENI → pool 50k. Investidor com 25k de 100k
    // angariados → 25% do pool = 12,5k. ROI = 12500/25000 = 50%.
    const r = computeInvestorReturn({
      grossMargin: 100000,
      sharePct: 0.5,
      invested: 25000,
      totalRaised: 100000
    });
    expect(r.investorPool).toBe(50000);
    expect(r.amount).toBe(12500);
    expect(r.roiPct).toBeCloseTo(50, 5);
  });

  it('respeita uma fatia da TILWENI diferente do default', () => {
    // 30% p/ TILWENI → pool 70k; investidor único (50k de 50k) leva o pool todo.
    const r = computeInvestorReturn({
      grossMargin: 100000,
      sharePct: 0.3,
      invested: 50000,
      totalRaised: 50000
    });
    expect(r.investorPool).toBe(70000);
    expect(r.amount).toBe(70000);
  });

  it('prejuízo estimado não gera retorno negativo (pool a zero)', () => {
    const r = computeInvestorReturn({
      grossMargin: -20000,
      sharePct: 0.5,
      invested: 10000,
      totalRaised: 20000
    });
    expect(r.investorPool).toBe(0);
    expect(r.amount).toBe(0);
    expect(r.roiPct).toBe(0);
  });

  it('sem total angariado, retorno é 0 (evita divisão por zero)', () => {
    const r = computeInvestorReturn({
      grossMargin: 100000,
      sharePct: 0.5,
      invested: 10000,
      totalRaised: 0
    });
    expect(r.amount).toBe(0);
  });
});
