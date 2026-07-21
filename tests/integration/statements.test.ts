import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {Client} from 'pg';
import {admin, createTestUser} from '../rls/helpers';
import {publishStatement, listStatements} from '@/lib/statements/service';
import {statementPath} from '@/lib/statements/storage';

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

/**
 * Investidor com uma subscrição no estado pedido. Devolve o email porque é por
 * email que se conta na `email_outbox` — filtrar só por `template` seria uma
 * tautologia (a tabela nunca é truncada entre execuções).
 */
async function subscriberOn(
  projectId: string,
  status: 'fundos_confirmados' | 'interesse'
): Promise<{id: string; email: string}> {
  const email = `ext-${randomUUID().slice(0, 8)}@test.local`;
  const u = await createTestUser(email);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status,
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return {id: u.id, email};
}

async function outboxFor(email: string, template: string): Promise<number> {
  const {data, error} = await admin
    .from('email_outbox')
    .select('id')
    .eq('to_email', email)
    .eq('template', template);
  expect(error).toBeNull();
  return (data ?? []).length;
}

/**
 * Cliente service role cuja remoção no Storage funciona de facto.
 *
 * Porquê: neste stack local o `DELETE` em `storage.objects` é travado pelo
 * trigger `storage.protect_delete()` (exige o GUC `storage.allow_delete_query`,
 * que a imagem storage-api v1.14.5 aqui instalada nunca define) — qualquer
 * `storage.remove()` devolve "new row violates row-level security policy",
 * seja qual for o papel. Trocamos só o `remove` por um DELETE em SQL directo
 * com o GUC ligado, para poder afirmar o estado REAL do bucket no fim. O que
 * fica sob teste continua a ser o serviço: se ele não pedir a remoção do
 * caminho certo, o objeto sobrevive e o teste falha.
 */
function dbWithWorkingRemove(removed: string[]): SupabaseClient {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false, autoRefreshToken: false}}
  );
  const realFrom = db.storage.from.bind(db.storage);
  db.storage.from = (bucket: string) => {
    const api = realFrom(bucket);
    api.remove = async (paths: string[]) => {
      removed.push(...paths);
      const client = new Client({connectionString: process.env.SUPABASE_DB_URL});
      await client.connect();
      try {
        await client.query("select set_config('storage.allow_delete_query', 'true', false)");
        await client.query(
          'delete from storage.objects where bucket_id = $1 and name = any($2::text[])',
          [bucket, paths]
        );
      } finally {
        await client.end();
      }
      return {data: [], error: null};
    };
    return api;
  };
  return db;
}

beforeAll(async () => {
  staffId = (await createTestUser(`ext-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('publishStatement', () => {
  it('publica o extrato, sobe o ficheiro e notifica confirmados', async () => {
    const projectId = await makeProject();
    const confirmed = await subscriberOn(projectId, 'fundos_confirmados');
    // Subscrição ativa mas sem fundos: NÃO vê extratos e NÃO é notificado.
    const interested = await subscriberOn(projectId, 'interesse');
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

    expect(await outboxFor(confirmed.email, 'statement_published')).toBe(1);
    expect(await outboxFor(interested.email, 'statement_published')).toBe(0);
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

  it.each(['2026-00', '2026-13', '2026-99'])(
    'rejeita mês impossível (%s)',
    async (period) => {
      const projectId = await makeProject();
      await expect(
        publishStatement(
          {projectId, period, file: pdf('a.pdf'), publishedBy: staffId, locale: 'pt'},
          noopMail
        )
      ).rejects.toThrow(/período|periodo/i);
      expect(await listStatements(projectId)).toHaveLength(0);
    }
  );

  it('insert falhado não deixa PDF órfão no bucket', async () => {
    const projectId = await makeProject();
    const removed: string[] = [];
    const db = dbWithWorkingRemove(removed);
    // publishedBy inexistente ⇒ o insert rebenta na FK para auth.users, DEPOIS
    // de o ficheiro já ter subido. É a mesma janela da corrida do unique.
    const period = '2026-10';
    const path = statementPath(projectId, period, 1, 'orfao.pdf');

    await expect(
      publishStatement(
        {projectId, period, file: pdf('orfao.pdf'), publishedBy: randomUUID(), locale: 'pt'},
        {db, transport: noopMail.transport}
      )
    ).rejects.toThrow(/publicar extrato falhou/);

    // Nada ficou para trás: nem linha na BD, nem objeto no bucket.
    const {data: file, error} = await admin.storage.from('statements').download(path);
    expect(file).toBeNull();
    expect(error).not.toBeNull();
    expect(await listStatements(projectId)).toHaveLength(0);
    // E foi mesmo o serviço a pedir a remoção do caminho que tinha subido.
    expect(removed).toEqual([path]);
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
