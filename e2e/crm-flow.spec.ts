import {test, expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomBytes, createHash, randomUUID} from 'node:crypto';
import {config} from 'dotenv';

config({path: '.env.test'});

/**
 * Fluxo do CRM no browser: criar lead → ARRASTAR entre colunas → registar
 * follow-up → converter em convite.
 *
 * O arrastar é a razão principal deste ficheiro: é a interação central do
 * kanban e a única que nenhum teste de integração alcança (é 100% cliente).
 *
 * Na conversão semeia-se ANTES um convite pendente para o mesmo email, tal como
 * `invite-flow.spec.ts` semeia o seu: assim o botão segue o caminho da
 * deduplicação (reutiliza o convite existente) e o teste NÃO depende de um SMTP
 * real — que em CI não existe e deixaria o pedido pendurado.
 */

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

const PASSWORD = 'crm-e2e-123';

/**
 * Arrastar um cartão para uma coluna.
 *
 * NÃO se usa `locator.dragTo()`: com drag-and-drop nativo do HTML5 ele é
 * intermitente (mediu-se 1 em 3 execuções a falhar) porque comprime o gesto em
 * poucos eventos sintéticos. Os passos do rato à mão — com DOIS movimentos
 * sobre o alvo — são o padrão recomendado: o primeiro entra na zona, o segundo
 * garante o `dragover` que autoriza o largar.
 */
async function dragCardTo(
  page: import('@playwright/test').Page,
  card: import('@playwright/test').Locator,
  column: import('@playwright/test').Locator
) {
  // `hover()` (e não coordenadas fixas) porque também trata do scroll: com o
  // painel de follow-ups a crescer, o kanban desce e as colunas saem do ecrã.
  await card.hover();
  await page.mouse.down();
  await column.hover();
  await column.hover();
  await page.mouse.up();
}

test('CRM: criar lead, arrastar no kanban, follow-up e converter', async ({
  page
}) => {
  const run = randomBytes(4).toString('hex');
  const staffEmail = `crm-e2e-${run}@test.local`;
  const leadEmail = `lead-${run}@test.local`;
  const leadName = `Lead E2E ${run}`;

  // Staff (isento de KYC) com o prompt de MFA já dispensado — o foco é o CRM.
  const {data: created, error} = await admin.auth.admin.createUser({
    email: staffEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {full_name: `CRM Staff ${run}`, locale: 'pt'}
  });
  expect(error).toBeNull();
  const staffId = created?.user?.id;
  expect(staffId).toBeTruthy();
  await admin
    .from('profiles')
    .update({role: 'admin', mfa_prompt_seen: true})
    .eq('id', staffId!);

  await page.goto('/pt/login');
  await page.getByLabel('Email').fill(staffEmail);
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', {name: 'Entrar'}).click();
  await page.waitForURL('**/pt/projetos**');

  // --- Criar lead -----------------------------------------------------------
  await page.goto('/pt/crm');
  await page.getByRole('button', {name: 'Novo lead'}).click();
  const form = page.locator('form').filter({has: page.locator('#full_name')});
  await form.locator('#full_name').fill(leadName);
  await form.locator('#email').fill(leadEmail);
  await form.locator('#source').selectOption('referencia');
  await form.locator('#estimated_ticket').fill('25000');
  await form.getByRole('button', {name: 'Guardar'}).click();

  const card = page.locator('article', {hasText: leadName});
  await expect(card).toBeVisible();

  // Nasce em "Novo".
  const colOf = (label: string) =>
    page.locator('section').filter({
      has: page.getByRole('heading', {name: label, exact: true})
    });
  await expect(colOf('Novo').locator('article', {hasText: leadName})).toHaveCount(1);

  // Isola o board neste lead: o staff é criado de raiz em cada execução e é o
  // único dono do seu lead. Sem isto, o teste dependia de a base estar vazia —
  // passava em CI (base fresca) e falhava a partir da 2ª execução local.
  await page
    .getByLabel('Filtrar por responsável')
    .selectOption(`CRM Staff ${run}`);
  await expect(page.locator('article')).toHaveCount(1);

  // --- Arrastar: Novo → Qualificado ----------------------------------------
  await dragCardTo(page, card.first(), colOf('Qualificado').first());
  await expect(
    colOf('Qualificado').locator('article', {hasText: leadName})
  ).toHaveCount(1);
  await expect(colOf('Novo').locator('article', {hasText: leadName})).toHaveCount(0);

  // O arrastar tem de deixar rasto na timeline — é o que garante que não se
  // perde informação sobre COMO o lead avançou. O detalhe abre em MODAL, por
  // cima do board (sem navegação).
  await card.first().click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', {name: leadName})).toBeVisible();
  expect(page.url()).toContain('/pt/crm');
  expect(page.url()).not.toMatch(/\/pt\/crm\/.+/);
  await expect(modal.getByText('novo → qualificado')).toBeVisible();

  // --- Registar follow-up (dentro do modal) ---------------------------------
  const actForm = modal
    .locator('form')
    .filter({has: page.locator('textarea[name="body"]')});
  await actForm.locator('select[name="type"]').selectOption('chamada');
  await actForm.locator('input[name="due_at"]').fill('2026-08-05');
  await actForm.locator('textarea[name="body"]').fill('Ligar para agendar.');
  await actForm.getByRole('button', {name: 'Registar atividade'}).click();
  await expect(modal.getByText('Ligar para agendar.')).toBeVisible();

  // Fechar devolve ao board, com o cartão no sítio onde ficou.
  await modal.getByRole('button', {name: 'Fechar'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Aparece no painel de follow-ups do board.
  await page.goto('/pt/crm');
  const followups = page.locator('section', {hasText: 'Follow-ups por resolver'});
  await expect(followups.getByText(leadName)).toBeVisible();

  // --- Converter em convite (via deduplicação; ver nota no topo) ------------
  const token = randomBytes(32).toString('base64url');
  const {error: seedError} = await admin.from('invites').insert({
    id: randomUUID(),
    full_name: leadName,
    email: leadEmail,
    token_hash: createHash('sha256').update(token).digest('hex'),
    role: 'investor',
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString()
  });
  expect(seedError).toBeNull();

  await page
    .getByLabel('Filtrar por responsável')
    .selectOption(`CRM Staff ${run}`);
  await page.locator('article', {hasText: leadName}).first().click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('heading', {name: leadName})).toBeVisible();
  await detail.getByRole('button', {name: 'Converter em convite'}).click();

  // O botão dá lugar ao estado, e o lead muda de coluna.
  await expect(
    detail.getByRole('button', {name: 'Converter em convite'})
  ).toHaveCount(0);
  await expect(detail.locator('select[name="stage"]')).toHaveValue(
    'convite_enviado'
  );

  // O modal é um atalho, não uma substituição: a página do lead continua a
  // servir os links diretos (é para lá que apontam os follow-ups do board).
  const {data: row} = await admin
    .from('crm_leads')
    .select('id')
    .eq('email', leadEmail)
    .single();
  await page.goto(`/pt/crm/${row!.id}`);
  await expect(page.getByRole('heading', {name: leadName})).toBeVisible();
  await expect(page.getByText('Ligar para agendar.')).toBeVisible();

  // Não se criou convite duplicado — a deduplicação reutilizou o pendente.
  const {count} = await admin
    .from('invites')
    .select('id', {count: 'exact', head: true})
    .eq('email', leadEmail);
  expect(count).toBe(1);

  // --- Eliminar o lead (dois passos: pedir e confirmar) ---------------------
  // Feito a partir da página, que é onde o teste já está; o modal usa o mesmo
  // componente. O primeiro clique só revela a confirmação.
  await page.getByRole('button', {name: 'Eliminar lead'}).click();
  await expect(page.getByText('Eliminar definitivamente?')).toBeVisible();
  await page.getByRole('button', {name: 'Eliminar lead'}).click();

  // Volta ao pipeline e o cartão desapareceu do board. Sem filtrar por
  // responsável: apagado o único lead, o board pode ficar vazio e aí nem há
  // filtros para escolher.
  await page.waitForURL('**/pt/crm');
  await expect(page.locator('article', {hasText: leadName})).toHaveCount(0);

  // A lead saiu mesmo da base, e as atividades foram com ela.
  const {count: leadsLeft} = await admin
    .from('crm_leads')
    .select('id', {count: 'exact', head: true})
    .eq('email', leadEmail);
  expect(leadsLeft).toBe(0);
  const {count: actsLeft} = await admin
    .from('crm_activities')
    .select('id', {count: 'exact', head: true})
    .eq('lead_id', row!.id);
  expect(actsLeft).toBe(0);
});
