'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {acceptInviteAction, type AcceptState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initialState: AcceptState = {error: null};

export function AcceptForm({
  token,
  locale,
  fullName,
  email
}: {
  token: string;
  locale: string;
  fullName: string;
  email: string;
}) {
  const t = useTranslations('Aceitar');
  const [state, formAction, pending] = useActionState(
    acceptInviteAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" value={fullName} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-neutral-500">{t('passwordHint')}</p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="accept"
          className="mt-1"
          required
        />
        <span>{t('acceptTerms')}</span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
