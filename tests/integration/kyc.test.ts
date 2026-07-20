import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  submitKyc,
  approveKyc,
  rejectKyc,
  listPendingKyc
} from '@/lib/kyc/service';

// Transporte de email falso: não envia SMTP real. db não é passado, pelo que o
// serviço usa o admin client contra a BD local (email_outbox é gravado).
const noopMail = {transport: {sendMail: async () => ({})}};

function fakeFile(name: string): File {
  // Assinatura de PDF válida (%PDF-1.4) para passar o sniffing de conteúdo do
  // submitKyc — o file.type sozinho já não basta.
  const pdfBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34
  ]);
  return new File([pdfBytes], name, {type: 'application/pdf'});
}

// Um investidor fresco por cenário: o índice único parcial impede duas
// submissões 'submitted' em aberto para o mesmo utilizador.
async function freshInvestor(): Promise<string> {
  const run = randomUUID().slice(0, 8);
  return (await createTestUser(`kyc-svc-${run}@test.local`)).id;
}

let reviewerId: string;

beforeAll(async () => {
  const run = randomUUID().slice(0, 8);
  reviewerId = (await createTestUser(`kyc-rev-${run}@test.local`, 'admin')).id;
});

describe('submitKyc', () => {
  it('cria submissão + documentos, sobe ficheiros e marca perfil submitted', async () => {
    const investorId = await freshInvestor();
    const res = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        submittedIp: '203.0.113.1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    expect(res.submissionId).toBeTruthy();

    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, nif')
      .eq('id', res.submissionId)
      .single();
    expect(sub!.status).toBe('submitted');

    const {data: docs} = await admin
      .from('kyc_documents')
      .select('storage_path')
      .eq('submission_id', res.submissionId);
    expect(docs!.length).toBe(1);

    const path = docs![0].storage_path;
    const {data: file} = await admin.storage.from('kyc').download(path);
    expect(file).toBeTruthy();

    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('submitted');
  });

  it('rejeita NIF inválido', async () => {
    const investorId = await freshInvestor();
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '111111111',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
        },
        noopMail
      )
    ).rejects.toThrow(/nif/i);
  });

  it('rejeita documento em falta', async () => {
    const investorId = await freshInvestor();
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'foreign',
          nif: '123456789',
          fullName: 'Estrangeiro',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'id', file: fakeFile('id.pdf')}] // falta comprovativo_morada
        },
        noopMail
      )
    ).rejects.toThrow(/comprovativo_morada|falta/i);
  });

  it('limpa a submissão se o upload falhar (não tranca a resubmissão)', async () => {
    const investorId = await freshInvestor();
    const failingStorage = {
      from: () => ({
        upload: async () => ({
          data: null,
          error: {message: 'storage indisponível'}
        }),
        createSignedUrl: async () => ({data: null, error: {message: 'x'}})
      })
    };
    const stub = new Proxy(admin, {
      get(target, prop) {
        if (prop === 'storage') return failingStorage;
        return (target as never)[prop];
      }
    }) as unknown as import('@supabase/supabase-js').SupabaseClient;

    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '123456789',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
        },
        {db: stub, transport: {sendMail: async () => ({})}}
      )
    ).rejects.toThrow();

    // Não deve restar submissão em aberto → resubmissão válida passa.
    const ok = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'X',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc2.pdf')}]
      },
      noopMail
    );
    expect(ok.submissionId).toBeTruthy();
  });

  it('rejeita MIME fora da allow-list e não tranca a resubmissão', async () => {
    const investorId = await freshInvestor();
    const badFile = new File([new Uint8Array([1, 2, 3])], 'x.exe', {
      type: 'application/octet-stream'
    });
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '123456789',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: badFile}]
        },
        noopMail
      )
    ).rejects.toThrow(/tipo de ficheiro/i);

    // Validação é anterior ao insert → nada a limpar; resubmissão válida passa.
    const ok = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'X',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    expect(ok.submissionId).toBeTruthy();
  });

  it('rejeita ficheiro rotulado como PDF mas com conteúdo não-PDF (spoofing)', async () => {
    const investorId = await freshInvestor();
    // Content-Type declarado permitido, mas os bytes não são de um PDF/JPEG/PNG.
    const spoofed = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'cc.pdf', {
      type: 'application/pdf'
    });
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '123456789',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: spoofed}]
        },
        noopMail
      )
    ).rejects.toThrow(/tipo de ficheiro/i);

    // Nada foi inserido (validação antes do insert) → resubmissão válida passa.
    const ok = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'X',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    expect(ok.submissionId).toBeTruthy();
  });

  it('rejeita ficheiro acima do tamanho máximo', async () => {
    const investorId = await freshInvestor();
    // 9 MB > limite de 8 MB (kyc_max_file_mb). Buffer a zeros: barato de alocar,
    // mas File.size reflete os bytes reais — exercita mesmo o ramo do tamanho.
    const bigFile = new File([new Uint8Array(9 * 1024 * 1024)], 'grande.pdf', {
      type: 'application/pdf'
    });
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '123456789',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: bigFile}]
        },
        noopMail
      )
    ).rejects.toThrow(/demasiado grande/i);
  });
});

describe('approve/reject', () => {
  it('approveKyc marca aprovado e o perfil approved', async () => {
    const investorId = await freshInvestor();
    const {submissionId} = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    await approveKyc({submissionId, reviewerId, locale: 'pt'}, noopMail);
    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, reviewed_by')
      .eq('id', submissionId)
      .single();
    expect(sub!.status).toBe('approved');
    expect(sub!.reviewed_by).toBe(reviewerId);
    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('approved');
  });

  it('rejectKyc exige motivo e marca o perfil rejected', async () => {
    const investorId = await freshInvestor();
    const {submissionId} = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    await rejectKyc(
      {submissionId, reviewerId, note: 'Documento ilegível', locale: 'pt'},
      noopMail
    );
    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, review_note')
      .eq('id', submissionId)
      .single();
    expect(sub!.status).toBe('rejected');
    expect(sub!.review_note).toBe('Documento ilegível');
    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('rejected');
  });

  it('rejectKyc sem motivo lança', async () => {
    const investorId = await freshInvestor();
    const {submissionId} = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    await expect(
      rejectKyc({submissionId, reviewerId, note: '  ', locale: 'pt'}, noopMail)
    ).rejects.toThrow(/motivo/i);
  });
});

describe('listPendingKyc', () => {
  it('devolve submissões submitted', async () => {
    const investorId = await freshInvestor();
    await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Pendente',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      noopMail
    );
    const rows = await listPendingKyc();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((r) => r.status === 'submitted')).toBe(true);
    expect(rows.some((r) => r.user_id === investorId)).toBe(true);
  });
});
