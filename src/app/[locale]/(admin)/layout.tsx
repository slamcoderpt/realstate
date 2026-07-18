import {redirect} from '@/i18n/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';

// Back-office: o guard de sessão e a listagem de convites têm de correr a cada
// pedido (nunca servir HTML pré-gerado em build). Força render dinâmico.
export const dynamic = 'force-dynamic';

/**
 * Guard do back-office: só admin/project_manager entram. Um investidor (ou
 * anónimo, embora o middleware já o apanhe) é reencaminhado para a home.
 */
export default async function AdminLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const session = await getSession();
  if (!session || !isStaff(session.role)) {
    redirect({href: '/', locale: locale === 'en' ? 'en' : 'pt'});
  }
  return <>{children}</>;
}
