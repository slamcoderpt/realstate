import {getTranslations} from 'next-intl/server';
import {listProjectSubscriptions} from '@/lib/subscriptions/service';
import {nextStates, type SubscriptionStatus} from '@/lib/subscriptions/states';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  advanceSubscriptionAction,
  cancelSubscriptionAdminAction,
  uploadContractAction
} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(v));

const NON_TERMINAL: SubscriptionStatus[] = ['interesse', 'contrato_assinado'];

/**
 * Painel de tabela da marca. O `<Table>` traz o seu próprio contentor com
 * `overflow-x-auto`; anula-se aqui (`[&>div]:overflow-visible`) para que quem
 * rola seja este invólucro — é ele que tem a barra fina de `.scroll-soft`.
 */
const TABLE_PANEL =
  'scroll-soft overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)] [&>div]:overflow-visible';
const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-5 py-4 align-middle text-ink-soft';

export default async function SubscricoesPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const ta = await getTranslations('SubscriptionAdmin');
  const tsub = await getTranslations('Subscription');
  const tp = await getTranslations('ProjectAdmin');
  const subs = await listProjectSubscriptions(id);

  const db = createAdminClient();
  const names = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(subs.map((s) => s.user_id))).map(async (userId) => {
      const {data: profile} = await db
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
      if (profile?.full_name) {
        names.set(userId, profile.full_name);
        return;
      }
      const {data} = await db.auth.admin.getUserById(userId);
      names.set(userId, data.user?.email ?? userId);
    })
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">
          {tp('title')}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {ta('title')}
        </h1>
      </header>

      {subs.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {ta('empty')}
        </p>
      ) : (
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{ta('investor')}</TableHead>
                <TableHead className={`${TH} text-right`}>
                  {ta('amount')}
                </TableHead>
                <TableHead className={TH}>{ta('status')}</TableHead>
                <TableHead className={TH}>{ta('contract')}</TableHead>
                <TableHead className={TH}>{ta('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((sub) => {
                const canManage = NON_TERMINAL.includes(sub.status);
                return (
                  <TableRow
                    key={sub.id}
                    className="border-border hover:bg-brand-50/60"
                  >
                    <TableCell className={`${TD} font-semibold text-ink`}>
                      {names.get(sub.user_id) ?? sub.user_id}
                    </TableCell>
                    <TableCell
                      className={`${TD} text-right font-semibold tabular-nums text-ink`}
                    >
                      {eur(sub.amount)}
                    </TableCell>
                    <TableCell className={TD}>
                      <Badge variant="secondary">
                        {tsub(`status_${sub.status}` as 'status_interesse')}
                      </Badge>
                    </TableCell>
                    <TableCell className={TD}>
                      {sub.contract_path ? (
                        <a
                          href={`/api/subscriptions/contract/${sub.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
                        >
                          {ta('contract')}
                        </a>
                      ) : (
                        <span className="text-sm text-ink-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className={TD}>
                      <div className="flex flex-wrap items-center gap-2">
                        {nextStates(sub.status).map((st) => (
                          <form
                            key={st}
                            action={advanceSubscriptionAction.bind(
                              null,
                              loc,
                              id,
                              sub.id,
                              st
                            )}
                            className="flex items-center gap-2"
                          >
                            {st === 'fundos_confirmados' && (
                              <Input
                                name="confirmed_ref"
                                placeholder={ta('confirmRef')}
                                className="h-9 w-48"
                              />
                            )}
                            <Button type="submit" size="sm">
                              {ta('advance', {
                                state: tsub(
                                  `status_${st}` as 'status_interesse'
                                )
                              })}
                            </Button>
                          </form>
                        ))}
                        {canManage && (
                          <form
                            action={uploadContractAction.bind(
                              null,
                              loc,
                              id,
                              sub.id
                            )}
                            className="flex items-center gap-2"
                          >
                            <Input
                              type="file"
                              name="contract"
                              accept="application/pdf"
                              className="h-9 w-56 py-0 text-xs"
                            />
                            <Button type="submit" size="sm" variant="outline">
                              {ta('uploadContract')}
                            </Button>
                          </form>
                        )}
                        {canManage && (
                          <form
                            action={cancelSubscriptionAdminAction.bind(
                              null,
                              loc,
                              id,
                              sub.id
                            )}
                          >
                            <Button
                              type="submit"
                              size="sm"
                              variant="destructive"
                            >
                              {ta('cancel')}
                            </Button>
                          </form>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
