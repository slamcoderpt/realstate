'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {TableCell, TableRow} from '@/components/ui/table';
import type {SaveSettingState} from './actions';

const initial: SaveSettingState = {ok: false};

export function SettingRow({
  settingKey,
  description,
  value,
  action
}: {
  settingKey: string;
  description: string;
  value: string;
  action: (
    prev: SaveSettingState,
    formData: FormData
  ) => Promise<SaveSettingState>;
}) {
  const t = useTranslations('SettingsAdmin');
  const [state, formAction, pending] = useActionState(action, initial);

  // Sem `router.refresh()` a seguir a gravar: o textarea é não-controlado e a
  // re-renderização do Server Component reescrevia-lhe o `defaultValue` por
  // cima do que o utilizador entretanto tivesse escrito. O `revalidatePath` na
  // action já garante valores frescos na próxima navegação/reload.
  return (
    <TableRow className="border-border hover:bg-brand-50/60">
      <TableCell className="px-5 py-4 align-top font-mono text-xs font-bold text-ink">
        {settingKey}
      </TableCell>
      <TableCell className="px-5 py-4 align-top text-sm whitespace-normal text-ink-soft">
        {description}
        {value === 'null' && (
          <span className="mt-1 block text-xs text-ink-muted">
            {t('noLimit')}
          </span>
        )}
      </TableCell>
      <TableCell className="px-5 py-4 align-top">
        <form action={formAction} className="space-y-2.5">
          <textarea
            name="value"
            aria-label={`${settingKey} — ${t('value')}`}
            defaultValue={value}
            rows={2}
            spellCheck={false}
            className="w-full min-w-0 rounded-xl border border-input bg-white px-3.5 py-2.5 font-mono text-xs text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {t('save')}
            </Button>
            {state.error && (
              <span role="alert" className="text-xs font-semibold text-destructive">
                {t('invalidJson')}
              </span>
            )}
            {state.ok && !state.error && (
              <span role="status" className="text-xs font-semibold text-emerald-600">
                {t('saved')}
              </span>
            )}
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}
