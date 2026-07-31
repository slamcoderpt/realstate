'use client';

import {useEffect, useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {KanbanIcon, TableIcon} from 'lucide-react';
import type {Locale} from '@/lib/mail/templates';
import {CRM_SOURCES} from '@/lib/crm/constants';
import {TOOL} from './ui';
import {KanbanBoard} from './KanbanBoard';
import {LeadsTable} from './LeadsTable';
import {LeadDialog} from './LeadDialog';
import type {Column, LeadCard} from './types';

/**
 * O espaço de trabalho do pipeline: barra de ferramentas + a vista escolhida.
 *
 * Porquê aqui e não dentro de cada vista: os filtros e a lead aberta são os
 * mesmos independentemente de se estar a ver kanban ou tabela. Filtrar por
 * responsável, trocar para a tabela e ver o filtro desaparecer seria uma perda
 * de contexto sem explicação. Cada vista recebe leads JÁ filtrados e só se
 * preocupa em desenhá-los.
 */

const VIEW_KEY = 'crm:view';
type View = 'kanban' | 'table';

export function CrmWorkspace({
  locale,
  columns
}: {
  locale: Locale;
  columns: Column[];
}) {
  const t = useTranslations('Crm');

  // Arranca sempre no kanban para o HTML do servidor e o do cliente baterem
  // certo; a preferência guardada entra logo a seguir, já no browser.
  const [view, setView] = useState<View>('kanban');
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === 'table' || saved === 'kanban') setView(saved);
  }, []);
  function chooseView(next: View) {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }

  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [agent, setAgent] = useState('');
  const [tag, setTag] = useState('');
  const [openLead, setOpenLead] = useState<string | null>(null);

  const all = useMemo(() => columns.flatMap((c) => c.leads), [columns]);

  const owners = useMemo(
    () => [...new Set(all.map((l) => l.ownerName).filter(Boolean))].sort(),
    [all]
  );
  const agents = useMemo(
    () => [...new Set(all.map((l) => l.agentName).filter(Boolean))].sort(),
    [all]
  );
  const tags = useMemo(
    () => [...new Set(all.flatMap((l) => l.tags))].sort(),
    [all]
  );

  const keep = useMemo(() => {
    return (l: LeadCard) => {
      if (owner && l.ownerName !== owner) return false;
      if (source && l.source !== source) return false;
      if (agent && l.agentName !== agent) return false;
      if (tag && !l.tags.includes(tag)) return false;
      return true;
    };
  }, [owner, source, agent, tag]);

  const filteredColumns = useMemo(
    () => columns.map((c) => ({...c, leads: c.leads.filter(keep)})),
    [columns, keep]
  );
  const filteredLeads = useMemo(() => all.filter(keep), [all, keep]);

  const active = Boolean(owner || source || agent || tag);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Alternador de vista: dois botões num só grupo, com o ativo em branco
            sobre cinzento — o padrão de segmento do Twenty. */}
        <div className="flex items-center gap-0.5 rounded-md bg-[var(--crm-gray4)] p-0.5">
          <ViewButton
            active={view === 'kanban'}
            onClick={() => chooseView('kanban')}
            icon={<KanbanIcon aria-hidden className="size-3.5" />}
            label={t('viewKanban')}
          />
          <ViewButton
            active={view === 'table'}
            onClick={() => chooseView('table')}
            icon={<TableIcon aria-hidden className="size-3.5" />}
            label={t('viewTable')}
          />
        </div>

        <span className="mx-1 h-4 w-px bg-[var(--crm-gray5)]" aria-hidden />

        <select
          aria-label={t('filterByOwner')}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className={TOOL}
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
          className={TOOL}
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
            className={TOOL}
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
            className={TOOL}
          >
            <option value="">{t('filterAllTags')}</option>
            {tags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>
        )}
        {active && (
          <button
            type="button"
            onClick={() => {
              setOwner('');
              setSource('');
              setAgent('');
              setTag('');
            }}
            className="h-8 rounded px-2 text-[13px] font-medium text-[var(--crm-accent)] transition-colors hover:bg-[var(--crm-accent-soft)]"
          >
            {t('clearFilters')}
          </button>
        )}

        {/* Contagem à direita: com filtros ativos é a confirmação de que o
            filtro fez alguma coisa. */}
        <span className="ml-auto text-[12px] text-[var(--crm-gray9)] tabular-nums">
          {t('leadCount', {n: filteredLeads.length})}
        </span>
      </div>

      {view === 'kanban' ? (
        <KanbanBoard
          locale={locale}
          columns={filteredColumns}
          onOpen={setOpenLead}
        />
      ) : (
        <LeadsTable leads={filteredLeads} onOpen={setOpenLead} />
      )}

      {/* O detalhe abre por cima de qualquer uma das vistas. O que está por
          trás é atualizado pelo `revalidatePath` das próprias ações do modal. */}
      <LeadDialog
        locale={locale}
        leadId={openLead}
        onClose={() => setOpenLead(null)}
      />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-white text-[var(--crm-gray12)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
          : 'text-[var(--crm-gray11)] hover:text-[var(--crm-gray12)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
