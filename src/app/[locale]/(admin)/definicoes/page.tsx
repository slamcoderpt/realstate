import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {saveSettingAction} from './actions';
import {SettingRow} from './SettingRow';
import type {Locale} from '@/lib/mail/templates';

// Parâmetros vivos da plataforma + guard por sessão: render dinâmico.
export const dynamic = 'force-dynamic';

type SettingRowData = {key: string; description: string; value: unknown};

export default async function DefinicoesPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';

  // O layout (admin) só garante staff — um project_manager chegaria aqui.
  // Estes são parâmetros legais/operacionais: só admin.
  const session = await getSession();
  if (!session || session.role !== 'admin') notFound();

  const t = await getTranslations('SettingsAdmin');
  const db = createAdminClient();
  const {data} = await db
    .from('platform_settings')
    .select('key, description, value')
    .order('key');
  const settings = (data ?? []) as SettingRowData[];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('hint')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('key')}</TableHead>
                <TableHead>{t('description')}</TableHead>
                <TableHead>{t('value')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((s) => (
                <SettingRow
                  key={s.key}
                  settingKey={s.key}
                  description={s.description}
                  value={JSON.stringify(s.value)}
                  action={saveSettingAction.bind(null, loc, s.key)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
