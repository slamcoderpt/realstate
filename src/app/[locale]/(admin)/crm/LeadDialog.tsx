'use client';

import {useCallback, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {ExternalLinkIcon} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {Spinner} from '@/components/ui/spinner';
import type {LeadDetailView} from '@/lib/crm/detail-dto';
import type {Locale} from '@/lib/mail/templates';
import {loadLeadDetailAction} from './actions';
import {LeadDetail} from './LeadDetail';

/**
 * Detalhe da lead numa janela modal, aberta a partir do cartão do kanban: quem
 * está a trabalhar o pipeline vê e edita a lead sem perder o board de vista.
 *
 * Os dados são carregados por Server Action ao abrir (e recarregados a cada
 * ação) — o board por trás fica atualizado pelo `revalidatePath` das mesmas
 * ações. A página `/crm/[id]` mantém-se para links diretos e é alcançável pelo
 * atalho no cabeçalho.
 */
export function LeadDialog({
  locale,
  leadId,
  onClose
}: {
  locale: Locale;
  /** `null` fecha o diálogo. */
  leadId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Crm');
  const router = useRouter();
  const [view, setView] = useState<LeadDetailView | null>(null);
  // Muda a cada carregamento: serve de `key` ao detalhe para os campos (não
  // controlados) voltarem a montar com os valores acabados de gravar.
  const [revision, setRevision] = useState(0);

  const load = useCallback(
    async (id: string) => {
      const next = await loadLeadDetailAction(locale, id);
      setView(next);
      setRevision((r) => r + 1);
    },
    [locale]
  );

  useEffect(() => {
    if (!leadId) return;
    setView(null);
    void load(leadId);
  }, [leadId, load]);

  return (
    <Dialog
      open={leadId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto scroll-soft rounded-[var(--radius-card)] sm:max-w-5xl"
      >
        {/* Título e ações da janela na MESMA linha: o «Fechar» absoluto obrigava
            a reservar espaço à direita do título e ainda assim colidia com nomes
            longos. O fechar é próprio (o do componente base é sr-only em inglês)
            e o atalho leva à página completa, o link partilhável da lead. */}
        <div className="flex items-start justify-between gap-4">
          <DialogHeader className="min-w-0 gap-1">
            <DialogTitle className="truncate text-xl font-extrabold tracking-tight text-ink">
              {view?.lead.full_name ?? t('details')}
            </DialogTitle>
            <DialogDescription className="truncate">
              {view ? view.lead.email || t('noEmail') : t('loading')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 items-center gap-1">
            {leadId && (
              <button
                type="button"
                onClick={() => router.push(`/crm/${leadId}`)}
                title={t('openFullPage')}
                className="rounded-lg p-2 text-ink-muted transition hover:bg-secondary hover:text-ink"
              >
                <ExternalLinkIcon aria-hidden className="size-4" />
                <span className="sr-only">{t('openFullPage')}</span>
              </button>
            )}
            <DialogClose className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-muted transition hover:bg-secondary hover:text-ink">
              {t('close')}
            </DialogClose>
          </div>
        </div>

        {view ? (
          <LeadDetail
            key={revision}
            locale={locale}
            view={view}
            variant="dialog"
            onChanged={() => {
              if (leadId) void load(leadId);
            }}
            onDeleted={onClose}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Spinner className="text-brand-500" />
            {t('loading')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
