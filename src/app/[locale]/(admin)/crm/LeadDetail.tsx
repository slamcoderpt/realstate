'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {SendIcon, Trash2Icon, UserCheckIcon} from 'lucide-react';
import {Spinner} from '@/components/ui/spinner';
import type {LeadDetailView} from '@/lib/crm/detail-dto';
import {
  CRM_STAGES,
  CRM_SOURCES,
  CRM_PROFILES,
  CRM_ACTIVITY_TYPES,
  type CrmStage
} from '@/lib/crm/constants';
import type {Locale} from '@/lib/mail/templates';
import {
  Avatar,
  Row,
  Tag,
  STAGE_TONE,
  FIELD_BASE,
  INLINE,
  INLINE_AREA,
  PANEL,
  SECTION_TITLE,
  eur
} from './ui';
import {
  addActivityAction,
  convertLeadToInviteAction,
  deleteLeadAction,
  moveLeadStageAction,
  updateLeadAction
} from './actions';

/**
 * Detalhe de uma lead (histórico, registo de atividade, edição e conversão).
 *
 * Componente de cliente partilhado pelos dois sítios onde o detalhe aparece: o
 * modal do kanban e a página `/crm/[id]` (que continua a servir links diretos,
 * como os do painel de follow-ups). `onChanged` existe para o modal recarregar
 * os dados depois de cada ação — na página basta o `revalidatePath` das ações.
 *
 * Layout: uma barra de ações no topo (estado + conversão) e duas colunas —
 * trabalho à esquerda (registar atividade e histórico), ficha à direita.
 */

const BTN_PRIMARY =
  'inline-flex h-8 items-center gap-1.5 rounded bg-[var(--crm-accent)] px-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0b64b0] disabled:opacity-50';
const BTN_NEUTRAL =
  'inline-flex h-8 items-center gap-1.5 rounded border border-[var(--crm-gray6)] bg-white px-2.5 text-[13px] font-medium text-[var(--crm-gray11)] transition-colors hover:bg-[var(--crm-gray4)] hover:text-[var(--crm-gray12)] disabled:opacity-50';

type Busy = 'stage' | 'convert' | 'activity' | 'details' | 'delete' | null;

export function LeadDetail({
  locale,
  view,
  variant = 'page',
  onChanged,
  onDeleted
}: {
  locale: Locale;
  view: LeadDetailView;
  /** No modal o nome já está no título do diálogo e não há coluna fixa. */
  variant?: 'page' | 'dialog';
  onChanged?: () => void;
  /** O que fazer depois de eliminar. Por omissão, volta ao pipeline. */
  onDeleted?: () => void;
}) {
  const t = useTranslations('Crm');
  const router = useRouter();
  // Qual das ações está a decorrer (para o indicador ficar no sítio certo).
  const [busy, setBusy] = useState<Busy>(null);
  // Eliminar pede confirmação: o botão dá lugar à pergunta, ali mesmo. Um
  // diálogo dentro do diálogo do detalhe seria pior de usar do que isto.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = busy !== null;
  const {lead, activities} = view;
  const isPage = variant === 'page';

  // Todas as ações passam por aqui: marcam o detalhe como ocupado e avisam quem
  // nos usa para recarregar. Devolver a promessa ao `action` do formulário é o
  // que faz o React só limpar os campos DEPOIS de a ação terminar.
  async function run(kind: Busy, fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  // Eliminar não passa pelo `run`: depois de apagar não há detalhe para
  // recarregar — fecha-se o modal ou volta-se ao pipeline.
  async function onDelete() {
    setBusy('delete');
    try {
      await deleteLeadAction(locale, lead.id);
      if (onDeleted) onDeleted();
      else router.push('/crm');
    } catch {
      // Falhou: devolve o controlo com a confirmação ainda aberta.
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {isPage && (
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-[var(--crm-gray12)]">
          <Avatar name={lead.full_name} size={24} />
          {lead.full_name}
        </h1>
      )}

      {/* Barra de ações: o estado da lead e o passo seguinte, numa só linha. O
          estado grava ao mudar — o botão «Guardar» só para isto era ruído. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--crm-gray4)] pb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-[var(--crm-gray9)]">
            {t('moveTo')}
          </span>
          <select
            name="stage"
            aria-label={t('moveTo')}
            value={lead.stage}
            disabled={pending}
            onChange={(e) =>
              run('stage', () =>
                moveLeadStageAction(locale, lead.id, e.target.value as CrmStage)
              )
            }
            className="h-7 rounded border border-transparent bg-transparent px-1.5 text-[13px] font-medium text-[var(--crm-gray12)] outline-none transition-colors hover:bg-[var(--crm-gray3)] focus:border-[var(--crm-gray6)] focus:bg-white disabled:opacity-60"
          >
            {CRM_STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`stage_${s}` as 'stage_novo')}
              </option>
            ))}
          </select>
          {busy === 'stage' && (
            <Spinner className="size-3.5 text-[var(--crm-gray9)]" />
          )}
        </div>

        {/* Conversão: se já foi convertida mostra o estado; senão, o botão que
            cria o convite (reutiliza o mecanismo de convites existente). */}
        {lead.converted_user_id ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#218358]">
            <UserCheckIcon aria-hidden className="size-4" />
            {t('convertedUser')}
          </span>
        ) : lead.converted_invite_id ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#ab6400]">
            <SendIcon aria-hidden className="size-4" />
            {t('convertedInvite')}
          </span>
        ) : (
          <form
            action={() =>
              run('convert', () => convertLeadToInviteAction(locale, lead.id))
            }
          >
            <button
              type="submit"
              title={t('convertHint')}
              disabled={pending}
              className={BTN_PRIMARY}
            >
              {busy === 'convert' ? (
                <Spinner className="size-3.5 text-white" />
              ) : (
                <SendIcon aria-hidden className="size-3.5" />
              )}
              {t('convert')}
            </button>
          </form>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        {/* Trabalhar a lead: escrever e ver o que já se fez. */}
        <div className="space-y-3">
          <form
            action={(fd: FormData) =>
              run('activity', () => addActivityAction(locale, lead.id, fd))
            }
            className={`${PANEL} space-y-2 p-2.5`}
          >
            <textarea
              name="body"
              rows={2}
              placeholder={t('activityBody')}
              className={INLINE_AREA}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="type"
                aria-label={t('activityType')}
                defaultValue="nota"
                className={`${FIELD_BASE} w-32`}
              >
                {CRM_ACTIVITY_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {t(`type_${a}` as 'type_nota')}
                  </option>
                ))}
              </select>
              <input
                name="due_at"
                type="date"
                aria-label={t('dueAt')}
                title={t('dueAt')}
                className={`${FIELD_BASE} w-36`}
              />
              <button
                type="submit"
                disabled={pending}
                className={`${BTN_NEUTRAL} ml-auto`}
              >
                {busy === 'activity' && (
                  <Spinner className="size-3.5 text-[var(--crm-gray9)]" />
                )}
                {t('addActivity')}
              </button>
            </div>
          </form>

          <section className="space-y-1.5">
            <h2 className={SECTION_TITLE}>{t('timeline')}</h2>
            {activities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--crm-gray6)] px-4 py-8 text-center text-[13px] text-[var(--crm-gray9)]">
                {t('noActivities')}
              </p>
            ) : (
              <ul className="space-y-1">
                {activities.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-[var(--crm-gray4)] bg-white px-2.5 py-2 text-[13px]"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                      <Tag>{t(`type_${a.type}` as 'type_nota')}</Tag>
                      <span className="text-[var(--crm-gray9)] tabular-nums">
                        {a.createdAtLabel}
                      </span>
                      {a.authorName && (
                        <span className="text-[var(--crm-gray9)]">
                          · {a.authorName}
                        </span>
                      )}
                      {a.dueAtLabel && (
                        <Tag tone="amber">
                          {t('dueAt')}: {a.dueAtLabel}
                        </Tag>
                      )}
                    </div>
                    {a.body && (
                      <p className="mt-1 whitespace-pre-line text-[var(--crm-gray11)]">
                        {a.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Ficha da lead. Campos em linha (ver `Row`/`INLINE` em ui.tsx): o
            valor lê-se como texto e só ganha caixa quando se lhe toca. */}
        <form
          action={(fd: FormData) =>
            run('details', () => updateLeadAction(locale, lead.id, fd))
          }
          className={`${PANEL} p-3 ${isPage ? 'lg:sticky lg:top-24' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className={SECTION_TITLE}>{t('details')}</h2>
            <Tag tone={STAGE_TONE[lead.stage]}>
              {t(`stage_${lead.stage}` as 'stage_novo')}
            </Tag>
          </div>

          <div className="space-y-0.5">
            <Row htmlFor="full_name" label={t('fullName')}>
              <input
                id="full_name"
                name="full_name"
                defaultValue={lead.full_name}
                required
                className={`${INLINE} font-medium`}
              />
            </Row>
            <Row htmlFor="email" label={t('email')}>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={lead.email}
                required
                className={INLINE}
              />
            </Row>
            <Row htmlFor="phone" label={t('phone')}>
              <input
                id="phone"
                name="phone"
                defaultValue={lead.phone}
                placeholder="—"
                className={INLINE}
              />
            </Row>
            <Row htmlFor="source" label={t('source')}>
              <select
                id="source"
                name="source"
                defaultValue={lead.source}
                className={INLINE}
              >
                {CRM_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`source_${s}` as 'source_outro')}
                  </option>
                ))}
              </select>
            </Row>
            {/* Quem trouxe o investidor — à parte da origem, porque é isto que
                responde a «a quem se paga comissão». */}
            <Row htmlFor="agent_name" label={t('agentShort')}>
              <input
                id="agent_name"
                name="agent_name"
                defaultValue={lead.agent_name}
                placeholder="—"
                className={INLINE}
              />
            </Row>
            <Row htmlFor="investor_profile" label={t('investorProfile')}>
              <select
                id="investor_profile"
                name="investor_profile"
                defaultValue={lead.investor_profile ?? ''}
                className={INLINE}
              >
                <option value="">{t('noProfile')}</option>
                {CRM_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {t(`profile_${p}` as 'profile_retail')}
                  </option>
                ))}
              </select>
            </Row>
            {/* O valor formatado vive no rótulo da linha seguinte, não numa
                linha à parte: repetir «250 000 €» por baixo do campo era ruído,
                mas sem ele não se lê um número de seis dígitos de relance. */}
            <Row htmlFor="estimated_ticket" label={t('estimatedTicket')}>
              <div className="flex items-center gap-2">
                <input
                  id="estimated_ticket"
                  name="estimated_ticket"
                  type="number"
                  min={0}
                  step="1000"
                  defaultValue={lead.estimated_ticket ?? ''}
                  placeholder="—"
                  className={`${INLINE} tabular-nums`}
                />
                {lead.estimated_ticket != null && (
                  <span className="shrink-0 text-[12px] text-[var(--crm-gray9)] tabular-nums">
                    {eur(lead.estimated_ticket)}
                  </span>
                )}
              </div>
            </Row>
            <Row htmlFor="tags" label={t('tags')}>
              <input
                id="tags"
                name="tags"
                defaultValue={lead.tags.join(', ')}
                placeholder={t('tagsHint')}
                className={INLINE}
              />
            </Row>
          </div>

          <div className="mt-2 border-t border-[var(--crm-gray4)] pt-2">
            <label htmlFor="notes" className="text-[12px] text-[var(--crm-gray9)]">
              {t('notes')}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={lead.notes}
              placeholder="—"
              className={`${INLINE_AREA} mt-0.5`}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className={`${BTN_NEUTRAL} mt-2 w-full justify-center`}
          >
            {busy === 'details' && (
              <Spinner className="size-3.5 text-[var(--crm-gray9)]" />
            )}
            {t('save')}
          </button>
        </form>
      </div>

      {/* Eliminar. Fora dos formulários acima (não se aninham) e no fim, atrás
          de uma confirmação — é a única ação daqui que não se desfaz. */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--crm-gray4)] pt-3">
        {confirmDelete ? (
          <>
            <p className="mr-auto text-[13px] text-[var(--crm-gray11)]">
              {t('deleteConfirm')}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
              className={BTN_NEUTRAL}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[#ce2c31] px-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#b3272b] disabled:opacity-50"
            >
              {busy === 'delete' ? (
                <Spinner className="size-3.5 text-white" />
              ) : (
                <Trash2Icon aria-hidden className="size-3.5" />
              )}
              {t('deleteLead')}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--crm-gray9)] transition-colors hover:text-[#ce2c31] disabled:opacity-50"
          >
            <Trash2Icon aria-hidden className="size-3.5" />
            {t('deleteLead')}
          </button>
        )}
      </div>
    </div>
  );
}
