'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  transitionSubscription,
  cancelSubscription,
  attachContract
} from '@/lib/subscriptions/service';
import {uploadContract, contractPath} from '@/lib/subscriptions/storage';
import {createAdminClient} from '@/lib/supabase/admin';
import type {SubscriptionStatus} from '@/lib/subscriptions/states';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function advanceSubscriptionAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string,
  to: SubscriptionStatus,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const confirmedRef =
    to === 'fundos_confirmados'
      ? String(formData.get('confirmed_ref') ?? '')
      : undefined;
  await transitionSubscription({
    id: subscriptionId,
    to,
    reviewerId: s.userId,
    locale,
    confirmedRef
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}

export async function cancelSubscriptionAdminAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string
): Promise<void> {
  const s = await requireStaff();
  await cancelSubscription({id: subscriptionId, byUserId: s.userId, isStaff: true});
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}

export async function uploadContractAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('contract');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = contractPath(subscriptionId, file.name);
  await uploadContract(path, file, db);
  await attachContract(subscriptionId, path, db);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}
