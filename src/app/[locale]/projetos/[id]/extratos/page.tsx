import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {listStatements} from '@/lib/statements/service';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function dateFmt(loc: Locale, value: string): string {
  return new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'medium'
  }).format(new Date(value));
}

export default async function ExtratosPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);
  const t = await getTranslations('Statements');
  const tw = await getTranslations('Works');

  const session = await getSession();
  if (!session) notFound();

  const db = createAdminClient();

  // Gate deliberadamente mais apertado que o da obra (qualquer subscrição
  // ativa): os extratos da conta dedicada só se abrem a staff ou a quem tem
  // fundos confirmados no projeto. O mesmo critério de /api/statements/[id].
  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', id)
      .eq('user_id', session.userId)
      .eq('status', 'fundos_confirmados');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) notFound();

  const statements = await listStatements(id, db);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <a
          href={`/${locale}/projetos/${id}`}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
        >
          {tw('backToProject')}
        </a>
      </header>

      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        {t('notice')}
      </p>

      {statements.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">{t('period')}</th>
              <th className="py-2 font-medium">{t('version')}</th>
              <th className="py-2 font-medium">{t('published')}</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100">
                <td className="py-2 font-mono">{s.period}</td>
                <td className="py-2 font-mono">{s.version}</td>
                <td className="py-2 font-mono">
                  {dateFmt(loc, s.published_at)}
                </td>
                <td className="py-2 text-right">
                  <a
                    href={`/api/statements/${s.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
                  >
                    {t('open')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
