import {describe, it, expect} from 'vitest';
import {
  generateInviteToken,
  hashToken,
  isRedeemable
} from '@/lib/invites/token';

describe('token de convite', () => {
  it('gera um par {token, hash} coerente', () => {
    const {token, hash} = generateInviteToken();
    expect(token).toBeTruthy();
    expect(hash).toBe(hashToken(token));
  });

  it('hashToken é determinístico', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('tokens diferentes → hashes diferentes', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it('o hash é sha256 hex (64 chars)', () => {
    expect(hashToken('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('o token não é o próprio hash (nunca persistir o token)', () => {
    const {token, hash} = generateInviteToken();
    expect(token).not.toBe(hash);
  });
});

describe('isRedeemable', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it('pendente e não expirado → redimível', () => {
    expect(isRedeemable({status: 'pending', expires_at: future})).toBe(true);
  });

  it('pendente mas expirado → não redimível', () => {
    expect(isRedeemable({status: 'pending', expires_at: past})).toBe(false);
  });

  it('já aceite → não redimível', () => {
    expect(isRedeemable({status: 'accepted', expires_at: future})).toBe(false);
  });

  it('revogado → não redimível', () => {
    expect(isRedeemable({status: 'revoked', expires_at: future})).toBe(false);
  });
});
