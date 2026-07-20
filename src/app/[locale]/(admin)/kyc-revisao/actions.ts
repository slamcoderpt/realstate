'use server';

import {requireStaff} from '@/lib/auth/staff';
import {approveKyc, rejectKyc} from '@/lib/kyc/service';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function approveKycAction(
  locale: Locale,
  submissionId: string
): Promise<void> {
  const session = await requireStaff();
  await approveKyc({submissionId, reviewerId: session.userId, locale});
  revalidatePath(`/${locale}/kyc-revisao`);
}

export async function rejectKycAction(
  locale: Locale,
  submissionId: string,
  note: string
): Promise<void> {
  const session = await requireStaff();
  await rejectKyc({submissionId, reviewerId: session.userId, note, locale});
  revalidatePath(`/${locale}/kyc-revisao`);
}
