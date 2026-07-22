import {getTranslations} from 'next-intl/server';
import {Link, redirect} from '@/i18n/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';
import {countUnread} from '@/lib/notifications/service';
import {createClient} from '@/lib/supabase/server';
import {NotificationBell} from '@/components/NotificationBell';
import {Button} from '@/components/ui/button';

/**
 * Casca da aplicação: cabeçalho + navegação por papel + sino de notificações.
 *
 * A navegação por papel é usabilidade, NÃO uma fronteira de segurança: cada
 * destino tem o seu próprio guard server-side (layout `(admin)`, `requireStaff`
 * nas Server Actions, RLS na base de dados). Esconder um link não protege nada.
 */
export default async function AppShell({
  locale,
  children
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Sem sessão não há casca. `/login`, `/mfa` e `/aceitar-convite/[token]` são
  // alcançados por quem ainda não é ninguém: um cabeçalho ali estaria errado e
  // ainda tentaria contar notificações de um utilizador que não existe.
  if (!session) return <>{children}</>;

  // Nem em aal1 (autenticado mas com a MFA por resolver). Não é cosmética: cada
  // <Link> faz prefetch do payload RSC, o middleware responde 307 -> /mfa a
  // TODOS, e a cache do router passa a mapear cada destino para /mfa. O
  // `router.push('/')` a seguir ao código TOTP correto resolvia então para
  // /mfa e o utilizador ficava preso, tendo de introduzir um segundo código.
  // Só o staff era atingido — o investidor escapava por acaso, salvo pelo
  // redirect de KYC. A casca só aparece quando a navegação é mesmo navegável.
  const supabase = await createClient();
  const {data: aal} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return <>{children}</>;

  const t = await getTranslations('Nav');
  const loc = locale === 'en' ? 'en' : 'pt';
  const {role} = session;

  const items: Array<{href: string; label: string}> = [
    {href: '/', label: t('dashboard')},
    {href: '/projetos', label: t('projects')}
  ];
  if (isStaff(role)) {
    items.push(
      {href: '/convites', label: t('invites')},
      {href: '/kyc-revisao', label: t('kycQueue')},
      {href: '/gestao-projetos', label: t('projectsAdmin')}
    );
  }
  if (role === 'admin') {
    items.push(
      {href: '/definicoes', label: t('settings')},
      {href: '/utilizadores', label: t('users')}
    );
  }
  // O auditor não é staff (não entra no back-office), mas lê a auditoria.
  if (role === 'admin' || role === 'auditor') {
    items.push({href: '/auditoria', label: t('audit')});
  }

  const unread = await countUnread(session.userId);

  async function signOutAction() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect({href: '/login', locale: loc});
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.2em] text-neutral-900"
          >
            TILWENI
          </Link>

          <nav
            aria-label="TILWENI"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-neutral-600 transition-colors hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell locale={loc} initialCount={unread} />
            <span className="hidden text-xs text-neutral-500 sm:inline">
              {session.email}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                {t('signOut')}
              </Button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
