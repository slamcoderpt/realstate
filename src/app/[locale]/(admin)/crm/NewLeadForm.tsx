'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {PlusIcon} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import type {Locale} from '@/lib/mail/templates';
import {CRM_SOURCES, CRM_PROFILES} from '@/lib/crm/constants';
import {FIELD, LABEL} from './ui';
import {createLeadAction} from './actions';

/** Criação de lead em janela modal — o pipeline fica visível por trás. */
export function NewLeadForm({locale}: {locale: Locale}) {
  const t = useTranslations('Crm');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--crm-accent)] px-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0b64b0]"
        >
          <PlusIcon aria-hidden className="size-3.5" />
          {t('newLead')}
        </button>
      </DialogTrigger>
      {/* `crm-surface` também aqui: o diálogo sai por portal para o `body` e,
          sem a classe, herdava o tema da marca em vez do tema do CRM. */}
      <DialogContent
        showCloseButton={false}
        className="crm-surface max-h-[90vh] overflow-y-auto scroll-soft rounded-lg border-[var(--crm-gray5)] p-4 sm:max-w-xl"
      >
        <DialogHeader className="gap-0.5">
          <DialogTitle className="text-[15px] font-semibold text-[var(--crm-gray12)]">
            {t('newLead')}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[var(--crm-gray9)]">
            {t('subtitle')}
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await createLeadAction(locale, fd);
            setOpen(false);
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field id="full_name" label={t('fullName')}>
            <input id="full_name" name="full_name" required className={FIELD} />
          </Field>
          <Field id="email" label={t('email')}>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={FIELD}
            />
          </Field>
          <Field id="phone" label={t('phone')}>
            <input id="phone" name="phone" className={FIELD} />
          </Field>
          <Field id="source" label={t('source')}>
            <select
              id="source"
              name="source"
              defaultValue="outro"
              className={FIELD}
            >
              {CRM_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`source_${s}` as 'source_outro')}
                </option>
              ))}
            </select>
          </Field>
          {/* Agente/intermediário: campo à parte da origem — quem trouxe o
              investidor, para depois se poder pagar comissão. */}
          <Field id="agent_name" label={t('agent')}>
            <input
              id="agent_name"
              name="agent_name"
              placeholder={t('agentHint')}
              className={FIELD}
            />
          </Field>
          <Field id="investor_profile" label={t('investorProfile')}>
            <select
              id="investor_profile"
              name="investor_profile"
              defaultValue=""
              className={FIELD}
            >
              <option value="">{t('noProfile')}</option>
              {CRM_PROFILES.map((p) => (
                <option key={p} value={p}>
                  {t(`profile_${p}` as 'profile_retail')}
                </option>
              ))}
            </select>
          </Field>
          <Field id="estimated_ticket" label={t('estimatedTicket')}>
            <input
              id="estimated_ticket"
              name="estimated_ticket"
              type="number"
              min={0}
              step="1000"
              className={FIELD}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="notes" label={t('notes')}>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className={`${FIELD} h-auto py-1.5`}
              />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded bg-[var(--crm-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#0b64b0]"
            >
              {t('save')}
            </button>
            <DialogClose className="inline-flex h-8 items-center rounded border border-[var(--crm-gray6)] bg-white px-3 text-[13px] font-medium text-[var(--crm-gray11)] transition-colors hover:bg-[var(--crm-gray4)]">
              {t('cancel')}
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  );
}
