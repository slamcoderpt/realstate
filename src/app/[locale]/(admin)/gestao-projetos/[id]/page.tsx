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

export default async function EditarProjetoPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('ProjectAdmin');
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <Badge variant="secondary">{project.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('save')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={updateProjectAction.bind(null, loc, id)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor="name">{t('name')}</Label>
              <Input id="name" name="name" defaultValue={project.name} required />
            </div>
            <div>
              <Label htmlFor="location">{t('location')}</Label>
              <Input
                id="location"
                name="location"
                defaultValue={project.location}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">{t('description')}</Label>
              <Input
                id="description"
                name="description"
                defaultValue={project.description}
              />
            </div>
            <div>
              <Label htmlFor="acquisition_cost">{t('acquisition')}</Label>
              <Input
                id="acquisition_cost"
                name="acquisition_cost"
                type="number"
                step="0.01"
                defaultValue={project.acquisition_cost}
              />
            </div>
            <div>
              <Label htmlFor="works_budget">{t('works')}</Label>
              <Input
                id="works_budget"
                name="works_budget"
                type="number"
                step="0.01"
                defaultValue={project.works_budget}
              />
            </div>
            <div>
              <Label htmlFor="arv">{t('arv')}</Label>
              <Input
                id="arv"
                name="arv"
                type="number"
                step="0.01"
                defaultValue={project.arv}
              />
            </div>
            <div>
              <Label htmlFor="total_amount">{t('amount')}</Label>
              <Input
                id="total_amount"
                name="total_amount"
                type="number"
                step="0.01"
                defaultValue={project.total_amount}
              />
            </div>
            <div>
              <Label htmlFor="estimated_irr">{t('irr')}</Label>
              <Input
                id="estimated_irr"
                name="estimated_irr"
                type="number"
                step="0.01"
                defaultValue={project.estimated_irr}
              />
            </div>
            <div>
              <Label htmlFor="term_months">{t('term')}</Label>
              <Input
                id="term_months"
                name="term_months"
                type="number"
                defaultValue={project.term_months}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t('save')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-neutral-500">{labels.invest}</p>
            <p className="text-lg font-medium">
              {eur(indicators.totalInvestment)}
            </p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">{labels.margin}</p>
            <p className="text-lg font-medium">{eur(indicators.grossMargin)}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500">{labels.roi}</p>
            <p className="text-lg font-medium">
              {indicators.roiPct.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('budgetLines')}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('lineName')}</TableHead>
              <TableHead>{t('linePhase')}</TableHead>
              <TableHead className="text-right">{t('lineAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgetLines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.name}</TableCell>
                <TableCell>{line.phase}</TableCell>
                <TableCell className="text-right">
                  {eur(Number(line.budget_amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form
          action={addBudgetLineAction.bind(null, loc, id)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1" style={{minWidth: 160}}>
            <Label htmlFor="line_name">{t('lineName')}</Label>
            <Input id="line_name" name="line_name" required />
          </div>
          <div className="flex-1" style={{minWidth: 120}}>
            <Label htmlFor="line_phase">{t('linePhase')}</Label>
            <Input id="line_phase" name="line_phase" />
          </div>
          <div style={{minWidth: 140}}>
            <Label htmlFor="line_amount">{t('lineAmount')}</Label>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('transition')}</h2>
        <div className="flex flex-wrap gap-2">
          {nextStates(project.status).map((s) => (
            <form
              key={s}
              action={transitionProjectAction.bind(null, loc, id, s)}
            >
              <Button type="submit">{s}</Button>
            </form>
          ))}
          {nextStates(project.status).length === 0 && (
            <p className="text-sm text-neutral-500">{project.status}</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('photos')}</h2>
        <div className="flex flex-wrap gap-3">
          {photoUrls.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              className="h-32 w-32 rounded-md object-cover"
            />
          ))}
        </div>
        <form
          action={uploadPhotoAction.bind(null, loc, id)}
          className="flex flex-wrap items-end gap-3"
        >
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="text-sm"
          />
          <Button type="submit">{t('uploadPhoto')}</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('documents')}</h2>
        <ul className="space-y-1 text-sm">
          {documents.map((doc) => (
            <li key={doc.id}>
              <span className="font-medium">{doc.original_filename}</span>{' '}
              <Badge variant="outline">{doc.doc_type}</Badge>
            </li>
          ))}
        </ul>
        <form
          action={uploadDocAction.bind(null, loc, id)}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="file" name="document" className="text-sm" />
          <select
            name="doc_type"
            className="rounded-md border p-2 text-sm"
            defaultValue="outro"
          >
            {DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
          <Button type="submit">{t('uploadDoc')}</Button>
        </form>
      </section>
    </main>
  );
}
