'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {PlusIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';
import {createLeadAction} from './actions';

// Listas locais (não importar do módulo server-only do serviço).
const SOURCES = ['referencia', 'evento', 'website', 'linkedin', 'outro'];
const PROFILES = ['retail', 'qualificado', 'institucional'];

const CONTROL =
  'h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm text-ink outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function NewLeadForm({locale}: {locale: Locale}) {
  const t = useTranslations('Crm');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden className="size-4" />
        {t('newLead')}
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-xl">
      <CardContent>
        <form
          action={async (fd) => {
            await createLeadAction(locale, fd);
            setOpen(false);
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="full_name" className="font-semibold text-ink">
              {t('fullName')}
            </Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-semibold text-ink">
              {t('email')}
            </Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="font-semibold text-ink">
              {t('phone')}
            </Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source" className="font-semibold text-ink">
              {t('source')}
            </Label>
            <select id="source" name="source" defaultValue="outro" className={CONTROL}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`source_${s}` as 'source_outro')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="investor_profile" className="font-semibold text-ink">
              {t('investorProfile')}
            </Label>
            <select
              id="investor_profile"
              name="investor_profile"
              defaultValue=""
              className={CONTROL}
            >
              <option value="">{t('noProfile')}</option>
              {PROFILES.map((p) => (
                <option key={p} value={p}>
                  {t(`profile_${p}` as 'profile_retail')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated_ticket" className="font-semibold text-ink">
              {t('estimatedTicket')}
            </Label>
            <Input
              id="estimated_ticket"
              name="estimated_ticket"
              type="number"
              min={0}
              step="1000"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes" className="font-semibold text-ink">
              {t('notes')}
            </Label>
            <textarea id="notes" name="notes" rows={3} className={`${CONTROL} h-auto py-2.5`} />
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit">{t('save')}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
