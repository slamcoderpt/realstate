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
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label
          htmlFor="amount"
          className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase"
        >
          {t('amount')}
        </Label>
        <Input id="amount" name="amount" type="number" min={min} step="1000" required />
        <p className="text-xs text-ink-muted">{t('minNotice', {min: minLabel})}</p>
      </div>
      <label className="flex items-start gap-2.5 rounded-2xl bg-secondary p-3 text-xs leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-4 shrink-0 accent-brand-500"
        />
        <span>{t('consent')}</span>
      </label>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
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
