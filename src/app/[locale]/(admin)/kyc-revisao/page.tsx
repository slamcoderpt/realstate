import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {listPendingKyc} from '@/lib/kyc/service';
import {approveKycAction, rejectKycAction} from './actions';
import {Button} from '@/components/ui/button';
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
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      {pending.length === 0 && (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      )}
      <div className="space-y-4">
        {pending.map((sub) => (
          <Card key={sub.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {sub.full_name}{' '}
                <Badge variant="secondary">{sub.citizen_type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-neutral-600">
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
                    className="text-sm text-blue-700 underline"
                  >
                    {t(`doc_${d.doc_type}` as 'doc_cartao_cidadao')}
                  </a>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
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
                  className="flex items-end gap-2"
                >
                  <input
                    name="note"
                    placeholder={t('rejectReason')}
                    required
                    className="rounded-md border p-2 text-sm"
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
