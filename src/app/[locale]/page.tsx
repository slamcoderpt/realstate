import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';

export default async function HomePage() {
  const t = await getTranslations('Home');
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-neutral-500">
        {t('signedInAs', {email: user?.email ?? ''})}
      </p>
    </main>
  );
}
