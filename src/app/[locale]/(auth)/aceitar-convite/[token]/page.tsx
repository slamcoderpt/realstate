import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {hashToken, isRedeemable} from '@/lib/invites/token';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {AcceptForm} from './AcceptForm';

// O token vem no URL e valida-se a cada pedido; nunca prerender estático.
export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({
  params
}: {
  params: Promise<{locale: string; token: string}>;
}) {
  const {locale, token} = await params;
  const t = await getTranslations('Aceitar');

  const admin = createAdminClient();
  const {data: invite} = await admin
    .from('invites')
    .select('full_name, email, status, expires_at')
    .eq('token_hash', hashToken(token))
    .single();

  const valid =
    invite &&
    isRedeemable({status: invite.status, expires_at: invite.expires_at});

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl tracking-tight">
            {valid ? t('title') : t('invalidTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {valid ? (
            <>
              <p className="mb-4 text-sm text-neutral-500">{t('subtitle')}</p>
              <AcceptForm
                token={token}
                locale={locale}
                fullName={invite.full_name}
                email={invite.email}
              />
            </>
          ) : (
            <p className="text-sm text-neutral-600">{t('invalidBody')}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
