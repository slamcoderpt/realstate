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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-2">
        <Label htmlFor="name" className="text-ink">
          {t('name')}
        </Label>
        <Input id="name" value={fullName} disabled className="bg-secondary" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink">
          {t('email')}
        </Label>
        <Input id="email" value={email} disabled className="bg-secondary" />
      </div>
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
        <p className="text-xs text-ink-muted">{t('passwordHint')}</p>
      </div>

      {/* Aceitação dos termos: caixa própria e alvo largo. Aqui reconhece-se o
          risco e a iliquidez do investimento — não pode ler-se como rodapé. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/70 p-3.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="accept"
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-500"
          required
        />
        <span>{t('acceptTerms')}</span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
