'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {BellIcon, LoaderCircleIcon} from 'lucide-react';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  myNotificationsAction,
  markAllReadAction
} from '@/app/[locale]/notificacoes/actions';

/**
 * A linha vem do tipo de retorno da Server Action, e não de
 * `@/lib/notifications/service` — esse módulo é `server-only` e um import dele
 * (mesmo de tipo) num componente cliente é um pé posto na armadilha. Assim o
 * cliente só conhece o contrato da action.
 */
type Row = Awaited<ReturnType<typeof myNotificationsAction>>[number];
type NotificationType = Row['type'];

/**
 * Mapa explícito tipo → chave i18n. Deliberadamente não é `t(\`type_${n.type}\`)`:
 * a chave interpolada não satisfaz as chaves tipadas do next-intl e, sobretudo,
 * um tipo novo de notificação passaria a render vazio em silêncio. Aqui é erro
 * de compilação.
 */
const TITLE_KEY = {
  kyc_approved: 'type_kyc_approved',
  kyc_rejected: 'type_kyc_rejected',
  subscription_confirmed: 'type_subscription_confirmed',
  work_update: 'type_work_update',
  statement: 'type_statement'
} as const satisfies Record<NotificationType, string>;

function text(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

function formatWhen(iso: string, locale: string): string {
  // Fuso fixo: este componente é renderizado no servidor e re-hidratado no
  // browser. Sem `timeZone` as duas passagens divergiriam e o React acusaria
  // hydration mismatch em quem não estiver em Lisboa.
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon'
  }).format(new Date(iso));
}

/**
 * Uma notificação renderizada. Vive aqui (e não na página) para que o mapa de
 * cópia seja único entre o sino e `/notificacoes`.
 */
export function NotificationItem({
  notification,
  locale
}: {
  notification: Row;
  locale: string;
}) {
  const t = useTranslations('Notifications');
  const unread = notification.read_at === null;

  // Switch exaustivo: um tipo novo sem `case` deixa de devolver `string` e o
  // TypeScript reclama.
  function body(): string {
    const p = notification.payload;
    switch (notification.type) {
      case 'kyc_approved':
        return t('body_kyc_approved');
      case 'kyc_rejected':
        return t('body_kyc_rejected');
      case 'subscription_confirmed':
        return t('body_subscription_confirmed', {
          projectName: text(p.projectName)
        });
      case 'work_update':
        return t('body_work_update', {
          projectName: text(p.projectName),
          updateTitle: text(p.updateTitle)
        });
      case 'statement':
        return t('body_statement', {
          period: text(p.period),
          projectName: text(p.projectName)
        });
    }
  }

  const inner = (
    <div
      className={cn(
        'rounded-md border-l-2 px-3 py-2',
        unread
          ? 'border-l-neutral-900 bg-neutral-50'
          : 'border-l-transparent opacity-70'
      )}
    >
      <p className="text-sm font-medium text-neutral-900">
        {t(TITLE_KEY[notification.type])}
      </p>
      <p className="text-xs text-neutral-600">{body()}</p>
      <p className="mt-1 text-[11px] text-neutral-400">
        {formatWhen(notification.created_at, locale)}
      </p>
    </div>
  );

  if (!notification.href) return inner;
  return (
    <Link href={notification.href} className="block hover:bg-neutral-100">
      {inner}
    </Link>
  );
}

export function NotificationBell({
  locale,
  initialCount
}: {
  locale: string;
  initialCount: number;
}) {
  const t = useTranslations('Notifications');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  // `useState(initialCount)` só olha para o argumento na primeira render. Sem
  // isto, um novo valor vindo do servidor (ex.: marcar todas como lidas em
  // /notificacoes, que revalida o layout) era ignorado e o sino ficava a
  // anunciar não-lidas que já não existem. Padrão oficial de ajustar estado
  // quando uma prop muda — corre durante a render, sem efeito nem re-render extra.
  const [syncedCount, setSyncedCount] = useState(initialCount);
  if (initialCount !== syncedCount) {
    setSyncedCount(initialCount);
    setCount(initialCount);
  }

  async function load() {
    setLoading(true);
    try {
      setItems(await myNotificationsAction(10));
    } finally {
      setLoading(false);
    }
  }

  // Só se lê a lista ao abrir: o cabeçalho está em todas as páginas e não vale
  // um SELECT por navegação para um menu que ninguém abriu.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  async function onMarkAllRead() {
    setCount(await markAllReadAction());
    await load();
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('title')}
          className="relative gap-1.5"
        >
          <BellIcon aria-hidden="true" />
          {count > 0 && (
            <span className="text-xs text-neutral-600">
              {t('unreadCount', {n: count})}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {loading && items === null && (
            <div className="flex justify-center py-4">
              <LoaderCircleIcon
                className="size-4 animate-spin text-neutral-400"
                aria-hidden="true"
              />
            </div>
          )}
          {items !== null && items.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-neutral-500">
              {t('empty')}
            </p>
          )}
          {items?.map((n) => (
            <NotificationItem key={n.id} notification={n} locale={locale} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
          >
            {t('markAllRead')}
          </Button>
          <Link
            href="/notificacoes"
            className="px-2 text-xs text-neutral-600 underline-offset-4 hover:underline"
            onClick={() => setOpen(false)}
          >
            {t('viewAll')}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
