'use server';

import {
  completePasswordReset,
  type CompleteResetReason
} from '@/lib/auth/password-reset';
import {MIN_PASSWORD_LENGTH} from '@/lib/invites/accept';

/** Chaves do namespace `NewPassword` — o formulário mostra-as tal e qual. */
export type NewPasswordError = 'mismatch' | 'weak' | 'invalidLink' | 'error';
export type NewPasswordState = {done: boolean; error: NewPasswordError | null};

const REASON_TO_KEY: Record<CompleteResetReason, NewPasswordError> = {
  invalid: 'invalidLink',
  weak_password: 'weak',
  error: 'error'
};

export async function completePasswordResetAction(
  _prev: NewPasswordState,
  formData: FormData
): Promise<NewPasswordState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  // A confirmação é puramente de interface (o serviço só conhece uma password),
  // por isso é aqui que se verifica.
  if (password !== confirm) return {done: false, error: 'mismatch'};
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {done: false, error: 'weak'};
  }
  if (!token) return {done: false, error: 'invalidLink'};

  try {
    const result = await completePasswordReset({token, password});
    if (!result.ok) return {done: false, error: REASON_TO_KEY[result.reason]};
    return {done: true, error: null};
  } catch {
    return {done: false, error: 'error'};
  }
}
