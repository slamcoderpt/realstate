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
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'submitted' ? (
            <p className="text-sm text-neutral-600">{t('pending')}</p>
          ) : status === 'approved' ? (
            <p className="text-sm text-green-700">{t('approved')}</p>
          ) : (
            <>
              {status === 'rejected' && (
                <p className="mb-4 text-sm text-red-600">{t('rejectedRetry')}</p>
              )}
              <p className="mb-4 text-sm text-neutral-600">{t('intro')}</p>
              <KycForm locale={loc} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
