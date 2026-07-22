import type {Metadata} from 'next';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import AppShell from '@/components/AppShell';
import {NavProgress} from '@/components/NavProgress';
import '../globals.css';

export const metadata: Metadata = {
  title: 'TILWENI',
  robots: {index: false, follow: false}
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider>
          <NavProgress />
          <AppShell locale={locale}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
