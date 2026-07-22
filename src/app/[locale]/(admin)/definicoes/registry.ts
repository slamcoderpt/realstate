/**
 * Que controlo desenhar para cada definição.
 *
 * `platform_settings` é uma tabela genérica (`key`, `value jsonb`,
 * `description`) — o tipo não vive na base de dados, e não deve: o mesmo valor
 * é lido por código que já sabe o que espera. O que faltava era do lado da
 * INTERFACE, que obrigava um administrador a escrever JSON à mão para mudar
 * "8" para "10". Este registo é essa camada, e só existe aqui.
 *
 * REGRA: uma chave sem entrada aqui continua editável, em JSON cru (`json`).
 * Uma definição nova criada por migração nunca fica inacessível por alguém se
 * ter esquecido deste ficheiro — degrada para o comportamento antigo em vez de
 * desaparecer.
 */

export type SettingKind =
  | 'number'
  | 'numberOrNull'
  | 'boolean'
  | 'text'
  | 'stringList'
  | 'localizedText'
  | 'json';

export type SettingGroup =
  | 'subscription'
  | 'kyc'
  | 'invites'
  | 'works'
  | 'legal'
  | 'other';

export type SettingSpec = {
  kind: SettingKind;
  group: SettingGroup;
  /** Sufixo mostrado dentro do campo (chave de i18n em SettingsAdmin). */
  unit?: 'unit_percent' | 'unit_days' | 'unit_mb' | 'unit_eur';
  /** Passo do input numérico. Montantes em euros não se editam ao cêntimo. */
  step?: number;
  min?: number;
};

export const SETTINGS: Record<string, SettingSpec> = {
  min_subscription_amount: {
    kind: 'number',
    group: 'subscription',
    unit: 'unit_eur',
    step: 500,
    min: 0
  },
  // O jsonb `null` significa "sem limite" e é a razão de existir o RPC
  // set_platform_setting: o PostgREST não consegue escrevê-lo.
  max_investors_per_project: {
    kind: 'numberOrNull',
    group: 'subscription',
    step: 1,
    min: 1
  },
  show_subscription_progress: {kind: 'boolean', group: 'subscription'},

  kyc_consent_version: {kind: 'text', group: 'kyc'},
  kyc_max_file_mb: {kind: 'number', group: 'kyc', unit: 'unit_mb', step: 1, min: 1},
  kyc_allowed_mime: {kind: 'stringList', group: 'kyc'},

  invite_validity_days: {
    kind: 'number',
    group: 'invites',
    unit: 'unit_days',
    step: 1,
    min: 1
  },

  budget_deviation_alert_pct: {
    kind: 'number',
    group: 'works',
    unit: 'unit_percent',
    step: 1,
    min: 0
  },

  terms_version: {kind: 'text', group: 'legal'},
  risk_notice: {kind: 'localizedText', group: 'legal'}
};

export const GROUP_ORDER: SettingGroup[] = [
  'subscription',
  'kyc',
  'invites',
  'works',
  'legal',
  'other'
];

export const GROUP_LABEL = {
  subscription: 'group_subscription',
  kyc: 'group_kyc',
  invites: 'group_invites',
  works: 'group_works',
  legal: 'group_legal',
  other: 'group_other'
} as const satisfies Record<SettingGroup, string>;

export function specFor(key: string): SettingSpec {
  return SETTINGS[key] ?? {kind: 'json', group: 'other'};
}
