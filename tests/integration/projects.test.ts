import {describe, it, expect} from 'vitest';
import {
  createProject,
  transitionProject,
  addBudgetLine,
  listCatalogue,
  getProjectDetail
} from '@/lib/projects/service';

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
  it('devolve todos os projetos lançados (exceto preparacao)', async () => {
    // Um projeto que fica em preparacao: NÃO deve aparecer no catálogo.
    const {id: prepId} = await createProject({
      name: 'CatPrep', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });

    // Um projeto em subscricao: aparece.
    const {id: subId} = await createProject({
      name: 'CatSub', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await transitionProject(subId, 'subscricao');

    // Um projeto já financiado/em curso: também aparece (dá noção de escala).
    const {id: curId} = await createProject({
      name: 'CatCurso', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await transitionProject(curId, 'subscricao');
    await transitionProject(curId, 'subscrito');
    await transitionProject(curId, 'em_curso');

    const rows = await listCatalogue();
    expect(rows.every((r) => r.status !== 'preparacao')).toBe(true);
    expect(rows.some((r) => r.id === subId)).toBe(true);
    expect(rows.some((r) => r.id === curId)).toBe(true);
    expect(rows.some((r) => r.id === prepId)).toBe(false);
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
    expect(detail!.budgetLines[0].budget_amount).toBe(3200);
  });
});
