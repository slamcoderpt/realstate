import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {getSession, canReadAudit} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

// O registo é append-only e cresce a cada pedido: nunca servir HTML de build.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const PAYLOAD_MAX = 400;

/**
 * Painel de tabela da marca. O `<Table>` traz o seu próprio contentor com
 * `overflow-x-auto`; anula-se aqui (`[&>div]:overflow-visible`) para que quem
 * rola seja este invólucro — é ele que tem a barra fina de `.scroll-soft`.
 * Esta é a tabela mais larga do back-office e a razão de a classe existir.
 */
const TABLE_PANEL =
  'scroll-soft overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)] [&>div]:overflow-visible';
const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-5 py-4 align-top text-ink-soft';
const FILTER_LABEL =
  'text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
  ip: string | null;
  created_at: string;
};

type Filters = {
  action: string;
  entity: string;
  from: string;
  to: string;
};

/** Query string com os filtros atuais mais a página pedida (para prev/next). */
function hrefWith(filters: Filters, page: number): string {
  const qs = new URLSearchParams();
  if (filters.action) qs.set('action', filters.action);
  if (filters.entity) qs.set('entity', filters.entity);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `/auditoria?${s}` : '/auditoria';
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function AuditoriaPage({
  params,
  searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {locale} = await params;
  const sp = await searchParams;

  // Guard próprio, e não o layout `(admin)`: esse deixa entrar project_manager,
  // que a política RLS do audit_log exclui. Ver `canReadAudit`.
  const session = await getSession();
  if (!session || !canReadAudit(session.role)) notFound();

  const t = await getTranslations('AuditAdmin');

  const filters: Filters = {
    action: first(sp.action).trim(),
    entity: first(sp.entity).trim(),
    from: first(sp.from).trim(),
    to: first(sp.to).trim()
  };
  const parsedPage = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 1 ? parsedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const db = createAdminClient();
  let query = db
    .from('audit_log')
    .select('id,actor_id,action,entity_type,entity_id,payload,ip,created_at', {
      count: 'exact'
    })
    .order('created_at', {ascending: false})
    .order('id', {ascending: false});

  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entity) query = query.eq('entity_type', filters.entity);
  // Os limites vêm de `<input type="date">` (só o dia). Interpretam-se em UTC,
  // que é como o `created_at` é guardado — `to` inclui o dia inteiro.
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59.999Z`);

  const {data, count} = await query.range(offset, offset + PAGE_SIZE - 1);
  const rows = (data ?? []) as AuditRow[];

  // Nomes dos atores numa ÚNICA query: os ids distintos da página de uma vez.
  // Uma query por linha seriam até 50 idas à BD por render.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))
  );
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const {data: profiles} = await db
      .from('profiles')
      .select('id,full_name')
      .in('id', actorIds);
    for (const p of (profiles ?? []) as {id: string; full_name: string}[]) {
      if (p.full_name) names.set(p.id, p.full_name);
    }
  }

  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + rows.length < total;

  const when = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      <p className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 px-5 py-4 text-sm leading-relaxed text-ink-soft">
        {t('triggerNote')}
      </p>

      {/* GET puro: os filtros ficam no URL, logo são partilháveis e o prev/next
          consegue preservá-los sem estado de cliente. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className={FILTER_LABEL}>{t('filterAction')}</span>
          <Input
            name="action"
            defaultValue={filters.action}
            className="h-10 w-48"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className={FILTER_LABEL}>{t('filterEntity')}</span>
          <Input
            name="entity"
            defaultValue={filters.entity}
            className="h-10 w-48"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className={FILTER_LABEL}>{t('filterFrom')}</span>
          <Input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="h-10 w-40"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className={FILTER_LABEL}>{t('filterTo')}</span>
          <Input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="h-10 w-40"
          />
        </label>
        <Button type="submit" size="sm">
          {t('apply')}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/auditoria" locale={locale === 'en' ? 'en' : 'pt'}>
            {t('clear')}
          </Link>
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {t('empty')}
        </p>
      ) : (
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{t('when')}</TableHead>
                <TableHead className={TH}>{t('actor')}</TableHead>
                <TableHead className={TH}>{t('action')}</TableHead>
                <TableHead className={TH}>{t('entity')}</TableHead>
                <TableHead className={TH}>{t('entityId')}</TableHead>
                <TableHead className={TH}>{t('ip')}</TableHead>
                <TableHead className={TH}>{t('payload')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const raw = JSON.stringify(row.payload ?? {});
                const payload =
                  raw.length > PAYLOAD_MAX
                    ? `${raw.slice(0, PAYLOAD_MAX)}…`
                    : raw;
                return (
                  <TableRow key={row.id} className="border-border hover:bg-brand-50/60">
                    <TableCell
                      className={`${TD} whitespace-nowrap text-sm tabular-nums`}
                    >
                      {when.format(new Date(row.created_at))}
                    </TableCell>
                    <TableCell className={`${TD} text-sm`}>
                      {row.actor_id ? (
                        <span className="font-semibold text-ink">
                          {names.get(row.actor_id) ?? row.actor_id}
                        </span>
                      ) : (
                        <span className="text-ink-muted">{t('system')}</span>
                      )}
                    </TableCell>
                    <TableCell className={TD}>
                      <Badge variant="secondary">{row.action}</Badge>
                    </TableCell>
                    <TableCell className={`${TD} text-sm`}>
                      {row.entity_type}
                    </TableCell>
                    <TableCell
                      className={`${TD} max-w-[16rem] truncate font-mono text-xs text-ink-muted`}
                    >
                      {row.entity_id ?? '—'}
                    </TableCell>
                    <TableCell className={`${TD} font-mono text-xs text-ink-muted`}>
                      {row.ip ?? '—'}
                    </TableCell>
                    <TableCell className={TD}>
                      <pre className="scroll-soft max-w-md overflow-x-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-ink-soft">
                        {payload}
                      </pre>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center gap-3">
        {hasPrev && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={hrefWith(filters, page - 1)}
              locale={locale === 'en' ? 'en' : 'pt'}
            >
              {t('prev')}
            </Link>
          </Button>
        )}
        {hasNext && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={hrefWith(filters, page + 1)}
              locale={locale === 'en' ? 'en' : 'pt'}
            >
              {t('next')}
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}
