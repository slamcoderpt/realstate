'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {changePasswordAction, type ChangePasswordState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: ChangePasswordState = {ok: false};

const FIELD_LABEL =
  'text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';

/**
 * Troca de palavra-passe. O `minLength` do input é conforto, não controlo: o
 * mínimo verdadeiro é o do servidor (`MIN_PASSWORD_LENGTH`), e é lá que a
 * recusa acontece.
 */
export function PasswordForm({minLength}: {minLength: number}) {
  const t = useTranslations('Profile');
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="currentPassword" className={FIELD_LABEL}>
            {t('currentPassword')}
          </Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword" className={FIELD_LABEL}>
            {t('newPassword')}
          </Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={minLength}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className={FIELD_LABEL}>
            {t('confirmPassword')}
          </Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={minLength}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('changePassword')}
        </Button>
        {state.error === 'wrongPassword' && (
          <span role="alert" className="text-sm font-semibold text-destructive">
            {t('wrongPassword')}
          </span>
        )}
        {state.error === 'saveError' && (
          <span role="alert" className="text-sm font-semibold text-destructive">
            {t('saveError')}
          </span>
        )}
        {state.ok && (
          <span role="status" className="text-sm font-semibold text-emerald-600">
            {t('passwordChanged')}
          </span>
        )}
      </div>
    </form>
  );
}
