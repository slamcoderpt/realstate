'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {updateProfileAction, type UpdateProfileState} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: UpdateProfileState = {ok: false};

const FIELD_LABEL =
  'text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const SELECT =
  'h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Nome e idioma preferido. Não leva o id do utilizador em campo nenhum — de
 * propósito: a ação tira-o da sessão, e um `<input type="hidden">` com o id
 * daria a ideia errada de que o cliente escolhe quem é.
 */
export function DetailsForm({
  fullName,
  preferredLocale
}: {
  fullName: string;
  preferredLocale: 'pt' | 'en';
}) {
  const t = useTranslations('Profile');
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName" className={FIELD_LABEL}>
            {t('fullName')}
          </Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            required
            maxLength={120}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language" className={FIELD_LABEL}>
            {t('language')}
          </Label>
          <select
            id="language"
            name="language"
            defaultValue={preferredLocale}
            className={SELECT}
          >
            <option value="pt">{t('lang_pt')}</option>
            <option value="en">{t('lang_en')}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('save')}
        </Button>
        {state.error && (
          <span role="alert" className="text-sm font-semibold text-destructive">
            {t('saveError')}
          </span>
        )}
        {state.ok && (
          <span role="status" className="text-sm font-semibold text-emerald-600">
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  );
}
