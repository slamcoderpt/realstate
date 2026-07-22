import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {createNotification} from '@/lib/notifications/service';
import {isValidNif, normalizeNif} from './nif';
import {detectMime} from './filetype';
import {kycObjectPath, uploadKycFile} from './storage';

/**
 * Lógica de KYC (server-only, service role). O controlo de acesso é feito pela
 * Server Action chamadora (o investidor só submete para si; aprovar/rejeitar
 * exige staff). A escrita passa toda por aqui, com service role — RLS das
 * tabelas kyc_* é staff-read; investidores nunca escrevem diretamente.
 */

export type CitizenType = 'pt' | 'foreign';
export type KycDocType = 'cartao_cidadao' | 'id' | 'comprovativo_morada';

export type KycDocumentInput = {docType: KycDocType; file: File};

export type SubmitKycInput = {
  userId: string;
  citizenType: CitizenType;
  nif: string;
  fullName: string;
  consentVersion: string;
  submittedIp?: string;
  locale: Locale;
  documents: KycDocumentInput[];
};

export type SubmitKycResult = {submissionId: string};

function requiredDocs(citizenType: CitizenType): KycDocType[] {
  // PT: Cartão de Cidadão. Estrangeiro: ID + comprovativo de morada.
  return citizenType === 'pt'
    ? ['cartao_cidadao']
    : ['id', 'comprovativo_morada'];
}

export async function submitKyc(
  input: SubmitKycInput,
  deps: SendEmailDeps = {}
): Promise<SubmitKycResult> {
  const db = deps.db ?? createAdminClient();

  const nif = normalizeNif(input.nif);
  if (!isValidNif(nif)) throw new Error('NIF inválido');

  const needed = requiredDocs(input.citizenType);
  const provided = new Set(input.documents.map((d) => d.docType));
  for (const doc of needed) {
    if (!provided.has(doc)) {
      throw new Error(`documento em falta: ${doc}`);
    }
  }

  // Política de ficheiros (server-side; o accept do cliente é contornável).
  // Validado ANTES de qualquer insert/upload — um ficheiro inválido não deixa
  // estado parcial nem submissão em aberto.
  const {data: settings} = await db
    .from('platform_settings')
    .select('key, value')
    .in('key', ['kyc_max_file_mb', 'kyc_allowed_mime']);
  const maxMb = Number(
    settings?.find((s) => s.key === 'kyc_max_file_mb')?.value ?? 8
  );
  const allowedMime = (settings?.find((s) => s.key === 'kyc_allowed_mime')
    ?.value as string[] | undefined) ?? [
    'application/pdf',
    'image/jpeg',
    'image/png'
  ];
  const maxBytes = maxMb * 1024 * 1024;
  for (const doc of input.documents) {
    if (doc.file.size > maxBytes) {
      throw new Error(`ficheiro demasiado grande: ${doc.docType}`);
    }
    // 1) Tipo declarado tem de ser permitido (rejeição rápida e barata).
    if (!allowedMime.includes(doc.file.type)) {
      throw new Error(`tipo de ficheiro não permitido: ${doc.file.type}`);
    }
    // 2) Conteúdo REAL (magic-bytes) tem de corresponder a um tipo permitido.
    //    Impede que um ficheiro (ex.: .exe) seja aceite só por vir rotulado com
    //    um Content-Type falso — o accept do cliente e o file.type são forjáveis.
    const head = new Uint8Array(await doc.file.slice(0, 8).arrayBuffer());
    const realMime = detectMime(head);
    if (!realMime || !allowedMime.includes(realMime)) {
      throw new Error(`tipo de ficheiro não permitido: ${doc.file.type}`);
    }
  }

  const {data: sub, error} = await db
    .from('kyc_submissions')
    .insert({
      user_id: input.userId,
      citizen_type: input.citizenType,
      verification_method: 'document',
      nif,
      full_name: input.fullName.trim(),
      consent_given: true,
      consent_version: input.consentVersion,
      submitted_ip: input.submittedIp ?? null
    })
    .select('id')
    .single();
  if (error || !sub) {
    throw new Error(`criar submissão KYC falhou: ${error?.message ?? 'sem linha'}`);
  }

  try {
    for (const doc of input.documents) {
      const path = kycObjectPath(
        input.userId,
        sub.id,
        doc.docType,
        doc.file.name
      );
      await uploadKycFile(path, doc.file, db);
      const {error: docError} = await db.from('kyc_documents').insert({
        submission_id: sub.id,
        doc_type: doc.docType,
        storage_path: path,
        original_filename: doc.file.name,
        mime_type: doc.file.type,
        size_bytes: doc.file.size
      });
      if (docError) {
        throw new Error(`registar documento KYC falhou: ${docError.message}`);
      }
    }
  } catch (err) {
    // Limpa a submissão em aberto para não trancar a resubmissão (o índice único
    // parcial bloquearia uma nova). Os ficheiros já subidos ficam órfãos —
    // aceite a esta escala; a limpeza de Storage fica para o fluxo de eliminação.
    await db.from('kyc_submissions').delete().eq('id', sub.id);
    throw err;
  }

  const {error: profileError} = await db
    .from('profiles')
    .update({kyc_status: 'submitted'})
    .eq('id', input.userId);
  if (profileError) {
    throw new Error(`atualizar perfil KYC falhou: ${profileError.message}`);
  }

  await sendEmail(
    {
      toEmail: await userEmail(db, input.userId),
      toName: input.fullName,
      locale: input.locale,
      template: 'kyc_submitted',
      payload: {fullName: input.fullName}
    },
    {db, transport: deps.transport}
  );

  return {submissionId: sub.id};
}

export type ReviewInput = {
  submissionId: string;
  reviewerId: string;
  locale: Locale;
};

export async function approveKyc(
  input: ReviewInput,
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const sub = await setDecision(db, input, 'approved', null);
  const {error: profileError} = await db
    .from('profiles')
    .update({kyc_status: 'approved'})
    .eq('id', sub.user_id);
  if (profileError) {
    throw new Error(`atualizar perfil KYC falhou: ${profileError.message}`);
  }
  await sendEmail(
    {
      toEmail: await userEmail(db, sub.user_id),
      toName: sub.full_name,
      locale: input.locale,
      template: 'kyc_approved',
      payload: {fullName: sub.full_name}
    },
    {db, transport: deps.transport}
  );
  // In-app ao lado do email. Payload vazio: `body_kyc_approved` não interpola
  // nada — a cópia vive no i18n, não aqui.
  await createNotification(
    {userId: sub.user_id, type: 'kyc_approved', payload: {}, href: '/kyc'},
    db
  );
}

export async function rejectKyc(
  input: ReviewInput & {note: string},
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const note = input.note.trim();
  if (!note) throw new Error('rejeição exige motivo');
  const sub = await setDecision(db, input, 'rejected', note);
  const {error: profileError} = await db
    .from('profiles')
    .update({kyc_status: 'rejected'})
    .eq('id', sub.user_id);
  if (profileError) {
    throw new Error(`atualizar perfil KYC falhou: ${profileError.message}`);
  }
  await sendEmail(
    {
      toEmail: await userEmail(db, sub.user_id),
      toName: sub.full_name,
      locale: input.locale,
      template: 'kyc_rejected',
      payload: {fullName: sub.full_name, reason: note}
    },
    {db, transport: deps.transport}
  );
  // Sem o motivo no payload: `body_kyc_rejected` não o interpola e a
  // notificação in-app não é sítio para texto livre de staff.
  await createNotification(
    {userId: sub.user_id, type: 'kyc_rejected', payload: {}, href: '/kyc'},
    db
  );
}

export type PendingKycRow = {
  id: string;
  user_id: string;
  citizen_type: CitizenType;
  nif: string;
  full_name: string;
  status: string;
  created_at: string;
};

export async function listPendingKyc(
  db: SupabaseClient = createAdminClient()
): Promise<PendingKycRow[]> {
  const {data, error} = await db
    .from('kyc_submissions')
    .select('id, user_id, citizen_type, nif, full_name, status, created_at')
    .eq('status', 'submitted')
    .order('created_at', {ascending: true});
  if (error) throw new Error(`listar KYC pendente falhou: ${error.message}`);
  return (data ?? []) as PendingKycRow[];
}

// --- helpers internos ---

type SubmissionRow = {user_id: string; full_name: string};

async function setDecision(
  db: SupabaseClient,
  input: ReviewInput,
  status: 'approved' | 'rejected',
  note: string | null
): Promise<SubmissionRow> {
  const {data, error} = await db
    .from('kyc_submissions')
    .update({
      status,
      review_note: note,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', input.submissionId)
    .eq('status', 'submitted') // idempotência: só decide submissões pendentes
    .select('user_id, full_name')
    .single();
  if (error || !data) {
    throw new Error(
      `decidir KYC falhou: ${error?.message ?? 'submissão não pendente'}`
    );
  }
  return data as SubmissionRow;
}

async function userEmail(db: SupabaseClient, userId: string): Promise<string> {
  const {data} = await db.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) throw new Error(`utilizador ${userId} sem email`);
  return email;
}
