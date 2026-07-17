import {useTranslations} from 'next-intl';

export default function HomePage() {
  const t = useTranslations('Home');
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
    </main>
  );
}
