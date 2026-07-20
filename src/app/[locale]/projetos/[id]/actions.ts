'use server';

import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {manifestInterest, cancelSubscription} from '@/lib/subscriptions/service';

export type ManifestState = {ok: boolean; error?: string};

export async function manifestInterestAction(
  locale: string,
  projectId: string,
  _prev: ManifestState,
  formData: FormData
): Promise<ManifestState> {
  const session = await getSession();
  if (!session) return {ok: false, error: 'session'};

  const amount = Number(formData.get('amount') ?? 0);
  const consent = formData.get('consent') === 'on';
  if (!consent) return {ok: false, error: 'consent_required'};
  if (!Number.isFinite(amount) || amount <= 0) return {ok: false, error: 'amount'};

  const db = createAdminClient();
  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'terms_version')
    .single();
  const consentVersion =
    typeof setting?.value === 'string' ? setting.value : 'v1';

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  try {
    await manifestInterest({
      userId: session.userId,
      projectId,
      amount,
      consentVersion,
      interestIp: ip
    });
    revalidatePath(`/${locale}/projetos/${projectId}`);
    return {ok: true};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro';
    if (/mínimo|minimo/i.test(msg)) return {ok: false, error: 'below_min'};
    if (/duplicate|unique|já|ativa/i.test(msg)) return {ok: false, error: 'already'};
    return {ok: false, error: 'generic'};
  }
}

export async function cancelSubscriptionAction(
  locale: string,
  projectId: string,
  subscriptionId: string
): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await cancelSubscription({id: subscriptionId, byUserId: session.userId, isStaff: false});
  revalidatePath(`/${locale}/projetos/${projectId}`);
}
