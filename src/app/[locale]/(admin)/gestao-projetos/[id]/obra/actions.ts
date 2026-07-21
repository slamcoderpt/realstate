'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  addMilestone,
  updateMilestone,
  setActualAmount,
  type MilestoneStatus
} from '@/lib/works/service';
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
