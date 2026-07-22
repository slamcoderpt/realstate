'use client';

import {useEffect, useState} from 'react';
import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {submitKycAction, type SubmitState} from './actions';
import type {Locale} from '@/lib/mail/templates';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: SubmitState = {ok: false};

// O botão de "escolher ficheiro" do browser é cinzento e passa despercebido;
// aqui fica com a cor da marca para se perceber que há algo para carregar.
const FILE_INPUT =
  'cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-full file:bg-brand-50 file:px-3 file:font-semibold file:text-brand-700';

export function KycForm({locale}: {locale: Locale}) {
  const t = useTranslations('Kyc');
  const router = useRouter();
  const [citizenType, setCitizenType] = useState<'pt' | 'foreign'>('pt');
  const [state, formAction, pending] = useActionState(
    submitKycAction.bind(null, locale),
    initial
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="citizen_type" className="text-ink">
          {t('citizenType')}
        </Label>
        {/* Sem primitivo de select na casa: alinha-se à mão com o Input para
            os dois campos não parecerem de formulários diferentes. */}
        <select
          id="citizen_type"
          name="citizen_type"
          value={citizenType}
          onChange={(e) => setCitizenType(e.target.value as 'pt' | 'foreign')}
          className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="pt">{t('citizenPt')}</option>
          <option value="foreign">{t('citizenForeign')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name" className="text-ink">
          {t('fullName')}
        </Label>
        <Input id="full_name" name="full_name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nif" className="text-ink">
          {t('nif')}
        </Label>
        <Input id="nif" name="nif" inputMode="numeric" required />
      </div>

      {citizenType === 'pt' ? (
        <div className="space-y-2">
          <Label htmlFor="cartao_cidadao" className="text-ink">
            {t('docCc')}
          </Label>
          <Input
            id="cartao_cidadao"
            name="cartao_cidadao"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            className={FILE_INPUT}
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="id" className="text-ink">
              {t('docId')}
            </Label>
            <Input
              id="id"
              name="id"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              className={FILE_INPUT}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comprovativo_morada" className="text-ink">
              {t('docAddress')}
            </Label>
            <Input
              id="comprovativo_morada"
              name="comprovativo_morada"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              className={FILE_INPUT}
            />
          </div>
        </>
      )}

      {/* Consentimento RGPD: caixa própria e alvo largo — não é letra miúda. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/70 p-3.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-500"
        />
        <span>{t('consent')}</span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {state.error === 'consent_required'
            ? t('consentRequired')
            : t('submitError')}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
