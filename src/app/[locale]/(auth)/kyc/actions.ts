'use server';

import {headers} from 'next/headers';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {submitKyc, type CitizenType, type KycDocType} from '@/lib/kyc/service';
import type {Locale} from '@/lib/mail/templates';

export type SubmitState = {ok: boolean; error?: string};

const DOC_FIELDS: KycDocType[] = ['cartao_cidadao', 'id', 'comprovativo_morada'];

export async function submitKycAction(
  locale: Locale,
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const session = await getSession();
  if (!session) return {ok: false, error: 'sessão inválida'};

  const citizenType = formData.get('citizen_type') as CitizenType;
  if (citizenType !== 'pt' && citizenType !== 'foreign') {
    return {ok: false, error: 'invalid_citizen_type'};
  }
  const nif = String(formData.get('nif') ?? '');
  const fullName = String(formData.get('full_name') ?? '');
  const consent = formData.get('consent') === 'on';
  if (!consent) return {ok: false, error: 'consent_required'};

  const documents = DOC_FIELDS.flatMap((docType) => {
    const file = formData.get(docType);
    return file instanceof File && file.size > 0 ? [{docType, file}] : [];
  });

  const db = createAdminClient();
  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'kyc_consent_version')
    .single();
  const consentVersion =
    typeof setting?.value === 'string' ? setting.value : 'v1';

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  try {
    await submitKyc({
      userId: session.userId,
      citizenType,
      nif,
      fullName,
      consentVersion,
      submittedIp: ip,
      locale,
      documents
    });
    return {ok: true};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro';
    return {ok: false, error: msg};
  }
}
