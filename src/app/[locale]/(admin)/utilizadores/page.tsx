import {getTranslations} from 'next-intl/server';
import {redirect} from '@/i18n/navigation';
import {getSession} from '@/lib/auth/staff';
import {listUsers, USER_ROLES} from '@/lib/users/service';
import {changeUserRoleAction} from './actions';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
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
const SELECT =
  'h-9 rounded-xl border border-input bg-white px-3 text-sm text-ink shadow-[0_1px_2px_rgba(7,18,53,0.04)] outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default async function UtilizadoresPage({
  params,
  searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{err?: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const {err} = await searchParams;

  // O layout (admin) só garante *staff* — e project_manager é staff. Mudar
  // papéis é exclusivo de admin, por isso a página revalida por sua conta.
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    redirect({href: '/', locale: loc});
  }

  const t = await getTranslations('UsersAdmin');
  const users = await listUsers();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {t('title')}
      </h1>

      {err && (
        <p
          role="alert"
          className="rounded-[var(--radius-card)] border border-destructive/25 bg-destructive/5 px-5 py-3.5 text-sm font-semibold text-destructive"
        >
          {err === 'self_demotion' ? t('cannotDemoteSelf') : t('saveError')}
        </p>
      )}

      {users.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-card px-6 py-14 text-center text-sm text-ink-muted shadow-[var(--shadow-card)]">
          {t('empty')}
        </p>
      ) : (
        <div className={TABLE_PANEL}>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-secondary hover:bg-secondary">
                <TableHead className={TH}>{t('name')}</TableHead>
                <TableHead className={TH}>{t('email')}</TableHead>
                <TableHead className={TH}>{t('role')}</TableHead>
                <TableHead className={TH}>{t('kyc')}</TableHead>
                <TableHead className={TH}>{t('createdAt')}</TableHead>
                <TableHead className={TH} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="border-border hover:bg-brand-50/60">
                  <TableCell className={`${TD} font-semibold text-ink`}>
                    {/* Uma <form> não pode envolver <td>s. Fica vazia aqui e o
                        select/botão ligam-se-lhe pelo atributo `form`. O `id` do
                        alvo é argumento ligado no servidor; do formulário só vem
                        o papel — o ator sai sempre da sessão. */}
                    <form
                      id={`role-${u.id}`}
                      action={saveRole.bind(null, loc, u.id)}
                    />
                    {u.full_name || '—'}
                  </TableCell>
                  <TableCell className={TD}>{u.email || '—'}</TableCell>
                  <TableCell className={TD}>
                    <select
                      name="role"
                      form={`role-${u.id}`}
                      defaultValue={u.role}
                      aria-label={t('role')}
                      className={SELECT}
                    >
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role_${r}` as 'role_investor')}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className={TD}>
                    <Badge variant="secondary">{u.kyc_status}</Badge>
                  </TableCell>
                  <TableCell className={`${TD} tabular-nums`}>
                    {new Date(u.created_at).toLocaleDateString(loc)}
                  </TableCell>
                  <TableCell className={`${TD} text-right`}>
                    <Button type="submit" size="sm" form={`role-${u.id}`}>
                      {t('save')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}

/**
 * Um erro lançado numa Server Action sobe ao error boundary e troca a página
 * inteira por um ecrã de erro. `changeUserRoleAction` devolve um resultado em
 * vez de lançar, e a recusa vem para aqui como `?err=` — mantendo a página
 * inteiramente Server Component (nada de `useActionState`, nada de estado no
 * cliente) e o URL sem qualquer identificador de utilizador.
 */
async function saveRole(
  locale: Locale,
  targetId: string,
  formData: FormData
): Promise<void> {
  'use server';
  const result = await changeUserRoleAction(locale, targetId, formData);
  if (!result.ok) {
    redirect({href: `/utilizadores?err=${result.error}`, locale});
  }
}
