import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {publishStatement, listStatements} from '@/lib/statements/service';

let staffId: string;
const noopMail = {transport: {sendMail: async () => ({})}};

function pdf(name: string): File {
  // Assinatura de PDF válida.
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, {type: 'application/pdf'});
}

async function makeProject(): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `Ext-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function funderOn(projectId: string): Promise<string> {
  const u = await createTestUser(`ext-${randomUUID().slice(0, 8)}@test.local`);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status: 'fundos_confirmados',
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return u.id;
}

beforeAll(async () => {
  staffId = (await createTestUser(`ext-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('publishStatement', () => {
  it('publica o extrato, sobe o ficheiro e notifica confirmados', async () => {
    const projectId = await makeProject();
    await funderOn(projectId);
    const {id, version} = await publishStatement(
      {projectId, period: '2026-07', file: pdf('extrato.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(id).toBeTruthy();
    expect(version).toBe(1);

    const rows = await listStatements(projectId);
    expect(rows).toHaveLength(1);
    const {data: file} = await admin.storage.from('statements').download(rows[0].storage_path);
    expect(file).toBeTruthy();

    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'statement_published');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('republicar o mesmo período cria uma NOVA versão (histórico permanente)', async () => {
    const projectId = await makeProject();
    await publishStatement(
      {projectId, period: '2026-08', file: pdf('a.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    const {version} = await publishStatement(
      {projectId, period: '2026-08', file: pdf('b.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(version).toBe(2);
    const rows = await listStatements(projectId);
    expect(rows).toHaveLength(2); // ambas as versões continuam visíveis
  });

  it('rejeita período mal formado', async () => {
    const projectId = await makeProject();
    await expect(
      publishStatement(
        {projectId, period: 'julho', file: pdf('a.pdf'), publishedBy: staffId, locale: 'pt'},
        noopMail
      )
    ).rejects.toThrow(/período|periodo/i);
  });

  // Os extratos passam por Server Action (os bytes chegam ao servidor), logo o
  // conteúdo REAL é verificável — o file.type declarado é forjável.
  it('rejeita ficheiro que não é PDF apesar do tipo declarado', async () => {
    const projectId = await makeProject();
    const fake = new File([new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e])], 'x.pdf', {
      type: 'application/pdf'
    });
    await expect(
      publishStatement(
        {projectId, period: '2026-09', file: fake, publishedBy: staffId, locale: 'pt'},
        noopMail
      )
    ).rejects.toThrow();
    // Nada foi gravado — a rejeição acontece antes de qualquer escrita.
    expect(await listStatements(projectId)).toHaveLength(0);
  });
});
