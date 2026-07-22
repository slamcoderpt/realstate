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
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {t('triggerNote')}
      </p>

      {/* GET puro: os filtros ficam no URL, logo são partilháveis e o prev/next
          consegue preservá-los sem estado de cliente. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">{t('filterAction')}</span>
          <Input
            name="action"
            defaultValue={filters.action}
            className="h-9 w-48"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">{t('filterEntity')}</span>
          <Input
            name="entity"
            defaultValue={filters.entity}
            className="h-9 w-48"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">{t('filterFrom')}</span>
          <Input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="h-9 w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">{t('filterTo')}</span>
          <Input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="h-9 w-40"
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
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('when')}</TableHead>
                <TableHead>{t('actor')}</TableHead>
                <TableHead>{t('action')}</TableHead>
                <TableHead>{t('entity')}</TableHead>
                <TableHead>{t('entityId')}</TableHead>
                <TableHead>{t('ip')}</TableHead>
                <TableHead>{t('payload')}</TableHead>
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
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {when.format(new Date(row.created_at))}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.actor_id ? (
                        <span className="font-medium">
                          {names.get(row.actor_id) ?? row.actor_id}
                        </span>
                      ) : (
                        <span className="text-neutral-400">{t('system')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.entity_type}</TableCell>
                    <TableCell className="max-w-[16rem] truncate text-xs text-neutral-500">
                      {row.entity_id ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-500">
                      {row.ip ?? '—'}
                    </TableCell>
                    <TableCell>
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-xs text-neutral-600">
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
