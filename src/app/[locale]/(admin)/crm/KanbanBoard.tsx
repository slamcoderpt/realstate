'use client';

import {useState, useTransition} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {UserRoundIcon} from 'lucide-react';
import type {Locale} from '@/lib/mail/templates';
import type {CrmStage} from '@/lib/crm/service';
import {moveLeadStageAction} from './actions';

export type LeadCard = {
  id: string;
  fullName: string;
  estimatedTicket: number | null;
  ownerName: string;
  daysSinceContact: number;
};

type Column = {stage: CrmStage; label: string; leads: LeadCard[]};

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

export function KanbanBoard({
  locale,
  columns
}: {
  locale: Locale;
  columns: Column[];
}) {
  const t = useTranslations('Crm');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Coluna sob o cartão a ser arrastado (feedback visual do alvo).
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function onDrop(stage: CrmStage) {
    const id = dragging;
    setDragOver(null);
    setDragging(null);
    if (!id) return;
    startTransition(async () => {
      await moveLeadStageAction(locale, id, stage);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex gap-4 overflow-x-auto scroll-soft pb-3 ${pending ? 'opacity-70' : ''}`}
    >
      {columns.map((col) => (
        <section
          key={col.stage}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(col.stage);
          }}
          onDragLeave={() => setDragOver((s) => (s === col.stage ? null : s))}
          onDrop={() => onDrop(col.stage)}
          className={`flex w-72 shrink-0 flex-col rounded-[var(--radius-card)] border bg-secondary/50 ${
            dragOver === col.stage
              ? 'border-brand-400 bg-brand-50'
              : 'border-border'
          }`}
        >
          <header className="flex items-center justify-between px-4 py-3">
            <h2 className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">
              {col.label}
            </h2>
            <span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold text-ink-muted tabular-nums">
              {col.leads.length}
            </span>
          </header>

          <div className="flex min-h-16 flex-1 flex-col gap-2 px-3 pb-3">
            {col.leads.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-ink-muted">
                {t('noLeads')}
              </p>
            ) : (
              col.leads.map((lead) => (
                <article
                  key={lead.id}
                  draggable
                  onDragStart={() => setDragging(lead.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => router.push(`/crm/${lead.id}`)}
                  className={`cursor-pointer rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] transition hover:border-brand-200 hover:shadow-[0_10px_24px_rgba(0,107,255,0.12)] ${
                    dragging === lead.id ? 'opacity-40' : ''
                  }`}
                >
                  <p className="text-sm font-bold text-ink">{lead.fullName}</p>
                  {lead.estimatedTicket != null && (
                    <p className="mt-1 text-xs font-semibold text-brand-600 tabular-nums">
                      {eur(lead.estimatedTicket)}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-muted">
                    <span className="flex min-w-0 items-center gap-1">
                      <UserRoundIcon aria-hidden className="size-3 shrink-0" />
                      <span className="truncate">{lead.ownerName || '—'}</span>
                    </span>
                    {lead.daysSinceContact > 0 && (
                      <span className="shrink-0 tabular-nums">
                        {t('daysInStage', {n: lead.daysSinceContact})}
                      </span>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
