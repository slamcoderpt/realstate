import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {listAllProjects} from '@/lib/projects/service';
import {createProjectAction} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
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

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(v));

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
/**
 * Mesma pele dos controlos nativos do back-office (ver `obra/page.tsx`): a
 * `<textarea>` não é um `<Input>`, por isso a altura fixa h-11 dá lugar a
 * padding vertical equivalente.
 */
const CONTROL_BASE =
  'rounded-xl border border-input bg-white text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const TEXTAREA = `w-full px-3.5 py-2.5 text-sm ${CONTROL_BASE}`;

export default async function GestaoProjetosPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('ProjectAdmin');
  const ts = await getTranslations('ProjectStatus');
  const projects = await listAllProjects();

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
            {t('new')}
          </CardTitle>
          {/* O resto da ficha (capa, imagens, documentos, rubricas) precisa do
              id do projeto, logo só existe depois de criar. Dizê-lo aqui evita
              que o formulário se leia como sendo tudo o que há. */}
          <CardDescription className="text-sm text-ink-muted">
            {t('newHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createProjectAction.bind(null, loc)}
            className="grid gap-5 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="name" className={FIELD_LABEL}>
                {t('name')}
              </Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className={FIELD_LABEL}>
                {t('location')}
              </Label>
              <Input id="location" name="location" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description" className={FIELD_LABEL}>
                {t('description')}
              </Label>
              <textarea
                id="description"
                name="description"
                rows={5}
                className={TEXTAREA}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acquisition_cost" className={FIELD_LABEL}>
                {t('acquisition')}
              </Label>
              <Input
                id="acquisition_cost"
                name="acquisition_cost"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="works_budget" className={FIELD_LABEL}>
                {t('works')}
              </Label>
              <Input
                id="works_budget"
                name="works_budget"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arv" className={FIELD_LABEL}>
                {t('arv')}
              </Label>
              <Input id="arv" name="arv" type="number" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_amount" className={FIELD_LABEL}>
                {t('amount')}
              </Label>
              <Input
                id="total_amount"
                name="total_amount"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_irr" className={FIELD_LABEL}>
                {t('irr')}
              </Label>
              <Input
                id="estimated_irr"
                name="estimated_irr"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term_months" className={FIELD_LABEL}>
                {t('term')}
              </Label>
              <Input id="term_months" name="term_months" type="number" />
            </div>
            <div className="pt-1 sm:col-span-2">
              <Button type="submit">{t('create')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className={TABLE_PANEL}>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-secondary hover:bg-secondary">
              <TableHead className={TH}>{t('name')}</TableHead>
              <TableHead className={TH}>{t('location')}</TableHead>
              <TableHead className={TH}>{t('status')}</TableHead>
              <TableHead className={`${TH} text-right`}>{t('amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell
                  colSpan={4}
                  className="px-5 py-14 text-center text-sm text-ink-muted"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {projects.map((p) => (
              <TableRow key={p.id} className="border-border hover:bg-brand-50/60">
                <TableCell className={TD}>
                  <Link
                    href={`/${loc}/gestao-projetos/${p.id}`}
                    className="font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-brand-700 hover:underline"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className={TD}>{p.location}</TableCell>
                <TableCell className={TD}>
                  <Badge variant="secondary">
                    {ts(p.status as 'preparacao')}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`${TD} text-right font-semibold tabular-nums text-ink`}
                >
                  {eur(Number(p.total_amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
