import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  publishWorkDocument,
  listWorkDocuments,
  deleteWorkDocument
} from '@/lib/works/service';

let staffId: string;

function pdf(name: string): File {
  // Assinatura de PDF válida (%PDF-1.4).
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, {type: 'application/pdf'});
}

async function makeProject(): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `Doc-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function makeBudgetLine(projectId: string): Promise<string> {
  const {data, error} = await admin
    .from('project_budget_lines')
    .insert({project_id: projectId, name: 'Demolições', phase: 'X', budget_amount: 1000})
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  staffId = (await createTestUser(`wd-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('publishWorkDocument', () => {
  it('anexa um PDF ao projeto (sem associação) e lista-o', async () => {
    const projectId = await makeProject();
    const {id} = await publishWorkDocument({
      projectId,
      file: pdf('fatura.pdf'),
      createdBy: staffId
    });
    expect(id).toBeTruthy();

    const docs = await listWorkDocuments(projectId);
    expect(docs).toHaveLength(1);
    expect(docs[0].original_filename).toBe('fatura.pdf');
    expect(docs[0].budget_line_id).toBeNull();
    expect(docs[0].work_update_id).toBeNull();
  });

  it('associa a fatura a uma rubrica de custo', async () => {
    const projectId = await makeProject();
    const lineId = await makeBudgetLine(projectId);
    await publishWorkDocument({
      projectId,
      file: pdf('fatura-demolicoes.pdf'),
      createdBy: staffId,
      budgetLineId: lineId
    });
    const docs = await listWorkDocuments(projectId);
    expect(docs).toHaveLength(1);
    expect(docs[0].budget_line_id).toBe(lineId);
  });

  it('rejeita um tipo não-PDF', async () => {
    const projectId = await makeProject();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'x.png', {
      type: 'image/png'
    });
    await expect(
      publishWorkDocument({projectId, file: png, createdBy: staffId})
    ).rejects.toThrow(/não permitido/i);
  });

  it('rejeita um ficheiro que diz ser PDF mas não é (magic-bytes)', async () => {
    const projectId = await makeProject();
    const fake = new File([new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e])], 'x.pdf', {
      type: 'application/pdf'
    });
    await expect(
      publishWorkDocument({projectId, file: fake, createdBy: staffId})
    ).rejects.toThrow(/não é um PDF/i);
  });
});

describe('deleteWorkDocument', () => {
  it('apaga o documento', async () => {
    const projectId = await makeProject();
    const {id} = await publishWorkDocument({
      projectId,
      file: pdf('apagar.pdf'),
      createdBy: staffId
    });
    await deleteWorkDocument(id);
    expect(await listWorkDocuments(projectId)).toHaveLength(0);
  });
});
