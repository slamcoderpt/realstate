import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {BellIcon} from 'lucide-react';
import {getSession} from '@/lib/auth/staff';
import {listNotifications} from '@/lib/notifications/service';
import {NotificationItem} from '@/components/NotificationBell';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {markAllReadAction} from './actions';

// Notificações são pessoais e mudam a cada leitura: nunca servir HTML de build.
export const dynamic = 'force-dynamic';

export default async function NotificacoesPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const session = await getSession();
  // Sem sessão isto nem existe (o middleware já redireciona; este é o cinto).
  if (!session) notFound();

  const t = await getTranslations('Notifications');
  const items = await listNotifications(session.userId, 50);
  const hasUnread = items.some((n) => n.read_at === null);

  async function markAll() {
    'use server';
    await markAllReadAction();
    // O contador do sino vive no cabeçalho, que é do layout — sem revalidar o
    // layout a página ficava a zeros e o sino continuava a anunciar não-lidas.
    // O caminho tem de ser o PADRÃO da rota (`/[locale]`), não o URL `/pt`:
    // com o URL concreto o Next não encontra a entrada e a invalidação é um
    // no-op silencioso.
    revalidatePath('/[locale]', 'layout');
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        {hasUnread && (
          <form action={markAll}>
            <Button type="submit" variant="outline" size="sm">
              {t('markAllRead')}
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="py-10">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400"
            >
              <BellIcon className="size-6" />
            </span>
            <p className="max-w-sm text-sm text-ink-muted">{t('empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-3">
          <CardContent className="px-3">
            <ul className="space-y-1">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationItem notification={n} locale={locale} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
