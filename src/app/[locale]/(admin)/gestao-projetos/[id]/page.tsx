import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getProjectDetail} from '@/lib/projects/service';
import {nextStates} from '@/lib/projects/states';
import {signedProjectUrl, PHOTOS_BUCKET} from '@/lib/projects/storage';
import {
  updateProjectAction,
  transitionProjectAction,
  addBudgetLineAction,
  uploadPhotoAction,
  uploadDocAction
} from '../actions';
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

const INDICATOR_LABELS: Record<
  Locale,
  {invest: string; margin: string; roi: string}
> = {
  pt: {
    invest: 'Investimento total',
    margin: 'Margem bruta',
    roi: 'ROI'
  },
  en: {
    invest: 'Total investment',
    margin: 'Gross margin',
    roi: 'ROI'
  }
};

const DOC_TYPES = [
  'caderneta_predial',
  'licenca',
  'orcamento_empreiteiro',
  'apolice_seguro',
  'outro'
] as const;

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
const SECTION_TITLE = 'text-lg font-bold tracking-tight text-ink';
const NAV_LINK =
  'inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100';
const SELECT =
  'h-11 rounded-xl border border-input bg-white px-3.5 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default async function EditarProjetoPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('ProjectAdmin');
  const ts = await getTranslations('ProjectStatus');
  const td = await getTranslations('ProjectDocType');
  const tsa = await getTranslations('SubscriptionAdmin');
  const twa = await getTranslations('WorksAdmin');
  const tea = await getTranslations('StatementsAdmin');
  const detail = await getProjectDetail(id, {staff: true});
  if (!detail) notFound();

  const {project, budgetLines, photos, documents, indicators} = detail;
  const labels = INDICATOR_LABELS[loc];

  const photoUrls = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      url: await signedProjectUrl(PHOTOS_BUCKET, photo.storage_path)
    }))
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">
          {t('title')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            {project.name}
          </h1>
          <Badge variant="secondary">{ts(project.status as 'preparacao')}</Badge>
        </div>
        <nav className="flex flex-wrap gap-2">
          <a
            href={`/${locale}/gestao-projetos/${id}/subscricoes`}
            className={NAV_LINK}
          >
            {tsa('title')}
          </a>
          <a href={`/${locale}/gestao-projetos/${id}/obra`} className={NAV_LINK}>
            {twa('title')}
          </a>
          <a
            href={`/${locale}/gestao-projetos/${id}/extratos`}
            className={NAV_LINK}
          >
            {tea('title')}
          </a>
        </nav>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
            {t('save')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={updateProjectAction.bind(null, loc, id)}
            className="grid gap-5 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="name" className={FIELD_LABEL}>
                {t('name')}
              </Label>
              <Input id="name" name="name" defaultValue={project.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className={FIELD_LABEL}>
                {t('location')}
              </Label>
              <Input
                id="location"
                name="location"
                defaultValue={project.location}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description" className={FIELD_LABEL}>
                {t('description')}
              </Label>
              <Input
                id="description"
                name="description"
                defaultValue={project.description}
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
                defaultValue={project.acquisition_cost}
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
                defaultValue={project.works_budget}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arv" className={FIELD_LABEL}>
                {t('arv')}
              </Label>
              <Input
                id="arv"
                name="arv"
                type="number"
                step="0.01"
                defaultValue={project.arv}
              />
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
                defaultValue={project.total_amount}
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
                defaultValue={project.estimated_irr}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term_months" className={FIELD_LABEL}>
                {t('term')}
              </Label>
              <Input
                id="term_months"
                name="term_months"
                type="number"
                defaultValue={project.term_months}
              />
            </div>
            <div className="pt-1 sm:col-span-2">
              <Button type="submit">{t('save')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-8 pt-6 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
              {labels.invest}
            </p>
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-ink">
              {eur(indicators.totalInvestment)}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
              {labels.margin}
            </p>
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-ink">
              {eur(indicators.grossMargin)}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
              {labels.roi}
            </p>
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-ink">
              {indicators.roiPct.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('budgetLines')}</h2>
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{t('lineName')}</TableHead>
                <TableHead className={TH}>{t('linePhase')}</TableHead>
                <TableHead className={`${TH} text-right`}>
                  {t('lineAmount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetLines.map((line) => (
                <TableRow
                  key={line.id}
                  className="border-border hover:bg-brand-50/60"
                >
                  <TableCell className={`${TD} font-semibold text-ink`}>
                    {line.name}
                  </TableCell>
                  <TableCell className={TD}>{line.phase}</TableCell>
                  <TableCell
                    className={`${TD} text-right font-semibold tabular-nums text-ink`}
                  >
                    {eur(Number(line.budget_amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <form
          action={addBudgetLineAction.bind(null, loc, id)}
          className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <div className="flex-1 space-y-2" style={{minWidth: 160}}>
            <Label htmlFor="line_name" className={FIELD_LABEL}>
              {t('lineName')}
            </Label>
            <Input id="line_name" name="line_name" required />
          </div>
          <div className="flex-1 space-y-2" style={{minWidth: 120}}>
            <Label htmlFor="line_phase" className={FIELD_LABEL}>
              {t('linePhase')}
            </Label>
            <Input id="line_phase" name="line_phase" />
          </div>
          <div className="space-y-2" style={{minWidth: 140}}>
            <Label htmlFor="line_amount" className={FIELD_LABEL}>
              {t('lineAmount')}
            </Label>
            <Input
              id="line_amount"
              name="line_amount"
              type="number"
              step="0.01"
            />
          </div>
          <Button type="submit">{t('addLine')}</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('transition')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {nextStates(project.status).map((s) => (
            <form
              key={s}
              action={transitionProjectAction.bind(null, loc, id, s)}
            >
              <Button type="submit">{ts(s as 'preparacao')}</Button>
            </form>
          ))}
          {nextStates(project.status).length === 0 && (
            <p className="text-sm text-ink-muted">
              {ts(project.status as 'preparacao')}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('photos')}</h2>
        {photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {photoUrls.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt=""
                className="h-32 w-32 rounded-2xl border border-border object-cover shadow-[var(--shadow-card)]"
              />
            ))}
          </div>
        )}
        <form
          action={uploadPhotoAction.bind(null, loc, id)}
          className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <Input
            type="file"
            name="photo"
            accept="image/*"
            className="max-w-sm flex-1"
          />
          <Button type="submit">{t('uploadPhoto')}</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('documents')}</h2>
        {documents.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--shadow-card)]">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm"
              >
                <span className="font-semibold text-ink">
                  {doc.original_filename}
                </span>{' '}
                <Badge variant="outline">
                  {td(doc.doc_type as 'caderneta_predial')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <form
          action={uploadDocAction.bind(null, loc, id)}
          className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <Input type="file" name="document" className="max-w-sm flex-1" />
          <select name="doc_type" className={SELECT} defaultValue="outro">
            {DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {td(dt as 'caderneta_predial')}
              </option>
            ))}
          </select>
          <Button type="submit">{t('uploadDoc')}</Button>
        </form>
      </section>
    </main>
  );
}
