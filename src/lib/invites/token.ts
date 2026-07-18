import {createHash, randomBytes} from 'node:crypto';

/**
 * Convites: o token viaja no link enviado por email; na base de dados guardamos
 * apenas o seu hash. Um vazamento da tabela `invites` não permite, assim, forjar
 * a aceitação de um convite — é preciso o token em claro, que só o destinatário
 * do email tem.
 */

export type InviteToken = {
  /** Segredo em claro — vai no link, nunca é persistido. */
  token: string;
  /** sha256(token) em hex — é isto que fica em `invites.token_hash`. */
  hash: string;
};

/** Gera um token de convite e o respetivo hash. 32 bytes → base64url. */
export function generateInviteToken(): InviteToken {
  const token = randomBytes(32).toString('base64url');
  return {token, hash: hashToken(token)};
}

/** Hash determinístico usado tanto ao criar como ao validar um convite. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type InviteState = {
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string | Date;
};

/** Um convite é redimível se está pendente e ainda não expirou. */
export function isRedeemable(invite: InviteState, now: Date = new Date()): boolean {
  if (invite.status !== 'pending') return false;
  return new Date(invite.expires_at).getTime() > now.getTime();
}
