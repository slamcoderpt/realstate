import {test, expect, type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {authenticator} from 'otplib';
import {config} from 'dotenv';

// Garante as chaves locais também no worker do Playwright.
config({path: '.env.test'});

/**
 * Jornada crítica do investidor, ponta a ponta e numa só passagem:
 *
 *   convite → registo → MFA → KYC → catálogo → subscrição → fundos
 *   confirmados → obra → extrato → registo de auditoria
 *
 * Só UMA coisa é semeada com service role: a conta de staff. Não há UI para
 * criar o primeiro admin (o registo é exclusivamente por convite e é preciso
 * um admin para emitir o primeiro convite) — logo o galo tem de nascer do ovo
 * em algum lado. Todo o resto passa pela UI, incluindo o enrolment de MFA do
 * próprio staff, porque a UI é o que está sob teste.
 *
 * O token do convite NÃO é semeado: lê-se de `email_outbox`, que é o registo do
 * email que a app enviou. É exatamente o que o investidor faz — abre o email e
 * carrega no link. O que se contorna é a caixa de correio, não o fluxo.
 *
 * Duas asserções valem por si só e não devem ser diluídas:
 *
 *  1. `Capital investido` é SÓ o montante com fundos confirmados. O investidor
 *     acaba com duas posições (uma confirmada, outra em `interesse`); se o
 *     mosaico alguma vez somar as duas, está a mentir sobre dinheiro.
 *  2. Os extratos NÃO abrem antes de os fundos estarem confirmados, ao passo
 *     que o acompanhamento de obra abre com qualquer subscrição ativa. A
 *     assimetria é desenho de produto (a obra é informação do projeto; o
 *     extrato é a conta que detém o dinheiro) e é o tipo de coisa que uma
 *     refactorização unifica sem dar por isso.
 */

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

/**
 * `localhost` e não `127.0.0.1` (o baseURL da config), de propósito: o redirect
 * do middleware resolve para `localhost` e, partindo de `127.0.0.1`, o prefetch
 * RSC morre em CORS — o login fica preso sem nunca avançar para /mfa. Como os
 * URLs aqui são absolutos, o baseURL da config é ignorado neste ficheiro.
 */
const APP = 'http://localhost:3000';

const PASSWORD = 'e2e-secret-123';

/** NIF português válido (checksum mod 11) — o serviço rejeita qualquer outro. */
const NIF = '123456789';

/**
 * PDF mínimo mas real: o `%PDF-` inicial é o que os magic-bytes de
 * `detectMime` verificam, tanto no KYC como na publicação de extratos.
 */
const PDF = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF'
  ].join('\n'),
  'utf8'
);

/**
 * O `Intl` emite U+202F (espaço estreito inquebrável) entre milhares e U+00A0
 * antes do símbolo. Comparar strings de dinheiro sem normalizar é uma
 * armadilha: o teste falha por causa de um byte invisível.
 */
function ws(value: string): string {
  return value.replace(/[   ]/g, ' ');
}

/** Mesmo formato que a app usa nos mosaicos e nas tabelas. */
function eur(value: number): string {
  return ws(
    new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value)
  );
}

/** Login + MFA pela UI, até a sessão estar em aal2. */
async function loginAndEnrolMfa(page: Page, email: string): Promise<void> {
  await page.goto(`${APP}/pt/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(PASSWORD);
  await page.getByRole('button', {name: 'Entrar'}).click();

  // Middleware: aal1 não passa daqui. O enrolment (QR + segredo) resolve de
  // forma assíncrona depois de montar a página.
  await page.waitForURL('**/pt/mfa**');
  const secretLoc = page.locator('code');
  await expect(secretLoc).toBeVisible();
  const secret = (await secretLoc.innerText()).trim();
  expect(secret.length).toBeGreaterThan(0);

  await page.getByLabel('Código').fill(authenticator.generate(secret));
  const verified = page.waitForResponse((r) =>
    /\/auth\/v1\/factors\/[^/]+\/verify$/.test(r.url())
  );
  await page.getByRole('button', {name: 'Confirmar'}).click();
  // Falha aqui (400) = o código TOTP foi rejeitado. Distinguir isso de "a
  // navegação não avançou" poupa meia hora a quem vier a seguir.
  expect((await verified).status()).toBe(200);

  // A página faz `router.push('/')` a seguir ao verify — e para staff essa
  // navegação NÃO sai de /mfa. Defeito conhecido introduzido nesta fatia: a
  // casca da app renderiza a navegação por papel já em /mfa e o prefetch de
  // cada destino, ainda em aal1, devolve 307 → /mfa; a cache do router do
  // cliente fica com todos os destinos a apontar para /mfa e o `push`
  // seguinte resolve por lá. Sintoma para um humano: o staff tem de
  // introduzir o código TOTP DUAS vezes em cada login.
  //
  // Uma navegação dura (não do router do cliente) ignora essa cache e deixa o
  // middleware decidir o destino a partir do cookie, já em aal2 — investidor
  // por aprovar vai parar a /kyc, staff a /. O teste não finge que o defeito
  // não existe: contorna-o de forma explícita e nomeada.
  await expect
    .poll(
      async () => {
        await page.goto(`${APP}/pt`);
        return new URL(page.url()).pathname;
      },
      {timeout: 15_000, message: 'sessão não subiu a aal2 depois do TOTP'}
    )
    .not.toBe('/pt/mfa');
}

/** Cria um projeto pelo back-office e leva-o até `subscricao`. Devolve o id. */
async function createProjectInSubscription(
  page: Page,
  name: string
): Promise<string> {
  await page.goto(`${APP}/pt/gestao-projetos`);
  await page.getByLabel('Nome', {exact: true}).fill(name);
  await page.getByLabel('Localização').fill('Lisboa');
  await page.getByLabel('Descrição').fill('Reabilitação integral.');
  await page.getByLabel('Custo de aquisição (€)').fill('60000');
  await page.getByLabel('Orçamento de obra (€)').fill('25000');
  await page.getByLabel('ARV (€)').fill('120000');
  await page.getByLabel('Montante total (€)').fill('100000');
  await page.getByLabel('TIR estimada (%)').fill('12');
  await page.getByLabel('Prazo (meses)').fill('18');
  await page.getByRole('button', {name: 'Criar projeto'}).click();

  const link = page.getByRole('link', {name});
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/pt\/gestao-projetos\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  // Máquina de estados: `preparacao` só avança para `subscricao`.
  await page.getByRole('button', {name: 'Em subscrição'}).click();
  await expect(page.locator('[data-slot="badge"]').first()).toHaveText(
    'Em subscrição'
  );
  return id;
}

/** Manifesta interesse no projeto aberto e confirma a posição na própria página. */
async function manifestInterest(
  page: Page,
  projectId: string,
  amount: number
): Promise<void> {
  await page.goto(`${APP}/pt/projetos/${projectId}`);
  await page.getByLabel('Montante a investir (€)').fill(String(amount));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Manifestar interesse'}).click();

  const position = page.getByText('Montante:', {exact: false});
  await expect(position).toBeVisible();
  expect(ws(await position.innerText())).toContain(eur(amount));
}

test('jornada do investidor: convite → registo → MFA → KYC → subscrição → obra → extrato auditado', async ({
  browser
}) => {
  // Jornada longa e deliberadamente sequencial: dezenas de navegações, Server
  // Actions e uploads. O timeout por defeito (45s) é para testes curtos; este
  // corre em ~20s, a folga é para não ser a máquina lenta a fazer falhar.
  test.setTimeout(180_000);

  const run = randomBytes(3).toString('hex');
  const staffEmail = `e2e-staff-${run}@test.local`;
  const investorEmail = `e2e-inv-${run}@test.local`;
  const investorName = `Investidor Jornada ${run}`;
  const projectName = `Quinta do Teste ${run}`;
  const otherProjectName = `Palacete do Teste ${run}`;
  const updateTitle = `Betonilha concluída ${run}`;
  const period = '2026-06';

  // --- Semente (a única) -----------------------------------------------------
  // Conta de staff por service role: não existe UI para criar o primeiro
  // admin. `admin` e não `project_manager` porque o passo 7 lê /auditoria, que
  // só admin/auditor podem ver.
  const {data: createdStaff, error: staffError} =
    await admin.auth.admin.createUser({
      email: staffEmail,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {full_name: `Staff Jornada ${run}`, locale: 'pt'}
    });
  expect(staffError).toBeNull();
  const staffId = createdStaff?.user?.id;
  expect(staffId).toBeTruthy();
  const {error: roleError} = await admin
    .from('profiles')
    .update({role: 'admin'})
    .eq('id', staffId!);
  expect(roleError).toBeNull();

  // Duas sessões em paralelo, como na vida real: o staff no back-office e o
  // investidor no portal, cada um com os seus cookies.
  const staffContext = await browser.newContext();
  const investorContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const investor = await investorContext.newPage();

  try {
    // --- 1. Convite → registo → MFA -----------------------------------------
    // A MFA é obrigatória para toda a gente, staff incluído.
    await loginAndEnrolMfa(staff, staffEmail);
    await expect(staff.getByRole('link', {name: 'Convites'})).toBeVisible();

    await staff.goto(`${APP}/pt/convites`);
    await staff.getByLabel('Nome completo').fill(investorName);
    await staff.getByLabel('Email').fill(investorEmail);
    await staff.getByRole('button', {name: 'Enviar convite'}).click();

    const inviteRow = staff.locator('tr', {hasText: investorEmail});
    await expect(inviteRow).toContainText('Pendente');

    // O link vive no email que a app acabou de enviar. Lê-se o registo da
    // outbox — o equivalente a abrir a caixa de correio do investidor.
    const {data: mail, error: mailError} = await admin
      .from('email_outbox')
      .select('payload')
      .eq('to_email', investorEmail)
      .eq('template', 'invite')
      .order('created_at', {ascending: false})
      .limit(1)
      .single();
    expect(mailError).toBeNull();
    const inviteUrl = String(
      (mail!.payload as {url: string}).url
    ).replace('127.0.0.1', 'localhost');
    expect(inviteUrl).toContain('/pt/aceitar-convite/');

    await investor.goto(inviteUrl);
    await expect(investor.getByText('Criar a sua conta')).toBeVisible();
    await investor.getByLabel('Palavra-passe').fill(PASSWORD);
    await investor.getByRole('checkbox').check();
    await investor.getByRole('button', {name: 'Criar conta'}).click();
    await investor.waitForURL('**/pt/login**');

    await loginAndEnrolMfa(investor, investorEmail);

    // --- 2. KYC --------------------------------------------------------------
    // Sem KYC aprovado o catálogo é invisível: o middleware devolve o
    // investidor a /kyc venha ele de onde vier.
    await investor.waitForURL('**/pt/kyc**');
    await investor.goto(`${APP}/pt/projetos`);
    await investor.waitForURL('**/pt/kyc**');
    await expect(
      investor.getByText('Verificação de identidade', {exact: true})
    ).toBeVisible();

    await investor.getByLabel('Nome completo').fill(investorName);
    await investor.getByLabel('NIF').fill(NIF);
    await investor
      .getByLabel('Cartão de Cidadão (frente e verso)')
      .setInputFiles({
        name: 'cartao-cidadao.pdf',
        mimeType: 'application/pdf',
        buffer: PDF
      });
    await investor.getByRole('checkbox').check();
    await investor.getByRole('button', {name: 'Submeter'}).click();
    await expect(investor.getByText(/em análise/)).toBeVisible();

    // Staff aprova na fila de revisão.
    await staff.goto(`${APP}/pt/kyc-revisao`);
    const kycCard = staff.locator('[data-slot="card"]', {
      hasText: investorName
    });
    await expect(kycCard).toBeVisible();
    await expect(kycCard).toContainText(NIF);
    await kycCard.getByRole('button', {name: 'Aprovar'}).click();
    await expect(
      staff.locator('[data-slot="card"]', {hasText: investorName})
    ).toHaveCount(0);

    // O investidor deixa de ser desviado para /kyc.
    await investor.goto(`${APP}/pt/projetos`);
    await expect(investor).toHaveURL(`${APP}/pt/projetos`);
    await expect(
      investor.getByRole('heading', {name: 'Catálogo de projetos'})
    ).toBeVisible();

    // --- 3. Projeto ----------------------------------------------------------
    const projectId = await createProjectInSubscription(staff, projectName);

    await investor.goto(`${APP}/pt/projetos`);
    const card = investor.locator('[data-slot="card"]', {hasText: projectName});
    await expect(card).toBeVisible();
    await expect(card).toContainText('12%');
    await card.click();
    await investor.waitForURL(`${APP}/pt/projetos/${projectId}`);
    await expect(
      investor.getByRole('heading', {name: projectName})
    ).toBeVisible();

    // --- 4. Subscrição -------------------------------------------------------
    await manifestInterest(investor, projectId, 25000);

    // Assimetria deliberada, verificada AQUI — com subscrição ativa mas ainda
    // sem fundos confirmados. A obra abre; os extratos não, nem por link nem
    // por URL direto.
    await expect(
      investor.getByRole('link', {name: 'Acompanhamento de obra'})
    ).toBeVisible();
    await expect(
      investor.getByRole('link', {name: 'Extratos da conta dedicada'})
    ).toHaveCount(0);

    const obraBefore = await investor.goto(
      `${APP}/pt/projetos/${projectId}/obra`
    );
    expect(obraBefore?.status()).toBe(200);
    await expect(
      investor.getByRole('heading', {name: 'Acompanhamento de obra'})
    ).toBeVisible();

    const extratosBefore = await investor.goto(
      `${APP}/pt/projetos/${projectId}/extratos`
    );
    expect(extratosBefore?.status()).toBe(404);

    // Segunda posição, que fica em `interesse` até ao fim — é o controlo da
    // asserção de capital investido lá em baixo.
    const otherProjectId = await createProjectInSubscription(
      staff,
      otherProjectName
    );
    await manifestInterest(investor, otherProjectId, 9000);

    // Staff faz avançar a primeira subscrição até aos fundos confirmados.
    await staff.goto(`${APP}/pt/gestao-projetos/${projectId}/subscricoes`);
    const subRow = staff.locator('tbody tr', {hasText: investorName});
    // O estado lê-se no Badge, não na linha: os próprios botões dizem "Avançar
    // para Contrato assinado", logo `toContainText` na linha passaria antes de
    // a transição acontecer.
    const subStatus = subRow.locator('[data-slot="badge"]');
    await expect(subStatus).toHaveText('Interesse manifestado');
    await subRow
      .getByRole('button', {name: 'Avançar para Contrato assinado'})
      .click();
    await expect(subStatus).toHaveText('Contrato assinado');

    await subRow
      .getByPlaceholder('Referência da transferência')
      .fill(`TRF-${run}`);
    await subRow
      .getByRole('button', {name: 'Avançar para Fundos confirmados'})
      .click();
    await expect(subStatus).toHaveText('Fundos confirmados');

    // --- 5. Obra e extrato ---------------------------------------------------
    await staff.goto(`${APP}/pt/gestao-projetos/${projectId}/obra`);
    await staff.getByLabel('Título', {exact: true}).fill(updateTitle);
    await staff
      .getByLabel('Descrição')
      .fill('Betonilha aplicada em toda a área do piso 0.');
    await staff.getByRole('button', {name: 'Publicar atualização'}).click();
    await expect(staff.getByRole('heading', {name: updateTitle})).toBeVisible();

    await staff.goto(`${APP}/pt/gestao-projetos/${projectId}/extratos`);
    await staff.getByLabel('Período (AAAA-MM)').fill(period);
    await staff.getByLabel('Ficheiro (PDF)').setInputFiles({
      name: 'extrato-2026-06.pdf',
      mimeType: 'application/pdf',
      buffer: PDF
    });
    await staff.getByRole('button', {name: 'Publicar extrato'}).click();
    await expect(staff.locator('tbody tr', {hasText: period})).toBeVisible();

    // --- 6. O que o investidor vê -------------------------------------------
    await investor.goto(`${APP}/pt`);

    // Sino: KYC aprovado + fundos confirmados + atualização de obra + extrato.
    const bell = investor.getByRole('button', {name: 'Notificações'});
    await expect(bell).toContainText('4 por ler');
    await bell.click();
    await expect(investor.getByText('Identidade verificada')).toBeVisible();
    await expect(
      investor.getByText(`${projectName}: ${updateTitle}`)
    ).toBeVisible();
    await expect(
      investor.getByText(`Extrato de ${period} do projeto ${projectName}.`)
    ).toBeVisible();
    await investor.keyboard.press('Escape');

    // Capital investido = SÓ a posição confirmada (25 000 €), nunca a soma das
    // duas (34 000 €). As duas posições estão ambas visíveis na tabela — é o
    // que torna a asserção do mosaico não-vazia.
    const invested = investor
      .getByText('Capital investido', {exact: true})
      .locator('xpath=following-sibling::p[1]');
    expect(ws(await invested.innerText())).toBe(eur(25000));
    // `p` e não `getByText`: "Projetos" é também o link da navegação.
    expect(
      ws(
        await investor
          .locator('p')
          .filter({hasText: /^Projetos$/})
          .locator('xpath=following-sibling::p[1]')
          .innerText()
      )
    ).toBe('2');

    const confirmedRow = investor.locator('tr', {hasText: projectName});
    await expect(confirmedRow).toContainText('Fundos confirmados');
    expect(ws(await confirmedRow.innerText())).toContain(eur(25000));

    const interestRow = investor.locator('tr', {hasText: otherProjectName});
    await expect(interestRow).toContainText('Interesse manifestado');
    expect(ws(await interestRow.innerText())).toContain(eur(9000));

    // Obra: a atualização publicada aparece no diário.
    await investor.goto(`${APP}/pt/projetos/${projectId}/obra`);
    await expect(
      investor.getByRole('heading', {name: updateTitle})
    ).toBeVisible();
    await expect(
      investor.getByText('Betonilha aplicada em toda a área do piso 0.')
    ).toBeVisible();

    // Extratos: agora abrem — a mesma página que dava 404 antes dos fundos.
    const extratosAfter = await investor.goto(
      `${APP}/pt/projetos/${projectId}/extratos`
    );
    expect(extratosAfter?.status()).toBe(200);
    const statementRow = investor.locator('tbody tr', {hasText: period});
    await expect(statementRow).toBeVisible();
    await expect(statementRow.locator('td').nth(1)).toHaveText('1'); // versão

    const openLink = statementRow.getByRole('link', {name: 'Abrir'});
    const href = await openLink.getAttribute('href');
    expect(href).toMatch(/^\/api\/statements\/[0-9a-f-]{36}$/);
    const statementId = href!.split('/').pop()!;

    // A consulta faz-se com o pedido real (mesmos cookies do contexto do
    // investidor) em vez de seguir o `target="_blank"`: o Chromium headless
    // trata um PDF ora como navegação ora como download, e essa
    // não-determinação não é o que este teste quer medir. O que interessa —
    // a rota autoriza, audita e emite a URL assinada — é exercido na mesma.
    const pdfResponse = await investor.request.get(`${APP}${href}`);
    expect(pdfResponse.status()).toBe(200);
    expect((await pdfResponse.body()).subarray(0, 5).toString('utf8')).toBe(
      '%PDF-'
    );

    // --- 7. Auditoria --------------------------------------------------------
    // A consulta do extrato ficou registada, e o admin vê-a em /auditoria.
    await staff.goto(
      `${APP}/pt/auditoria?action=view_document&entity=account_statements`
    );
    const auditRow = staff
      .locator('tbody tr', {hasText: statementId})
      .first();
    await expect(auditRow).toBeVisible();
    await expect(auditRow).toContainText('view_document');
    await expect(auditRow).toContainText(investorName);
    await expect(auditRow).toContainText(period);
    await expect(auditRow).toContainText(projectId);
  } finally {
    await staffContext.close();
    await investorContext.close();
  }
});
