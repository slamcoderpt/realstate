'use client';

import {useEffect, useState} from 'react';
import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {submitKycAction, type SubmitState} from './actions';
import type {Locale} from '@/lib/mail/templates';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: SubmitState = {ok: false};

export function KycForm({locale}: {locale: Locale}) {
  const t = useTranslations('Kyc');
  const router = useRouter();
  const [citizenType, setCitizenType] = useState<'pt' | 'foreign'>('pt');
  const [state, formAction, pending] = useActionState(
    submitKycAction.bind(null, locale),
    initial
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="citizen_type">{t('citizenType')}</Label>
        <select
          id="citizen_type"
          name="citizen_type"
          value={citizenType}
          onChange={(e) => setCitizenType(e.target.value as 'pt' | 'foreign')}
          className="w-full rounded-md border p-2"
        >
          <option value="pt">{t('citizenPt')}</option>
          <option value="foreign">{t('citizenForeign')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">{t('fullName')}</Label>
        <Input id="full_name" name="full_name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nif">{t('nif')}</Label>
        <Input id="nif" name="nif" inputMode="numeric" required />
      </div>

      {citizenType === 'pt' ? (
        <div className="space-y-2">
          <Label htmlFor="cartao_cidadao">{t('docCc')}</Label>
          <Input
            id="cartao_cidadao"
            name="cartao_cidadao"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="id">{t('docId')}</Label>
            <Input
              id="id"
              name="id"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comprovativo_morada">{t('docAddress')}</Label>
            <Input
              id="comprovativo_morada"
              name="comprovativo_morada"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </div>
        </>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>{t('consent')}</span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error === 'consent_required'
            ? t('consentRequired')
            : t('submitError')}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
