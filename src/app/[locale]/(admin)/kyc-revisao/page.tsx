import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {listPendingKyc} from '@/lib/kyc/service';
import {approveKycAction, rejectKycAction} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

export default async function AdminKycPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('KycAdmin');
  const pending = await listPendingKyc();

  const db = createAdminClient();
  const ids = pending.map((p) => p.id);
  const {data: docs} = ids.length
    ? await db
        .from('kyc_documents')
        .select('id, submission_id, doc_type')
        .in('submission_id', ids)
    : {data: []};
  const docsBySub = new Map<string, {id: string; doc_type: string}[]>();
  for (const d of docs ?? []) {
    const arr = docsBySub.get(d.submission_id) ?? [];
    arr.push({id: d.id, doc_type: d.doc_type});
    docsBySub.set(d.submission_id, arr);
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>
      {pending.length === 0 && (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {t('empty')}
        </p>
      )}
      <div className="space-y-5">
        {pending.map((sub) => (
          <Card key={sub.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-lg font-bold tracking-tight text-ink">
                {sub.full_name}{' '}
                <Badge variant="secondary">{sub.citizen_type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm tabular-nums text-ink-soft">
                NIF: {sub.nif} ·{' '}
                {new Date(sub.created_at).toLocaleDateString(loc)}
              </p>
              <div className="flex flex-wrap gap-2">
                {(docsBySub.get(sub.id) ?? []).map((d) => (
                  <a
                    key={d.id}
                    href={`/api/kyc/document/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
                  >
                    {t(`doc_${d.doc_type}` as 'doc_cartao_cidadao')}
                  </a>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-5">
                <form action={approveKycAction.bind(null, loc, sub.id)}>
                  <Button type="submit">{t('approve')}</Button>
                </form>
                <form
                  action={async (fd: FormData) => {
                    'use server';
                    await rejectKycAction(
                      loc,
                      sub.id,
                      String(fd.get('note') ?? '')
                    );
                  }}
                  className="flex flex-1 flex-wrap items-end justify-end gap-3"
                >
                  <Input
                    name="note"
                    placeholder={t('rejectReason')}
                    required
                    className="w-64 flex-none"
                  />
                  <Button type="submit" variant="destructive">
                    {t('reject')}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
