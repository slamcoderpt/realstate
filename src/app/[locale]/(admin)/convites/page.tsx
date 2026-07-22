import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  createInviteAction,
  revokeInviteAction,
  resendInviteAction
} from './actions';

// Dados sensíveis + guard por sessão: render dinâmico a cada pedido.
export const dynamic = 'force-dynamic';

type InviteRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
};

const STATUS_VARIANT: Record<
  InviteRow['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'default',
  accepted: 'secondary',
  expired: 'outline',
  revoked: 'destructive'
};

/**
 * Painel de tabela da marca. O `<Table>` traz o seu próprio contentor com
 * `overflow-x-auto`; anula-se aqui (`[&>div]:overflow-visible`) para que quem
 * rola seja este invólucro — é ele que tem a barra fina de `.scroll-soft`.
 */
const TABLE_PANEL =
  'scroll-soft overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)] [&>div]:overflow-visible';
const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-5 py-4 text-ink-soft';

export default async function ConvitesPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const t = await getTranslations('Convites');
  const admin = createAdminClient();
  const {data} = await admin
    .from('invites')
    .select('id, full_name, email, role, status, expires_at, created_at')
    .order('created_at', {ascending: false});
  const invites = (data ?? []) as InviteRow[];

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-PT', {
      dateStyle: 'medium'
    }).format(new Date(iso));

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">{t('subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
            {t('newInvite')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createInviteAction} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="flex-1 space-y-2" style={{minWidth: 180}}>
              <Label htmlFor="fullName" className="font-semibold text-ink">
                {t('fullName')}
              </Label>
              <Input id="fullName" name="fullName" required />
            </div>
            <div className="flex-1 space-y-2" style={{minWidth: 220}}>
              <Label htmlFor="email" className="font-semibold text-ink">
                {t('email')}
              </Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit">{t('send')}</Button>
          </form>
        </CardContent>
      </Card>

      <div className={TABLE_PANEL}>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              <TableHead className={TH}>{t('fullName')}</TableHead>
              <TableHead className={TH}>{t('email')}</TableHead>
              <TableHead className={TH}>{t('status')}</TableHead>
              <TableHead className={TH}>{t('expiresAt')}</TableHead>
              <TableHead className={`${TH} text-right`}>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="px-5 py-14 text-center text-sm text-ink-muted"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {invites.map((invite) => (
              <TableRow key={invite.id} className="border-border hover:bg-brand-50/60">
                <TableCell className={`${TD} font-semibold text-ink`}>
                  {invite.full_name}
                </TableCell>
                <TableCell className={TD}>{invite.email}</TableCell>
                <TableCell className={TD}>
                  <Badge variant={STATUS_VARIANT[invite.status]}>
                    {t(`statusLabel.${invite.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className={`${TD} tabular-nums`}>
                  {fmtDate(invite.expires_at)}
                </TableCell>
                <TableCell className={`${TD} text-right`}>
                  {invite.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <form action={resendInviteAction}>
                        <input type="hidden" name="id" value={invite.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button type="submit" variant="outline" size="sm">
                          {t('resend')}
                        </Button>
                      </form>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="id" value={invite.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button type="submit" variant="destructive" size="sm">
                          {t('revoke')}
                        </Button>
                      </form>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
