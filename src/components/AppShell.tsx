import {getTranslations} from 'next-intl/server';
import {Link, redirect} from '@/i18n/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';
import {countUnread} from '@/lib/notifications/service';
import {createClient} from '@/lib/supabase/server';
import {NotificationBell} from '@/components/NotificationBell';
import {MainNav} from '@/components/MainNav';
import type {NavItem, NavMenu, NavSection} from '@/components/MainNav';
import {UserMenu} from '@/components/UserMenu';

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
  const tRoles = await getTranslations('UsersAdmin');
  const loc = locale === 'en' ? 'en' : 'pt';
  const {role} = session;

  // Agrupado pelo modelo mental do utilizador, não pela árvore de papéis: o que
  // é do investidor fica plano (é o uso diário), e tudo o que é de gestão
  // recolhe para um só menu. Um admin tinha 8 links na barra; passa a ter 3.
  const flat: NavItem[] = [
    {href: '/', label: t('dashboard')},
    {href: '/projetos', label: t('projects')}
  ];
  const menus: NavMenu[] = [];

  if (isStaff(role)) {
    const sections: NavSection[] = [
      {
        items: [
          {href: '/convites', label: t('invites')},
          {href: '/kyc-revisao', label: t('kycQueue')},
          {href: '/gestao-projetos', label: t('projectsAdmin')}
        ]
      }
    ];
    if (role === 'admin') {
      sections.push({
        label: t('administration'),
        items: [
          {href: '/definicoes', label: t('settings')},
          {href: '/utilizadores', label: t('users')},
          {href: '/auditoria', label: t('audit')}
        ]
      });
    }
    menus.push({label: t('backoffice'), sections});
  } else if (role === 'auditor') {
    // O auditor não é staff e só tem um destino além do que já é plano — um
    // dropdown de um item só seria fricção sem arrumação nenhuma.
    flat.push({href: '/auditoria', label: t('audit')});
  }

  const ROLE_LABEL = {
    investor: tRoles('role_investor'),
    project_manager: tRoles('role_project_manager'),
    admin: tRoles('role_admin'),
    auditor: tRoles('role_auditor')
  } as const;

  const unread = await countUnread(session.userId);

  async function signOutAction() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect({href: '/login', locale: loc});
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-6">
          <div className="flex items-center gap-4 py-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-[0.2em] text-neutral-900 transition-opacity hover:opacity-70"
            >
              TILWENI
            </Link>
            {/* Filete a separar a identidade da navegação: a marca não é um
                item de menu, e sem isto lia-se como o primeiro deles. */}
            <span aria-hidden className="hidden h-4 w-px bg-neutral-200 md:block" />
          </div>

          {/* No telemóvel estes vêm ANTES do MainNav no DOM de propósito: o
              painel do menu é `w-full` e, se viessem depois, seriam empurrados
              para baixo da lista aberta em vez de ficarem na barra. Aqui o
              `ml-auto` encosta-os à direita e o botão do menu fica a seguir. */}
          <div className="ml-auto flex items-center py-3 md:hidden">
            <NotificationBell locale={loc} initialCount={unread} />
            <UserMenu
              email={session.email}
              roleLabel={ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}
              signOutLabel={t('signOut')}
              accountLabel={t('account')}
              signOut={signOutAction}
            />
          </div>

          <MainNav flat={flat} menus={menus} menuLabel={t('menu')} />

          <div className="ml-auto hidden items-center gap-1 py-3 md:flex">
            <NotificationBell locale={loc} initialCount={unread} />
            <UserMenu
              email={session.email}
              roleLabel={ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}
              signOutLabel={t('signOut')}
              accountLabel={t('account')}
              signOut={signOutAction}
            />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
