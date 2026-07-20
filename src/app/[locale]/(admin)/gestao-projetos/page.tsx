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
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('new')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={createProjectAction.bind(null, loc)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor="name">{t('name')}</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="location">{t('location')}</Label>
              <Input id="location" name="location" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">{t('description')}</Label>
              <Input id="description" name="description" />
            </div>
            <div>
              <Label htmlFor="acquisition_cost">{t('acquisition')}</Label>
              <Input
                id="acquisition_cost"
                name="acquisition_cost"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="works_budget">{t('works')}</Label>
              <Input
                id="works_budget"
                name="works_budget"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="arv">{t('arv')}</Label>
              <Input id="arv" name="arv" type="number" step="0.01" />
            </div>
            <div>
              <Label htmlFor="total_amount">{t('amount')}</Label>
              <Input
                id="total_amount"
                name="total_amount"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="estimated_irr">{t('irr')}</Label>
              <Input
                id="estimated_irr"
                name="estimated_irr"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="term_months">{t('term')}</Label>
              <Input id="term_months" name="term_months" type="number" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t('create')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('location')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead className="text-right">{t('amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-neutral-500">
                {t('empty')}
              </TableCell>
            </TableRow>
          )}
          {projects.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/${loc}/gestao-projetos/${p.id}`}
                  className="text-blue-700 underline"
                >
                  {p.name}
                </Link>
              </TableCell>
              <TableCell>{p.location}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {ts(p.status as 'preparacao')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {eur(Number(p.total_amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
