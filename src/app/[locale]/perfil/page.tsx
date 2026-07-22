import {getTranslations, setRequestLocale} from 'next-intl/server';
import {ShieldCheckIcon} from 'lucide-react';
import {Link, redirect} from '@/i18n/navigation';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {MIN_PASSWORD_LENGTH} from '@/lib/invites/accept';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {DetailsForm} from './DetailsForm';
import {PasswordForm} from './PasswordForm';
import type {Locale} from '@/lib/mail/templates';

// Dados da própria conta, sempre frescos: nada aqui pode vir de HTML de build.
export const dynamic = 'force-dynamic';

/**
 * Perfil do utilizador autenticado.
 *
 * Vive no topo e NÃO dentro de `(admin)`: toda a gente tem perfil — investidor,
 * gestor, admin e auditor — e o layout `(admin)` barra quem não é staff.
 *
 * O que é editável aqui é deliberadamente pouco:
 * - **KYC é leitura.** Quem decide o estado é o staff no back-office; deixar o
 *   próprio mexer-lhe anulava o controlo.
 * - **MFA é opcional e opt-in aqui.** Quem não a tem vê um botão para a ativar
 *   (leva ao enrolamento em /mfa); quem já a tem vê a afirmação de que está
 *   ativa. Não há botão para DESATIVAR de propósito: seria exatamente o que
 *   faltava a quem apanhasse uma sessão aberta para lhe arrancar o 2º fator.
 */
const SECTION_LABEL =
  'text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';

function ReadOnlyField({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="space-y-1.5">
      <p className={SECTION_LABEL}>{label}</p>
      <div className="text-sm font-semibold break-words text-ink">{children}</div>
    </div>
  );
}

export default async function PerfilPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);

  const session = await getSession();
  if (!session) {
    redirect({href: '/login', locale: loc});
  }

  const t = await getTranslations('Profile');
  const tRoles = await getTranslations('UsersAdmin');

  // Leitura com service role, como o resto da app: o `authenticated` só tem
  // SELECT sobre o próprio perfil, mas a página já corre no servidor e este é
  // o caminho que os outros ecrãs usam.
  const db = createAdminClient();
  const {data: profile} = await db
    .from('profiles')
    .select('full_name, role, kyc_status, preferred_locale')
    .eq('id', session!.userId)
    .single();

  const role = (profile?.role ?? session!.role) as string;
  const kycStatus = (profile?.kyc_status ?? 'pending') as string;
  const preferredLocale = profile?.preferred_locale === 'en' ? 'en' : 'pt';

  // Os rótulos de papel são os mesmos do back-office e do cabeçalho — a mesma
  // palavra para a mesma coisa em toda a aplicação (ver AppShell).
  const ROLE_LABEL: Record<string, string> = {
    investor: tRoles('role_investor'),
    project_manager: tRoles('role_project_manager'),
    admin: tRoles('role_admin'),
    auditor: tRoles('role_auditor')
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight text-ink">
            {t('account')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <ReadOnlyField label={t('email')}>{session!.email}</ReadOnlyField>
            <ReadOnlyField label={t('role')}>
              {ROLE_LABEL[role] ?? role}
            </ReadOnlyField>
            <ReadOnlyField label={t('kycStatus')}>
              <Badge variant="secondary">
                {t(`kyc_${kycStatus}` as 'kyc_pending')}
              </Badge>
            </ReadOnlyField>
          </div>

          {session!.hasMfa ? (
            <p className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-ink-soft">
              <ShieldCheckIcon
                className="size-4 shrink-0 text-brand-500"
                aria-hidden
              />
              {t('mfaOn')}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-4 py-3">
              <p className="flex items-center gap-2.5 text-sm text-ink-soft">
                <ShieldCheckIcon
                  className="size-4 shrink-0 text-ink-muted"
                  aria-hidden
                />
                {t('mfaOff')}
              </p>
              <Button asChild size="sm">
                <Link href="/mfa">{t('mfaEnable')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight text-ink">
            {t('details')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DetailsForm
            fullName={profile?.full_name ?? ''}
            preferredLocale={preferredLocale}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight text-ink">
            {t('security')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
        </CardContent>
      </Card>
    </main>
  );
}
