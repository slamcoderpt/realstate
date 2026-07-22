import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Gestão de utilizadores (server-only, service role). A escrita de `role` passa
 * obrigatoriamente por aqui: o trigger `protect_profile_fields` reverte
 * `role`/`kyc_status` para qualquer `current_user` que não seja service_role /
 * postgres, pelo que um cliente com sessão não consegue mudar papéis nem que
 * tente. O `audit_log` é preenchido pelo trigger `profiles_audit` — não se
 * escreve auditoria à mão aqui, ficariam duas linhas por alteração.
 */

export const USER_ROLES = [
  'investor',
  'project_manager',
  'admin',
  'auditor'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (USER_ROLES as readonly unknown[]).includes(value);
}

export type UserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  kyc_status: string;
  created_at: string;
};

/**
 * O email vive em `auth.users` e o resto em `public.profiles`; não há join
 * possível via PostgREST. Puxamos as duas listas por inteiro e cruzamo-las em
 * memória por id — um `getUserById` por linha seriam N pedidos HTTP para uma
 * página que já lista centenas de utilizadores.
 */
export async function listUsers(): Promise<UserRow[]> {
  const profiles = await allProfiles();
  const emails = await allAuthEmails();

  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: emails.get(p.id) ?? '',
    role: p.role as UserRole,
    kyc_status: p.kyc_status,
    created_at: p.created_at
  }));
}

/**
 * O PostgREST tem tecto de linhas por resposta (`max_rows = 1000` em
 * supabase/config.toml) e NÃO sinaliza truncagem: um `select` sem `range`
 * devolve 1000 linhas e um `error` nulo, exactamente como se fossem todas.
 * Daí paginar com `.range()` até uma página vir incompleta.
 */
const DB_PAGE_SIZE = 1000;

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
  kyc_status: string;
  created_at: string;
};

async function allProfiles(): Promise<ProfileRow[]> {
  const db = createAdminClient();
  const out: ProfileRow[] = [];

  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const {data, error} = await db
      .from('profiles')
      .select('id, full_name, role, kyc_status, created_at')
      .order('created_at', {ascending: false})
      .order('id', {ascending: false}) // desempate estável entre páginas
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as ProfileRow[];
    out.push(...page);
    if (page.length < DB_PAGE_SIZE) break;
  }

  return out;
}

/**
 * `auth.admin.listUsers()` é paginado e traz 50 por omissão — sem paginar, a
 * página mostrava utilizadores sem email a partir do 51.º e ninguém dava por
 * ela. Pedimos páginas grandes e paramos quando uma vem incompleta (o GoTrue
 * pode impor um tecto a `perPage`, e o ciclo aguenta esse caso).
 */
const AUTH_PAGE_SIZE = 1000;

async function allAuthEmails(): Promise<Map<string, string>> {
  const db = createAdminClient();
  const emails = new Map<string, string>();

  for (let page = 1; ; page++) {
    const {data, error} = await db.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE
    });
    if (error) throw error;

    const users = data?.users ?? [];
    for (const u of users) emails.set(u.id, u.email ?? '');
    if (users.length < AUTH_PAGE_SIZE) break;
  }

  return emails;
}

export type ChangeUserRoleInput = {
  actorId: string;
  targetId: string;
  role: UserRole;
};

/**
 * Muda o papel de um utilizador.
 *
 * O ator NÃO se pode despromover a si próprio: com um único administrador — que
 * é exactamente o estado inicial de produção — bastaria um clique distraído para
 * a plataforma ficar sem ninguém que consiga voltar a promover alguém, e a
 * recuperação seria SQL cru na base de dados. `admin → admin` sobre a própria
 * linha passa: não retira privilégio nenhum.
 */
export async function changeUserRole({
  actorId,
  targetId,
  role
}: ChangeUserRoleInput): Promise<UserRow> {
  if (!isUserRole(role)) {
    throw new Error(`papel inválido: ${String(role)}`);
  }
  if (actorId === targetId && role !== 'admin') {
    throw new Error(
      'não é possível retirar a si próprio o papel de administrador'
    );
  }

  const db = createAdminClient();
  const {data, error} = await db
    .from('profiles')
    .update({role})
    .eq('id', targetId)
    .select('id, full_name, role, kyc_status, created_at')
    .single();
  if (error) throw error;

  const {data: authUser} = await db.auth.admin.getUserById(targetId);

  return {
    id: data.id,
    full_name: data.full_name,
    email: authUser?.user?.email ?? '',
    role: data.role as UserRole,
    kyc_status: data.kyc_status,
    created_at: data.created_at
  };
}
