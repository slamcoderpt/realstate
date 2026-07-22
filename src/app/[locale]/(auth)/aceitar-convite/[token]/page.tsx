import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {hashToken, isRedeemable} from '@/lib/invites/token';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {AcceptForm} from './AcceptForm';
import {Brand} from '@/components/Brand';

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
    <main className="flex min-h-screen flex-col md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="brand-canvas flex items-center px-6 py-6 md:items-start md:px-14 md:py-16">
        <Brand onDark className="relative" />
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 md:py-16">
        <Card className="w-full max-w-md py-8">
          <CardHeader className="gap-1.5 px-6 sm:px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-ink">
              {valid ? t('title') : t('invalidTitle')}
            </CardTitle>
            {valid && <p className="text-sm text-ink-muted">{t('subtitle')}</p>}
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            {valid ? (
              <AcceptForm
                token={token}
                locale={locale}
                fullName={invite.full_name}
                email={invite.email}
              />
            ) : (
              // Convite morto: o texto tem de ser o protagonista do cartão.
              <p className="text-sm text-ink-soft">{t('invalidBody')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
