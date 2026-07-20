import {describe, it, expect} from 'vitest';
import {computeIndicators} from '@/lib/projects/indicators';

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
