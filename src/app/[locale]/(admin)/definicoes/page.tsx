import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {saveSettingAction} from './actions';
import {SettingField} from './SettingField';
import {GROUP_LABEL, GROUP_ORDER, specFor, type SettingGroup} from './registry';
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

  // Agrupadas por área em vez de por ordem alfabética: quem vem mudar o
  // montante mínimo não quer passar os olhos por definições de KYC pelo
  // caminho. Um grupo sem definições não é renderizado.
  const porGrupo = new Map<SettingGroup, SettingRowData[]>();
  for (const s of settings) {
    const g = specFor(s.key).group;
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), s]);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">{t('hint')}</p>
      </header>

      {GROUP_ORDER.filter((g) => porGrupo.has(g)).map((grupo) => (
        <Card key={grupo} className="py-0">
          <CardHeader className="border-b border-border px-6 py-4 [.border-b]:pb-4">
            <CardTitle className="text-xs font-bold tracking-[0.12em] text-ink-muted uppercase">
              {t(GROUP_LABEL[grupo])}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {porGrupo.get(grupo)!.map((s) => (
              <SettingField
                // A chave inclui o VALOR: quando a gravação revalida a página e
                // o servidor manda um valor diferente, o React remonta o campo
                // em vez de tentar reconciliar estado de cliente com dados
                // novos. Sem isto os controlos ficavam dessincronizados do
                // rascunho — o campo mostrava 25 e a caixa "sem limite"
                // aparecia marcada ao mesmo tempo.
                key={`${s.key}:${JSON.stringify(s.value)}`}
                settingKey={s.key}
                description={s.description}
                value={JSON.stringify(s.value)}
                spec={specFor(s.key)}
                action={saveSettingAction.bind(null, loc, s.key)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
