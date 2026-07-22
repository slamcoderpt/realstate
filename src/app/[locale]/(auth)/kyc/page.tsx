import {getTranslations, setRequestLocale} from 'next-intl/server';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {redirect} from '@/i18n/navigation';
import {KycForm} from './KycForm';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';
import {Brand} from '@/components/Brand';

export const dynamic = 'force-dynamic';

export default async function KycPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);
  const t = await getTranslations('Kyc');

  const session = await getSession();
  if (!session) {
    redirect({href: '/login', locale: locale === 'en' ? 'en' : 'pt'});
  }

  const db = createAdminClient();
  const {data: profile} = await db
    .from('profiles')
    .select('kyc_status')
    .eq('id', session!.userId)
    .single();
  const status = profile?.kyc_status ?? 'pending';

  return (
    <main className="brand-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
      {/* `relative` põe o conteúdo acima dos ::before/::after decorativos da
          tela de marca — sem isso, as formas pintam por cima do cartão. */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <Brand onDark />
        <Card className="w-full max-w-md py-8">
          <CardHeader className="px-6 sm:px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-ink">
              {t('title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            {status === 'submitted' ? (
              <p className="rounded-xl bg-secondary px-3.5 py-3 text-sm text-ink-soft">
                {t('pending')}
              </p>
            ) : status === 'approved' ? (
              <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-700">
                {t('approved')}
              </p>
            ) : (
              <div className="space-y-5">
                {status === 'rejected' && (
                  <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                    {t('rejectedRetry')}
                  </p>
                )}
                <p className="text-sm text-ink-soft">{t('intro')}</p>
                <KycForm locale={loc} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
