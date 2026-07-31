import type {CrmStage} from '@/lib/crm/constants';

/**
 * A lead como as vistas (kanban e tabela) precisam dela: já resolvida (nome do
 * responsável em vez de id) e já derivada (dias sem contacto). Montada no
 * servidor, em `page.tsx` — as vistas são só apresentação.
 */
export type LeadCard = {
  id: string;
  fullName: string;
  email: string;
  stage: CrmStage;
  estimatedTicket: number | null;
  ownerName: string;
  source: string;
  /** Agente/intermediário que trouxe o lead ('' = veio direto). */
  agentName: string;
  tags: string[];
  daysSinceContact: number;
};

export type Column = {stage: CrmStage; label: string; leads: LeadCard[]};
