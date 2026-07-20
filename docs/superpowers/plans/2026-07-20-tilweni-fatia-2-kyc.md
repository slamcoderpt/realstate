# TILWENI Fase A — Fatia 2: KYC · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KYC manual com upload de documentos (Cartão de Cidadão / ID + comprovativo de morada + NIF), revisão no back-office, gating do investidor até aprovação, e emails bilingues — tudo com bucket de Storage privado, acesso auditado e consentimento registado.

**Architecture:** Segue os padrões da Fatia 1. Tabelas `kyc_submissions` + `kyc_documents` com RLS staff-only-read e escrita exclusiva via Server Actions com service role. **Primeiro bucket de Storage** (`kyc`, privado): os investidores nunca tocam no Storage diretamente — o upload passa por uma Server Action (service role) e a visualização por um Route Handler que **regista a consulta no audit_log antes** de emitir uma URL assinada de curta duração. Campo `verification_method` (`document` agora, `cmd` futuro) para a integração Autenticação.Gov encaixar sem migração ([docs/pesquisa-cmd-autenticacao-gov.md](../../pesquisa-cmd-autenticacao-gov.md)).

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + Storage + RLS), Vitest + `pg` (testes RLS), next-intl.

**Spec:** [docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md](../specs/2026-07-17-tilweni-fase-a-design.md) (secções 3.2, 5.2, 4)

---

## Decisões de slice (confirmadas com o utilizador)

- **Caminho único de upload para todos** nesta fatia: PT usa Cartão de Cidadão; estrangeiro usa ID + comprovativo de morada. NIF é campo validado em ambos. (A validação CMD sem retenção entra quando o acesso AMA existir.)
- **Consentimento expresso registado** no momento do upload (versão do texto guardada).
- **Histórico mantido**: cada submissão é uma linha própria; a rejeitada fica arquivada com o motivo. Uma resubmissão cria nova submissão.
- **Storage privado, acesso só server-side** (service role); visualização por Route Handler auditado com URL assinada ~60s.
- **Gating**: investidor autenticado (aal2) com `kyc_status != approved` → `/kyc`. Staff isento.

## Armadilhas conhecidas desta máquina (herdadas das fatias anteriores)

- **PowerShell escreve BOM** — escrever SQL/TS com Git Bash ou método sem BOM. Verificar: `head -c 3 <ficheiro> | xxd -p` **não** deve dar `efbbbf`.
- **Stack local na porta 54421** (API) / **54422** (DB); nunca hardcodar 54321. `.env.test` é a fonte de verdade e já tem `SUPABASE_DB_URL`.
- **Servidores Next órfãos** dão output falso — confirmar PID dono da porta 3000 (`Get-NetTCPConnection -LocalPort 3000,3001,3002`) e limpar no fim.
- **Não usar `/tmp`** em scripts mistos Git Bash / Python de Windows.

## Estrutura de ficheiros (mapa de decomposição)

```
supabase/migrations/
  <ts>_kyc.sql                         # Task 3: enums, tabelas, RLS, audit, bucket kyc + storage RLS, settings
src/lib/kyc/
  nif.ts                               # Task 1: validação de NIF português (checksum mod 11) — puro
  service.ts                           # Task 4: submit/list/approve/reject (server-only, service role, DI)
  storage.ts                           # Task 4: upload/paths/signed URL (server-only, service role)
src/lib/mail/
  templates.ts                         # Task 5: +kyc_submitted, kyc_approved, kyc_rejected (modificar)
src/app/[locale]/(auth)/kyc/
  page.tsx                             # Task 6: página do investidor (form)
  KycForm.tsx                          # Task 6: form client (citizen_type, NIF, uploads, consentimento)
  actions.ts                           # Task 6: submitKycAction (guard sessão) + upload via service role
src/app/[locale]/(admin)/kyc/
  page.tsx                             # Task 8: fila de revisão (staff)
  actions.ts                           # Task 8: approveKycAction/rejectKycAction (requireStaff)
src/app/api/kyc/document/[id]/route.ts # Task 8: Route Handler — audita consulta, emite URL assinada
src/lib/supabase/middleware.ts         # Task 7: gating kyc (modificar)
messages/pt.json, messages/en.json     # Task 9: namespace Kyc (modificar)
tests/unit/nif.test.ts                 # Task 1
tests/rls/kyc.test.ts                  # Task 2
tests/integration/kyc.test.ts          # Task 4
tests/unit/mail-templates.test.ts      # Task 5 (modificar)
next.config.ts                         # Task 6: serverActions.bodySizeLimit (modificar)
```

---

### Task 1: Validação de NIF português (puro, TDD)

**Files:**
- Create: `src/lib/kyc/nif.ts`, `tests/unit/nif.test.ts`

- [ ] **Step 1: Escrever o teste a falhar `tests/unit/nif.test.ts`**

```ts
import {describe, it, expect} from 'vitest';
import {isValidNif, normalizeNif} from '@/lib/kyc/nif';

describe('normalizeNif', () => {
  it('remove espaços e não-dígitos', () => {
    expect(normalizeNif(' 123 456 789 ')).toBe('123456789');
    expect(normalizeNif('PT123456789')).toBe('123456789');
  });
});

describe('isValidNif', () => {
  it('aceita NIFs válidos (checksum correto)', () => {
    // NIFs com dígito de controlo válido
    expect(isValidNif('123456789')).toBe(true);
    expect(isValidNif('287024059')).toBe(true); // primeiro dígito 2 (singular)
    expect(isValidNif('501442600')).toBe(true); // 5 (pessoa coletiva)
  });

  it('rejeita comprimento errado', () => {
    expect(isValidNif('12345678')).toBe(false);
    expect(isValidNif('1234567890')).toBe(false);
  });

  it('rejeita não-numérico', () => {
    expect(isValidNif('12345678X')).toBe(false);
  });

  it('rejeita dígito de controlo errado', () => {
    expect(isValidNif('123456788')).toBe(false);
  });

  it('rejeita primeiro dígito inválido', () => {
    // 0 e 4 e 7 não são prefixos válidos de NIF
    expect(isValidNif('012345678')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/unit/nif.test.ts`
Expected: FAIL (`isValidNif`/`normalizeNif` não existem).

- [ ] **Step 3: Implementar `src/lib/kyc/nif.ts`**

```ts
/**
 * Validação do NIF português (Número de Identificação Fiscal).
 * 9 dígitos; o 9.º é dígito de controlo (checksum mod 11 sobre os 8 primeiros).
 * O 1.º dígito identifica o tipo de contribuinte; conjunto válido conhecido.
 */

// Prefixos válidos (1.º dígito): 1,2 singular; 3 reservado; 5 coletiva;
// 6 administração pública; 8 empresário individual; 9 provisório/irregular.
const VALID_FIRST_DIGITS = new Set([1, 2, 3, 5, 6, 8, 9]);

export function normalizeNif(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidNif(input: string): boolean {
  const nif = normalizeNif(input);
  if (!/^\d{9}$/.test(nif)) return false;
  if (!VALID_FIRST_DIGITS.has(Number(nif[0]))) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === Number(nif[8]);
}
```

- [ ] **Step 4: Correr e confirmar que PASSA**

Run: `npm test -- tests/unit/nif.test.ts`
Expected: PASS. Se algum NIF de exemplo falhar o checksum, corrige o exemplo (não o algoritmo) para um NIF com dígito de controlo correto — calcula à mão pela fórmula e usa esse valor.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kyc/nif.ts tests/unit/nif.test.ts
git commit -m "feat(kyc): validação de NIF português (checksum mod 11)"
```

---

### Task 2: Testes RLS do KYC (a falhar — schema por criar)

**Files:**
- Create: `tests/rls/kyc.test.ts`

Contexto: mesma disciplina TDD da Fatia 0 — os testes definem o contrato de segurança e devem falhar com `42P01` até a Task 3 criar o schema. Os helpers (`admin`, `createTestUser`, `signInAs`, `anonClient`) já existem em `tests/rls/helpers.ts`.

- [ ] **Step 1: Escrever `tests/rls/kyc.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const investorA = `kyc-a-${run}@test.local`;
const investorB = `kyc-b-${run}@test.local`;
const staff = `kyc-staff-${run}@test.local`;

let idA: string;
let idB: string;
let subA: string;

beforeAll(async () => {
  idA = (await createTestUser(investorA)).id;
  idB = (await createTestUser(investorB)).id;
  await createTestUser(staff, 'admin');

  // Submissão do investidor A, criada com service role (como fará a Server Action).
  const {data, error} = await admin
    .from('kyc_submissions')
    .insert({
      user_id: idA,
      citizen_type: 'pt',
      nif: '123456789',
      full_name: 'Investidor A',
      consent_given: true,
      consent_version: 'v1'
    })
    .select('id')
    .single();
  if (error) throw error;
  subA = data.id;

  await admin.from('kyc_documents').insert({
    submission_id: subA,
    doc_type: 'cartao_cidadao',
    storage_path: `${idA}/${subA}/cartao_cidadao.pdf`,
    original_filename: 'cc.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1234
  });
});

describe('kyc_submissions RLS', () => {
  it('investidor lê a sua própria submissão', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê a submissão de outro', async () => {
    const client = await signInAs(investorB);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê submissões de qualquer investidor', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('kyc_submissions')
      .select('id')
      .eq('id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO consegue aprovar-se a si próprio (update bloqueado)', async () => {
    const client = await signInAs(investorA);
    await client
      .from('kyc_submissions')
      .update({status: 'approved'})
      .eq('id', subA);
    const {data} = await admin
      .from('kyc_submissions')
      .select('status')
      .eq('id', subA)
      .single();
    expect(data!.status).toBe('submitted');
  });

  it('anónimo NÃO lê submissões', async () => {
    const {data, error} = await anonClient()
      .from('kyc_submissions')
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe('kyc_documents RLS', () => {
  it('investidor NÃO lê metadados de documentos de outro', async () => {
    const client = await signInAs(investorB);
    const {data, error} = await client
      .from('kyc_documents')
      .select('id')
      .eq('submission_id', subA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê metadados de documentos', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('kyc_documents')
      .select('id')
      .eq('submission_id', subA);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('kyc bucket de Storage', () => {
  it('é privado', async () => {
    const {data} = await admin.storage.getBucket('kyc');
    expect(data?.public).toBe(false);
  });

  it('investidor autenticado NÃO lista objetos do bucket kyc diretamente', async () => {
    // Storage sem políticas permissivas: só o service role acede. Um cliente
    // autenticado não deve conseguir listar/descarregar.
    const client = await signInAs(investorA);
    const {data} = await client.storage.from('kyc').list(idA);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('kyc alimenta o audit_log', () => {
  it('aprovar/rejeitar uma submissão fica registado', async () => {
    await admin
      .from('kyc_submissions')
      .update({status: 'approved', reviewed_at: new Date().toISOString()})
      .eq('id', subA);
    const {data} = await admin
      .from('audit_log')
      .select('action')
      .eq('entity_type', 'kyc_submissions')
      .eq('entity_id', subA)
      .eq('action', 'update');
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHAM com `42P01`**

Run: `npm test -- tests/rls/kyc.test.ts`
Expected: FAIL — `relation "public.kyc_submissions" does not exist` (e o bucket `kyc` inexistente). Confirmar que a causa é o schema em falta, não erro de harness.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/kyc.test.ts
git commit -m "test(kyc): testes RLS de submissions/documents/storage (a falhar — schema por criar)"
```

---

### Task 3: Migração do KYC (tabelas, RLS, audit, Storage, settings)

**Files:**
- Create: `supabase/migrations/<timestamp>_kyc.sql`

- [ ] **Step 1: Gerar o ficheiro de migração**

```bash
supabase migration new kyc
```

Usar o ficheiro `supabase/migrations/<timestamp>_kyc.sql` gerado. **Escrever sem BOM.**

- [ ] **Step 2: Escrever a migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 2 — KYC
-- kyc_submissions + kyc_documents + RLS (staff-read) + audit +
-- bucket de Storage privado `kyc` (acesso só service role) + settings.
--
-- Escrita das submissões: exclusivamente via Server Actions com service role
-- (bypassa RLS por grant), com validação de negócio e atribuição de ator.
-- Investidores só LEEM as suas próprias linhas.
-- ============================================================

-- ---------- Tipos ----------
create type public.citizen_type as enum ('pt', 'foreign');
create type public.kyc_verification_method as enum ('document', 'cmd');
create type public.kyc_submission_status as enum ('submitted', 'approved', 'rejected');
create type public.kyc_doc_type as enum ('cartao_cidadao', 'id', 'comprovativo_morada');

-- ---------- kyc_submissions ----------
create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  citizen_type public.citizen_type not null,
  verification_method public.kyc_verification_method not null default 'document',
  nif text not null,
  full_name text not null,
  status public.kyc_submission_status not null default 'submitted',
  consent_given boolean not null,
  consent_version text not null,
  submitted_ip inet,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  -- Consentimento é obrigatório: uma submissão sem consentimento é inválida.
  constraint kyc_consent_required check (consent_given = true)
);

create index kyc_submissions_user_idx on public.kyc_submissions (user_id);
create index kyc_submissions_status_idx on public.kyc_submissions (status);

-- Um utilizador só pode ter UMA submissão em aberto (submitted) de cada vez.
-- Guarda contra duplo-submit concorrente (race cross-tabela que o check em TS
-- não garante; o service role bypassa RLS mas não índices únicos). Histórico
-- preservado: 'rejected'/'approved' não são cobertas, logo resubmeter é permitido.
create unique index kyc_submissions_one_open_per_user
  on public.kyc_submissions (user_id) where status = 'submitted';

alter table public.kyc_submissions enable row level security;

-- Investidor lê as SUAS submissões.
create policy "kyc_submissions: dono lê"
  on public.kyc_submissions for select
  using (auth.uid() = user_id);

-- Staff lê todas.
create policy "kyc_submissions: staff lê"
  on public.kyc_submissions for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de INSERT/UPDATE/DELETE: escrita só via service role.

-- ---------- kyc_documents ----------
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.kyc_submissions (id) on delete cascade,
  doc_type public.kyc_doc_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  constraint kyc_size_positive check (size_bytes > 0)
);

create index kyc_documents_submission_idx on public.kyc_documents (submission_id);

alter table public.kyc_documents enable row level security;

-- Investidor lê metadados dos documentos das SUAS submissões.
create policy "kyc_documents: dono lê"
  on public.kyc_documents for select
  using (
    exists (
      select 1 from public.kyc_submissions s
      where s.id = submission_id and s.user_id = auth.uid()
    )
  );

-- Staff lê todos.
create policy "kyc_documents: staff lê"
  on public.kyc_documents for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- Auditoria (reutiliza audit_row_change da Fatia 0) ----------
create trigger kyc_submissions_audit
  after insert or update or delete on public.kyc_submissions
  for each row execute function public.audit_row_change();

create trigger kyc_documents_audit
  after insert or update or delete on public.kyc_documents
  for each row execute function public.audit_row_change();

-- ---------- Storage: bucket privado `kyc` ----------
-- Sem políticas em storage.objects para este bucket: por defeito, anon e
-- authenticated ficam sem acesso. Todo o I/O (upload e leitura) é feito
-- server-side com service role, que bypassa RLS de storage. A visualização
-- passa por um Route Handler que audita a consulta antes de emitir URL assinada.
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- ---------- platform_settings do KYC ----------
insert into public.platform_settings (key, value, description) values
  ('kyc_consent_version', '"v1"'::jsonb,
   'Versão do texto de consentimento de tratamento de dados/documentos de KYC'),
  ('kyc_max_file_mb', '8'::jsonb,
   'Tamanho máximo por ficheiro de KYC (MB)'),
  ('kyc_allowed_mime', '["application/pdf","image/jpeg","image/png"]'::jsonb,
   'Tipos de ficheiro aceites no upload de KYC')
on conflict (key) do nothing;
```

- [ ] **Step 3: Aplicar e verificar sem BOM**

```bash
head -c 3 supabase/migrations/*_kyc.sql | xxd -p   # não deve ser efbbbf
supabase db reset
```

Expected: aplica `foundations`, `convites_email`, `grants_rls_roles`, `harden_definer_grants` e o novo `kyc`. Sem erros.

- [ ] **Step 4: Correr os testes RLS do KYC — devem PASSAR**

Run: `npm test -- tests/rls/kyc.test.ts`
Expected: PASS (todos). Se o teste "investidor NÃO lista objetos do bucket" falhar por o cliente conseguir listar, rever que não foram criadas políticas permissivas em `storage.objects`.

- [ ] **Step 5: Correr a suite toda (nada regrediu)**

Run: `npm test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_kyc.sql
git commit -m "feat(kyc): migração — submissions/documents com RLS+audit, bucket kyc privado, settings"
```

---

### Task 4: Camada de serviço + Storage (server-only, service role)

**Files:**
- Create: `src/lib/kyc/storage.ts`, `src/lib/kyc/service.ts`, `tests/integration/kyc.test.ts`

> ⚠️ **Importante (índice único `kyc_submissions_one_open_per_user`):** a migração da Task 3 impede duas submissões `submitted` em aberto para o mesmo utilizador. Portanto, no teste abaixo, **cada `submitKyc` que fique em aberto tem de usar um investidor DIFERENTE** — ou aprovar/rejeitar a submissão anterior antes de submeter de novo com o mesmo utilizador. O exemplo abaixo cria um investidor fresco por cenário via `createTestUser`. Não reutilizar `investorId` em dois `submitKyc` seguidos sem decidir o primeiro.

- [ ] **Step 1: Escrever o teste de integração `tests/integration/kyc.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  submitKyc,
  approveKyc,
  rejectKyc,
  listPendingKyc
} from '@/lib/kyc/service';

const run = randomUUID().slice(0, 8);
const investor = `kyc-svc-${run}@test.local`;
const reviewer = `kyc-rev-${run}@test.local`;
let investorId: string;
let reviewerId: string;

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, {
    type: 'application/pdf'
  });
}

beforeAll(async () => {
  investorId = (await createTestUser(investor)).id;
  reviewerId = (await createTestUser(reviewer, 'admin')).id;
});

describe('submitKyc', () => {
  it('cria submissão + documentos, sobe ficheiros e marca perfil submitted', async () => {
    const res = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        submittedIp: '203.0.113.1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      {transport: {sendMail: async () => {}}}
    );
    expect(res.submissionId).toBeTruthy();

    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, nif')
      .eq('id', res.submissionId)
      .single();
    expect(sub!.status).toBe('submitted');

    const {data: docs} = await admin
      .from('kyc_documents')
      .select('storage_path')
      .eq('submission_id', res.submissionId);
    expect(docs!.length).toBe(1);

    // Ficheiro existe no bucket
    const path = docs![0].storage_path;
    const {data: file} = await admin.storage.from('kyc').download(path);
    expect(file).toBeTruthy();

    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('submitted');
  });

  it('rejeita NIF inválido', async () => {
    await expect(
      submitKyc(
        {
          userId: investorId,
          citizenType: 'pt',
          nif: '111111111',
          fullName: 'X',
          consentVersion: 'v1',
          locale: 'pt',
          documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
        },
        {transport: {sendMail: async () => {}}}
      )
    ).rejects.toThrow(/nif/i);
  });
});

describe('approve/reject', () => {
  it('approveKyc marca aprovado e o perfil approved', async () => {
    const {submissionId} = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      {transport: {sendMail: async () => {}}}
    );
    await approveKyc(
      {submissionId, reviewerId, locale: 'pt'},
      {transport: {sendMail: async () => {}}}
    );
    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, reviewed_by')
      .eq('id', submissionId)
      .single();
    expect(sub!.status).toBe('approved');
    expect(sub!.reviewed_by).toBe(reviewerId);
    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('approved');
  });

  it('rejectKyc exige motivo e marca o perfil rejected', async () => {
    const {submissionId} = await submitKyc(
      {
        userId: investorId,
        citizenType: 'pt',
        nif: '123456789',
        fullName: 'Investidor Teste',
        consentVersion: 'v1',
        locale: 'pt',
        documents: [{docType: 'cartao_cidadao', file: fakeFile('cc.pdf')}]
      },
      {transport: {sendMail: async () => {}}}
    );
    await rejectKyc(
      {submissionId, reviewerId, note: 'Documento ilegível', locale: 'pt'},
      {transport: {sendMail: async () => {}}}
    );
    const {data: sub} = await admin
      .from('kyc_submissions')
      .select('status, review_note')
      .eq('id', submissionId)
      .single();
    expect(sub!.status).toBe('rejected');
    expect(sub!.review_note).toBe('Documento ilegível');
    const {data: profile} = await admin
      .from('profiles')
      .select('kyc_status')
      .eq('id', investorId)
      .single();
    expect(profile!.kyc_status).toBe('rejected');
  });
});

describe('listPendingKyc', () => {
  it('devolve submissões submitted', async () => {
    const rows = await listPendingKyc();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((r) => r.status === 'submitted')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/integration/kyc.test.ts`
Expected: FAIL (módulos `@/lib/kyc/service` inexistentes).

- [ ] **Step 3: Implementar `src/lib/kyc/storage.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const KYC_BUCKET = 'kyc';

/** Caminho canónico no bucket: <userId>/<submissionId>/<docType>-<ficheiro> */
export function kycObjectPath(
  userId: string,
  submissionId: string,
  docType: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${userId}/${submissionId}/${docType}-${safe}`;
}

/** Sobe um ficheiro para o bucket kyc (service role). */
export async function uploadKycFile(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(KYC_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload kyc falhou: ${error.message}`);
}

/** Emite uma URL assinada de curta duração para um objeto do bucket kyc. */
export async function signedKycUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(KYC_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url kyc falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 4: Implementar `src/lib/kyc/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {isValidNif, normalizeNif} from './nif';
import {kycObjectPath, uploadKycFile} from './storage';

/**
 * Lógica de KYC (server-only, service role). O controlo de acesso é feito pela
 * Server Action chamadora (o investidor só submete para si; aprovar/rejeitar
 * exige staff). A escrita passa toda por aqui, com service role — RLS das
 * tabelas kyc_* é staff-read; investidores nunca escrevem diretamente.
 */

export type CitizenType = 'pt' | 'foreign';
export type KycDocType = 'cartao_cidadao' | 'id' | 'comprovativo_morada';

export type KycDocumentInput = {docType: KycDocType; file: File};

export type SubmitKycInput = {
  userId: string;
  citizenType: CitizenType;
  nif: string;
  fullName: string;
  consentVersion: string;
  submittedIp?: string;
  locale: Locale;
  documents: KycDocumentInput[];
};

export type SubmitKycResult = {submissionId: string};

function requiredDocs(citizenType: CitizenType): KycDocType[] {
  // PT: Cartão de Cidadão. Estrangeiro: ID + comprovativo de morada.
  return citizenType === 'pt'
    ? ['cartao_cidadao']
    : ['id', 'comprovativo_morada'];
}

export async function submitKyc(
  input: SubmitKycInput,
  deps: SendEmailDeps = {}
): Promise<SubmitKycResult> {
  const db = deps.db ?? createAdminClient();

  const nif = normalizeNif(input.nif);
  if (!isValidNif(nif)) throw new Error('NIF inválido');

  const needed = requiredDocs(input.citizenType);
  const provided = new Set(input.documents.map((d) => d.docType));
  for (const doc of needed) {
    if (!provided.has(doc)) {
      throw new Error(`documento em falta: ${doc}`);
    }
  }

  const {data: sub, error} = await db
    .from('kyc_submissions')
    .insert({
      user_id: input.userId,
      citizen_type: input.citizenType,
      verification_method: 'document',
      nif,
      full_name: input.fullName.trim(),
      consent_given: true,
      consent_version: input.consentVersion,
      submitted_ip: input.submittedIp ?? null
    })
    .select('id')
    .single();
  if (error || !sub) {
    throw new Error(`criar submissão KYC falhou: ${error?.message ?? 'sem linha'}`);
  }

  for (const doc of input.documents) {
    const path = kycObjectPath(
      input.userId,
      sub.id,
      doc.docType,
      doc.file.name
    );
    await uploadKycFile(path, doc.file, db);
    const {error: docError} = await db.from('kyc_documents').insert({
      submission_id: sub.id,
      doc_type: doc.docType,
      storage_path: path,
      original_filename: doc.file.name,
      mime_type: doc.file.type,
      size_bytes: doc.file.size
    });
    if (docError) {
      throw new Error(`registar documento KYC falhou: ${docError.message}`);
    }
  }

  await db.from('profiles').update({kyc_status: 'submitted'}).eq('id', input.userId);

  await sendEmail(
    {
      toEmail: await userEmail(db, input.userId),
      toName: input.fullName,
      locale: input.locale,
      template: 'kyc_submitted',
      payload: {fullName: input.fullName}
    },
    {db, transport: deps.transport}
  );

  return {submissionId: sub.id};
}

export type ReviewInput = {
  submissionId: string;
  reviewerId: string;
  locale: Locale;
};

export async function approveKyc(
  input: ReviewInput,
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const sub = await setDecision(db, input, 'approved', null);
  await db.from('profiles').update({kyc_status: 'approved'}).eq('id', sub.user_id);
  await sendEmail(
    {
      toEmail: await userEmail(db, sub.user_id),
      toName: sub.full_name,
      locale: input.locale,
      template: 'kyc_approved',
      payload: {fullName: sub.full_name}
    },
    {db, transport: deps.transport}
  );
}

export async function rejectKyc(
  input: ReviewInput & {note: string},
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const note = input.note.trim();
  if (!note) throw new Error('rejeição exige motivo');
  const sub = await setDecision(db, input, 'rejected', note);
  await db.from('profiles').update({kyc_status: 'rejected'}).eq('id', sub.user_id);
  await sendEmail(
    {
      toEmail: await userEmail(db, sub.user_id),
      toName: sub.full_name,
      locale: input.locale,
      template: 'kyc_rejected',
      payload: {fullName: sub.full_name, reason: note}
    },
    {db, transport: deps.transport}
  );
}

export type PendingKycRow = {
  id: string;
  user_id: string;
  citizen_type: CitizenType;
  nif: string;
  full_name: string;
  status: string;
  created_at: string;
};

export async function listPendingKyc(
  db: SupabaseClient = createAdminClient()
): Promise<PendingKycRow[]> {
  const {data, error} = await db
    .from('kyc_submissions')
    .select('id, user_id, citizen_type, nif, full_name, status, created_at')
    .eq('status', 'submitted')
    .order('created_at', {ascending: true});
  if (error) throw new Error(`listar KYC pendente falhou: ${error.message}`);
  return (data ?? []) as PendingKycRow[];
}

// --- helpers internos ---

type SubmissionRow = {user_id: string; full_name: string};

async function setDecision(
  db: SupabaseClient,
  input: ReviewInput,
  status: 'approved' | 'rejected',
  note: string | null
): Promise<SubmissionRow> {
  const {data, error} = await db
    .from('kyc_submissions')
    .update({
      status,
      review_note: note,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', input.submissionId)
    .eq('status', 'submitted') // idempotência: só decide submissões pendentes
    .select('user_id, full_name')
    .single();
  if (error || !data) {
    throw new Error(
      `decidir KYC falhou: ${error?.message ?? 'submissão não pendente'}`
    );
  }
  return data as SubmissionRow;
}

async function userEmail(db: SupabaseClient, userId: string): Promise<string> {
  const {data} = await db.auth.admin.getUserById(userId);
  return data.user?.email ?? '';
}
```

- [ ] **Step 5: Correr o teste de integração — PASSA (depois da Task 5 para os templates)**

Nota: o `sendEmail` usa os templates `kyc_submitted`/`kyc_approved`/`kyc_rejected`, adicionados na Task 5. Para não bloquear, a Task 5 vem A SEGUIR e completa os templates; se correres este teste antes da Task 5, o `renderTemplate` lançará em template desconhecido. **Ordem correta: implementa a Task 5 antes de correr este teste até verde.** Alternativamente, executa Task 5 e Task 4-Step5 em conjunto.

Run (após Task 5): `npm test -- tests/integration/kyc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kyc/storage.ts src/lib/kyc/service.ts tests/integration/kyc.test.ts
git commit -m "feat(kyc): serviço submit/approve/reject + storage (service role, DI)"
```

---

### Task 5: Templates de email do KYC

**Files:**
- Modify: `src/lib/mail/templates.ts`
- Modify: `tests/unit/mail-templates.test.ts`

- [ ] **Step 1: Adicionar os testes ao `tests/unit/mail-templates.test.ts`** (acrescentar, não substituir os existentes)

```ts
import {renderTemplate} from '@/lib/mail/templates';

describe('templates KYC', () => {
  it('kyc_submitted rende em pt e en', () => {
    const pt = renderTemplate('kyc_submitted', 'pt', {fullName: 'Ana'});
    expect(pt.subject).toMatch(/KYC|verifica/i);
    expect(pt.html).toContain('Ana');
    const en = renderTemplate('kyc_submitted', 'en', {fullName: 'Ana'});
    expect(en.html).toContain('Ana');
  });

  it('kyc_approved rende', () => {
    const r = renderTemplate('kyc_approved', 'pt', {fullName: 'Ana'});
    expect(r.html).toContain('Ana');
  });

  it('kyc_rejected inclui o motivo', () => {
    const r = renderTemplate('kyc_rejected', 'pt', {
      fullName: 'Ana',
      reason: 'Documento ilegível'
    });
    expect(r.html).toContain('Documento ilegível');
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/unit/mail-templates.test.ts`
Expected: FAIL (templates KYC desconhecidos).

- [ ] **Step 3: Estender `src/lib/mail/templates.ts`**

Adicionar aos tipos e ao dispatch de `renderTemplate`. Alterar a união `TemplateName` e o `TemplatePayloadMap`:

```ts
export type TemplateName =
  | 'invite'
  | 'welcome'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected';

export type KycSubmittedPayload = {fullName: string};
export type KycApprovedPayload = {fullName: string};
export type KycRejectedPayload = {fullName: string; reason: string};

export type TemplatePayloadMap = {
  invite: InvitePayload;
  welcome: WelcomePayload;
  kyc_submitted: KycSubmittedPayload;
  kyc_approved: KycApprovedPayload;
  kyc_rejected: KycRejectedPayload;
};
```

E acrescentar os corpos ao `renderTemplate` (seguir o estilo dos templates existentes — `layout(locale, body)` + `esc()`). Exemplo dos três corpos, a inserir no switch/dispatch existente:

```ts
// kyc_submitted
const kycSubmitted: Record<Locale, (p: KycSubmittedPayload) => RenderedEmail> = {
  pt: (p) => ({
    subject: 'TILWENI — Verificação de identidade recebida',
    html: layout(
      'pt',
      `<p>Olá ${esc(p.fullName)},</p><p>Recebemos os seus documentos de verificação de identidade (KYC). Vamos analisá-los e notificá-lo assim que a verificação estiver concluída.</p>`
    )
  }),
  en: (p) => ({
    subject: 'TILWENI — Identity verification received',
    html: layout(
      'en',
      `<p>Hello ${esc(p.fullName)},</p><p>We have received your identity verification (KYC) documents. We will review them and notify you once verification is complete.</p>`
    )
  })
};

// kyc_approved
const kycApproved: Record<Locale, (p: KycApprovedPayload) => RenderedEmail> = {
  pt: (p) => ({
    subject: 'TILWENI — Verificação de identidade aprovada',
    html: layout(
      'pt',
      `<p>Olá ${esc(p.fullName)},</p><p>A sua verificação de identidade foi aprovada. Já tem acesso à sua área privada.</p>`
    )
  }),
  en: (p) => ({
    subject: 'TILWENI — Identity verification approved',
    html: layout(
      'en',
      `<p>Hello ${esc(p.fullName)},</p><p>Your identity verification has been approved. You now have access to your private area.</p>`
    )
  })
};

// kyc_rejected
const kycRejected: Record<Locale, (p: KycRejectedPayload) => RenderedEmail> = {
  pt: (p) => ({
    subject: 'TILWENI — Verificação de identidade — ação necessária',
    html: layout(
      'pt',
      `<p>Olá ${esc(p.fullName)},</p><p>A sua verificação de identidade não pôde ser concluída pelo seguinte motivo:</p><p style="padding:12px;background:#f5f5f5;border-radius:6px">${esc(p.reason)}</p><p>Por favor volte a submeter os documentos corrigidos na plataforma.</p>`
    )
  }),
  en: (p) => ({
    subject: 'TILWENI — Identity verification — action required',
    html: layout(
      'en',
      `<p>Hello ${esc(p.fullName)},</p><p>Your identity verification could not be completed for the following reason:</p><p style="padding:12px;background:#f5f5f5;border-radius:6px">${esc(p.reason)}</p><p>Please resubmit the corrected documents on the platform.</p>`
    )
  })
};
```

Ligar os três ao dispatch de `renderTemplate` conforme a estrutura existente do ficheiro (seguir exatamente como `invite`/`welcome` são despachados — se for um `switch (name)`, adicionar os três `case`; garantir exaustividade de tipos).

- [ ] **Step 4: Correr templates + suite**

Run: `npm test -- tests/unit/mail-templates.test.ts` → PASS
Run: `npm test -- tests/integration/kyc.test.ts` → PASS (agora que os templates existem)

- [ ] **Step 5: `npm run typecheck` para garantir exaustividade da união**

Run: `npm run typecheck`
Expected: 0 erros (se o `renderTemplate` usa `switch` exaustivo, o TS confirma que todos os `TemplateName` estão cobertos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mail/templates.ts tests/unit/mail-templates.test.ts
git commit -m "feat(kyc): templates de email submitted/approved/rejected (bilingues)"
```

---

### Task 6: Página do investidor `/kyc` + submissão

**Files:**
- Create: `src/app/[locale]/(auth)/kyc/page.tsx`, `src/app/[locale]/(auth)/kyc/KycForm.tsx`, `src/app/[locale]/(auth)/kyc/actions.ts`
- Modify: `next.config.ts` (subir `serverActions.bodySizeLimit` para uploads)

Nota: `/kyc` vive em `(auth)` porque é acessível a um investidor autenticado que ainda não passou o gating de KYC. A página é o destino do gating (Task 7). Segue o padrão de client-form + Server Action de `aceitar-convite`.

- [ ] **Step 1: Subir o limite de body das Server Actions em `next.config.ts`**

No objeto `nextConfig` (antes de `export default withNextIntl(nextConfig)`), adicionar:

```ts
  experimental: {
    serverActions: {bodySizeLimit: '10mb'}
  },
```

(Documentos de KYC podem ter alguns MB; o default de 1MB não chega. 10MB dá folga; o limite real por ficheiro é validado no servidor via `kyc_max_file_mb`.)

- [ ] **Step 2: Criar a Server Action `src/app/[locale]/(auth)/kyc/actions.ts`**

```ts
'use server';

import {headers} from 'next/headers';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {submitKyc, type CitizenType, type KycDocType} from '@/lib/kyc/service';
import type {Locale} from '@/lib/mail/templates';

export type SubmitState = {ok: boolean; error?: string};

const DOC_FIELDS: KycDocType[] = ['cartao_cidadao', 'id', 'comprovativo_morada'];

export async function submitKycAction(
  locale: Locale,
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const session = await getSession();
  if (!session) return {ok: false, error: 'sessão inválida'};

  const citizenType = formData.get('citizen_type') as CitizenType;
  const nif = String(formData.get('nif') ?? '');
  const fullName = String(formData.get('full_name') ?? '');
  const consent = formData.get('consent') === 'on';
  if (!consent) return {ok: false, error: 'consent_required'};

  const documents = DOC_FIELDS.flatMap((docType) => {
    const file = formData.get(docType);
    return file instanceof File && file.size > 0
      ? [{docType, file}]
      : [];
  });

  // Versão de consentimento e limites vêm das settings.
  const db = createAdminClient();
  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'kyc_consent_version')
    .single();
  const consentVersion =
    typeof setting?.value === 'string' ? setting.value : 'v1';

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  try {
    await submitKyc({
      userId: session.userId,
      citizenType,
      nif,
      fullName,
      consentVersion,
      submittedIp: ip,
      locale,
      documents
    });
    return {ok: true};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro';
    return {ok: false, error: msg};
  }
}
```

- [ ] **Step 3: Criar o form client `src/app/[locale]/(auth)/kyc/KycForm.tsx`**

```tsx
'use client';

import {useActionState, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {submitKycAction, type SubmitState} from './actions';
import type {Locale} from '@/lib/mail/templates';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const initial: SubmitState = {ok: false};

export function KycForm({locale}: {locale: Locale}) {
  const t = useTranslations('Kyc');
  const router = useRouter();
  const [citizenType, setCitizenType] = useState<'pt' | 'foreign'>('pt');
  const [state, formAction, pending] = useActionState(
    submitKycAction.bind(null, locale),
    initial
  );

  if (state.ok) {
    router.refresh();
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('citizenType')}</Label>
        <select
          name="citizen_type"
          value={citizenType}
          onChange={(e) => setCitizenType(e.target.value as 'pt' | 'foreign')}
          className="w-full rounded-md border p-2"
        >
          <option value="pt">{t('citizenPt')}</option>
          <option value="foreign">{t('citizenForeign')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">{t('fullName')}</Label>
        <Input id="full_name" name="full_name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nif">{t('nif')}</Label>
        <Input id="nif" name="nif" inputMode="numeric" required />
      </div>

      {citizenType === 'pt' ? (
        <div className="space-y-2">
          <Label htmlFor="cartao_cidadao">{t('docCc')}</Label>
          <Input
            id="cartao_cidadao"
            name="cartao_cidadao"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="id">{t('docId')}</Label>
            <Input
              id="id"
              name="id"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comprovativo_morada">{t('docAddress')}</Label>
            <Input
              id="comprovativo_morada"
              name="comprovativo_morada"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </div>
        </>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>{t('consent')}</span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error === 'consent_required'
            ? t('consentRequired')
            : t('submitError')}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Criar a página `src/app/[locale]/(auth)/kyc/page.tsx`**

```tsx
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {redirect} from '@/i18n/navigation';
import {KycForm} from './KycForm';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

export default async function KycPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Kyc');

  const session = await getSession();
  if (!session) redirect({href: '/login', locale: locale === 'en' ? 'en' : 'pt'});

  // Estado atual do KYC do investidor.
  const db = createAdminClient();
  const {data: profile} = await db
    .from('profiles')
    .select('kyc_status')
    .eq('id', session!.userId)
    .single();
  const status = profile?.kyc_status ?? 'pending';

  const loc: Locale = locale === 'en' ? 'en' : 'pt';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'submitted' ? (
            <p className="text-sm text-neutral-600">{t('pending')}</p>
          ) : status === 'approved' ? (
            <p className="text-sm text-green-700">{t('approved')}</p>
          ) : (
            <>
              {status === 'rejected' && (
                <p className="mb-4 text-sm text-red-600">{t('rejectedRetry')}</p>
              )}
              <p className="mb-4 text-sm text-neutral-600">{t('intro')}</p>
              <KycForm locale={loc} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Build + typecheck + lint**

```bash
npm run build && npm run typecheck && npm run lint
```

Expected: sem erros. (As chaves de tradução `Kyc.*` são adicionadas na Task 9; se o build falhar por mensagens em falta, adiantar o namespace `Kyc` mínimo — mas a Task 9 é a canónica.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(auth)/kyc" next.config.ts
git commit -m "feat(kyc): página do investidor + submissão com upload e consentimento"
```

---

### Task 7: Gating de KYC no middleware

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

Contexto: o middleware já redireciona `aal1 → /mfa`. Agora, para um investidor `aal2` com `kyc_status != approved`, redireciona para `/kyc` (exceto na própria `/kyc` e nas rotas públicas). Staff (admin/PM) é isento. Usa `withStagedCookies` (já existe) em qualquer resposta nova.

- [ ] **Step 1: Ler o estado atual do middleware**

```bash
cat src/lib/supabase/middleware.ts
```

- [ ] **Step 2: Modificar `updateSession` para acrescentar o gating de KYC**

Depois do bloco que trata `aal1 → /mfa`, e antes do `return response` final, inserir. O código completo do bloco a adicionar:

```ts
  // Gating de KYC: um investidor autenticado (já em aal2 — passou o bloco MFA
  // acima) que ainda não tenha KYC aprovado é encaminhado para /kyc. Staff é
  // isento. A própria /kyc é a exceção (senão haveria loop).
  const isKycPage = /^\/(pt|en)\/kyc$/.test(pathname);
  if (user && !isKycPage && !isApi) {
    const {data: profile} = await supabase
      .from('profiles')
      .select('role, kyc_status')
      .eq('id', user.id)
      .single();
    const isInvestor = (profile?.role ?? 'investor') === 'investor';
    const approved = profile?.kyc_status === 'approved';
    if (isInvestor && !approved) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/kyc`;
      url.search = '';
      return withStagedCookies(response, NextResponse.redirect(url));
    }
  }
```

Notas de integração:
- `locale` e `isApi` já são calculados mais acima na função (ver Task 7 do plano da Fatia 0 / estado atual). Se `isApi` não existir na versão atual, calcular `const isApi = /^\/api(?:\/|$)/.test(pathname);`.
- A leitura de `profiles` corre sob a sessão do utilizador (cliente `supabase` do middleware); a policy "profiles: ler o próprio" devolve a própria linha. Uma leitura por pedido é aceitável à escala do piloto (<20 investidores).
- Para `/api`, não redirecionar (um cliente `fetch` não deve seguir HTML). O gating de KYC das rotas `/api` protegidas far-se-á ao nível de cada handler quando existirem (Fatia 3+).

- [ ] **Step 3: Ajustar a e2e existente (o gating muda o fluxo pós-registo)**

⚠️ **Integração crítica.** A e2e da Fatia 1 (`tests/e2e/*` — fluxo convite→registo→login→MFA→área privada) assumia que, depois do MFA, o investidor chegava à home. Com este gating, um investidor recém-registado (`kyc_status = pending`) passa a ser redirecionado para `/kyc`. Localizar o teste e2e e atualizar a asserção final: após MFA, esperar a **página /kyc** (verificar um texto do namespace `Kyc`, ex.: o título), em vez da home.

```bash
ls tests/e2e/ 2>/dev/null || find tests -name "*.spec.ts" -o -name "*e2e*"
```

Atualizar a asserção final do fluxo para esperar `/kyc`. Se o teste e2e correr em CI e precisar de mensagens, garantir que a Task 9 (namespace `Kyc`) está aplicada antes.

- [ ] **Step 4: Verificar o gating manualmente**

```bash
node scripts/create-demo-user.mjs   # cria demo@tilweni.local (kyc pending)
(npm run dev > /tmp/tilweni-kyc.log 2>&1 &) ; sleep 6
# login como demo, aal precisa de MFA — para o teste do gating KYC, mais simples:
# um utilizador aprovado NÃO deve ser redirecionado; um pending DEVE ir para /kyc.
```

Verificação mínima aceitável: teste de integração/unit do predicado de gating, ou verificação manual com um utilizador cujo `kyc_status` se alterna via `admin` e observando o redirect. Documentar o que foi observado. Matar o dev server e confirmar portas limpas (`Get-NetTCPConnection -LocalPort 3000,3001,3002`).

- [ ] **Step 5: Suite + build**

```bash
npm test && npm run build && npm run typecheck && npm run lint
```

Expected: verde. Se a e2e não correr localmente (precisa de browser), garantir pelo menos unit/integration/RLS verdes e a e2e atualizada para o novo fluxo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/middleware.ts tests/
git commit -m "feat(kyc): gating do middleware — investidor sem KYC aprovado vai para /kyc"
```

---

### Task 8: Back-office de revisão + visualização auditada de documentos

**Files:**
- Create: `src/app/[locale]/(admin)/kyc/page.tsx`, `src/app/[locale]/(admin)/kyc/actions.ts`, `src/app/api/kyc/document/[id]/route.ts`

- [ ] **Step 1: Route Handler auditado `src/app/api/kyc/document/[id]/route.ts`**

Emite uma URL assinada de ~60s para um documento de KYC, **registando a consulta no audit_log antes** (cumpre a secção 4 da spec: "regista a consulta antes de emitir a URL assinada"). Só staff.

```ts
import {NextResponse} from 'next/server';
import {requireStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedKycUrl} from '@/lib/kyc/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  let staffId: string;
  try {
    const session = await requireStaff();
    staffId = session.userId;
  } catch {
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  }

  const {id} = await params;
  const db = createAdminClient();

  const {data: doc, error} = await db
    .from('kyc_documents')
    .select('storage_path, submission_id')
    .eq('id', id)
    .single();
  if (error || !doc) {
    return NextResponse.json({error: 'not_found'}, {status: 404});
  }

  // Auditar a consulta ANTES de emitir a URL (registo de acesso a documento).
  await db.from('audit_log').insert({
    actor_id: staffId,
    action: 'view_document',
    entity_type: 'kyc_documents',
    entity_id: id,
    payload: {submission_id: doc.submission_id}
  });

  const url = await signedKycUrl(doc.storage_path, 60, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Server Actions `src/app/[locale]/(admin)/kyc/actions.ts`**

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {approveKyc, rejectKyc} from '@/lib/kyc/service';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function approveKycAction(
  locale: Locale,
  submissionId: string
): Promise<void> {
  const session = await requireStaff();
  await approveKyc({submissionId, reviewerId: session.userId, locale});
  revalidatePath(`/${locale}/kyc`);
}

export async function rejectKycAction(
  locale: Locale,
  submissionId: string,
  note: string
): Promise<void> {
  const session = await requireStaff();
  await rejectKyc({submissionId, reviewerId: session.userId, note, locale});
  revalidatePath(`/${locale}/kyc`);
}
```

- [ ] **Step 3: Página de revisão `src/app/[locale]/(admin)/kyc/page.tsx`**

Seguir o padrão de `(admin)/convites/page.tsx` (Server Component com `force-dynamic`, tabela shadcn, Server Actions). Lista `listPendingKyc()`; para cada submissão mostra nome, NIF, tipo, data, e os documentos como links para `/api/kyc/document/<id>` (abrem a URL assinada auditada); botões Aprovar / Rejeitar (com campo de motivo). Guard já garantido pelo `(admin)/layout.tsx`.

```tsx
import {getTranslations} from 'next-intl/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {listPendingKyc} from '@/lib/kyc/service';
import {approveKycAction, rejectKycAction} from './actions';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type {Locale} from '@/lib/mail/templates';

export const dynamic = 'force-dynamic';

export default async function AdminKycPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const loc: Locale = locale === 'en' ? 'en' : 'pt';
  const t = await getTranslations('KycAdmin');
  const pending = await listPendingKyc();

  const db = createAdminClient();
  // Documentos por submissão (para os links auditados).
  const ids = pending.map((p) => p.id);
  const {data: docs} = ids.length
    ? await db
        .from('kyc_documents')
        .select('id, submission_id, doc_type')
        .in('submission_id', ids)
    : {data: []};
  const docsBySub = new Map<string, {id: string; doc_type: string}[]>();
  for (const d of docs ?? []) {
    const arr = docsBySub.get(d.submission_id) ?? [];
    arr.push({id: d.id, doc_type: d.doc_type});
    docsBySub.set(d.submission_id, arr);
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      {pending.length === 0 && (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      )}
      <div className="space-y-4">
        {pending.map((sub) => (
          <Card key={sub.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {sub.full_name}{' '}
                <Badge variant="secondary">{sub.citizen_type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-neutral-600">
                NIF: {sub.nif} · {new Date(sub.created_at).toLocaleDateString(loc)}
              </p>
              <div className="flex flex-wrap gap-2">
                {(docsBySub.get(sub.id) ?? []).map((d) => (
                  <a
                    key={d.id}
                    href={`/api/kyc/document/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-700 underline"
                  >
                    {t(`doc_${d.doc_type}` as 'doc_cartao_cidadao')}
                  </a>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <form action={approveKycAction.bind(null, loc, sub.id)}>
                  <Button type="submit">{t('approve')}</Button>
                </form>
                <form
                  action={async (fd: FormData) => {
                    'use server';
                    await rejectKycAction(
                      loc,
                      sub.id,
                      String(fd.get('note') ?? '')
                    );
                  }}
                  className="flex items-end gap-2"
                >
                  <input
                    name="note"
                    placeholder={t('rejectReason')}
                    required
                    className="rounded-md border p-2 text-sm"
                  />
                  <Button type="submit" variant="destructive">
                    {t('reject')}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Build + typecheck + lint**

```bash
npm run build && npm run typecheck && npm run lint
```

Expected: sem erros (chaves `KycAdmin.*` na Task 9).

- [ ] **Step 5: Verificação manual do acesso auditado**

Com um utilizador staff em sessão, abrir `/api/kyc/document/<id>` de um documento existente e confirmar (a) redirect para uma URL assinada que abre o ficheiro, (b) uma linha `view_document` no `audit_log`:

```bash
# via admin client, após aceder ao endpoint:
node -e "import('@supabase/supabase-js').then(async ({createClient})=>{require('dotenv').config({path:'.env.test'});const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const {data}=await db.from('audit_log').select('action,entity_type').eq('action','view_document').limit(3);console.log(data);})"
```

Expected: pelo menos uma linha `view_document` / `kyc_documents`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(admin)/kyc" "src/app/api/kyc"
git commit -m "feat(kyc): back-office de revisão + visualização auditada de documentos (URL assinada)"
```

---

### Task 9: Mensagens i18n + verificação final

**Files:**
- Modify: `messages/pt.json`, `messages/en.json`

- [ ] **Step 1: Adicionar os namespaces `Kyc`, `KycAdmin` a `messages/pt.json`**

```json
  "Kyc": {
    "title": "Verificação de identidade",
    "intro": "Para aceder aos projetos, precisamos de verificar a sua identidade.",
    "citizenType": "Tipo de cidadão",
    "citizenPt": "Cidadão português",
    "citizenForeign": "Cidadão estrangeiro",
    "fullName": "Nome completo",
    "nif": "NIF",
    "docCc": "Cartão de Cidadão (frente e verso)",
    "docId": "Documento de identificação",
    "docAddress": "Comprovativo de morada",
    "consent": "Autorizo o tratamento dos meus documentos para efeitos de verificação de identidade (KYC), nos termos da política de privacidade.",
    "consentRequired": "É necessário dar o consentimento para continuar.",
    "submit": "Submeter",
    "submitError": "Não foi possível submeter. Verifique os dados e tente novamente.",
    "pending": "Os seus documentos estão em análise. Notificamos assim que a verificação estiver concluída.",
    "approved": "A sua identidade está verificada.",
    "rejectedRetry": "A verificação anterior não foi aceite. Por favor volte a submeter os documentos."
  },
  "KycAdmin": {
    "title": "Verificações de identidade pendentes",
    "empty": "Sem verificações pendentes.",
    "approve": "Aprovar",
    "reject": "Rejeitar",
    "rejectReason": "Motivo da rejeição",
    "doc_cartao_cidadao": "Cartão de Cidadão",
    "doc_id": "Documento de identificação",
    "doc_comprovativo_morada": "Comprovativo de morada"
  }
```

- [ ] **Step 2: Adicionar as MESMAS chaves a `messages/en.json`** (traduzidas)

```json
  "Kyc": {
    "title": "Identity verification",
    "intro": "To access the projects, we need to verify your identity.",
    "citizenType": "Citizen type",
    "citizenPt": "Portuguese citizen",
    "citizenForeign": "Foreign citizen",
    "fullName": "Full name",
    "nif": "Tax number (NIF)",
    "docCc": "Citizen Card (front and back)",
    "docId": "Identity document",
    "docAddress": "Proof of address",
    "consent": "I authorise the processing of my documents for identity verification (KYC) purposes, under the privacy policy.",
    "consentRequired": "You must give consent to continue.",
    "submit": "Submit",
    "submitError": "Could not submit. Check the details and try again.",
    "pending": "Your documents are under review. We will notify you once verification is complete.",
    "approved": "Your identity has been verified.",
    "rejectedRetry": "Your previous verification was not accepted. Please resubmit your documents."
  },
  "KycAdmin": {
    "title": "Pending identity verifications",
    "empty": "No pending verifications.",
    "approve": "Approve",
    "reject": "Reject",
    "rejectReason": "Rejection reason",
    "doc_cartao_cidadao": "Citizen Card",
    "doc_id": "Identity document",
    "doc_comprovativo_morada": "Proof of address"
  }
```

- [ ] **Step 3: Correr o teste de paridade PT/EN**

Run: `npm test -- tests/messages-parity.test.ts`
Expected: PASS (chaves idênticas nos dois ficheiros).

- [ ] **Step 4: Suite completa + build + typecheck + lint**

```bash
npm test && npm run build && npm run typecheck && npm run lint
```

Expected: tudo verde.

- [ ] **Step 5: Verificação e2e manual do fluxo completo**

Com o stack local e um investidor de teste:
1. Login + MFA → deve ser redirecionado para `/kyc`.
2. Submeter Cartão de Cidadão + NIF válido + consentimento → mensagem "em análise"; `kyc_status = submitted`.
3. Como staff, abrir `/pt/kyc` (back-office), ver a submissão, abrir o documento (URL assinada, linha `view_document` no audit), Aprovar.
4. Como investidor, recarregar → já não é redirecionado para `/kyc` (kyc aprovado).

Documentar o observado. Limpar dev server e portas.

- [ ] **Step 6: Commit**

```bash
git add messages/pt.json messages/en.json
git commit -m "feat(kyc): mensagens i18n PT/EN dos fluxos de KYC"
```

---

## Fora de âmbito (fatias seguintes)

- **Integração real Autenticação.Gov/CMD** (KYC PT sem retenção) — só quando o acesso AMA existir; o campo `verification_method` já a acomoda. Ver [docs/pesquisa-cmd-autenticacao-gov.md](../../pesquisa-cmd-autenticacao-gov.md).
- **Verificação KYC automática** por fornecedor externo (backlog V2+).
- **Catálogo de projetos** (Fatia 3) — é o que o gating de KYC protege a jusante.

## Notas de segurança/compliance a preservar

- Documentos de KYC nunca são servidos publicamente: bucket privado, acesso só service role server-side, URLs assinadas ~60s, e **cada consulta fica no audit_log** (Route Handler).
- Consentimento é obrigatório (constraint `kyc_consent_required`) e a versão do texto fica registada na submissão.
- Escrita das tabelas `kyc_*` é exclusivamente via Server Actions com service role; RLS é staff-read + dono-lê; investidores nunca escrevem diretamente.
- A retenção do Cartão de Cidadão nesta fatia é uma decisão consciente do piloto, com mitigações; a validação CMD sem retenção substitui-a quando a AMA conceder acesso. Sujeito ao parecer da Fase 0.
