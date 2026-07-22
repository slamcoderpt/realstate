'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {requestPasswordResetAction, type ResetState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initialState: ResetState = {status: 'idle'};

export function ResetForm({locale}: {locale: string}) {
  const t = useTranslations('ResetPassword');
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState
  );

  // Enviado: o formulário sai de cena. Voltar a mostrá-lo convidaria a repetir o
  // pedido, e a mensagem já diz tudo o que há para dizer.
  if (state.status === 'sent') {
    return (
      <div className="space-y-5">
        <p
          role="status"
          className="rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-ink-soft"
        >
          {t('sent')}
        </p>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-brand-500 hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink">
          {t('email')}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      {state.status === 'error' && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {t('error')}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>

      <Link
        href="/login"
        className="block text-center text-sm font-medium text-brand-500 hover:underline"
      >
        {t('backToLogin')}
      </Link>
    </form>
  );
}
