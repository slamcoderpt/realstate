/**
 * Vocabulário do CRM (estados, origens, perfis) — o único sítio onde estas
 * listas vivem.
 *
 * Está fora de `service.ts` de propósito: o serviço é `server-only` e os
 * componentes do kanban são de cliente, pelo que antes cada um repetia as
 * listas à mão e elas divergiam ao primeiro valor novo. Este módulo não importa
 * nada do servidor, por isso atravessa a fronteira sem problema.
 *
 * A ORDEM dos arrays é a ordem de apresentação. Os valores têm de coincidir com
 * os enums de `public.crm_*` na base de dados.
 */

export type CrmStage =
  | 'novo'
  | 'contactado'
  | 'qualificado'
  | 'reuniao'
  | 'convite_enviado'
  | 'convertido'
  | 'perdido';

// Ordem das colunas do kanban (a mesma da apresentação).
export const CRM_STAGES: CrmStage[] = [
  'novo',
  'contactado',
  'qualificado',
  'reuniao',
  'convite_enviado',
  'convertido',
  'perdido'
];

export type CrmSource =
  | 'referencia'
  | 'evento'
  | 'website'
  | 'linkedin'
  | 'programa_joao_goncalves'
  | 'outro';

export const CRM_SOURCES: CrmSource[] = [
  'referencia',
  'evento',
  'website',
  'linkedin',
  'programa_joao_goncalves',
  'outro'
];

export type CrmInvestorProfile = 'retail' | 'qualificado' | 'institucional';
export const CRM_PROFILES: CrmInvestorProfile[] = [
  'retail',
  'qualificado',
  'institucional'
];

export type CrmActivityType =
  | 'nota'
  | 'chamada'
  | 'email'
  | 'reuniao'
  | 'mudanca_estado';

/** Tipos que um humano pode registar à mão (`mudanca_estado` é automático). */
export const CRM_ACTIVITY_TYPES: Exclude<CrmActivityType, 'mudanca_estado'>[] = [
  'nota',
  'chamada',
  'email',
  'reuniao'
];
