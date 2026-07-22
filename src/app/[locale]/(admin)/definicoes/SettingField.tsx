'use client';

import {useActionState, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import type {SaveSettingState} from './actions';
import type {SettingSpec} from './registry';

const initial: SaveSettingState = {ok: false};

/**
 * Uma definição = um campo com o controlo do seu tipo.
 *
 * O que vai para o servidor continua a ser JSON no campo `value` — o contrato
 * da Server Action não muda. O que muda é quem o escreve: aqui é o componente,
 * a partir de um controlo adequado, em vez de o administrador ter de saber que
 * 8 vai sem aspas e "v1" vai com.
 *
 * O botão de guardar só aparece quando há alteração por gravar. Com dez
 * definições na página, dez botões permanentes eram ruído e escondiam qual
 * delas tinha mesmo mudado.
 */
export function SettingField({
  settingKey,
  description,
  value,
  spec,
  action
}: {
  settingKey: string;
  description: string;
  /** O valor tal como está na base, já serializado em JSON. */
  value: string;
  spec: SettingSpec;
  action: (
    prev: SaveSettingState,
    formData: FormData
  ) => Promise<SaveSettingState>;
}) {
  const t = useTranslations('SettingsAdmin');
  const [state, formAction, pending] = useActionState(action, initial);

  const [draft, setDraft] = useState<unknown>(() => safeParse(value));

  // `value` é a referência do que está gravado — a página remonta este campo
  // (ver a `key` em page.tsx) sempre que o servidor manda um valor diferente,
  // pelo que não há estado antigo a arrastar.
  const parsed = safeParse(value);
  const json = JSON.stringify(draft ?? null);
  const dirty = json !== value;

  const unit = spec.unit ? t(spec.unit) : null;

  return (
    <form
      action={formAction}
      className="grid gap-x-8 gap-y-3 px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{description}</p>
        {/* A chave técnica continua à vista, mas discreta: é o que se procura
            no código ou se cita num pedido de suporte, não o que se lê. */}
        <p className="mt-1 font-mono text-[11px] text-ink-muted">{settingKey}</p>
        {spec.kind === 'stringList' && (
          <p className="mt-2 text-xs text-ink-muted">{t('onePerLine')}</p>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <Control
          settingKey={settingKey}
          spec={spec}
          draft={draft}
          setDraft={setDraft}
          unit={unit}
          t={t}
        />

        {/* O valor viaja sempre como JSON — é o contrato da action. */}
        <input type="hidden" name="value" value={json} />

        <div className="flex min-h-8 flex-wrap items-center gap-3">
          {dirty && (
            <>
              <Button type="submit" size="sm" disabled={pending}>
                {t('save')}
              </Button>
              <button
                type="button"
                onClick={() => setDraft(parsed)}
                className="text-xs font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {t('discard')}
              </button>
            </>
          )}
          {state.error && (
            <span role="alert" className="text-xs font-semibold text-destructive">
              {t('invalidJson')}
            </span>
          )}
          {state.ok && !state.error && !dirty && (
            <span role="status" className="text-xs font-semibold text-emerald-600">
              {t('saved')}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * As chaves de mensagem são tipadas (augmentação `AppConfig` do next-intl): o
 * tradutor não aceita uma `string` qualquer. Herdar o tipo em vez de o alargar
 * é o que faz uma chave inexistente ser erro de compilação e não texto em
 * branco em produção.
 */
type T = ReturnType<typeof useTranslations<'SettingsAdmin'>>;

type ControlProps = {
  settingKey: string;
  spec: SettingSpec;
  draft: unknown;
  setDraft: (v: unknown) => void;
  unit: string | null;
  t: T;
};

function Control({settingKey, spec, draft, setDraft, unit, t}: ControlProps) {
  const label = `${settingKey} — ${t('value')}`;

  switch (spec.kind) {
    case 'boolean':
      return (
        <label className="inline-flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={draft === true}
            onChange={(e) => setDraft(e.target.checked)}
            aria-label={label}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-2">
            <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
          <span className="text-sm font-semibold text-ink-soft">
            {draft === true ? t('enabled') : t('disabled')}
          </span>
        </label>
      );

    case 'number':
      return (
        <NumberInput
          label={label}
          spec={spec}
          unit={unit}
          value={typeof draft === 'number' ? draft : null}
          onChange={setDraft}
        />
      );

    case 'numberOrNull':
      return (
        <NumberOrNull
          label={label}
          spec={spec}
          unit={unit}
          draft={draft}
          setDraft={setDraft}
          noLimitLabel={t('noLimit')}
        />
      );

    case 'text':
      return (
        <Input
          type="text"
          aria-label={label}
          value={typeof draft === 'string' ? draft : ''}
          onChange={(e) => setDraft(e.target.value)}
        />
      );

    case 'stringList': {
      const linhas = Array.isArray(draft) ? (draft as string[]) : [];
      return (
        <textarea
          aria-label={label}
          rows={Math.max(3, linhas.length)}
          spellCheck={false}
          value={linhas.join('\n')}
          onChange={(e) =>
            setDraft(
              e.target.value
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
            )
          }
          className={TEXTAREA}
        />
      );
    }

    case 'localizedText': {
      const obj = (draft && typeof draft === 'object' ? draft : {}) as Record<
        string,
        string
      >;
      return (
        <div className="space-y-3">
          {(['pt', 'en'] as const).map((lang) => (
            <div key={lang} className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase">
                {lang}
              </span>
              <textarea
                aria-label={`${settingKey} — ${lang}`}
                rows={4}
                value={obj[lang] ?? ''}
                onChange={(e) => setDraft({...obj, [lang]: e.target.value})}
                className={TEXTAREA}
              />
            </div>
          ))}
        </div>
      );
    }

    default:
      // Chave sem entrada no registo: continua editável em JSON cru, com o
      // rótulo a dizer que é isso mesmo. Melhor do que ficar inacessível.
      return (
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase">
            {t('advanced')}
          </span>
          <textarea
            aria-label={label}
            rows={3}
            spellCheck={false}
            value={JSON.stringify(draft ?? null)}
            onChange={(e) => {
              try {
                setDraft(JSON.parse(e.target.value));
              } catch {
                // Enquanto o JSON estiver a meio de ser escrito não se pode
                // fazer parse; guarda-se o texto cru e a action valida.
                setDraft(e.target.value);
              }
            }}
            className={cn(TEXTAREA, 'font-mono text-xs')}
          />
        </div>
      );
  }
}

/**
 * "Sem limite" (jsonb null) vs. um número.
 *
 * A checkbox tem estado PRÓPRIO em vez de ser derivada de `draft === null`.
 * Derivá-la punha o React a recalcular o `checked` como efeito de se escrever
 * NOUTRO campo, e a propriedade do DOM ficava dessincronizada do estado: o
 * campo mostrava 25, a checkbox aparecia marcada, e um clique deixava de
 * alterar o valor. Cada controlo passa a mandar em si próprio; o JSON é que é
 * derivado dos dois.
 */
function NumberOrNull({
  label,
  spec,
  unit,
  draft,
  setDraft,
  noLimitLabel
}: {
  label: string;
  spec: SettingSpec;
  unit: string | null;
  draft: unknown;
  setDraft: (v: unknown) => void;
  noLimitLabel: string;
}) {
  const [semLimite, setSemLimite] = useState(draft === null);
  // Guarda o número enquanto "sem limite" está marcado, para o repor ao
  // desmarcar em vez de o utilizador ter de o escrever outra vez.
  const [numero, setNumero] = useState(
    typeof draft === 'number' ? draft : (spec.min ?? 1)
  );

  return (
    <div className="space-y-2">
      <NumberInput
        label={label}
        spec={spec}
        unit={unit}
        value={semLimite ? null : numero}
        onChange={(v) => {
          setNumero(v);
          setDraft(v);
        }}
        disabled={semLimite}
      />
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={semLimite}
          onChange={(e) => {
            setSemLimite(e.target.checked);
            setDraft(e.target.checked ? null : numero);
          }}
          className="size-4 accent-brand-500"
        />
        {noLimitLabel}
      </label>
    </div>
  );
}

function NumberInput({
  label,
  spec,
  unit,
  value,
  onChange,
  disabled
}: {
  label: string;
  spec: SettingSpec;
  unit: string | null;
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={label}
        step={spec.step}
        min={spec.min}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(unit && 'pr-14', 'tabular-nums')}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-ink-muted">
          {unit}
        </span>
      )}
    </div>
  );
}

const TEXTAREA =
  'w-full min-w-0 rounded-xl border border-input bg-white px-3.5 py-2.5 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
