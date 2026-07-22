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
    <TableRow>
      <TableCell className="align-top font-mono text-xs font-medium">
        {settingKey}
      </TableCell>
      <TableCell className="align-top text-sm text-neutral-500">
        {description}
        {value === 'null' && (
          <span className="block text-xs text-neutral-400">{t('noLimit')}</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        <form action={formAction} className="space-y-2">
          <textarea
            name="value"
            aria-label={`${settingKey} — ${t('value')}`}
            defaultValue={value}
            rows={2}
            spellCheck={false}
            className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {t('save')}
            </Button>
            {state.error && (
              <span role="alert" className="text-xs text-red-600">
                {t('invalidJson')}
              </span>
            )}
            {state.ok && !state.error && (
              <span role="status" className="text-xs text-emerald-600">
                {t('saved')}
              </span>
            )}
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}
