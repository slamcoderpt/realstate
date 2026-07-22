import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Brand} from '@/components/Brand';
import {NewPasswordForm} from './NewPasswordForm';

// O token vem na query string e é validado a cada submit; nunca prerender.
export const dynamic = 'force-dynamic';

export default async function NovaPalavraPassePage({
  searchParams
}: {
  searchParams: Promise<{token?: string | string[]}>;
}) {
  const {token} = await searchParams;
  // A validade do token NÃO é verificada aqui de propósito: fazê-lo obrigaria a
  // ler a tabela ao carregar a página, transformando cada visita ao link num
  // oráculo de "este token existe". A validação vive no submit, e falha sempre
  // com a mesma mensagem.
  const value = Array.isArray(token) ? token[0] : token;
  const t = await getTranslations('NewPassword');

  return (
    // Mesma casca das restantes páginas de entrada (login, aceitar convite).
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
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            {value ? (
              <NewPasswordForm token={value} />
            ) : (
              // Link sem token: não há formulário nenhum a mostrar. Devolve-se
              // ao login, de onde se pede um link novo (Nav.forgotPassword).
              <div className="space-y-5">
                <p className="text-sm text-ink-soft">{t('invalidLink')}</p>
                <Link
                  href="/login"
                  className="block text-center text-sm font-medium text-brand-500 hover:underline"
                >
                  {t('goToLogin')}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
