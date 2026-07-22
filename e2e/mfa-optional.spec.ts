import {test, expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {config} from 'dotenv';

config({path: '.env.test'});

// MFA é opcional: no 1º login sem fator aparece o ecrã de configuração com a
// opção de ignorar. Ao ignorar, o utilizador entra na app (aal1) e não volta a
// ser incomodado. Usa-se um staff (isento de KYC) para a asserção terminar no
// dashboard e não no gate de KYC.

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

const PASSWORD = 'e2e-skip-123';

test('MFA opcional: staff ignora a configuração, entra e não é reincomodado', async ({
  page
}) => {
  const run = randomBytes(4).toString('hex');
  const email = `skip-${run}@test.local`;

  const {data: created, error} = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {full_name: 'Skip Staff', locale: 'pt'}
  });
  expect(error).toBeNull();
  await admin.from('profiles').update({role: 'admin'}).eq('id', created!.user.id);

  // Login com password.
  await page.goto('/pt/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', {name: 'Entrar'}).click();

  // 1º login sem fator → ecrã de configuração de MFA.
  await page.waitForURL('**/pt/mfa**');
  await expect(page.getByText('Verificação em dois passos')).toBeVisible();

  // Ignorar.
  await page.getByRole('button', {name: 'Configurar depois'}).click();

  // Entra na app: a casca aparece (staff em aal1 que dispensou o prompt).
  await page.waitForURL((u) => /\/pt(\/?$|\?)/.test(u.pathname + u.search));
  await expect(page.getByRole('link', {name: 'Projetos'})).toBeVisible();

  // Navegar de novo NÃO volta a /mfa (prompt já visto).
  await page.goto('/pt/projetos');
  await expect(page).toHaveURL(/\/pt\/projetos/);
  await expect(page).not.toHaveURL(/\/pt\/mfa/);
});
