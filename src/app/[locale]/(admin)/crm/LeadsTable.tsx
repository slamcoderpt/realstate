'use client';

import {useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {ArrowDownIcon, ArrowUpIcon} from 'lucide-react';
import {Avatar, Empty, Tag, STAGE_TONE, eur} from './ui';
import type {LeadCard} from './types';

/**
 * Vista de tabela do pipeline — a leitura que o kanban não dá.
 *
 * O kanban responde a "em que ponto está cada lead"; a tabela responde a
 * "mostra-me tudo o que tenho, ordenado". Com 50 leads o kanban obriga a
 * percorrer sete colunas para comparar dois valores; aqui é uma linha por lead
 * e uma coluna por atributo.
 *
 * Densidade: linhas de 32px e tipos de 12/13px (a medida do Twenty). A tabela
 * rola na horizontal em vez de espremer colunas — cortar um email a meio para
 * caber é pior do que deslocar.
 */

type SortKey = 'fullName' | 'estimatedTicket' | 'daysSinceContact';

const HEAD =
  'whitespace-nowrap px-3 py-0 text-left text-[12px] font-medium text-[var(--crm-gray9)]';
const CELL = 'whitespace-nowrap px-3 text-[13px] text-[var(--crm-gray11)]';

export function LeadsTable({
  leads,
  onOpen
}: {
  leads: LeadCard[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('Crm');
  // Sem ordenação escolhida, mantém-se a ordem do servidor (atividade mais
  // recente primeiro), que é a mais útil por omissão.
  const [sort, setSort] = useState<{key: SortKey; asc: boolean} | null>(null);

  const rows = useMemo(() => {
    if (!sort) return leads;
    const {key, asc} = sort;
    return [...leads].sort((a, b) => {
      let d: number;
      if (key === 'fullName') {
        d = a.fullName.localeCompare(b.fullName, 'pt');
      } else if (key === 'estimatedTicket') {
        // Sem ticket vai sempre para o fim, suba-se ou desça-se: "não sei" não
        // é um valor pequeno, e deixá-lo a boiar no topo escondia os grandes.
        const av = a.estimatedTicket;
        const bv = b.estimatedTicket;
        if (av == null && bv == null) d = 0;
        else if (av == null) return 1;
        else if (bv == null) return -1;
        else d = av - bv;
      } else {
        d = a.daysSinceContact - b.daysSinceContact;
      }
      return asc ? d : -d;
    });
  }, [leads, sort]);

  function toggle(key: SortKey) {
    setSort((s) => {
      if (s?.key !== key) return {key, asc: true};
      // 3.º clique volta à ordem natural — sem isto não havia como desfazer.
      return s.asc ? {key, asc: false} : null;
    });
  }

  function SortHead({
    keyName,
    label,
    align = 'left'
  }: {
    keyName: SortKey;
    label: string;
    align?: 'left' | 'right';
  }) {
    const active = sort?.key === keyName;
    const Icon = active && !sort.asc ? ArrowDownIcon : ArrowUpIcon;
    return (
      <th scope="col" className={`${HEAD} ${align === 'right' ? 'text-right' : ''}`}>
        <button
          type="button"
          onClick={() => toggle(keyName)}
          aria-label={t('sortBy', {field: label})}
          className={`-mx-1 inline-flex h-8 items-center gap-1 rounded px-1 transition-colors hover:bg-[var(--crm-gray4)] ${
            active ? 'text-[var(--crm-gray12)]' : ''
          } ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <Icon
            aria-hidden
            className={`size-3 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
          />
        </button>
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--crm-gray6)] bg-white px-4 py-12 text-center text-[13px] text-[var(--crm-gray9)]">
        {t('noLeadsFiltered')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto scroll-soft rounded-lg border border-[var(--crm-gray4)] bg-white">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--crm-gray4)]">
            <SortHead keyName="fullName" label={t('fullName')} />
            <th scope="col" className={HEAD}>
              {t('email')}
            </th>
            <th scope="col" className={HEAD}>
              {t('stage')}
            </th>
            <th scope="col" className={HEAD}>
              {t('source')}
            </th>
            <th scope="col" className={HEAD}>
              {t('agent')}
            </th>
            <SortHead
              keyName="estimatedTicket"
              label={t('estimatedTicketShort')}
              align="right"
            />
            <th scope="col" className={HEAD}>
              {t('ownerLabel')}
            </th>
            <th scope="col" className={HEAD}>
              {t('tags')}
            </th>
            <SortHead
              keyName="daysSinceContact"
              label={t('sinceContact')}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr
              key={l.id}
              onClick={() => onOpen(l.id)}
              className="crm-row h-8 cursor-pointer border-b border-[var(--crm-gray4)] last:border-b-0"
            >
              {/* O nome é o único elemento focável da linha: é o caminho de
                  teclado para abrir a lead. O clique na linha faz o mesmo, para
                  quem usa rato — a área toda é alvo. */}
              <td className={`${CELL} font-medium text-[var(--crm-gray12)]`}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(l.id);
                  }}
                  className="flex max-w-[16rem] items-center gap-2 text-left outline-none focus-visible:underline"
                >
                  <Avatar name={l.fullName} />
                  <span className="truncate">{l.fullName}</span>
                </button>
              </td>
              <td className={`${CELL} max-w-[15rem]`}>
                <span className="block truncate">{l.email}</span>
              </td>
              <td className={CELL}>
                <Tag tone={STAGE_TONE[l.stage]}>
                  {t(`stage_${l.stage}` as 'stage_novo')}
                </Tag>
              </td>
              <td className={CELL}>
                <Tag>{t(`source_${l.source}` as 'source_outro')}</Tag>
              </td>
              <td className={`${CELL} max-w-[12rem]`}>
                {l.agentName ? <Tag tone="blue">{l.agentName}</Tag> : <Empty />}
              </td>
              <td className={`${CELL} text-right tabular-nums`}>
                {l.estimatedTicket == null ? <Empty /> : eur(l.estimatedTicket)}
              </td>
              <td className={CELL}>
                {l.ownerName ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={l.ownerName} size={18} />
                    <span className="truncate">{l.ownerName}</span>
                  </span>
                ) : (
                  <Empty />
                )}
              </td>
              <td className={`${CELL} max-w-[14rem]`}>
                {l.tags.length === 0 ? (
                  <Empty />
                ) : (
                  <span className="flex gap-1">
                    {l.tags.map((tg) => (
                      <Tag key={tg}>{tg}</Tag>
                    ))}
                  </span>
                )}
              </td>
              {/* Dias sem contacto: passa a vermelho a partir de duas semanas,
                  que é quando um lead deixa de estar "a decorrer". */}
              <td className={`${CELL} text-right tabular-nums`}>
                <span
                  className={
                    l.daysSinceContact >= 14 ? 'font-medium text-[#ce2c31]' : ''
                  }
                >
                  {t('days', {n: l.daysSinceContact})}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
