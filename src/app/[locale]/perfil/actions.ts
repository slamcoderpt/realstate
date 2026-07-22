'use server';

import {createClient} from '@supabase/supabase-js';
import {revalidatePath} from 'next/cache';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {MIN_PASSWORD_LENGTH} from '@/lib/invites/accept';

/**
 * Ações do perfil do próprio utilizador.
 *
 * Duas regras atravessam este ficheiro:
 *
 * 1. **O id vem SEMPRE da sessão.** Nunca de um campo do formulário — um
 *    `userId` no payload seria um `.eq('id', ...)` controlado pelo cliente,
 *    isto é, editar o perfil de qualquer pessoa. Como a escrita é feita com
 *    service role (o grant de UPDATE de `authenticated` sobre `profiles` está
 *    revogado — ver `20260721083458_restore_explicit_grants.sql` e
 *    `tests/rls/grants-hardening.test.ts`), aqui não há RLS a apanhar o erro:
 *    esta função É o controlo de acesso.
 *
 * 2. **Devolvem resultado, não lançam.** Um `throw` numa Server Action sobe ao
 *    error boundary e troca a página por um ecrã de erro; em produção a
 *    mensagem é ainda redigida para um digest. Sem resultado não haveria como
 *    mostrar `Profile.saved` / `Profile.saveError` / `Profile.wrongPassword`.
 */

export type UpdateProfileState = {ok: boolean; error?: 'saveError'};
export type ChangePasswordState = {
  ok: boolean;
  error?: 'saveError' | 'wrongPassword';
};

/** Limite defensivo: `profiles.full_name` é text sem limite. */
const FULL_NAME_MAX = 120;

export async function updateProfileAction(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const session = await getSession();
  if (!session) return {ok: false, error: 'saveError'};

  const fullName = String(formData.get('fullName') ?? '')
    .trim()
    .slice(0, FULL_NAME_MAX);
  // O idioma é fechado à lista da coluna (`check (preferred_locale in
  // ('pt','en'))`): qualquer outro valor rebentaria o UPDATE com um erro de
  // constraint em vez de uma recusa legível.
  const preferredLocale = formData.get('language') === 'en' ? 'en' : 'pt';

  // Nome vazio apagaria a identificação do utilizador em todo o back-office
  // (listagens, auditoria) sem que ninguém tivesse pedido isso.
  if (!fullName) return {ok: false, error: 'saveError'};

  const db = createAdminClient();
  const {error} = await db
    .from('profiles')
    .update({full_name: fullName, preferred_locale: preferredLocale})
    .eq('id', session.userId);
  if (error) return {ok: false, error: 'saveError'};

  // Rota dinâmica: o caminho concreto é no-op, o padrão do segmento é que conta.
  revalidatePath('/[locale]/perfil', 'page');
  return {ok: true};
}

/**
 * Troca de palavra-passe COM verificação da atual.
 *
 * O `updateUser({password})` do Supabase não pede a antiga: quem apanhasse uma
 * sessão aberta trocava a palavra-passe e trancava o verdadeiro dono fora da
 * conta sem nunca a ter sabido. A verificação é feita tentando autenticar num
 * cliente descartável (o único mecanismo que o GoTrue oferece para "esta
 * palavra-passe está certa?") e só depois se escreve.
 *
 * A escrita vai por service role e não pelo cliente com os cookies do pedido:
 * assim a ação não depende do contexto de pedido do Next para nada além da
 * sessão, e o caminho é o mesmo que os testes de integração exercitam.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session?.email) return {ok: false, error: 'saveError'};

  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  // Mesmo mínimo do aceitar-convite: importado, não recopiado — duas cópias do
  // número acabam sempre por divergir.
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {ok: false, error: 'saveError'};
  }
  if (newPassword !== confirmPassword) return {ok: false, error: 'saveError'};

  // Cliente descartável, com a chave anónima: autenticar-se aqui não pode
  // tocar na sessão do pedido (sem persistência, sem refresh automático).
  const probe = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {auth: {persistSession: false, autoRefreshToken: false}}
  );
  const {error: signInError} = await probe.auth.signInWithPassword({
    email: session.email,
    password: currentPassword
  });
  if (signInError) return {ok: false, error: 'wrongPassword'};

  // `scope: 'local'` é obrigatório: o default do supabase-js é 'global' e
  // revogaria TODAS as sessões do utilizador — incluindo o browser de onde
  // este pedido veio, expulsando-o a meio de uma operação bem sucedida.
  await probe.auth.signOut({scope: 'local'});

  const db = createAdminClient();
  const {error} = await db.auth.admin.updateUserById(session.userId, {
    password: newPassword
  });
  if (error) return {ok: false, error: 'saveError'};

  return {ok: true};
}
