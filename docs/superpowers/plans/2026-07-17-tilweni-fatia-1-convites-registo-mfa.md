# TILWENI Fase A — Fatia 1: Convites + Registo + MFA · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar task-a-task. Os passos usam checkbox (`- [ ]`).

**Goal:** Módulo 5.1 da spec completo — convite nominativo por admin → email via `email_outbox` + SMTP Microsoft 365 → aceitação de convite com registo de termos/IP → criação de conta → enrolment MFA (TOTP) forçado no primeiro login. Registo impossível sem convite; log imutável de quem convidou quem.

**Architecture:** Continua o monolito Next.js 15 (App Router, `src/`) com Supabase como fonte de dados. Toda a lógica sensível em Server Actions/Route Handlers com service role; zero autorização no cliente. Nova tabela `invites` (token **hasheado**, nunca em claro na BD) e `email_outbox` (fila com retry). Envio de email desacoplado por fila, processada por cron (Edge Function ou Route Handler protegido). MFA via Supabase Auth (TOTP), enrolment forçado por middleware.

**Tech Stack:** + `nodemailer` (SMTP 365), `@supabase/supabase-js` admin (já presente). Sem novas libs de UI além do shadcn já instalado. Testes: Vitest (unit + RLS) já configurados; Playwright entra aqui (primeiro fluxo E2E: aceitar convite → login → MFA).

**Spec:** `docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md` (§5.1, §5.9, §6, §7)
**Depende de:** Fatia 0 (profiles, platform_settings, audit_log, auth, i18n, middleware) — concluída.

**Decisões de design desta fatia (a confirmar com o utilizador antes de implementar):**
- **Token:** 32 bytes aleatórios (base64url) no link; na BD guarda-se apenas `sha256(token)`. Validação por hash. Um vazamento da BD não permite forjar aceitações.
- **Processamento da fila (DECIDIDO):** `pg_cron` (grátis, cadência ao minuto) + `pg_net` `http_post` ao Route Handler `/api/cron/email` (protegido por `CRON_SECRET`). O *agendamento* é do Supabase (grátis em todos os planos; Vercel Cron no plano Hobby só corre 1×/dia), o *envio* fica no runtime Node do Next onde o Nodemailer+SMTP funcionam. Requer extensões `pg_cron` e `pg_net` (ativar na migração/dashboard).
- **MFA:** TOTP nativo do Supabase (`supabase.auth.mfa.enroll/challenge/verify`). Enrolment forçado: middleware deteta `aal1` com fatores por verificar e redireciona para `/[locale]/(auth)/mfa`.
- **Termos versionados:** `platform_settings` ganha `terms_version` (ou tabela `legal_texts`); o `invites.terms_version` regista a versão aceite. Para a Fatia 1 basta um campo de versão simples em settings.

**Armadilhas conhecidas (herdadas da Fatia 0):**
- Portas locais não-default (54421/54422). BOM em `config.toml` parte o CLI.
- `actor_id = auth.uid()` é NULL em ações service_role — dívida registada na Fatia 0. **Esta fatia resolve-a** para ações de convite: a Server Action propaga o ator (ver Task 5).
- Testes de RLS têm de asserir `error` **e** `data` (um `data: null` de tabela inexistente passa falsos-verdes).

---

### Task 1: Migração — `invites` + `email_outbox` (+ RLS, triggers, audit)

**Files:** Create `supabase/migrations/<ts>_convites_email.sql`

- [ ] **Step 1:** `supabase migration new convites_email`
- [ ] **Step 2:** Escrever a migração:
  - Enums: `invite_status` (`pending`,`accepted`,`expired`,`revoked`), `email_status` (`queued`,`sending`,`sent`,`failed`,`dead`).
  - Tabela `invites`: `id uuid pk default gen_random_uuid()`, `full_name text not null`, `email citext not null` (extensão `citext`), `token_hash text not null unique`, `invited_by uuid references auth.users`, `role public.user_role not null default 'investor'`, `status public.invite_status not null default 'pending'`, `expires_at timestamptz not null`, `accepted_at timestamptz`, `accepted_ip inet`, `terms_version text`, `created_at timestamptz default now()`. Índice em `email` e `status`.
  - Tabela `email_outbox`: `id uuid pk`, `to_email citext not null`, `to_name text`, `locale text not null default 'pt' check (locale in ('pt','en'))`, `template text not null`, `payload jsonb not null default '{}'`, `status public.email_status not null default 'queued'`, `attempts int not null default 0`, `max_attempts int not null default 5`, `last_error text`, `next_attempt_at timestamptz not null default now()`, `created_at timestamptz default now()`, `sent_at timestamptz`. Índice parcial em `(status, next_attempt_at)` para o poller.
  - RLS ativa em ambas. `invites`: SELECT só `admin`/`project_manager` (via `current_user_role()`); **sem** policies de escrita (só service role). `email_outbox`: SELECT só `admin`; sem escrita por utilizadores.
  - `citext` para email case-insensitive (evita duplicar convites por maiúsculas).
  - Trigger de auditoria (reutiliza `public.audit_row_change`) em `invites` (insert/update/delete).
  - `settings`: `insert into platform_settings … ('terms_version','"2026-07"'::jsonb, …)`.
- [ ] **Step 3:** `supabase db reset` — aplica limpo.
- [ ] **Step 4:** `list_tables` confirma RLS ativa e 0 advisors de segurança.

---

### Task 2: Testes primeiro (RLS + unit) — devem falhar

**Files:** Create `tests/rls/invites.test.ts`, `tests/unit/token.test.ts`

- [ ] **Step 1:** RLS: investidor **não** lê `invites` nem `email_outbox` (data `[]`, error null); admin lê ambos; anónimo não lê nada.
- [ ] **Step 2:** RLS: `email_outbox` não é escrito por authenticated; UPDATE de `invites` por investidor não passa.
- [ ] **Step 3:** Unit (token): `generateInviteToken()` devolve par `{token, hash}`; `hashToken(token)` é determinístico e igual ao `hash`; tokens diferentes → hashes diferentes.
- [ ] **Step 4:** `npm test` — RLS de invites FALHA (helpers/Server Actions por criar), unit de token FALHA (lib por criar).

---

### Task 3: Domínio de convites (lib, sem I/O)

**Files:** Create `src/lib/invites/token.ts`

- [ ] **Step 1:** `generateInviteToken()`: 32 bytes `crypto.randomBytes` → base64url; `hashToken(raw)`: `sha256` hex. Puro, testável.
- [ ] **Step 2:** Helpers de estado: `isRedeemable(invite, now)` (pending && !expired && !revoked).
- [ ] **Step 3:** Unit de token/estado PASSAM.

---

### Task 4: Infra de email — `email_outbox` + Nodemailer SMTP 365 + templates + cron

**Files:** Create `src/lib/mail/outbox.ts`, `src/lib/mail/smtp.ts`, `src/lib/mail/templates/*`, `src/app/api/cron/email/route.ts`. Modify `.env.example`, `.env.local`.

- [ ] **Step 1:** `npm install nodemailer` + `@types/nodemailer` (dev).
- [ ] **Step 2:** `enqueueEmail({to, name, locale, template, payload})` — insert em `email_outbox` via admin client. Chamado dentro da mesma transação lógica das Server Actions.
- [ ] **Step 3:** `smtp.ts`: transporter Nodemailer (host `smtp.office365.com`, port 587, STARTTLS, auth user/pass da caixa TILWENI). Credenciais em env (`SMTP_HOST/PORT/USER/PASS/FROM`).
- [ ] **Step 4:** Templates bilingues (invite, welcome) — HTML sóbrio + rodapé com aviso de risco (de `platform_settings.risk_notice[locale]`).
- [ ] **Step 5:** Route Handler `/api/cron/email`: protegido por header `Authorization: Bearer ${CRON_SECRET}`; seleciona `queued`/`failed` com `next_attempt_at <= now` e `attempts < max_attempts`; marca `sending`; envia; em sucesso `sent`; em falha incrementa `attempts`, calcula `next_attempt_at` (backoff exponencial), grava `last_error`; ao atingir `max_attempts` → `dead`. Rate-limit amigável ao SMTP 365 (~30/min): processa em lotes pequenos.
- [ ] **Step 6:** Agendamento via `pg_cron` + `pg_net`: migração ativa as extensões e cria um job `cron.schedule('email-poller', '* * * * *', $$ select net.http_post(url:=<APP_URL>/api/cron/email, headers:=jsonb_build_object('Authorization','Bearer '||<secret>)) $$)`. O `APP_URL` e o secret vêm de settings/GUC, não hardcoded. Cadência inicial: 1 min.
- [ ] **Step 7:** Teste de integração do poller contra Supabase local (enfileira → corre handler com SMTP mock/inbucket → estado `sent`). Inbucket local do Supabase (porta em `config.toml`) serve de SMTP de teste.

---

### Task 5: Server Action de convite + back-office mínimo

**Files:** Create `src/lib/supabase/audit.ts` (propagação de ator), `src/app/[locale]/(admin)/convites/page.tsx`, `src/app/[locale]/(admin)/convites/actions.ts`

- [ ] **Step 1:** `createInvite({fullName, email, role})` (admin-only, verifica role server-side): gera token, grava `invites` com `token_hash`, `invited_by = <admin id>`, `expires_at = now + invite_validity_days`; enfileira email `invite` com link `/{locale}/aceitar-convite/{token}`.
- [ ] **Step 2:** Resolver a dívida de ator do audit: antes das escritas privilegiadas, `set_config('request.jwt.claim.sub', <adminId>, true)` (ou GUC próprio lido pelo trigger) para o `audit_row_change` registar QUEM. Ajustar o trigger se necessário.
- [ ] **Step 3:** `revokeInvite(id)` e `resendInvite(id)` (novo token, novo email, invalida o anterior).
- [ ] **Step 4:** UI back-office `/[locale]/(admin)/convites`: tabela de convites (estado, validade), form de criar, botões revogar/reenviar. Guard de role no layout `(admin)`.
- [ ] **Step 5:** Testes RLS/integração das actions PASSAM; convites aparecem no `audit_log` com ator atribuído.

---

### Task 6: Página de aceitação de convite + registo

**Files:** Create `src/app/[locale]/(auth)/aceitar-convite/[token]/page.tsx` + `actions.ts`

- [ ] **Step 1:** Página server-side valida o token (hash → `invites`), estado redimível; se inválido/expirado → ecrã de erro bilingue.
- [ ] **Step 2:** Form: nome (pré-preenchido), definir password, **checkboxes obrigatórias** — aceitação de risco + iliquidez + termos (textos de `platform_settings`, versão registada).
- [ ] **Step 3:** Server Action `acceptInvite`: revalida token, cria conta `auth.admin.createUser({email, password, email_confirm:true, user_metadata:{full_name, locale}})`; marca invite `accepted` com `accepted_at`, `accepted_ip` (do header), `terms_version`; enfileira email `welcome`. Tudo idempotente/transacional (token já usado → erro).
- [ ] **Step 4:** O middleware já permite `/aceitar-convite/*` sem sessão (regex em `PUBLIC_PATHS` da Fatia 0 — confirmar/estender).
- [ ] **Step 5:** Testes: aceitar convite cria profile (trigger da Fatia 0), regista IP+termos, invalida token; segundo uso falha.

---

### Task 7: Enrolment MFA (TOTP) forçado

**Files:** Create `src/app/[locale]/(auth)/mfa/page.tsx` + `actions.ts`; Modify `src/lib/supabase/middleware.ts`

- [ ] **Step 1:** Middleware: obter AAL (`getAuthenticatorAssuranceLevel`); se `currentLevel = aal1` e sem fatores verificados → forçar `/[locale]/mfa` (exceto na própria página e logout).
- [ ] **Step 2:** Página MFA: `supabase.auth.mfa.enroll({factorType:'totp'})` → mostrar QR + secret; input de código → `challenge` + `verify`. Sucesso → sessão sobe a `aal2`, redireciona para `/`.
- [ ] **Step 3:** Login existente (Fatia 0): após password, se o utilizador já tem fator TOTP, pedir código (challenge) antes de prosseguir.
- [ ] **Step 4:** Teste E2E (Playwright) do fluxo: aceitar convite → login → enrolment MFA → home. (Usar TOTP determinístico via `otplib` no teste.)

---

### Task 8: Verificação, testes e build

- [ ] **Step 1:** `npm run build && npm run typecheck && npm test` verdes.
- [ ] **Step 2:** Playwright E2E verde localmente e no CI (adicionar step ao `ci.yml`; browser Chromium pré-instalado).
- [ ] **Step 3:** Correr `get_advisors` (security) no staging após aplicar migração.

---

### Task 9: SMTP 365 + secrets + deploy

- [ ] **Step 1:** Criar/confirmar caixa SMTP na TILWENI (Microsoft 365); obter credenciais. **Requer ação do utilizador.**
- [ ] **Step 2:** Definir env vars (`SMTP_*`, `CRON_SECRET`) em Vercel (Production→prod, Preview→staging) e localmente. Nunca commitar.
- [ ] **Step 3:** Aplicar a migração ao staging e prod (via CLI `db push` ou MCP `apply_migration`).
- [ ] **Step 4:** Apontar os emails internos do Supabase Auth (reset password) ao SMTP 365 no `config.toml`/dashboard.
- [ ] **Step 5:** Documentar em `docs/ambientes.md` (novas env vars, cron).

---

## Fora desta fatia (fatias seguintes)
- Fatia 2: KYC (upload, fila de revisão, gating do middleware por estado KYC).
- Fatias 3-6 conforme a spec §8.

## Decisões tomadas
- **Cron:** ✅ `pg_cron` + `pg_net` → Route Handler (grátis, ao minuto). Ver Task 4.
- **SMTP 365:** ✅ caixa já existe; credenciais fornecidas pelo utilizador (entram nas env vars na Task 4/9; testes locais usam Inbucket).
- **Branch:** Fatia 1 desenvolve-se em `claude/continuacao-anterior-uasvp0` (entra no PR #2, junto com a Fatia 0).

## Perguntas abertas (não bloqueiam Tasks 1-3)
1. **Cadência do poller:** 1 min (default) confirmado? Volume é baixo (<20 investidores).
2. **Textos legais** (risco/iliquidez/termos): usar `risk_notice` existente + bloco de termos novo em `platform_settings` (mais simples, recomendado), ou tabela `legal_texts` versionada já nesta fatia?

## Nota de execução (ambiente remoto)
Este container não tem Docker/Supabase local; `supabase start`/`db reset`/`npm test` (RLS) correm no **CI (GitHub Actions)** e na máquina do utilizador. Os testes unitários puros (token) correm aqui. A validação de RLS desta fatia faz-se pelo CI antes do merge.
