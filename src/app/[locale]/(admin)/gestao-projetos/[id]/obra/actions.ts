'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  addMilestone,
  updateMilestone,
  setActualAmount,
  publishWorkUpdate,
  publishWorkDocument,
  deleteWorkDocument,
  type MilestoneStatus
} from '@/lib/works/service';
import {
  createMediaUploadUrl,
  workMediaPath,
  mediaTypeFor
} from '@/lib/works/storage';
import {createAdminClient} from '@/lib/supabase/admin';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

/**
 * Server Actions do back-office de obra. `requireStaff()` é obrigatório em
 * cada uma: uma Server Action é um endpoint independente e o layout `(admin)`
 * não a protege.
 */

export async function addMilestoneAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const planned = String(formData.get('planned_date') ?? '');
  await addMilestone(projectId, {
    title: String(formData.get('title') ?? ''),
    plannedDate: planned || null
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function updateMilestoneAction(
  locale: Locale,
  projectId: string,
  milestoneId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const actual = String(formData.get('actual_date') ?? '');
  await updateMilestone(milestoneId, {
    status: String(formData.get('status') ?? 'previsto') as MilestoneStatus,
    actualDate: actual || null
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function setActualAmountAction(
  locale: Locale,
  projectId: string,
  lineId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await setActualAmount(lineId, Number(formData.get('actual_amount') ?? 0), {
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function publishUpdateAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const milestone = String(formData.get('milestone_id') ?? '');
  await publishWorkUpdate({
    projectId,
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    milestoneId: milestone || null,
    createdBy: s.userId,
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

/**
 * Passo 1 do upload direto: devolve caminho + token assinado ao browser.
 * `mediaTypeFor` filtra o MIME declarado pelo cliente — é uma primeira linha,
 * não uma garantia: quem impõe tipo e tamanho é o bucket (os bytes nunca
 * passam por aqui).
 */
export async function createUploadUrlAction(
  updateId: string,
  filename: string,
  mimeType: string
): Promise<{path: string; token: string} | {error: string}> {
  await requireStaff();
  if (!mediaTypeFor(mimeType)) return {error: 'mime'};
  const path = workMediaPath(updateId, filename);
  try {
    return await createMediaUploadUrl(path);
  } catch {
    return {error: 'upload_url'};
  }
}

/** Passo 3 do upload direto: regista a media depois de o browser a enviar. */
export async function registerMediaAction(
  locale: Locale,
  projectId: string,
  updateId: string,
  path: string,
  mimeType: string,
  sizeBytes: number
): Promise<void> {
  await requireStaff();
  const kind = mediaTypeFor(mimeType);
  if (!kind) throw new Error('tipo de ficheiro não permitido');
  const db = createAdminClient();
  const {count} = await db
    .from('work_update_media')
    .select('*', {count: 'exact', head: true})
    .eq('work_update_id', updateId);
  const {error} = await db.from('work_update_media').insert({
    work_update_id: updateId,
    storage_path: path,
    media_type: kind,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    sort_order: (count ?? 0) + 1
  });
  if (error) throw new Error(`registar media falhou: ${error.message}`);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

/**
 * Anexa um documento/fatura à obra. O PDF sobe pela própria Server Action
 * (FormData) — o serviço valida os bytes por magic-bytes. A associação é
 * opcional: `associate` vem como `line:<id>`, `update:<id>` ou vazio (documento
 * do projeto, sem ligação a rubrica/atualização).
 */
export async function uploadWorkDocumentAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return;
  const assoc = String(formData.get('associate') ?? '');
  const budgetLineId = assoc.startsWith('line:') ? assoc.slice(5) : null;
  const workUpdateId = assoc.startsWith('update:') ? assoc.slice(7) : null;
  await publishWorkDocument({
    projectId,
    file,
    createdBy: s.userId,
    budgetLineId,
    workUpdateId
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function deleteWorkDocumentAction(
  locale: Locale,
  projectId: string,
  docId: string
): Promise<void> {
  await requireStaff();
  await deleteWorkDocument(docId);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}
