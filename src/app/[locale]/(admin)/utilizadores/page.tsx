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
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      {err === 'self_demotion' && (
        <p role="alert" className="text-sm text-red-600">
          {t('cannotDemoteSelf')}
        </p>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('email')}</TableHead>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('kyc')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
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
                <TableCell>{u.email || '—'}</TableCell>
                <TableCell>
                  <select
                    name="role"
                    form={`role-${u.id}`}
                    defaultValue={u.role}
                    aria-label={t('role')}
                    className="h-9 rounded-md border px-2 text-sm"
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role_${r}` as 'role_investor')}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.kyc_status}</Badge>
                </TableCell>
                <TableCell>
                  {new Date(u.created_at).toLocaleDateString(loc)}
                </TableCell>
                <TableCell>
                  <Button type="submit" size="sm" form={`role-${u.id}`}>
                    {t('save')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
