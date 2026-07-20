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

export default async function SubscricoesPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const ta = await getTranslations('SubscriptionAdmin');
  const tsub = await getTranslations('Subscription');
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
      <h1 className="text-2xl font-semibold tracking-tight">{ta('title')}</h1>

      {subs.length === 0 ? (
        <p className="text-sm text-neutral-500">{ta('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ta('investor')}</TableHead>
              <TableHead className="text-right">{ta('amount')}</TableHead>
              <TableHead>{ta('status')}</TableHead>
              <TableHead>{ta('contract')}</TableHead>
              <TableHead>{ta('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((sub) => {
              const canManage = NON_TERMINAL.includes(sub.status);
              return (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium">
                    {names.get(sub.user_id) ?? sub.user_id}
                  </TableCell>
                  <TableCell className="text-right">{eur(sub.amount)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {tsub(`status_${sub.status}` as 'status_interesse')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sub.contract_path ? (
                      <a
                        href={`/api/subscriptions/contract/${sub.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-700 underline"
                      >
                        {ta('contract')}
                      </a>
                    ) : (
                      <span className="text-sm text-neutral-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-end gap-2">
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
                          className="flex items-end gap-2"
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
                          className="flex items-end gap-2"
                        >
                          <input
                            type="file"
                            name="contract"
                            accept="application/pdf"
                            className="text-sm"
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
                          <Button type="submit" size="sm" variant="destructive">
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
      )}
    </main>
  );
}
