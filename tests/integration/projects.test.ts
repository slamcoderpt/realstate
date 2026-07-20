import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  createProject,
  updateProject,
  transitionProject,
  addBudgetLine,
  listCatalogue,
  getProjectDetail
} from '@/lib/projects/service';

const run = randomUUID().slice(0, 8);
let staffId: string;

beforeAll(async () => {
  staffId = (await createTestUser(`proj-svc-${run}@test.local`, 'admin')).id;
});

describe('createProject / updateProject', () => {
  it('cria um projeto em preparacao e calcula indicadores no detalhe', async () => {
    const {id} = await createProject({
      name: 'Campelos',
      location: 'Guimarães',
      description: 'Reabilitação',
      acquisitionCost: 120000,
      worksBudget: 48000,
      arv: 245000,
      totalAmount: 150000,
      estimatedIrr: 21,
      termMonths: 9
    });
    expect(id).toBeTruthy();
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.project.status).toBe('preparacao');
    expect(detail!.indicators.totalInvestment).toBe(168000);
    expect(detail!.indicators.grossMargin).toBe(77000);
  });
});

describe('transitionProject', () => {
  it('avança preparacao → subscricao (e regista published_at)', async () => {
    const {id} = await createProject({
      name: 'X', location: 'Y', description: '',
      acquisitionCost: 1, worksBudget: 1, arv: 3, totalAmount: 2,
      estimatedIrr: 10, termMonths: 6
    });
    await transitionProject(id, 'subscricao');
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.project.status).toBe('subscricao');
    expect(detail!.project.published_at).not.toBeNull();
  });

  it('rejeita uma transição inválida', async () => {
    const {id} = await createProject({
      name: 'X', location: 'Y', description: '',
      acquisitionCost: 1, worksBudget: 1, arv: 3, totalAmount: 2,
      estimatedIrr: 10, termMonths: 6
    });
    await expect(transitionProject(id, 'em_curso')).rejects.toThrow(/transição/i);
  });
});

describe('listCatalogue', () => {
  it('devolve apenas projetos em subscricao', async () => {
    const {id} = await createProject({
      name: 'Cat', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await transitionProject(id, 'subscricao');
    const rows = await listCatalogue();
    expect(rows.every((r) => r.status === 'subscricao')).toBe(true);
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});

describe('addBudgetLine', () => {
  it('adiciona uma rubrica ao projeto', async () => {
    const {id} = await createProject({
      name: 'B', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await addBudgetLine(id, {name: 'Demolições', phase: 'Preparação', budgetAmount: 3200});
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.budgetLines).toHaveLength(1);
    // Este stack devolve `numeric` como número JS (não string). Normalizamos
    // com Number(...) para verificar o valor sem fixar o formato de serialização.
    expect(Number(detail!.budgetLines[0].budget_amount)).toBe(3200);
  });
});
