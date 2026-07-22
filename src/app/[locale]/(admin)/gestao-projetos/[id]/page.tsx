import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {ExternalLinkIcon} from 'lucide-react';
import {getProjectDetail} from '@/lib/projects/service';
import {nextStates} from '@/lib/projects/states';
import {signedProjectUrl, PHOTOS_BUCKET} from '@/lib/projects/storage';
import {
  updateProjectAction,
  transitionProjectAction,
  addBudgetLineAction,
  uploadCoverAction,
  uploadPhotoAction,
  uploadDocAction
} from '../actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Card, CardContent} from '@/components/ui/card';
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

const TH =
  'px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';
const FIELD_LABEL = 'font-semibold text-ink';
const NAV_LINK =
  'inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100';
const SELECT =
  'h-11 rounded-xl border border-input bg-white px-3.5 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
/**
 * Mesma pele dos controlos nativos do back-office (ver `obra/page.tsx`): a
 * `<textarea>` não é um `<Input>`, por isso a altura fixa h-11 dá lugar a
 * padding vertical equivalente.
 */
const TEXTAREA =
  'w-full rounded-xl border border-input bg-white px-3.5 py-2.5 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Cabeçalho de secção com filete de marca — o mesmo da ficha do investidor. */
function SectionTitle({children}: {children: React.ReactNode}) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink">
      <span aria-hidden className="h-4 w-1 rounded-full bg-brand-500" />
      {children}
    </h2>
  );
}

/** Rótulo em versalete das divisórias dentro de um cartão. */
function GroupLabel({children}: {children: React.ReactNode}) {
  return (
    <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-ink-muted uppercase">
      {children}
    </p>
  );
}

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

  const transitions = nextStates(project.status);
  const pct =
    project.total_amount > 0
      ? Math.round((project.subscribed_amount / project.total_amount) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">
              {t('title')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-ink">
                {project.name}
              </h1>
              <Badge variant="secondary">
                {ts(project.status as 'preparacao')}
              </Badge>
            </div>
          </div>
          {/* A ficha do investidor já era servida a staff seja qual for o estado
              do projeto, mas não havia como lá chegar sem escrever o URL à mão.
              Abre noutro separador: quem pré-visualiza quer voltar ao
              formulário onde o deixou. */}
          <Button asChild variant="outline">
            <a
              href={`/${locale}/projetos/${id}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('viewAsInvestor')}
              <ExternalLinkIcon aria-hidden className="size-4" />
            </a>
          </Button>
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

      {/* Duas colunas a partir de `lg`, como a ficha do investidor: o que se
          EDITA à esquerda, o que se CONSULTA e decide à direita, fixo. Antes era
          uma pilha única de sete secções — o estado do projeto e os indicadores
          ficavam a três ecrãs do formulário que os produz. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-10">
          <section className="space-y-4">
            <SectionTitle>{t('details')}</SectionTitle>
            <Card>
              <CardContent>
                <form
                  action={updateProjectAction.bind(null, loc, id)}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <GroupLabel>{t('identification')}</GroupLabel>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name" className={FIELD_LABEL}>
                          {t('name')}
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          defaultValue={project.name}
                          required
                        />
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
                        <textarea
                          id="description"
                          name="description"
                          rows={5}
                          defaultValue={project.description}
                          className={TEXTAREA}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Os seis números juntos e a três colunas: é assim que se
                      confere um projeto — de relance, não campo a campo. */}
                  <div className="space-y-4 border-t border-border pt-6">
                    <GroupLabel>{t('numbers')}</GroupLabel>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-2">
                        <Label
                          htmlFor="acquisition_cost"
                          className={FIELD_LABEL}
                        >
                          {t('acquisition')}
                        </Label>
                        <Input
                          id="acquisition_cost"
                          name="acquisition_cost"
                          type="number"
                          step="0.01"
                          className="tabular-nums"
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
                          className="tabular-nums"
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
                          className="tabular-nums"
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
                          className="tabular-nums"
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
                          className="tabular-nums"
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
                          className="tabular-nums"
                          defaultValue={project.term_months}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-6">
                    <Button type="submit">{t('save')}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionTitle>{t('budgetLines')}</SectionTitle>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto scroll-soft">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left">
                      <th className={TH}>{t('lineName')}</th>
                      <th className={TH}>{t('linePhase')}</th>
                      <th className={`${TH} text-right`}>{t('lineAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {budgetLines.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-5 py-10 text-center text-sm text-ink-muted"
                        >
                          {t('noLines')}
                        </td>
                      </tr>
                    )}
                    {budgetLines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-5 py-4 font-semibold text-ink">
                          {line.name}
                        </td>
                        <td className="px-5 py-4 text-ink-muted">
                          {line.phase}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-ink tabular-nums">
                          {eur(Number(line.budget_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <form
              action={addBudgetLineAction.bind(null, loc, id)}
              className="grid gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            >
              <div className="space-y-2">
                <Label htmlFor="line_name" className={FIELD_LABEL}>
                  {t('lineName')}
                </Label>
                <Input id="line_name" name="line_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_phase" className={FIELD_LABEL}>
                  {t('linePhase')}
                </Label>
                <Input id="line_phase" name="line_phase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_amount" className={FIELD_LABEL}>
                  {t('lineAmount')}
                </Label>
                <Input
                  id="line_amount"
                  name="line_amount"
                  type="number"
                  step="0.01"
                  className="tabular-nums"
                />
              </div>
              <Button type="submit">{t('addLine')}</Button>
            </form>
          </section>

          {/* Capa, imagens e documentos eram três secções em fila, cada uma com
              o seu cartão de upload — três ecrãs para o que cabe aqui. */}
          <section className="space-y-4">
            <SectionTitle>{t('mediaTitle')}</SectionTitle>
            {/* `items-start`: sem isto a linha da grelha iguala as alturas e o
                cartão sem imagens ficava com um palmo de branco por baixo do
                botão, só porque o da capa tem uma pré-visualização. */}
            <div className="grid gap-5 md:grid-cols-2 md:items-start">
              <Card>
                <CardContent className="space-y-4">
                  <GroupLabel>{t('cover')}</GroupLabel>
                  {project.cover_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/projects/cover/${id}`}
                      alt={project.name}
                      className="aspect-video w-full rounded-2xl border border-border object-cover"
                    />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-dashed border-border bg-secondary text-sm text-ink-muted">
                      {t('cover')}
                    </div>
                  )}
                  <form
                    action={uploadCoverAction.bind(null, loc, id)}
                    className="space-y-3"
                  >
                    <Input
                      id="cover"
                      type="file"
                      name="cover"
                      accept="image/*"
                      aria-label={t('cover')}
                    />
                    <Button type="submit" size="sm">
                      {t('uploadCover')}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4">
                  <GroupLabel>{t('photos')}</GroupLabel>
                  {photoUrls.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {photoUrls.map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt=""
                          className="aspect-square w-full rounded-xl border border-border object-cover"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">{t('noPhotos')}</p>
                  )}
                  <form
                    action={uploadPhotoAction.bind(null, loc, id)}
                    className="space-y-3"
                  >
                    <Input
                      type="file"
                      name="photo"
                      accept="image/*"
                      aria-label={t('photos')}
                    />
                    <Button type="submit" size="sm">
                      {t('uploadPhoto')}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="space-y-4">
                  <GroupLabel>{t('documents')}</GroupLabel>
                  {documents.length > 0 ? (
                    <ul className="divide-y divide-border text-sm">
                      {documents.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex flex-wrap items-center gap-3 py-3"
                        >
                          <span className="font-semibold text-ink">
                            {doc.original_filename}
                          </span>
                          <Badge variant="outline">
                            {td(doc.doc_type as 'caderneta_predial')}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">{t('noDocs')}</p>
                  )}
                  <form
                    action={uploadDocAction.bind(null, loc, id)}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <Input
                      type="file"
                      name="document"
                      aria-label={t('documents')}
                      className="max-w-sm flex-1"
                    />
                    <select
                      name="doc_type"
                      aria-label={t('documents')}
                      className={SELECT}
                      defaultValue="outro"
                    >
                      {DOC_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {td(dt as 'caderneta_predial')}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm">
                      {t('uploadDoc')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <section className="space-y-4">
            <SectionTitle>{t('status')}</SectionTitle>
            <Card>
              <CardContent className="space-y-4">
                <Badge variant="secondary">
                  {ts(project.status as 'preparacao')}
                </Badge>
                {/* Um estado terminal não tem para onde ir: aí a divisória e o
                    rótulo desaparecem com os botões, e o cartão fica só com o
                    estado atual. */}
                {transitions.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <GroupLabel>{t('transition')}</GroupLabel>
                    {transitions.map((s) => (
                      <form
                        key={s}
                        action={transitionProjectAction.bind(null, loc, id, s)}
                      >
                        <Button type="submit" size="sm" className="w-full">
                          {ts(s as 'preparacao')}
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionTitle>{t('indicators')}</SectionTitle>
            <Card>
              <CardContent className="divide-y divide-border">
                {[
                  {label: labels.invest, value: eur(indicators.totalInvestment)},
                  {label: labels.margin, value: eur(indicators.grossMargin)},
                  {label: labels.roi, value: `${indicators.roiPct.toFixed(1)}%`}
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">
                      {row.label}
                    </span>
                    <span className="text-lg font-extrabold tracking-tight text-ink tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* Quanto já está subscrito é o número que decide se o projeto avança
              de estado — e o botão que o faz está aqui em cima. */}
          <section className="space-y-4">
            <SectionTitle>{t('subscriptionTitle')}</SectionTitle>
            <Card>
              <CardContent className="space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{width: `${Math.min(100, pct)}%`}}
                  />
                </div>
                <p className="text-sm font-bold text-ink tabular-nums">
                  {t('subscribedLabel')}: {eur(project.subscribed_amount)} /{' '}
                  {eur(project.total_amount)}
                </p>
                <p className="text-xs text-ink-muted">
                  {t('investorsCount', {n: project.investor_count})}
                </p>
              </CardContent>
            </Card>
          </section>
        </aside>
      </div>
    </main>
  );
}
