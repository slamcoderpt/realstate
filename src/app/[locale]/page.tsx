import {getTranslations, setRequestLocale} from 'next-intl/server';
import Link from 'next/link';
import {
  CalendarClockIcon,
  FolderOpenIcon,
  HardHatIcon,
  LayersIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon
} from 'lucide-react';
import {redirect} from '@/i18n/navigation';
import {getSession} from '@/lib/auth/staff';
import {getInvestorDashboard} from '@/lib/dashboard/service';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {PortfolioChart} from '@/components/charts/PortfolioChart';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}

/**
 * Mosaico de figura: rótulo pequeno em caixa alta, número grande, e um ladrilho
 * de ícone tingido de marca. O rótulo e o valor são IRMÃOS de propósito — o
 * teste ponta-a-ponta lê o valor com `following-sibling::p[1]` a partir do
 * rótulo, e enfiar o ícone entre os dois partiria a jornada do investidor.
 */
function StatTile({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.12em] text-ink-muted uppercase">
            {label}
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink tabular-nums">
            {value}
          </p>
        </div>
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-500"
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

/** Cabeçalho de secção com um filete de marca — decorativo, sem copy nova. */
function SectionTitle({children}: {children: React.ReactNode}) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink">
      <span aria-hidden className="h-4 w-1 rounded-full bg-brand-500" />
      {children}
    </h2>
  );
}

function PanelHeading({
  icon: Icon,
  children
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <CardTitle className="flex items-center gap-2.5 text-base font-bold text-ink">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500"
      >
        <Icon className="size-4" />
      </span>
      {children}
    </CardTitle>
  );
}

function EmptyLine({children}: {children: React.ReactNode}) {
  return <p className="py-2 text-center text-ink-muted">{children}</p>;
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

  const th =
    'px-5 py-3 text-xs font-bold tracking-[0.12em] text-ink-muted uppercase';

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label={t('invested')}
          value={eur(dash.investedTotal)}
          icon={WalletIcon}
        />
        <StatTile
          label={t('projectsCount')}
          value={String(dash.positions.length)}
          icon={LayersIcon}
        />
        <StatTile
          label={t('expectedReturn')}
          value={expectedReturn}
          icon={TrendingUpIcon}
        />
      </section>

      {/* Distribuição da carteira: capital investido (fundos confirmados) por
          projeto. Só aparece com pelo menos uma posição confirmada — sem capital
          confirmado não há carteira a repartir. */}
      {confirmed.length > 0 && (
        <section className="space-y-4">
          <SectionTitle>{t('portfolioTitle')}</SectionTitle>
          <Card className="py-5">
            <CardContent>
              <PortfolioChart
                data={confirmed.map((p) => ({
                  name: p.projectName,
                  amount: p.amount
                }))}
              />
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>{t('myPositions')}</SectionTitle>
        {dash.positions.length === 0 ? (
          <Card className="py-10">
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <span
                aria-hidden
                className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-400"
              >
                <FolderOpenIcon className="size-6" />
              </span>
              <p className="max-w-sm text-sm text-ink-muted">
                {t('noPositions')}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/${locale}/projetos`}>{t('browseProjects')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="overflow-x-auto scroll-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-left">
                    <th className={th}>{t('project')}</th>
                    <th className={`${th} text-right`}>{t('amount')}</th>
                    <th className={th}>{t('status')}</th>
                    <th className={`${th} text-right`}>{t('irr')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dash.positions.map((p) => (
                    <tr key={p.projectId} className="hover:bg-brand-50/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/${locale}/projetos/${p.projectId}`}
                          className="font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline"
                        >
                          {p.projectName}
                        </Link>
                        <span className="ml-2 text-xs text-ink-muted">
                          {tp(p.projectStatus as 'preparacao')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                        {eur(p.amount)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="secondary">
                          {ts(`status_${p.status}` as 'status_interesse')}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-ink-soft tabular-nums">
                        {p.estimatedIrr}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <PanelHeading icon={CalendarClockIcon}>
              {t('upcomingMilestones')}
            </PanelHeading>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.upcomingMilestones.length === 0 ? (
              <EmptyLine>{t('noMilestones')}</EmptyLine>
            ) : (
              <ul className="space-y-3">
                {dash.upcomingMilestones.map((m) => (
                  <li key={`${m.projectId}-${m.title}-${m.plannedDate}`}>
                    <p className="font-semibold text-ink">{m.title}</p>
                    <p className="text-xs text-ink-muted">
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
            <PanelHeading icon={HardHatIcon}>{t('latestUpdates')}</PanelHeading>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.latestUpdates.length === 0 ? (
              <EmptyLine>{t('noUpdates')}</EmptyLine>
            ) : (
              <ul className="space-y-3">
                {dash.latestUpdates.map((u) => (
                  <li key={`${u.projectId}-${u.publishedAt}-${u.title}`}>
                    <Link
                      href={`/${locale}/projetos/${u.projectId}/obra`}
                      className="font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline"
                    >
                      {u.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
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
            <PanelHeading icon={ReceiptTextIcon}>
              {t('recentDocuments')}
            </PanelHeading>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dash.recentStatements.length === 0 ? (
              <EmptyLine>{t('noDocuments')}</EmptyLine>
            ) : (
              <ul className="space-y-3">
                {dash.recentStatements.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/${locale}/projetos/${s.projectId}/extratos`}
                      className="font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline"
                    >
                      {s.period}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {s.projectName} · {s.publishedAt.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="border-t border-border pt-6 text-xs leading-relaxed text-ink-muted">
        {t('riskNotice')}
      </p>
    </main>
  );
}
