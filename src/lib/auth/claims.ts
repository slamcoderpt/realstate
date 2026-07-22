/**
 * Leitura dos claims que o Custom Access Token Hook injeta no JWT
 * (`user_role`, `kyc_status`) mais os standard (`aal`).
 *
 * Descodifica o payload SEM verificar a assinatura — é seguro porque só se usa
 * DEPOIS de `getUser()` ter validado o mesmo token contra o Supabase. A RLS
 * continua a ser a barreira real; estes claims servem só gating de UI/redirect.
 */

export type AppClaims = {
  user_role?: string;
  kyc_status?: string;
  aal?: string;
};

export function decodeAccessToken(token: string | null | undefined): AppClaims {
  if (!token) return {};
  const payload = token.split('.')[1];
  if (!payload) return {};
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('binary');
    return JSON.parse(json) as AppClaims;
  } catch {
    return {};
  }
}
