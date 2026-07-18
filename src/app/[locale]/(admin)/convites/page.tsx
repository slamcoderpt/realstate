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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('newInvite')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createInviteAction} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="flex-1 space-y-2" style={{minWidth: 180}}>
              <Label htmlFor="fullName">{t('fullName')}</Label>
              <Input id="fullName" name="fullName" required />
            </div>
            <div className="flex-1 space-y-2" style={{minWidth: 220}}>
              <Label htmlFor="email">{t('email')}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit">{t('send')}</Button>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('fullName')}</TableHead>
            <TableHead>{t('email')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('expiresAt')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-neutral-500">
                {t('empty')}
              </TableCell>
            </TableRow>
          )}
          {invites.map((invite) => (
            <TableRow key={invite.id}>
              <TableCell className="font-medium">{invite.full_name}</TableCell>
              <TableCell>{invite.email}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[invite.status]}>
                  {t(`statusLabel.${invite.status}`)}
                </Badge>
              </TableCell>
              <TableCell>{fmtDate(invite.expires_at)}</TableCell>
              <TableCell className="text-right">
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
    </main>
  );
}
