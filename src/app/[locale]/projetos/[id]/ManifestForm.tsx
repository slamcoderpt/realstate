'use client';

import {useEffect} from 'react';
import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {manifestInterestAction, type ManifestState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: ManifestState = {ok: false};

export function ManifestForm({
  locale,
  projectId,
  min
}: {
  locale: string;
  projectId: string;
  min: number;
}) {
  const t = useTranslations('Subscription');
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    manifestInterestAction.bind(null, locale, projectId),
    initial
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const minLabel = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(min);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="amount">{t('amount')}</Label>
        <Input id="amount" name="amount" type="number" min={min} step="1000" required />
        <p className="text-xs text-neutral-500">{t('minNotice', {min: minLabel})}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>{t('consent')}</span>
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error === 'below_min'
            ? t('belowMin')
            : state.error === 'already'
              ? t('already')
              : state.error === 'consent_required'
                ? t('consentRequired')
                : t('submitError')}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
