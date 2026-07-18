import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Autorização server-side. A verdade sobre o role vive no `profiles` (Supabase),
 * lido com service role — nunca no cliente. Usado pelo layout `(admin)` e pelas
 * Server Actions de convite.
 */

export type Session = {userId: string; email: string; role: string};

const STAFF_ROLES = ['admin', 'project_manager'];

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const {data} = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return {
    userId: user.id,
    email: user.email ?? '',
    role: data?.role ?? 'investor'
  };
}

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role);
}

/** Garante que o pedido vem de staff; lança se não. Para Server Actions. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (!session || !isStaff(session.role)) {
    throw new Error('acesso restrito a staff');
  }
  return session;
}
