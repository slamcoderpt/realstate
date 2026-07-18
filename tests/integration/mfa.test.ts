import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {authenticator} from 'otplib';
import {createTestUser, signInAs} from '../rls/helpers';

const run = randomUUID().slice(0, 8);
const email = `mfa-${run}@test.local`;

beforeAll(async () => {
  await createTestUser(email);
});

describe('MFA TOTP (enroll → verify → aal2)', () => {
  it('sessão de password é aal1 e sobe a aal2 após verificar o TOTP', async () => {
    const client = await signInAs(email);

    // Password só → aal1.
    const {data: before} =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(before!.currentLevel).toBe('aal1');
    expect(before!.nextLevel).toBe('aal1'); // sem fatores ainda

    // Enrolment TOTP.
    const {data: enrolled, error: enrollError} =
      await client.auth.mfa.enroll({factorType: 'totp'});
    expect(enrollError).toBeNull();
    const factorId = enrolled!.id;
    const secret = enrolled!.totp.secret;
    expect(secret).toBeTruthy();

    // Gera o código a partir do secret (como faria a app autenticadora).
    const code = authenticator.generate(secret);
    const {data: challenge} = await client.auth.mfa.challenge({factorId});
    const {error: verifyError} = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge!.id,
      code
    });
    expect(verifyError).toBeNull();

    // Sessão passa a aal2.
    const {data: after} =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(after!.currentLevel).toBe('aal2');
  });

  it('código TOTP inválido é rejeitado', async () => {
    const other = `mfa2-${run}@test.local`;
    await createTestUser(other);
    const client = await signInAs(other);

    const {data: enrolled} = await client.auth.mfa.enroll({factorType: 'totp'});
    const {data: challenge} = await client.auth.mfa.challenge({
      factorId: enrolled!.id
    });
    const {error} = await client.auth.mfa.verify({
      factorId: enrolled!.id,
      challengeId: challenge!.id,
      code: '000000'
    });
    expect(error).not.toBeNull();
  });
});
