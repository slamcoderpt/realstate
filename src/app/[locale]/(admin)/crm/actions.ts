'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  createLead,
  updateLead,
  moveLeadStage,
  addActivity,
  convertLeadToInvite,
  markActivityDone,
  type CrmStage,
  type CrmSource,
  type CrmInvestorProfile,
  type CrmActivityType
} from '@/lib/crm/service';
import {getLeadDetailView, type LeadDetailView} from '@/lib/crm/detail-dto';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';
import {headers} from 'next/headers';

/** Origem absoluta da app para os links dos emails. Env em prod; host em dev. */
async function appUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto =
    host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

/**
 * Server Actions do CRM. `requireStaff()` em cada uma — uma Server Action é um
 * endpoint independente e o layout `(admin)` não a protege por si só.
 */

function optional(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? '').trim();
  return s === '' ? undefined : s;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createLeadAction(
  locale: Locale,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  if (!fullName || !email) return;
  await createLead({
    fullName,
    email,
    phone: optional(formData.get('phone')),
    source: (optional(formData.get('source')) as CrmSource) ?? undefined,
    investorProfile:
      (optional(formData.get('investor_profile')) as CrmInvestorProfile) ??
      null,
    estimatedTicket: optionalNumber(formData.get('estimated_ticket')),
    notes: optional(formData.get('notes')),
    createdBy: s.userId
  });
  revalidatePath(`/${locale}/crm`);
}

/**
 * Detalhe de uma lead para o modal do kanban (o único sítio que o busca a
 * partir do cliente). Devolve já formatado — ver `getLeadDetailView`.
 */
export async function loadLeadDetailAction(
  locale: Locale,
  id: string
): Promise<LeadDetailView | null> {
  await requireStaff();
  return getLeadDetailView(id, locale);
}

export async function updateLeadAction(
  locale: Locale,
  id: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  // Tags: campo de texto separado por vírgulas → array normalizado, sem vazios.
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await updateLead(id, {
    fullName: String(formData.get('full_name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    source: String(formData.get('source') ?? 'outro') as CrmSource,
    investorProfile:
      (optional(formData.get('investor_profile')) as CrmInvestorProfile) ??
      null,
    estimatedTicket: optionalNumber(formData.get('estimated_ticket')),
    notes: String(formData.get('notes') ?? ''),
    tags
  });
  revalidatePath(`/${locale}/crm/${id}`);
  revalidatePath(`/${locale}/crm`);
}

export async function moveLeadStageAction(
  locale: Locale,
  id: string,
  to: CrmStage
): Promise<void> {
  const s = await requireStaff();
  await moveLeadStage(id, to, s.userId);
  revalidatePath(`/${locale}/crm`);
  revalidatePath(`/${locale}/crm/${id}`);
}

export async function markFollowupDoneAction(
  locale: Locale,
  activityId: string
): Promise<void> {
  await requireStaff();
  await markActivityDone(activityId);
  revalidatePath(`/${locale}/crm`);
}

export async function convertLeadToInviteAction(
  locale: Locale,
  id: string
): Promise<void> {
  const s = await requireStaff();
  await convertLeadToInvite(id, {
    locale,
    actorId: s.userId,
    appUrl: await appUrl()
  });
  revalidatePath(`/${locale}/crm/${id}`);
  revalidatePath(`/${locale}/crm`);
}

/** Variante para `<form>` (página de detalhe): lê o estado destino do FormData. */
export async function moveLeadStageFormAction(
  locale: Locale,
  id: string,
  formData: FormData
): Promise<void> {
  const to = String(formData.get('stage') ?? '') as CrmStage;
  if (!to) return;
  await moveLeadStageAction(locale, id, to);
}

export async function addActivityAction(
  locale: Locale,
  leadId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const type = String(formData.get('type') ?? 'nota') as CrmActivityType;
  const body = String(formData.get('body') ?? '').trim();
  const dueAt = optional(formData.get('due_at'));
  if (!body && !dueAt) return;
  await addActivity(
    leadId,
    {type, body, dueAt: dueAt ? new Date(dueAt).toISOString() : null},
    s.userId
  );
  revalidatePath(`/${locale}/crm/${leadId}`);
  revalidatePath(`/${locale}/crm`);
}
