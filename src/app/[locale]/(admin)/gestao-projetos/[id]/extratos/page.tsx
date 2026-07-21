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

  const statements = await listStatements(id);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{ta('title')}</h1>
        <a
          href={`/${locale}/gestao-projetos/${id}`}
          className="text-sm text-blue-700 underline"
        >
          {tw('backToProject')}
        </a>
      </div>

      <form
        action={publishStatementAction.bind(null, loc, id)}
        className="flex flex-wrap items-end gap-3 rounded-md border p-4"
      >
        <div style={{minWidth: 200}}>
          <Label htmlFor="statement_period">{ta('periodLabel')}</Label>
          <Input
            id="statement_period"
            name="period"
            pattern="\d{4}-\d{2}"
            required
          />
        </div>
        <div style={{minWidth: 240}}>
          <Label htmlFor="statement_file">{ta('file')}</Label>
          <Input
            id="statement_file"
            name="file"
            type="file"
            accept="application/pdf"
            required
          />
        </div>
        <Button type="submit">{ta('publish')}</Button>
        <p className="w-full text-xs text-neutral-500">{ta('newVersionHint')}</p>
      </form>

      {statements.length === 0 ? (
        <p className="text-sm text-neutral-500">{ta('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('period')}</TableHead>
              <TableHead>{t('version')}</TableHead>
              <TableHead>{t('published')}</TableHead>
              <TableHead>{t('open')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">{s.period}</TableCell>
                <TableCell className="font-mono">{s.version}</TableCell>
                <TableCell className="font-mono">
                  {s.published_at.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <a
                    href={`/api/statements/${s.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    {s.original_filename}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
