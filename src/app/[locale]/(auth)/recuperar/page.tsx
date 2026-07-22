import {getTranslations} from 'next-intl/server';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Brand} from '@/components/Brand';
import {ResetForm} from './ResetForm';

export default async function RecuperarPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const t = await getTranslations('ResetPassword');

  return (
    // Mesma casca das restantes páginas de entrada (login, aceitar convite):
    // tela de marca a toda a altura, marca por cima de um cartão centrado.
    <main className="brand-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
      {/* `relative` põe o conteúdo acima dos ::before/::after decorativos da
          tela de marca — sem isso, as formas pintam por cima do cartão. */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <Brand onDark />
        <Card className="w-full max-w-md py-8">
          <CardHeader className="gap-1.5 px-6 sm:px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-ink">
              {t('title')}
            </CardTitle>
            <p className="text-sm text-ink-muted">{t('intro')}</p>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            <ResetForm locale={locale} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
