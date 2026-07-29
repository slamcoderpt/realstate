'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {SendIcon, Trash2Icon, UserCheckIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import type {LeadDetailView} from '@/lib/crm/detail-dto';
import type {CrmStage} from '@/lib/crm/service';
import type {Locale} from '@/lib/mail/templates';
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
 * trabalho à esquerda (registar atividade e histórico), ficha à direita. Os
 * painéis são caixas simples e não `Card`: dentro de uma janela já emoldurada,
 * cartões com sombra dentro de cartões só acrescentavam ruído.
 */

// Listas locais: o módulo do serviço é `server-only`.
const STAGES: CrmStage[] = [
  'novo',
  'contactado',
  'qualificado',
  'reuniao',
  'convite_enviado',
  'convertido',
  'perdido'
];
const SOURCES = ['referencia', 'evento', 'website', 'linkedin', 'outro'];
const PROFILES = ['retail', 'qualificado', 'institucional'];
const ACTIVITY_TYPES = ['nota', 'chamada', 'email', 'reuniao'];

const FIELD =
  'h-10 w-full rounded-xl border border-input bg-white px-3 text-sm text-ink outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const LABEL = 'text-xs font-semibold text-ink-muted';
const PANEL = 'rounded-xl border border-border bg-card p-4';
const SECTION_TITLE =
  'text-[0.6875rem] font-bold tracking-[0.1em] text-ink-muted uppercase';

type Busy = 'stage' | 'convert' | 'activity' | 'details' | 'delete' | null;

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

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
    <div className="space-y-5">
      {isPage && (
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {lead.full_name}
        </h1>
      )}

      {/* Barra de ações: o estado da lead e o passo seguinte, numa só linha. O
          estado grava ao mudar — o botão «Guardar» só para isto era ruído. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={LABEL}>{t('moveTo')}</span>
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
            className="h-9 rounded-lg border border-input bg-white px-2.5 text-sm font-semibold text-ink outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`stage_${s}` as 'stage_novo')}
              </option>
            ))}
          </select>
          {busy === 'stage' && <Spinner className="size-3.5 text-brand-500" />}
        </div>

        {/* Conversão: se já foi convertida mostra o estado; senão, o botão que
            cria o convite (reutiliza o mecanismo de convites existente). */}
        {lead.converted_user_id ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <UserCheckIcon aria-hidden className="size-4" />
            {t('convertedUser')}
          </span>
        ) : lead.converted_invite_id ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <SendIcon aria-hidden className="size-4" />
            {t('convertedInvite')}
          </span>
        ) : (
          <form
            action={() =>
              run('convert', () => convertLeadToInviteAction(locale, lead.id))
            }
          >
            <Button
              type="submit"
              size="sm"
              title={t('convertHint')}
              loading={busy === 'convert'}
              disabled={pending}
            >
              <SendIcon aria-hidden className="size-4" />
              {t('convert')}
            </Button>
          </form>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Trabalhar a lead: escrever e ver o que já se fez. */}
        <div className="space-y-4">
          <form
            action={(fd: FormData) =>
              run('activity', () => addActivityAction(locale, lead.id, fd))
            }
            className={`${PANEL} space-y-2.5`}
          >
            <textarea
              name="body"
              rows={2}
              placeholder={t('activityBody')}
              className={`${FIELD} h-auto py-2.5`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="type"
                aria-label={t('activityType')}
                defaultValue="nota"
                className={`${FIELD} h-9 w-36`}
              >
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {t(`type_${a}` as 'type_nota')}
                  </option>
                ))}
              </select>
              <Input
                name="due_at"
                type="date"
                aria-label={t('dueAt')}
                title={t('dueAt')}
                className="h-9 w-40 rounded-xl px-3 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                loading={busy === 'activity'}
                disabled={pending}
              >
                {t('addActivity')}
              </Button>
            </div>
          </form>

          <section className="space-y-2">
            <h2 className={SECTION_TITLE}>{t('timeline')}</h2>
            {activities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
                {t('noActivities')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {activities.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-border bg-card px-3.5 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-bold text-ink">
                        {t(`type_${a.type}` as 'type_nota')}
                      </span>
                      <span className="text-ink-muted tabular-nums">
                        {a.createdAtLabel}
                      </span>
                      {a.authorName && (
                        <span className="text-ink-muted">· {a.authorName}</span>
                      )}
                      {a.dueAtLabel && (
                        <span className="font-semibold text-brand-600">
                          · {t('dueAt')}: {a.dueAtLabel}
                        </span>
                      )}
                    </div>
                    {a.body && (
                      <p className="mt-1 whitespace-pre-line text-ink-soft">
                        {a.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Ficha da lead. */}
        <form
          action={(fd: FormData) =>
            run('details', () => updateLeadAction(locale, lead.id, fd))
          }
          className={`${PANEL} space-y-3 ${isPage ? 'lg:sticky lg:top-24' : ''}`}
        >
          <h2 className={SECTION_TITLE}>{t('details')}</h2>

          <div className="space-y-1">
            <label htmlFor="full_name" className={LABEL}>
              {t('fullName')}
            </label>
            <input
              id="full_name"
              name="full_name"
              defaultValue={lead.full_name}
              required
              className={FIELD}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="email" className={LABEL}>
              {t('email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={lead.email}
              required
              className={FIELD}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="phone" className={LABEL}>
                {t('phone')}
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={lead.phone}
                className={FIELD}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="source" className={LABEL}>
                {t('source')}
              </label>
              <select
                id="source"
                name="source"
                defaultValue={lead.source}
                className={FIELD}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`source_${s}` as 'source_outro')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="investor_profile" className={LABEL}>
                {t('investorProfile')}
              </label>
              <select
                id="investor_profile"
                name="investor_profile"
                defaultValue={lead.investor_profile ?? ''}
                className={FIELD}
              >
                <option value="">{t('noProfile')}</option>
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {t(`profile_${p}` as 'profile_retail')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="estimated_ticket" className={LABEL}>
                {t('estimatedTicket')}
              </label>
              <input
                id="estimated_ticket"
                name="estimated_ticket"
                type="number"
                min={0}
                step="1000"
                defaultValue={lead.estimated_ticket ?? ''}
                className={FIELD}
              />
            </div>
          </div>
          {lead.estimated_ticket != null && (
            <p className="-mt-1 text-xs text-ink-muted tabular-nums">
              {eur(lead.estimated_ticket)}
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor="tags" className={LABEL}>
              {t('tags')}
            </label>
            <input
              id="tags"
              name="tags"
              defaultValue={lead.tags.join(', ')}
              placeholder={t('tagsHint')}
              className={FIELD}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="notes" className={LABEL}>
              {t('notes')}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={lead.notes}
              className={`${FIELD} h-auto py-2.5`}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="w-full"
            loading={busy === 'details'}
            disabled={pending}
          >
            {t('save')}
          </Button>
        </form>
      </div>

      {/* Eliminar. Fora dos formulários acima (não se aninham) e no fim, atrás
          de uma confirmação — é a única ação daqui que não se desfaz. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {confirmDelete ? (
          <>
            <p className="mr-auto text-sm text-ink-soft">{t('deleteConfirm')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={busy === 'delete'}
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2Icon aria-hidden className="size-4" />
              {t('deleteLead')}
            </Button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-destructive disabled:opacity-50"
          >
            <Trash2Icon aria-hidden className="size-4" />
            {t('deleteLead')}
          </button>
        )}
      </div>
    </div>
  );
}
