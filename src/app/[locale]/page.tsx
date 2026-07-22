import {getTranslations, setRequestLocale} from 'next-intl/server';
import Link from 'next/link';
import {redirect} from '@/i18n/navigation';
import {getSession} from '@/lib/auth/staff';
import {getInvestorDashboard} from '@/lib/dashboard/service';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

function StatTile({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

export default async function DashboardPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  setRequestLocale(loc);

  const session = await getSession();
  // O middleware já trava o acesso sem sessão; a página não presume isso.
  if (!session) redirect({href: '/login', locale: loc});

  const t = await getTranslations('Dashboard');
  const ts = await getTranslations('Subscription');
  const tp = await getTranslations('ProjectStatus');

  // Staff também pode ser investidor: a página é a mesma para toda a gente e o
  // que mostra é sempre a posição de quem está autenticado, nunca agregados.
  // `redirect` lança, mas o seu tipo de retorno não é `never` — daí o `!`,
  // como em (auth)/kyc/page.tsx.
  const dash = await getInvestorDashboard(session!.userId);

  const confirmed = dash.positions.filter(
    (p) => p.status === 'fundos_confirmados'
  );
  // Média da TIR ponderada pelo montante. Sem posições confirmadas o
  // denominador é 0 — mostra-se um travessão em vez de dividir por zero.
  const expectedReturn =
    dash.investedTotal > 0
      ? `${(
          confirmed.reduce((s, p) => s + p.amount * p.estimatedIrr, 0) /
          dash.investedTotal
        ).toFixed(1)}%`
      : '—';

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('invested')} value={eur(dash.investedTotal)} />
        <StatTile
          label={t('projectsCount')}
          value={String(dash.positions.length)}
        />
        <StatTile label={t('expectedReturn')} value={expectedReturn} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('myPositions')}</h2>
        {dash.positions.length === 0 ? (
          <div className="space-y-2 text-sm">
            <p className="text-neutral-500">{t('noPositions')}</p>
            <Link
              href={`/${locale}/projetos`}
              className="inline-block text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
            >
              {t('browseProjects')}
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 font-medium">{t('project')}</th>
                <th className="py-2 text-right font-medium">{t('amount')}</th>
                <th className="py-2 font-medium">{t('status')}</th>
                <th className="py-2 text-right font-medium">{t('irr')}</th>
              </tr>
            </thead>
            <tbody>
              {dash.positions.map((p) => (
                <tr key={p.projectId} className="border-b border-neutral-100">
                  <td className="py-2">
                    <Link
                      href={`/${locale}/projetos/${p.projectId}`}
                      className="text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
                    >
                      {p.projectName}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-500">
                      {tp(p.projectStatus as 'preparacao')}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">{eur(p.amount)}</td>
                  <td className="py-2">
                    <span className="inline-block rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {ts(`status_${p.status}` as 'status_interesse')}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">
                    {p.estimatedIrr}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('upcomingMilestones')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.upcomingMilestones.length === 0 ? (
              <p className="text-neutral-500">{t('noMilestones')}</p>
            ) : (
              <ul className="space-y-3">
                {dash.upcomingMilestones.map((m) => (
                  <li key={`${m.projectId}-${m.title}-${m.plannedDate}`}>
                    <p className="text-neutral-800">{m.title}</p>
                    <p className="text-xs text-neutral-500">
                      {m.projectName}
                      {m.plannedDate ? ` · ${m.plannedDate}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('latestUpdates')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.latestUpdates.length === 0 ? (
              <p className="text-neutral-500">{t('noUpdates')}</p>
            ) : (
              <ul className="space-y-3">
                {dash.latestUpdates.map((u) => (
                  <li key={`${u.projectId}-${u.publishedAt}-${u.title}`}>
                    <Link
                      href={`/${locale}/projetos/${u.projectId}/obra`}
                      className="text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
                    >
                      {u.title}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {u.projectName} · {u.publishedAt.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('recentDocuments')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.recentStatements.length === 0 ? (
              <p className="text-neutral-500">{t('noDocuments')}</p>
            ) : (
              <ul className="space-y-3">
                {dash.recentStatements.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/${locale}/projetos/${s.projectId}/extratos`}
                      className="text-neutral-800 underline-offset-2 hover:underline"
                    >
                      {s.period}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {s.projectName} · {s.publishedAt.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="border-t border-neutral-200 pt-6 text-xs leading-relaxed text-neutral-400">
        {t('riskNotice')}
      </p>
    </main>
  );
}
