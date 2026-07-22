import {getTranslations} from 'next-intl/server';
import {listStatements} from '@/lib/statements/service';
import {publishStatementAction} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

/**
 * Painel de tabela da marca. O `<Table>` traz o seu próprio contentor com
 * `overflow-x-auto`; anula-se aqui (`[&>div]:overflow-visible`) para que quem
 * rola seja este invólucro — é ele que tem a barra fina de `.scroll-soft`.
 */
const TABLE_PANEL =
  'scroll-soft overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)] [&>div]:overflow-visible';
const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const TD = 'px-5 py-4 text-ink-soft';
const FIELD_LABEL = 'font-semibold text-ink';

export default async function GestaoExtratosPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const ta = await getTranslations('StatementsAdmin');
  const t = await getTranslations('Statements');
  const tw = await getTranslations('Works');
  const tp = await getTranslations('ProjectAdmin');

  const statements = await listStatements(id);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">
          {tp('title')}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            {ta('title')}
          </h1>
          <a
            href={`/${locale}/gestao-projetos/${id}`}
            className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
          >
            {tw('backToProject')}
          </a>
        </div>
      </header>

      <form
        action={publishStatementAction.bind(null, loc, id)}
        className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <div className="space-y-2" style={{minWidth: 200}}>
          <Label htmlFor="statement_period" className={FIELD_LABEL}>
            {ta('periodLabel')}
          </Label>
          <Input
            id="statement_period"
            name="period"
            pattern="\d{4}-\d{2}"
            required
          />
        </div>
        <div className="space-y-2" style={{minWidth: 240}}>
          <Label htmlFor="statement_file" className={FIELD_LABEL}>
            {ta('file')}
          </Label>
          <Input
            id="statement_file"
            name="file"
            type="file"
            accept="application/pdf"
            required
          />
        </div>
        <Button type="submit">{ta('publish')}</Button>
        <p className="w-full text-xs text-ink-muted">{ta('newVersionHint')}</p>
      </form>

      {statements.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {ta('empty')}
        </p>
      ) : (
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{t('period')}</TableHead>
                <TableHead className={TH}>{t('version')}</TableHead>
                <TableHead className={TH}>{t('published')}</TableHead>
                <TableHead className={TH}>{t('open')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((s) => (
                <TableRow key={s.id} className="border-border hover:bg-brand-50/60">
                  <TableCell className={`${TD} font-mono font-semibold text-ink`}>
                    {s.period}
                  </TableCell>
                  <TableCell className={`${TD} font-mono`}>{s.version}</TableCell>
                  <TableCell className={`${TD} font-mono`}>
                    {s.published_at.slice(0, 10)}
                  </TableCell>
                  <TableCell className={TD}>
                    <a
                      href={`/api/statements/${s.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
                    >
                      {s.original_filename}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
