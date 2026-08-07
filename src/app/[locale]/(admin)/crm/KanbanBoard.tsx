'use client';

import {useEffect, useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {AlertTriangleIcon, HandshakeIcon, UserRoundIcon} from 'lucide-react';
import type {Locale} from '@/lib/mail/templates';
import {CRM_SOURCES, type CrmStage} from '@/lib/crm/constants';
import {moveLeadStageAction} from './actions';
import {LeadDialog} from './LeadDialog';

export type LeadCard = {
  id: string;
  fullName: string;
  estimatedTicket: number | null;
  ownerName: string;
  source: string;
  /** Agente/intermediário que trouxe o lead ('' = veio direto). */
  agentName: string;
  tags: string[];
  /**
   * Data (já formatada) do follow-up por resolver mais antigo, quando está
   * ATRASADO. `null` quando não há follow-up pendente ou ainda está a horas —
   * o cartão só mostra a marca quando ela pede ação.
   */
  overdueFollowup: string | null;
  daysSinceContact: number;
};

type Column = {stage: CrmStage; label: string; leads: LeadCard[]};

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
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Lead aberta em modal (null = fechado). O detalhe abre por cima do board.
  const [openLead, setOpenLead] = useState<string | null>(null);
  // Estado otimista do arrastar: id do cartão → coluna onde já o largámos. O
  // cartão muda de sítio no instante do largar e a gravação segue em pano de
  // fundo; esperar pela ida ao servidor dava 2-3 s de cartão parado.
  const [moved, setMoved] = useState<Record<string, CrmStage>>({});

  // Filtros (client-side, sobre os cartões já carregados).
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [agent, setAgent] = useState('');
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
  // Agentes existentes nos cartões — filtrar por agente é o que dá a lista de
  // leads a considerar para comissão.
  const agents = useMemo(
    () =>
      [
        ...new Set(
          columns.flatMap((c) => c.leads.map((l) => l.agentName).filter(Boolean))
        )
      ].sort(),
    [columns]
  );
  const tags = useMemo(
    () =>
      [...new Set(columns.flatMap((c) => c.leads.flatMap((l) => l.tags)))].sort(),
    [columns]
  );

  // Colunas com o movimento otimista já aplicado.
  const board = useMemo(() => {
    if (Object.keys(moved).length === 0) return columns;
    const placed = columns.flatMap((c) =>
      c.leads.map((l) => ({lead: l, stage: moved[l.id] ?? c.stage}))
    );
    return columns.map((c) => ({
      ...c,
      leads: placed.filter((p) => p.stage === c.stage).map((p) => p.lead)
    }));
  }, [columns, moved]);

  // Quando o servidor confirma (as props já trazem o cartão na coluna certa), o
  // otimismo deixa de ser preciso — largá-lo aqui evita ficar a mascarar dados.
  useEffect(() => {
    setMoved((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = {...prev};
      let changed = false;
      for (const c of columns)
        for (const l of c.leads)
          if (next[l.id] === c.stage) {
            delete next[l.id];
            changed = true;
          }
      return changed ? next : prev;
    });
  }, [columns]);

  function keep(l: LeadCard): boolean {
    if (owner && l.ownerName !== owner) return false;
    if (source && l.source !== source) return false;
    if (agent && l.agentName !== agent) return false;
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
    // Largado na coluna onde já estava: nada a gravar.
    const from = board.find((c) => c.leads.some((l) => l.id === id));
    if (!from || from.stage === stage) return;
    setMoved((m) => ({...m, [id]: stage}));
    // Sem `await`: a ação revalida `/crm` e as props chegam sozinhas. Se falhar,
    // desfaz-se o movimento para não mentir sobre o estado gravado.
    moveLeadStageAction(locale, id, stage).catch(() => {
      setMoved((m) => {
        const next = {...m};
        delete next[id];
        return next;
      });
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
          {CRM_SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`source_${s}` as 'source_outro')}
            </option>
          ))}
        </select>
        {agents.length > 0 && (
          <select
            aria-label={t('filterByAgent')}
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className={CONTROL}
          >
            <option value="">{t('filterAllAgents')}</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
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
        {(owner || source || agent || tag) && (
          <button
            type="button"
            onClick={() => {
              setOwner('');
              setSource('');
              setAgent('');
              setTag('');
            }}
            className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto scroll-soft pb-3">
        {board.map((col) => {
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
                      {lead.agentName && (
                        <p
                          title={`${t('agent')}: ${lead.agentName}`}
                          className="mt-1 flex items-center gap-1 text-xs text-ink-muted"
                        >
                          <HandshakeIcon aria-hidden className="size-3 shrink-0" />
                          <span className="truncate">{lead.agentName}</span>
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
                      {/* Follow-up atrasado: a única marca vermelha do cartão,
                          e só aparece quando há mesmo um a pedir ação. Se o
                          board ficasse cheio de vermelhos, nenhum se via. */}
                      {lead.overdueFollowup && (
                        <p className="mt-2 flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">
                          <AlertTriangleIcon aria-hidden className="size-3 shrink-0" />
                          <span className="tabular-nums">
                            {t('followupOverdue', {date: lead.overdueFollowup})}
                          </span>
                        </p>
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

      {/* O board por trás é atualizado pelo `revalidatePath` das próprias ações
          do modal — não é preciso refrescar ao fechar. */}
      <LeadDialog
        locale={locale}
        leadId={openLead}
        onClose={() => setOpenLead(null)}
      />
    </div>
  );
}
