'use client';

import {useMemo, useState, useTransition} from 'react';
import {useRouter} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {UserRoundIcon} from 'lucide-react';
import type {Locale} from '@/lib/mail/templates';
import type {CrmStage} from '@/lib/crm/service';
import {moveLeadStageAction} from './actions';
import {LeadDialog} from './LeadDialog';

export type LeadCard = {
  id: string;
  fullName: string;
  estimatedTicket: number | null;
  ownerName: string;
  source: string;
  tags: string[];
  daysSinceContact: number;
};

type Column = {stage: CrmStage; label: string; leads: LeadCard[]};

const SOURCES = ['referencia', 'evento', 'website', 'linkedin', 'outro'];

const CONTROL =
  'h-9 rounded-xl border border-input bg-white px-3 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Lead aberta em modal (null = fechado). O detalhe abre por cima do board.
  const [openLead, setOpenLead] = useState<string | null>(null);

  // Filtros (client-side, sobre os cartões já carregados).
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');

  const owners = useMemo(
    () =>
      [
        ...new Set(
          columns.flatMap((c) => c.leads.map((l) => l.ownerName).filter(Boolean))
        )
      ].sort(),
    [columns]
  );
  const tags = useMemo(
    () =>
      [...new Set(columns.flatMap((c) => c.leads.flatMap((l) => l.tags)))].sort(),
    [columns]
  );

  function keep(l: LeadCard): boolean {
    if (owner && l.ownerName !== owner) return false;
    if (source && l.source !== source) return false;
    if (tag && !l.tags.includes(tag)) return false;
    return true;
  }

  // O id do cartão viaja no `dataTransfer` (e não apenas no estado React): é o
  // canal que o próprio HTML5 drag-and-drop garante entre o início e o largar.
  // Depender só do estado deixava o largar sujeito a uma corrida com o
  // `dragend`, e alguns browsers nem iniciam o arrasto sem dados definidos.
  function onDrop(e: React.DragEvent, stage: CrmStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragging;
    setDragOver(null);
    setDragging(null);
    if (!id) return;
    startTransition(async () => {
      await moveLeadStageAction(locale, id, stage);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('filterByOwner')}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className={CONTROL}
        >
          <option value="">{t('filterAllOwners')}</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          aria-label={t('filterBySource')}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={CONTROL}
        >
          <option value="">{t('filterAllSources')}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`source_${s}` as 'source_outro')}
            </option>
          ))}
        </select>
        {tags.length > 0 && (
          <select
            aria-label={t('filterByTag')}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={CONTROL}
          >
            <option value="">{t('filterAllTags')}</option>
            {tags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>
        )}
        {(owner || source || tag) && (
          <button
            type="button"
            onClick={() => {
              setOwner('');
              setSource('');
              setTag('');
            }}
            className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      <div
        className={`flex gap-4 overflow-x-auto scroll-soft pb-3 ${pending ? 'opacity-70' : ''}`}
      >
        {columns.map((col) => {
          const visible = col.leads.filter(keep);
          return (
            <section
              key={col.stage}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver(col.stage);
              }}
              onDragLeave={() =>
                setDragOver((s) => (s === col.stage ? null : s))
              }
              onDrop={(e) => onDrop(e, col.stage)}
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
                  {visible.length}
                </span>
              </header>

              <div className="flex min-h-16 flex-1 flex-col gap-2 px-3 pb-3">
                {visible.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-ink-muted">
                    {t('noLeads')}
                  </p>
                ) : (
                  visible.map((lead) => (
                    <article
                      key={lead.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', lead.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragging(lead.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      // Abre o detalhe em modal (sem sair do board). O teclado
                      // chega ao cartão como a um botão — é a mesma ação.
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenLead(lead.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenLead(lead.id);
                        }
                      }}
                      className={`cursor-pointer rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] transition hover:border-brand-200 hover:shadow-[0_10px_24px_rgba(0,107,255,0.12)] ${
                        dragging === lead.id ? 'opacity-40' : ''
                      }`}
                    >
                      <p className="text-sm font-bold text-ink">
                        {lead.fullName}
                      </p>
                      {lead.estimatedTicket != null && (
                        <p className="mt-1 text-xs font-semibold text-brand-600 tabular-nums">
                          {eur(lead.estimatedTicket)}
                        </p>
                      )}
                      {lead.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.tags.map((tg) => (
                            <span
                              key={tg}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-soft"
                            >
                              {tg}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-muted">
                        <span className="flex min-w-0 items-center gap-1">
                          <UserRoundIcon aria-hidden className="size-3 shrink-0" />
                          <span className="truncate">
                            {lead.ownerName || '—'}
                          </span>
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
          );
        })}
      </div>

      <LeadDialog
        locale={locale}
        leadId={openLead}
        onClose={() => {
          setOpenLead(null);
          // O board pode ter mudado com o que se fez no modal.
          router.refresh();
        }}
      />
    </div>
  );
}
