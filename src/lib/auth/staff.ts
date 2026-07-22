import 'server-only';
import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {decodeAccessToken} from '@/lib/auth/claims';

/**
 * Autorização server-side. O role vem do claim `user_role` do JWT (injetado pelo
 * Custom Access Token Hook), lido localmente após getUser() validar o token —
 * evita uma query a `profiles` a cada navegação. Fallback à BD para tokens
 * antigos sem o claim. A RLS continua a ser a barreira real de dados; para
 * escrita, `requireAdmin`/`requireStaff` abaixo bastam-se por este role (que só
 * fica stale numa despromoção, evento raro; a RLS nunca é enganada).
 *
 * `cache()` deduplica a chamada dentro de um mesmo pedido (AppShell + páginas
 * partilham um só getUser + decode).
 */

export type Session = {
  userId: string;
  email: string;
  role: string;
  /** Nível de asseguração (aal1/aal2) lido do JWT. */
  aal: string | null;
};

const STAFF_ROLES = ['admin', 'project_manager'];

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: {session}
  } = await supabase.auth.getSession();
  const claims = decodeAccessToken(session?.access_token);

  let role = claims.user_role;
  if (role === undefined) {
    // Token antigo (pré-hook): cai para a BD.
    const admin = createAdminClient();
    const {data} = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    role = data?.role ?? 'investor';
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role: role ?? 'investor',
    aal: claims.aal ?? null
  };
});

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Quem pode ler extratos da conta dedicada SEM ter fundos confirmados no
 * projeto: staff + `auditor`.
 *
 * Predicado à parte, e não `auditor` dentro de `STAFF_ROLES`: a spec dá ao
 * auditor leitura read-only sobre extratos e documentos fiscais, e mais nada.
 * Alargar `isStaff` abriria de uma vez o back-office (`requireStaff`, layout
 * `(admin)`), KYC, gestão de projetos e subscrições. Espelha exatamente a
 * política RLS "statements: auditor lê" (20260721120000).
 */
export function canReadStatements(role: string): boolean {
  return isStaff(role) || role === 'auditor';
}

/**
 * O audit_log é legível por `admin` e `auditor` — NÃO por `project_manager`
 * (é o que a política "audit: admin e auditor leem" diz desde a Fatia 0). Por
 * isso esta página NÃO pode viver sob o route group (admin), cujo layout deixa
 * entrar project_manager: um PM veria a página e uma tabela vazia.
 */
export function canReadAudit(role: string): boolean {
  return role === 'admin' || role === 'auditor';
}

/** Garante que o pedido vem de staff; lança se não. Para Server Actions. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (!session || !isStaff(session.role)) {
    throw new Error('acesso restrito a staff');
  }
  return session;
}

/**
 * Garante `admin`, não apenas staff. `requireStaff()` deixaria passar
 * `project_manager`, que não deve mexer em parâmetros legais/operacionais
 * (montante mínimo, limite de investidores, versões de termos aceites).
 */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    throw new Error('acesso restrito a administradores');
  }
  return session;
}
