'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {completePasswordResetAction, type NewPasswordState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initialState: NewPasswordState = {done: false, error: null};

export function NewPasswordForm({token}: {token: string}) {
  const t = useTranslations('NewPassword');
  const [state, formAction, pending] = useActionState(
    completePasswordResetAction,
    initialState
  );

  // Feito: o formulário desaparece. Deixá-lo no ecrã convidaria a um segundo
  // submit com um token que já não serve (uso único) — só produziria um erro.
  if (state.done) {
    return (
      <div className="space-y-5">
        <p
          role="status"
          className="rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-ink-soft"
        >
          {t('done')}
        </p>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-brand-500 hover:underline"
        >
          {t('goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="password" className="text-ink">
          {t('password')}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-ink-muted">{t('hint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-ink">
          {t('confirm')}
        </Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {t(state.error)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
