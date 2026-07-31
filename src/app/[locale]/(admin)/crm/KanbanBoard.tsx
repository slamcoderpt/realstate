'use client';

import {useEffect, useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import type {Locale} from '@/lib/mail/templates';
import type {CrmStage} from '@/lib/crm/constants';
import {Avatar, Empty, Tag, STAGE_TONE, eur} from './ui';
import {moveLeadStageAction} from './actions';
import type {Column} from './types';

/**
 * Kanban do pipeline. Filtros e detalhe vivem no `CrmWorkspace` (são comuns às
 * duas vistas); aqui fica o que é próprio do board: arrastar, o movimento
 * otimista e o desenho dos cartões.
 */

function eurCompact(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(v);
}

export function KanbanBoard({
  locale,
  columns,
  onOpen
}: {
  locale: Locale;
  columns: Column[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('Crm');
  const [dragOver, setDragOver] = useState<CrmStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Estado otimista do arrastar: id do cartão → coluna onde já o largámos. O
  // cartão muda de sítio no instante do largar e a gravação segue em pano de
  // fundo; esperar pela ida ao servidor dava 2-3 s de cartão parado.
  const [moved, setMoved] = useState<Record<string, CrmStage>>({});

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
    <div className="flex gap-3 overflow-x-auto scroll-soft pb-2">
      {board.map((col) => {
        const total = col.leads.reduce(
          (sum, l) => sum + (l.estimatedTicket ?? 0),
          0
        );
        return (
          <section
            key={col.stage}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(col.stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === col.stage ? null : s))}
            onDrop={(e) => onDrop(e, col.stage)}
            className={`flex w-64 shrink-0 flex-col rounded-lg border transition-colors ${
              dragOver === col.stage
                ? 'border-[var(--crm-accent)] bg-[var(--crm-accent-soft)]'
                : 'border-transparent'
            }`}
          >
            {/* Cabeçalho: etiqueta do estado com a sua cor, contagem e o valor
                acumulado da coluna — saber quanto está parado em "Reunião" é
                metade da razão para olhar para um pipeline. */}
            <header className="flex items-center gap-2 px-1 py-2">
              <h2 className="text-[13px] font-semibold text-[var(--crm-gray12)]">
                <Tag tone={STAGE_TONE[col.stage]}>{col.label}</Tag>
              </h2>
              <span className="text-[12px] text-[var(--crm-gray9)] tabular-nums">
                {col.leads.length}
              </span>
              {total > 0 && (
                <span className="ml-auto text-[12px] text-[var(--crm-gray9)] tabular-nums">
                  {eurCompact(total)}
                </span>
              )}
            </header>

            <div className="flex min-h-16 flex-1 flex-col gap-1.5 px-1 pb-2">
              {col.leads.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--crm-gray5)] px-1 py-5 text-center text-[12px] text-[var(--crm-gray8)]">
                  {t('noLeads')}
                </p>
              ) : (
                col.leads.map((lead) => (
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
                    onClick={() => onOpen(lead.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(lead.id);
                      }
                    }}
                    className={`cursor-pointer rounded-md border border-[var(--crm-gray4)] bg-white p-2 transition-colors hover:border-[var(--crm-gray6)] focus-visible:border-[var(--crm-accent)] focus-visible:outline-none ${
                      dragging === lead.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={lead.fullName} />
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--crm-gray12)]">
                        {lead.fullName}
                      </p>
                      {lead.estimatedTicket != null && (
                        <span className="shrink-0 text-[12px] font-medium text-[var(--crm-gray11)] tabular-nums">
                          {eur(lead.estimatedTicket)}
                        </span>
                      )}
                    </div>

                    {(lead.agentName || lead.tags.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {lead.agentName && (
                          <Tag tone="blue" title={`${t('agent')}: ${lead.agentName}`}>
                            {lead.agentName}
                          </Tag>
                        )}
                        {lead.tags.map((tg) => (
                          <Tag key={tg}>{tg}</Tag>
                        ))}
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-[var(--crm-gray9)]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {lead.ownerName ? (
                          <>
                            <Avatar name={lead.ownerName} size={16} />
                            <span className="truncate">{lead.ownerName}</span>
                          </>
                        ) : (
                          <Empty />
                        )}
                      </span>
                      {lead.daysSinceContact > 0 && (
                        <span
                          className={`shrink-0 tabular-nums ${
                            lead.daysSinceContact >= 14
                              ? 'font-medium text-[#ce2c31]'
                              : ''
                          }`}
                        >
                          {t('days', {n: lead.daysSinceContact})}
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
  );
}
