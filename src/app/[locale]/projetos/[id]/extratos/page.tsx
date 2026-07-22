import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {ArrowLeftIcon, ReceiptTextIcon, ShieldCheckIcon} from 'lucide-react';
import {getSession, canReadStatements} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {listStatements} from '@/lib/statements/service';
import {Card, CardContent} from '@/components/ui/card';
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
  // ativa): os extratos da conta dedicada só se abrem a staff/auditor ou a quem
  // tem fundos confirmados no projeto. O mesmo critério de /api/statements/[id]
  // — e o auditor precisa de UI para aquilo que a RLS já lhe permite ler.
  let allowed = canReadStatements(session.role);
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

  const th =
    'px-5 py-3 text-xs font-bold tracking-[0.12em] text-ink-muted uppercase';

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        <a
          href={`/${locale}/projetos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {tw('backToProject')}
        </a>
      </header>

      {/* Aviso de auditoria: antes era âmbar, o que o fazia ler como alerta. É
          informação de confiança — fica em azul da casa, com o cadeado a dar o
          tom em vez da cor. */}
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-brand-100 bg-brand-50 p-4">
        <ShieldCheckIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-brand-500"
        />
        <p className="text-xs leading-relaxed text-ink-soft">{t('notice')}</p>
      </div>

      {statements.length === 0 ? (
        <Card className="py-10">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400"
            >
              <ReceiptTextIcon className="size-6" />
            </span>
            <p className="max-w-sm text-sm text-ink-muted">{t('empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto scroll-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className={th}>{t('period')}</th>
                  <th className={th}>{t('version')}</th>
                  <th className={th}>{t('published')}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statements.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-50/60">
                    <td className="px-5 py-4 font-bold text-ink tabular-nums">
                      {s.period}
                    </td>
                    <td className="px-5 py-4 text-ink-soft tabular-nums">
                      {s.version}
                    </td>
                    <td className="px-5 py-4 text-ink-muted tabular-nums">
                      {dateFmt(loc, s.published_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <a
                        href={`/api/statements/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {t('open')}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
