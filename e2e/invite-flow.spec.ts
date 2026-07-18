import {test, expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomBytes, createHash} from 'node:crypto';
import {authenticator} from 'otplib';
import {config} from 'dotenv';

// Garante as chaves locais também no worker do Playwright.
config({path: '.env.test'});

// E2E do fluxo completo: convite → registo → login → enrolment MFA → home.
// Semeia-se o convite diretamente na BD (service role) com um token conhecido,
// para controlar o link sem depender do email.

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

const PASSWORD = 'e2e-secret-123';

test('convite → registo → login → MFA → área privada', async ({page}) => {
  const run = randomBytes(4).toString('hex');
  const email = `e2e-${run}@test.local`;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const {error: seedError} = await admin.from('invites').insert({
    full_name: 'Investidor E2E',
    email,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 14 * 864e5).toISOString()
  });
  expect(seedError).toBeNull();

  // DIAGNÓSTICO: confirmar que o seed está na BD que o servidor lê.
  const {data: seedCheck, error: seedReadError} = await admin
    .from('invites')
    .select('token_hash, status, expires_at')
    .eq('token_hash', tokenHash)
    .single();
  console.log('SEED_URL', url);
  console.log('SEED_CHECK', JSON.stringify(seedCheck), 'err', JSON.stringify(seedReadError));

  // 1) Aceitar convite: definir password + aceitar termos.
  await page.goto(`/pt/aceitar-convite/${token}`);
  await page.waitForLoadState('networkidle');
  console.log('ACCEPT_URL', page.url());
  console.log('ACCEPT_BODY', await page.locator('body').innerText());
  await expect(page.getByRole('heading', {name: 'Criar a sua conta'})).toBeVisible();
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Criar conta'}).click();

  // 2) Redirecionado para o login.
  await page.waitForURL('**/pt/login**');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', {name: 'Entrar'}).click();

  // 3) Middleware força enrolment MFA (aal1 → /mfa). O enrolment (QR + secret)
  // resolve de forma assíncrona depois de montar a página.
  await page.waitForURL('**/pt/mfa**');
  const secretLoc = page.locator('code');
  await expect(secretLoc).toBeVisible();
  const secret = (await secretLoc.innerText()).trim();
  expect(secret.length).toBeGreaterThan(0);

  // 4) Gerar o código TOTP e confirmar → sobe a aal2.
  await page.getByLabel('Código').fill(authenticator.generate(secret));
  await page.getByRole('button', {name: 'Confirmar'}).click();

  // 5) Chega à área privada, com sessão iniciada.
  await page.waitForURL((u) => /\/pt(\/?$|\?)/.test(u.pathname + u.search));
  await expect(page.getByText(email)).toBeVisible();
});
