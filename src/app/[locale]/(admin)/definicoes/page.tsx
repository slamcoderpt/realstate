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

const TH =
  'h-12 px-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted';

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
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        <p className="max-w-3xl text-sm text-ink-soft">{t('hint')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* O `<Table>` traz o seu próprio contentor com `overflow-x-auto`;
              anula-se aqui para que quem role seja este invólucro — é ele que
              tem a barra fina de `.scroll-soft`. */}
          <div className="scroll-soft overflow-x-auto [&>div]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-secondary hover:bg-secondary">
                  <TableHead className={TH}>{t('key')}</TableHead>
                  <TableHead className={TH}>{t('description')}</TableHead>
                  <TableHead className={TH}>{t('value')}</TableHead>
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
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
