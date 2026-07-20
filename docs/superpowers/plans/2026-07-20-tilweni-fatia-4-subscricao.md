# TILWENI Fase A — Fatia 4: Subscrição (manifestação de interesse) · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manifestação de interesse do investidor num projeto (montante + re-aceitação de termos), progressão gerida pelo staff (`interesse → contrato_assinado → fundos_confirmados`) com arquivo do contrato PDF auditado, recomputo de `subscribed_amount`/`investor_count` apenas de `fundos_confirmados`, limite de investidores quando definido, e a "minha posição" na ficha.

**Architecture:** Segue os padrões das Fatias 2-3. Tabela `subscriptions` com RLS (investidor lê as suas; staff lê tudo) e escrita exclusiva via Server Actions com service role. Máquina de estados pura. Bucket privado `contracts`; contrato servido por Route Handler auditado (fail-closed) como no KYC. A RLS de `projects` é alargada para o investidor ver também os projetos onde tem subscrição. Contratualização/assinatura é **externa** (advogado/CMD fora da plataforma) — esta fatia só regista a progressão e arquiva o PDF; a assinatura digital integrada é Fase B.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + Storage + RLS), Vitest + `pg`, next-intl, Tailwind + shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md](../specs/2026-07-17-tilweni-fase-a-design.md) (secções 3.4, 5.4).

---

## Decisões de slice (confirmadas com o utilizador)

- **Base do progresso:** `subscribed_amount` e `investor_count` contam APENAS subscrições em `fundos_confirmados` (o progresso reflete dinheiro na conta dedicada, não intenções).
- **Montante mínimo** configurável em `platform_settings.min_subscription_amount` (default `5000`). **Máximo de investidores** (`max_investors_per_project`, já existe, atualmente `null`) só é imposto quando não-null; validado ao confirmar fundos.
- **Sem IBAN na plataforma:** o gestor regista a confirmação de fundos com uma referência/nota (data + `confirmed_ref`); os dados de transferência são comunicados fora da plataforma.
- **Contratualização externa:** o contrato é preparado/assinado fora (advogado/CMD); o staff só arquiva o PDF e faz progredir os estados. (Assinatura digital = Fase B.)
- **Re-aceitação de termos** de risco em cada manifestação de interesse (spec 3.4), registada na subscrição (`consent_given` + `terms_version` + IP).

## Máquina de estados da subscrição

`interesse → contrato_assinado → fundos_confirmados` (avanço sequencial). De `interesse` ou `contrato_assinado` pode ir a `cancelada`. `fundos_confirmados` e `cancelada` são terminais.

## Armadilhas conhecidas desta máquina (herdadas)

- **PowerShell escreve BOM** — SQL/TS sem BOM (Git Bash). Verificar `head -c 3 <f> | xxd -p` ≠ `efbbbf`.
- **Stack local 54421 (API) / 54422 (DB)**; `.env.test` é a fonte de verdade. Nunca hardcodar 54321.
- **`numeric` do Postgres**: normalizar para `number` no serviço (o PostgREST varia entre versões) — ver `src/lib/projects/service.ts`.
- **Route groups não mudam o URL** — cuidado com colisões.
- **Servidores Next órfãos** dão output falso — confirmar PID.
- **Grants:** anon/authenticated não têm DML de escrita (hardening); a escrita é sempre via service role. Uma nova tabela traz por default o grant de escrita — a migração desta fatia deve **revogá-lo** em `subscriptions` (como as outras).
- Escrever i18n de um namespace ANTES das páginas que o usam.

## Estrutura de ficheiros

```
supabase/migrations/
  <ts>_subscriptions.sql               # Task 3: tabela, enum, RLS, audit, bucket contracts, settings, projects RLS+, revoke grants
src/lib/subscriptions/
  states.ts                            # Task 1: máquina de estados (puro)
  service.ts                           # Task 4: manifestInterest/transition/cancel/list/getMine/recompute (server-only)
  storage.ts                           # Task 4: upload/URL assinada do contrato
src/lib/mail/templates.ts              # Task 5: +subscription_interest, subscription_confirmed
src/lib/projects/service.ts            # Task 6: getProjectDetail passa a aceitar viewerId (visibilidade por subscrição)
src/app/[locale]/projetos/[id]/
  page.tsx                             # Task 6/7: "minha posição" + form de manifestação
  ManifestForm.tsx                     # Task 7: form client (montante + consentimento)
  actions.ts                           # Task 7: manifestInterestAction (sessão + KYC)
src/app/[locale]/(admin)/gestao-projetos/[id]/subscricoes/
  page.tsx                             # Task 8: gestão de subscrições do projeto
  actions.ts                           # Task 8: transição/cancelar/upload contrato/confirmar (requireStaff)
src/app/api/subscriptions/contract/[id]/route.ts  # Task 8: contrato auditado (URL assinada)
messages/pt.json, messages/en.json     # Task 2
tests/unit/subscription-states.test.ts # Task 1
tests/rls/subscriptions.test.ts        # Task 2
tests/integration/subscriptions.test.ts# Task 4
```

---

### Task 1: Máquina de estados da subscrição (puro, TDD)

**Files:**
- Create: `src/lib/subscriptions/states.ts`, `tests/unit/subscription-states.test.ts`

- [ ] **Step 1: Escrever `tests/unit/subscription-states.test.ts`**

```ts
import {describe, it, expect} from 'vitest';
import {
  canTransition,
  nextStates,
  isTerminal,
  type SubscriptionStatus
} from '@/lib/subscriptions/states';

describe('máquina de estados da subscrição', () => {
  it('avança sequencialmente', () => {
    expect(canTransition('interesse', 'contrato_assinado')).toBe(true);
    expect(canTransition('contrato_assinado', 'fundos_confirmados')).toBe(true);
  });

  it('permite cancelar de interesse e contrato_assinado', () => {
    expect(canTransition('interesse', 'cancelada')).toBe(true);
    expect(canTransition('contrato_assinado', 'cancelada')).toBe(true);
  });

  it('não permite cancelar fundos confirmados', () => {
    expect(canTransition('fundos_confirmados', 'cancelada')).toBe(false);
  });

  it('não permite saltar nem recuar', () => {
    expect(canTransition('interesse', 'fundos_confirmados')).toBe(false);
    expect(canTransition('contrato_assinado', 'interesse')).toBe(false);
  });

  it('estados terminais', () => {
    expect(isTerminal('fundos_confirmados')).toBe(true);
    expect(isTerminal('cancelada')).toBe(true);
    expect(isTerminal('interesse')).toBe(false);
  });

  it('nextStates para progressão no back-office (exclui cancelada)', () => {
    expect(nextStates('interesse')).toEqual<SubscriptionStatus[]>([
      'contrato_assinado'
    ]);
    expect(nextStates('contrato_assinado')).toEqual<SubscriptionStatus[]>([
      'fundos_confirmados'
    ]);
    expect(nextStates('fundos_confirmados')).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA**

Run: `npm test -- tests/unit/subscription-states.test.ts` — FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/subscriptions/states.ts`**

```ts
/**
 * Máquina de estados da subscrição (spec 5.4). Progressão sequencial gerida
 * pelo staff; cancelamento possível antes de os fundos estarem confirmados.
 */

export type SubscriptionStatus =
  | 'interesse'
  | 'contrato_assinado'
  | 'fundos_confirmados'
  | 'cancelada';

const FORWARD: Record<SubscriptionStatus, SubscriptionStatus | null> = {
  interesse: 'contrato_assinado',
  contrato_assinado: 'fundos_confirmados',
  fundos_confirmados: null,
  cancelada: null
};

/** Estado seguinte na progressão (não inclui 'cancelada'). */
export function nextStates(current: SubscriptionStatus): SubscriptionStatus[] {
  const next = FORWARD[current];
  return next ? [next] : [];
}

export function isTerminal(s: SubscriptionStatus): boolean {
  return s === 'fundos_confirmados' || s === 'cancelada';
}

export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  if (to === 'cancelada') {
    return from === 'interesse' || from === 'contrato_assinado';
  }
  return nextStates(from).includes(to);
}
```

- [ ] **Step 4: Correr e confirmar PASSA** — `npm test -- tests/unit/subscription-states.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptions/states.ts tests/unit/subscription-states.test.ts
git commit -m "feat(subscricao): máquina de estados (puro)"
```

---

### Task 2: i18n namespaces + testes RLS (a falhar)

**Files:**
- Modify: `messages/pt.json`, `messages/en.json`
- Create: `tests/rls/subscriptions.test.ts`

- [ ] **Step 1: Adicionar a `messages/pt.json`** (antes do `}` final):

```json
  "Subscription": {
    "manifestTitle": "Manifestar interesse",
    "amount": "Montante a investir (€)",
    "minNotice": "Montante mínimo: {min}.",
    "consent": "Declaro ter sido informado e compreender que este investimento não tem capital garantido, pode resultar na perda total ou parcial do montante investido, é ilíquido, e que as rentabilidades apresentadas são estimativas e não constituem garantia de retorno.",
    "consentRequired": "É necessário aceitar a declaração para continuar.",
    "submit": "Manifestar interesse",
    "submitError": "Não foi possível registar. Verifique os dados e tente novamente.",
    "belowMin": "O montante é inferior ao mínimo exigido.",
    "already": "Já tem uma subscrição ativa neste projeto.",
    "myPosition": "A minha posição",
    "status_interesse": "Interesse manifestado",
    "status_contrato_assinado": "Contrato assinado",
    "status_fundos_confirmados": "Fundos confirmados",
    "status_cancelada": "Cancelada",
    "positionAmount": "Montante: {amount}",
    "contractPending": "Aguarda preparação do contrato pela TILWENI.",
    "cancel": "Cancelar interesse"
  },
  "SubscriptionAdmin": {
    "title": "Subscrições",
    "empty": "Sem subscrições neste projeto.",
    "investor": "Investidor",
    "amount": "Montante",
    "status": "Estado",
    "advance": "Avançar para {state}",
    "cancel": "Cancelar",
    "uploadContract": "Carregar contrato (PDF)",
    "contract": "Contrato",
    "confirmRef": "Referência da transferência",
    "confirmFunds": "Confirmar fundos",
    "maxReached": "Limite de investidores do projeto atingido."
  }
```

- [ ] **Step 2: Adicionar as MESMAS chaves (traduzidas) a `messages/en.json`**

```json
  "Subscription": {
    "manifestTitle": "Express interest",
    "amount": "Amount to invest (€)",
    "minNotice": "Minimum amount: {min}.",
    "consent": "I declare I have been informed and understand that this investment has no guaranteed capital, may result in the total or partial loss of the amount invested, is illiquid, and that the returns shown are estimates and not a guarantee of return.",
    "consentRequired": "You must accept the declaration to continue.",
    "submit": "Express interest",
    "submitError": "Could not register. Check the details and try again.",
    "belowMin": "The amount is below the required minimum.",
    "already": "You already have an active subscription for this project.",
    "myPosition": "My position",
    "status_interesse": "Interest expressed",
    "status_contrato_assinado": "Contract signed",
    "status_fundos_confirmados": "Funds confirmed",
    "status_cancelada": "Cancelled",
    "positionAmount": "Amount: {amount}",
    "contractPending": "Awaiting contract preparation by TILWENI.",
    "cancel": "Cancel interest"
  },
  "SubscriptionAdmin": {
    "title": "Subscriptions",
    "empty": "No subscriptions for this project.",
    "investor": "Investor",
    "amount": "Amount",
    "status": "Status",
    "advance": "Advance to {state}",
    "cancel": "Cancel",
    "uploadContract": "Upload contract (PDF)",
    "contract": "Contract",
    "confirmRef": "Transfer reference",
    "confirmFunds": "Confirm funds",
    "maxReached": "Project investor limit reached."
  }
```

- [ ] **Step 3: Paridade** — `npm test -- tests/messages-parity.test.ts` → PASS

- [ ] **Step 4: Escrever `tests/rls/subscriptions.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const invA = `sub-a-${run}@test.local`;
const invB = `sub-b-${run}@test.local`;
const staff = `sub-staff-${run}@test.local`;

let idA: string;
let idB: string;
let projectId: string;
let subAId: string;

beforeAll(async () => {
  idA = (await createTestUser(invA)).id;
  idB = (await createTestUser(invB)).id;
  await createTestUser(staff, 'admin');

  const {data: p, error: pe} = await admin
    .from('projects')
    .insert({
      name: 'Proj Sub',
      location: 'Porto',
      status: 'subscricao',
      total_amount: 150000,
      estimated_irr: 20,
      term_months: 9
    })
    .select('id')
    .single();
  if (pe) throw pe;
  projectId = p.id;

  const {data: s, error: se} = await admin
    .from('subscriptions')
    .insert({
      project_id: projectId,
      user_id: idA,
      amount: 20000,
      status: 'interesse',
      consent_given: true,
      terms_version: 'v1'
    })
    .select('id')
    .single();
  if (se) throw se;
  subAId = s.id;
});

describe('subscriptions RLS', () => {
  it('investidor lê a sua própria subscrição', async () => {
    const c = await signInAs(invA);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê a subscrição de outro', async () => {
    const c = await signInAs(invB);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff lê todas as subscrições', async () => {
    const c = await signInAs(staff);
    const {data, error} = await c
      .from('subscriptions')
      .select('id')
      .eq('id', subAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO escreve subscrições (sem grant/política)', async () => {
    const c = await signInAs(invA);
    await c.from('subscriptions').update({amount: 999999}).eq('id', subAId);
    const {data} = await admin
      .from('subscriptions')
      .select('amount')
      .eq('id', subAId)
      .single();
    expect(Number(data!.amount)).toBe(20000);
  });

  it('anónimo não vê subscrições', async () => {
    const {data} = await anonClient().from('subscriptions').select('id');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('projects RLS alargada por subscrição', () => {
  it('investidor com subscrição vê o projeto mesmo fora de subscricao', async () => {
    // Mover o projeto para em_curso (deixa de estar no catálogo aberto).
    await admin.from('projects').update({status: 'em_curso'}).eq('id', projectId);
    const c = await signInAs(invA);
    const {data} = await c.from('projects').select('id').eq('id', projectId);
    expect(data).toHaveLength(1); // A tem subscrição → vê
    // Repor
    await admin
      .from('projects')
      .update({status: 'subscricao'})
      .eq('id', projectId);
  });

  it('investidor SEM subscrição não vê um projeto em em_curso', async () => {
    await admin.from('projects').update({status: 'em_curso'}).eq('id', projectId);
    const c = await signInAs(invB);
    const {data} = await c.from('projects').select('id').eq('id', projectId);
    expect(data ?? []).toHaveLength(0);
    await admin
      .from('projects')
      .update({status: 'subscricao'})
      .eq('id', projectId);
  });
});
```

- [ ] **Step 5: Correr — FALHA com 42P01** (`public.subscriptions` não existe)

Run: `npm test -- tests/rls/subscriptions.test.ts` → FAIL (beforeAll rebenta a inserir em `subscriptions`). Confirmar a causa via GET direto (`curl .../rest/v1/subscriptions?select=id` com service key → `42P01`).

- [ ] **Step 6: Commit**

```bash
git add messages/pt.json messages/en.json tests/rls/subscriptions.test.ts
git commit -m "feat(subscricao): namespaces i18n + testes RLS (a falhar — schema por criar)"
```

---

### Task 3: Migração das subscrições (tabela, RLS, audit, bucket, settings, projects RLS+, grants)

**Files:**
- Create: `supabase/migrations/<timestamp>_subscriptions.sql`

- [ ] **Step 1: Gerar** — `supabase migration new subscriptions` (escrever SEM BOM).

- [ ] **Step 2: Escrever a migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 4 — Subscrição (manifestação de interesse)
-- subscriptions + RLS + audit + bucket contracts + settings +
-- alargamento da RLS de projects + revoke de grants de escrita.
-- Escrita: exclusivamente via Server Actions com service role.
-- ============================================================

create type public.subscription_status as enum (
  'interesse', 'contrato_assinado', 'fundos_confirmados', 'cancelada'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status public.subscription_status not null default 'interesse',
  consent_given boolean not null,
  terms_version text not null,
  interest_ip inet,
  contract_path text,
  signed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_ref text,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_consent_required check (consent_given = true)
);

create index subscriptions_project_idx on public.subscriptions (project_id);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- Um investidor só pode ter UMA subscrição ativa (não cancelada) por projeto.
create unique index subscriptions_one_active_per_user_project
  on public.subscriptions (project_id, user_id)
  where status <> 'cancelada';

alter table public.subscriptions enable row level security;

-- Investidor lê as SUAS subscrições.
create policy "subscriptions: dono lê"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Staff lê todas.
create policy "subscriptions: staff lê"
  on public.subscriptions for select
  to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de escrita: só service role.

-- Auditoria (reutiliza audit_row_change da Fatia 0).
create trigger subscriptions_audit
  after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row_change();

-- ---------- Alargar a RLS de projects: investidor vê onde tem subscrição ----------
-- Políticas SELECT permissivas somam-se (OR). Esta adiciona a visibilidade dos
-- projetos onde o investidor tem uma subscrição ativa, mesmo fora de 'subscricao'.
create policy "projects: investidor com subscrição"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.project_id = projects.id
        and s.user_id = auth.uid()
        and s.status <> 'cancelada'
    )
  );

-- ---------- Storage: bucket privado de contratos ----------
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- ---------- settings ----------
insert into public.platform_settings (key, value, description) values
  ('min_subscription_amount', '5000'::jsonb,
   'Montante mínimo por subscrição (€). Evita fracionamento massificado (spec secção 4).')
on conflict (key) do nothing;

-- ---------- Grants (hardening repo-wide): sem escrita para anon/authenticated ----------
-- Nova tabela traz DML completo por default privileges; a RLS é a barreira, mas
-- mantém-se a defesa em profundidade (ver 20260720143649_revoke_anon_writes.sql).
revoke insert, update, delete, truncate on public.subscriptions
  from anon, authenticated;
```

- [ ] **Step 3: Aplicar + sem BOM**

```bash
head -c 3 supabase/migrations/*_subscriptions.sql | xxd -p   # ≠ efbbbf
supabase db reset
```

- [ ] **Step 4: Testes RLS das subscrições — PASSAM** — `npm test -- tests/rls/subscriptions.test.ts`

- [ ] **Step 5: Suite completa** — `npm test` (verde; nada regrediu).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_subscriptions.sql
git commit -m "feat(subscricao): migração — subscriptions com RLS+audit, bucket contracts, projects RLS+, grants"
```

---

### Task 4: Serviço + Storage (server-only, service role)

**Files:**
- Create: `src/lib/subscriptions/storage.ts`, `src/lib/subscriptions/service.ts`, `tests/integration/subscriptions.test.ts`

- [ ] **Step 1: Escrever `tests/integration/subscriptions.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  manifestInterest,
  transitionSubscription,
  cancelSubscription,
  getMySubscription,
  listProjectSubscriptions
} from '@/lib/subscriptions/service';

const run = randomUUID().slice(0, 8);
let staffId: string;

async function makeProject(status = 'subscricao'): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `P-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status,
      total_amount: 200000,
      estimated_irr: 18,
      term_months: 10
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function freshInvestor(): Promise<string> {
  return (await createTestUser(`sub-svc-${randomUUID().slice(0, 8)}@test.local`)).id;
}

const noopMail = {transport: {sendMail: async () => ({})}};

beforeAll(async () => {
  staffId = (await createTestUser(`sub-rev-${run}@test.local`, 'admin')).id;
});

describe('manifestInterest', () => {
  it('cria subscrição em interesse (respeitando o mínimo)', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    expect(id).toBeTruthy();
    const mine = await getMySubscription(userId, projectId);
    expect(mine!.status).toBe('interesse');
    expect(mine!.amount).toBe(20000);
  });

  it('rejeita montante abaixo do mínimo', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await expect(
      manifestInterest(
        {userId, projectId, amount: 100, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow(/mínimo|minimo/i);
  });

  it('rejeita segunda subscrição ativa no mesmo projeto', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    await expect(
      manifestInterest(
        {userId, projectId, amount: 30000, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow();
  });

  it('rejeita manifestação num projeto que não está em subscricao', async () => {
    const projectId = await makeProject('preparacao');
    const userId = await freshInvestor();
    await expect(
      manifestInterest(
        {userId, projectId, amount: 20000, consentVersion: 'v1'},
        noopMail
      )
    ).rejects.toThrow(/subscri/i);
  });
});

describe('transitionSubscription + agregados', () => {
  it('confirmar fundos recomputa subscribed_amount/investor_count', async () => {
    const projectId = await makeProject();
    const u1 = await freshInvestor();
    const u2 = await freshInvestor();
    const {id: s1} = await manifestInterest(
      {userId: u1, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    const {id: s2} = await manifestInterest(
      {userId: u2, projectId, amount: 30000, consentVersion: 'v1'},
      noopMail
    );
    // s1 até fundos_confirmados
    await transitionSubscription({id: s1, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
    await transitionSubscription({id: s1, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail);
    // s2 fica em interesse
    const {data: proj} = await admin
      .from('projects')
      .select('subscribed_amount, investor_count')
      .eq('id', projectId)
      .single();
    expect(Number(proj!.subscribed_amount)).toBe(20000); // só s1
    expect(proj!.investor_count).toBe(1);
    void s2;
  });

  it('rejeita transição inválida', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest(
      {userId, projectId, amount: 20000, consentVersion: 'v1'},
      noopMail
    );
    await expect(
      transitionSubscription({id, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail)
    ).rejects.toThrow(/transição|transicao/i);
  });

  it('respeita max_investors_per_project quando definido', async () => {
    const projectId = await makeProject();
    // Definir limite = 1 para este teste (setting global; repor depois).
    await admin
      .from('platform_settings')
      .update({value: 1})
      .eq('key', 'max_investors_per_project');
    try {
      const u1 = await freshInvestor();
      const u2 = await freshInvestor();
      const {id: s1} = await manifestInterest({userId: u1, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
      const {id: s2} = await manifestInterest({userId: u2, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
      await transitionSubscription({id: s1, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
      await transitionSubscription({id: s1, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail);
      await transitionSubscription({id: s2, to: 'contrato_assinado', reviewerId: staffId, locale: 'pt'}, noopMail);
      await expect(
        transitionSubscription({id: s2, to: 'fundos_confirmados', reviewerId: staffId, locale: 'pt'}, noopMail)
      ).rejects.toThrow(/limite|max/i);
    } finally {
      await admin.from('platform_settings').update({value: null}).eq('key', 'max_investors_per_project');
    }
  });
});

describe('cancelSubscription', () => {
  it('o dono cancela a sua manifestação de interesse', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    const {id} = await manifestInterest({userId, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
    await cancelSubscription({id, byUserId: userId, isStaff: false});
    const mine = await getMySubscription(userId, projectId);
    expect(mine).toBeNull(); // getMySubscription só devolve ativas
  });
});

describe('listProjectSubscriptions', () => {
  it('lista as subscrições de um projeto (staff)', async () => {
    const projectId = await makeProject();
    const userId = await freshInvestor();
    await manifestInterest({userId, projectId, amount: 20000, consentVersion: 'v1'}, noopMail);
    const rows = await listProjectSubscriptions(projectId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].amount).toBe(20000);
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA** — `npm test -- tests/integration/subscriptions.test.ts`

- [ ] **Step 3: Implementar `src/lib/subscriptions/storage.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const CONTRACTS_BUCKET = 'contracts';

export function contractPath(
  subscriptionId: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${subscriptionId}/${Date.now()}-${safe}`;
}

export async function uploadContract(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload contrato falhou: ${error.message}`);
}

export async function signedContractUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url contrato falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 4: Implementar `src/lib/subscriptions/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {canTransition, type SubscriptionStatus} from './states';

/**
 * Lógica de subscrições (server-only, service role). Escrita só por aqui,
 * chamada por Server Actions que garantem sessão/KYC (manifestação) ou staff
 * (progressão). RLS é dono-lê + staff-lê; escrita nunca passa por RLS.
 */

export type SubscriptionRow = {
  id: string;
  project_id: string;
  user_id: string;
  amount: number;
  status: SubscriptionStatus;
  contract_path: string | null;
  confirmed_ref: string | null;
  created_at: string;
};

function toRow(raw: Record<string, unknown>): SubscriptionRow {
  return {
    ...(raw as SubscriptionRow),
    amount: Number(raw.amount)
  };
}

async function settingNumber(
  db: SupabaseClient,
  key: string
): Promise<number | null> {
  const {data} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .single();
  const v = data?.value;
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ManifestInput = {
  userId: string;
  projectId: string;
  amount: number;
  consentVersion: string;
  interestIp?: string;
};

export async function manifestInterest(
  input: ManifestInput,
  deps: SendEmailDeps = {}
): Promise<{id: string}> {
  const db = deps.db ?? createAdminClient();

  // Projeto tem de estar em subscricao.
  const {data: project} = await db
    .from('projects')
    .select('status, name')
    .eq('id', input.projectId)
    .single();
  if (!project || project.status !== 'subscricao') {
    throw new Error('projeto não está em subscrição');
  }

  // Investidor tem de ter KYC aprovado.
  const {data: profile} = await db
    .from('profiles')
    .select('kyc_status, full_name')
    .eq('id', input.userId)
    .single();
  if (profile?.kyc_status !== 'approved') {
    throw new Error('KYC não aprovado');
  }

  // Montante mínimo.
  const min = (await settingNumber(db, 'min_subscription_amount')) ?? 0;
  if (input.amount < min) {
    throw new Error(`montante abaixo do mínimo (${min})`);
  }

  const {data: sub, error} = await db
    .from('subscriptions')
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      amount: input.amount,
      status: 'interesse',
      consent_given: true,
      terms_version: input.consentVersion,
      interest_ip: input.interestIp ?? null
    })
    .select('id')
    .single();
  if (error || !sub) {
    // Índice único (subscrição ativa já existe) cai aqui.
    throw new Error(`registar subscrição falhou: ${error?.message ?? 'sem linha'}`);
  }

  // Notificar staff (email institucional). O destinatário concreto fica a cargo
  // da configuração; aqui usa-se o template 'subscription_interest'.
  await sendEmail(
    {
      toEmail: await staffNotifyEmail(db),
      locale: 'pt',
      template: 'subscription_interest',
      payload: {
        projectName: project.name,
        investorName: profile?.full_name ?? '',
        amount: formatEur(input.amount)
      }
    },
    {db, transport: deps.transport}
  );

  return {id: sub.id};
}

export type TransitionInput = {
  id: string;
  to: SubscriptionStatus;
  reviewerId: string;
  locale: Locale;
  confirmedRef?: string;
};

export async function transitionSubscription(
  input: TransitionInput,
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const {data: cur} = await db
    .from('subscriptions')
    .select('status, project_id, user_id, amount')
    .eq('id', input.id)
    .single();
  if (!cur) throw new Error(`subscrição ${input.id} não encontrada`);
  if (!canTransition(cur.status as SubscriptionStatus, input.to)) {
    throw new Error(`transição inválida: ${cur.status} → ${input.to}`);
  }

  // Ao confirmar fundos, respeitar o limite de investidores (se definido).
  if (input.to === 'fundos_confirmados') {
    const max = await settingNumber(db, 'max_investors_per_project');
    if (max !== null) {
      const {count} = await db
        .from('subscriptions')
        .select('user_id', {count: 'exact', head: true})
        .eq('project_id', cur.project_id)
        .eq('status', 'fundos_confirmados');
      if ((count ?? 0) + 1 > max) {
        throw new Error(`limite de investidores atingido (max ${max})`);
      }
    }
  }

  const patch: Record<string, unknown> = {
    status: input.to,
    reviewed_by: input.reviewerId,
    updated_at: new Date().toISOString()
  };
  if (input.to === 'contrato_assinado') patch.signed_at = new Date().toISOString();
  if (input.to === 'fundos_confirmados') {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_ref = input.confirmedRef ?? null;
  }

  const {error} = await db
    .from('subscriptions')
    .update(patch)
    .eq('id', input.id)
    .eq('status', cur.status); // idempotência
  if (error) throw new Error(`transição falhou: ${error.message}`);

  // Recomputar agregados do projeto (só fundos_confirmados contam).
  await recomputeProjectAggregates(db, cur.project_id);

  // Notificar o investidor na confirmação de fundos.
  if (input.to === 'fundos_confirmados') {
    await sendEmail(
      {
        toEmail: await userEmail(db, cur.user_id),
        locale: input.locale,
        template: 'subscription_confirmed',
        payload: {amount: formatEur(Number(cur.amount))}
      },
      {db, transport: deps.transport}
    );
  }
}

export async function attachContract(
  id: string,
  contractStoragePath: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {error} = await db
    .from('subscriptions')
    .update({contract_path: contractStoragePath, updated_at: new Date().toISOString()})
    .eq('id', id);
  if (error) throw new Error(`anexar contrato falhou: ${error.message}`);
}

export async function cancelSubscription(
  input: {id: string; byUserId: string; isStaff: boolean},
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: cur} = await db
    .from('subscriptions')
    .select('status, user_id, project_id')
    .eq('id', input.id)
    .single();
  if (!cur) throw new Error('subscrição não encontrada');
  if (!input.isStaff && cur.user_id !== input.byUserId) {
    throw new Error('sem permissão para cancelar');
  }
  if (!canTransition(cur.status as SubscriptionStatus, 'cancelada')) {
    throw new Error('não é possível cancelar neste estado');
  }
  const {error} = await db
    .from('subscriptions')
    .update({status: 'cancelada', updated_at: new Date().toISOString()})
    .eq('id', input.id)
    .eq('status', cur.status);
  if (error) throw new Error(`cancelar falhou: ${error.message}`);
  await recomputeProjectAggregates(db, cur.project_id);
}

export async function getMySubscription(
  userId: string,
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<SubscriptionRow | null> {
  const {data} = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .neq('status', 'cancelada')
    .maybeSingle();
  return data ? toRow(data) : null;
}

export async function listProjectSubscriptions(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<SubscriptionRow[]> {
  const {data, error} = await db
    .from('subscriptions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', {ascending: true});
  if (error) throw new Error(`listar subscrições falhou: ${error.message}`);
  return (data ?? []).map(toRow);
}

// --- helpers ---

async function recomputeProjectAggregates(
  db: SupabaseClient,
  projectId: string
): Promise<void> {
  const {data} = await db
    .from('subscriptions')
    .select('amount, user_id')
    .eq('project_id', projectId)
    .eq('status', 'fundos_confirmados');
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const investors = new Set(rows.map((r) => r.user_id)).size;
  const {error} = await db
    .from('projects')
    .update({subscribed_amount: total, investor_count: investors})
    .eq('id', projectId);
  if (error) throw new Error(`recomputar agregados falhou: ${error.message}`);
}

async function userEmail(db: SupabaseClient, userId: string): Promise<string> {
  const {data} = await db.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) throw new Error(`utilizador ${userId} sem email`);
  return email;
}

/** Email para notificar o staff de novas manifestações. Usa o SMTP_USER como
 *  destino institucional por defeito (configurável no futuro). */
async function staffNotifyEmail(_db: SupabaseClient): Promise<string> {
  return process.env.SMTP_USER ?? 'staff@tilweni.local';
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(n);
}
```

- [ ] **Step 5: Correr o teste de integração — PASSA (depois da Task 5 para os templates)**

Nota: `manifestInterest`/`transitionSubscription` usam os templates `subscription_interest`/`subscription_confirmed` (Task 5). Implementa a Task 5 antes de correr este teste até verde (os testes injetam `transport` falso, mas `renderTemplate` lança em template desconhecido).

- [ ] **Step 6: Commit**

```bash
git add src/lib/subscriptions/storage.ts src/lib/subscriptions/service.ts tests/integration/subscriptions.test.ts
git commit -m "feat(subscricao): serviço manifest/transition/cancel/recompute + storage (service role)"
```

---

### Task 5: Templates de email da subscrição

**Files:**
- Modify: `src/lib/mail/templates.ts`
- Modify: `tests/unit/mail-templates.test.ts`

- [ ] **Step 1: Adicionar testes a `tests/unit/mail-templates.test.ts`**

```ts
describe('templates subscrição', () => {
  it('subscription_interest rende', () => {
    const r = renderTemplate('subscription_interest', 'pt', {
      projectName: 'Campelos',
      investorName: 'Ana',
      amount: '20 000 €'
    });
    expect(r.html).toContain('Campelos');
    expect(r.html).toContain('Ana');
  });

  it('subscription_confirmed rende', () => {
    const r = renderTemplate('subscription_confirmed', 'pt', {amount: '20 000 €'});
    expect(r.html).toContain('20 000');
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA** — `npm test -- tests/unit/mail-templates.test.ts`

- [ ] **Step 3: Estender `src/lib/mail/templates.ts`** — seguir o estilo das funções `renderX(locale, payload)` existentes (com `layout()` + `esc()`, subjects bilingues), como nos templates de KYC.

Atualizar a união `TemplateName`:
```ts
export type TemplateName =
  | 'invite'
  | 'welcome'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'subscription_interest'
  | 'subscription_confirmed';
```

Adicionar payloads e ao `TemplatePayloadMap`:
```ts
export type SubscriptionInterestPayload = {
  projectName: string;
  investorName: string;
  amount: string;
};
export type SubscriptionConfirmedPayload = {amount: string};
```
```ts
  subscription_interest: SubscriptionInterestPayload;
  subscription_confirmed: SubscriptionConfirmedPayload;
```

Adicionar as funções de render + os `case` no `switch` do `renderTemplate` (seguir a forma dos `kyc_*`):
- **subscription_interest** (para staff): assunto PT "TILWENI — Nova manifestação de interesse"; corpo: "{investorName} manifestou interesse de {amount} no projeto {projectName}." (escapar tudo). EN equivalente.
- **subscription_confirmed** (para investidor): assunto PT "TILWENI — Fundos confirmados"; corpo: "Confirmámos a receção do seu investimento de {amount}. Obrigado." EN equivalente.

Todos com o rodapé de risco já existente no `layout`.

- [ ] **Step 4: Correr templates + integração das subscrições**

Run: `npm test -- tests/unit/mail-templates.test.ts` → PASS
Run: `npm test -- tests/integration/subscriptions.test.ts` → PASS

- [ ] **Step 5: Typecheck (exaustividade do switch)** — `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/mail/templates.ts tests/unit/mail-templates.test.ts
git commit -m "feat(subscricao): templates de email (interesse p/ staff, fundos confirmados p/ investidor)"
```

---

### Task 6: Visibilidade da ficha por subscrição (serviço) + "minha posição"

**Files:**
- Modify: `src/lib/projects/service.ts` (getProjectDetail aceita viewerId)
- Modify: `src/app/[locale]/projetos/[id]/page.tsx` (usa viewerId; mostra "minha posição")

- [ ] **Step 1: Alterar `getProjectDetail` em `src/lib/projects/service.ts`**

A assinatura passa a `getProjectDetail(id, opts: {staff: boolean; viewerId?: string}, db?)`. A regra de visibilidade passa a: staff, OU `status === 'subscricao'`, OU o `viewerId` tem uma subscrição ativa no projeto. Substituir a linha atual:

```ts
  if (!opts.staff && project.status !== 'subscricao') return null;
```
por:
```ts
  if (!opts.staff && project.status !== 'subscricao') {
    // Um investidor com subscrição ativa vê a ficha mesmo fora de 'subscricao'.
    let hasSub = false;
    if (opts.viewerId) {
      const {count} = await db
        .from('subscriptions')
        .select('id', {count: 'exact', head: true})
        .eq('project_id', id)
        .eq('user_id', opts.viewerId)
        .neq('status', 'cancelada');
      hasSub = (count ?? 0) > 0;
    }
    if (!hasSub) return null;
  }
```

Nota: as chamadas existentes com `{staff: true}` (back-office) e `{staff}` (ficha) continuam válidas; `viewerId` é opcional. Adicionar `viewerId` na chamada da ficha (Step 2).

- [ ] **Step 2: Atualizar a ficha `src/app/[locale]/projetos/[id]/page.tsx`**

- Passar `viewerId`: `getProjectDetail(id, {staff, viewerId: session?.userId})`.
- Substituir o stub de "minha posição" (as linhas com `t('myPosition')` / `t('noPosition')`). Carregar a subscrição do investidor: `import {getMySubscription} from '@/lib/subscriptions/service'` e, se houver sessão e não for staff, `const mine = session ? await getMySubscription(session.userId, id) : null;`. Renderizar (usar `getTranslations('Subscription')` como `ts`):
  - se `mine`: mostrar `ts('myPosition')`, `ts('positionAmount', {amount: eur(mine.amount)})`, e o estado `ts('status_' + mine.status)`; se `mine.status === 'interesse'`, mostrar `ts('contractPending')`; se `mine.status === 'interesse'`, um botão de cancelar (form → `cancelSubscriptionAction`, Task 7).
  - se não `mine` E o projeto está em `subscricao`: mostrar o `ManifestForm` (Task 7).
  - caso contrário (sem posição e não subscricao — não deve acontecer para investidor, a visibilidade já barra): nada.

(O `ManifestForm` e as actions são criados na Task 7; esta task pode deixar o form comentado/placeholder e a Task 7 liga-o — mas preferir fazer 6 e 7 juntas para a página compilar. Se separadas, esta task só faz a mudança de serviço + a leitura de `getMySubscription`, e a Task 7 acrescenta o form.)

- [ ] **Step 3: Verificar** — `npm test` (integração/RLS não regride), `npm run typecheck && npm run build`. O `getProjectDetail` alterado é coberto pelos testes de integração de projetos existentes (que chamam com `{staff:true}`) e pelos novos de subscrições.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects/service.ts "src/app/[locale]/projetos/[id]/page.tsx"
git commit -m "feat(subscricao): visibilidade da ficha por subscrição + a minha posição"
```

---

### Task 7: Manifestação de interesse (form + Server Action)

**Files:**
- Create: `src/app/[locale]/projetos/[id]/ManifestForm.tsx`, `src/app/[locale]/projetos/[id]/actions.ts`

- [ ] **Step 1: Server Actions `actions.ts`**

```ts
'use server';

import {headers} from 'next/headers';
import {getSession} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {manifestInterest, cancelSubscription} from '@/lib/subscriptions/service';
import {revalidatePath} from 'next/cache';

export type ManifestState = {ok: boolean; error?: string};

export async function manifestInterestAction(
  locale: string,
  projectId: string,
  _prev: ManifestState,
  formData: FormData
): Promise<ManifestState> {
  const session = await getSession();
  if (!session) return {ok: false, error: 'sessão inválida'};

  const amount = Number(formData.get('amount') ?? 0);
  const consent = formData.get('consent') === 'on';
  if (!consent) return {ok: false, error: 'consent_required'};
  if (!Number.isFinite(amount) || amount <= 0) {
    return {ok: false, error: 'amount'};
  }

  const db = createAdminClient();
  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'terms_version')
    .single();
  const consentVersion =
    typeof setting?.value === 'string' ? setting.value : 'v1';

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;

  try {
    await manifestInterest({
      userId: session.userId,
      projectId,
      amount,
      consentVersion,
      interestIp: ip
    });
    revalidatePath(`/${locale}/projetos/${projectId}`);
    return {ok: true};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro';
    if (/mínimo|minimo/i.test(msg)) return {ok: false, error: 'below_min'};
    if (/já|ativa|duplicate|unique/i.test(msg)) return {ok: false, error: 'already'};
    return {ok: false, error: 'generic'};
  }
}

export async function cancelSubscriptionAction(
  locale: string,
  projectId: string,
  subscriptionId: string
): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await cancelSubscription({id: subscriptionId, byUserId: session.userId, isStaff: false});
  revalidatePath(`/${locale}/projetos/${projectId}`);
}
```

- [ ] **Step 2: Form client `ManifestForm.tsx`**

Seguir o padrão do `KycForm` (`useActionState`, `useEffect` para `router.refresh()` no sucesso). Campos: `amount` (number, com `min` do setting mostrado via `minNotice`), checkbox `consent` (obrigatório, texto `Subscription.consent`), botão `submit`. Mostrar erros: `below_min` → `belowMin`, `already` → `already`, `consent_required` → `consentRequired`, resto → `submitError`. Recebe `locale`, `projectId`, e `min` (número, para o aviso). Usa `manifestInterestAction.bind(null, locale, projectId)`.

- [ ] **Step 3: Ligar na ficha** (se não feito na Task 6): renderizar `<ManifestForm locale={loc} projectId={id} min={min} />` quando não há posição e o projeto está em subscricao; e o botão de cancelar (`cancelSubscriptionAction.bind(null, loc, id, mine.id)`) quando `mine.status === 'interesse'`. Ler `min` de `platform_settings.min_subscription_amount` na página.

- [ ] **Step 4: Build + typecheck + lint** — sem erros; verificar `ManifestForm` não importa nada server-only.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/projetos/[id]/ManifestForm.tsx" "src/app/[locale]/projetos/[id]/actions.ts" "src/app/[locale]/projetos/[id]/page.tsx"
git commit -m "feat(subscricao): manifestação de interesse (form + Server Action) + cancelar"
```

---

### Task 8: Back-office de subscrições + contrato auditado

**Files:**
- Create: `src/app/[locale]/(admin)/gestao-projetos/[id]/subscricoes/page.tsx`, `.../subscricoes/actions.ts`, `src/app/api/subscriptions/contract/[id]/route.ts`

- [ ] **Step 1: Route Handler do contrato auditado `src/app/api/subscriptions/contract/[id]/route.ts`**

Emite URL assinada de 60s para o contrato de uma subscrição, registando a consulta no audit_log ANTES (fail-closed). Acesso: o dono da subscrição OU staff.

```ts
import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedContractUrl} from '@/lib/subscriptions/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: sub} = await db
    .from('subscriptions')
    .select('contract_path, user_id')
    .eq('id', id)
    .single();
  if (!sub || !sub.contract_path) {
    return NextResponse.json({error: 'not_found'}, {status: 404});
  }
  const owner = sub.user_id === session.userId;
  if (!owner && !isStaff(session.role)) {
    return NextResponse.json({error: 'forbidden'}, {status: 403});
  }

  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'subscription_contract',
    entity_id: id,
    payload: {}
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedContractUrl(sub.contract_path, 60, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Server Actions `.../subscricoes/actions.ts`**

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  transitionSubscription,
  cancelSubscription,
  attachContract
} from '@/lib/subscriptions/service';
import {uploadContract, contractPath} from '@/lib/subscriptions/storage';
import {createAdminClient} from '@/lib/supabase/admin';
import type {SubscriptionStatus} from '@/lib/subscriptions/states';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function advanceSubscriptionAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string,
  to: SubscriptionStatus,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const confirmedRef =
    to === 'fundos_confirmados'
      ? String(formData.get('confirmed_ref') ?? '')
      : undefined;
  await transitionSubscription({
    id: subscriptionId,
    to,
    reviewerId: s.userId,
    locale,
    confirmedRef
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}

export async function cancelSubscriptionAdminAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string
): Promise<void> {
  const s = await requireStaff();
  await cancelSubscription({id: subscriptionId, byUserId: s.userId, isStaff: true});
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}

export async function uploadContractAction(
  locale: Locale,
  projectId: string,
  subscriptionId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('contract');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = contractPath(subscriptionId, file.name);
  await uploadContract(path, file, db);
  await attachContract(subscriptionId, path, db);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/subscricoes`);
}
```

- [ ] **Step 3: Página `.../subscricoes/page.tsx`**

Server Component (`force-dynamic`). Carrega `listProjectSubscriptions(projectId)` + os nomes/emails dos investidores (via `admin.auth.admin` ou uma leitura a `profiles`). Tabela: investidor, montante (eur), estado (`ts('status_'+...)`), contrato (link para `/api/subscriptions/contract/<id>` se `contract_path`), e ações: upload de contrato (`uploadContractAction`), avançar estado (para cada `nextStates(status)`, um form — no caso de `fundos_confirmados`, com input `confirmed_ref`), cancelar. Guard pelo `(admin)/layout.tsx` + `requireStaff()` nas actions. Adicionar um link para esta página a partir de `gestao-projetos/[id]/page.tsx` ("Subscrições").

- [ ] **Step 4: Build + typecheck + lint**

- [ ] **Step 5: Verificar o acesso auditado** — confirmar (a) rota no build; (b) sem sessão → 401; (c) uma consulta a um contrato existente por dono/staff regista `view_document`/`subscription_contract` no audit_log antes da URL (verificar via admin client). Documentar observado vs. raciocinado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(admin)/gestao-projetos/[id]/subscricoes" "src/app/api/subscriptions"
git commit -m "feat(subscricao): back-office de subscrições + contrato por URL assinada (auditado)"
```

---

### Task 9: i18n final + verificação e2e do slice

- [ ] **Step 1: Paridade + suite + build**

```bash
npm test -- tests/messages-parity.test.ts
npm test
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 2: Verificação e2e manual**

Com o stack local, um staff e um investidor KYC-aprovado:
1. Investidor abre a ficha de um projeto em subscrição → "Manifestar interesse" com montante ≥ mínimo + consentimento → vê "a minha posição" em `interesse`; staff recebe email (na outbox).
2. Staff em `/gestao-projetos/<id>/subscricoes` → avança para `contrato_assinado`, carrega o PDF do contrato; investidor vê o estado atualizado e (se aplicável) o link do contrato.
3. Staff confirma fundos com referência → subscrição em `fundos_confirmados`; o `subscribed_amount`/`investor_count` do projeto atualiza (só conta confirmados); investidor recebe email.
4. Confirmar o mínimo (montante abaixo é rejeitado) e o duplo (segunda manifestação ativa rejeitada).
5. Definir `max_investors_per_project` e confirmar que a confirmação de fundos além do limite é rejeitada; repor null.
6. Confirmar que um investidor com subscrição continua a ver a ficha depois de o projeto sair de `subscricao`.

Documentar o observado. Limpar dev server/portas.

- [ ] **Step 3: Commit (se houve ajustes)**

---

## Fora de âmbito (fatias seguintes / fases)

- **Assinatura digital integrada** (CMD/DocuSign) e geração assistida de contrato — Fase B.
- **Acompanhamento de obra** (updates, marcos, orçado-vs-real, extratos) — Fatia 5.
- **Dashboard/portefólio** agregado — Fatia 6.
- **Motor de distribuição / fiscal** (retenção, comprovativos) — Fase C.

## Notas de segurança/compliance

- Contratos: bucket privado, acesso só server-side por URL assinada, **consulta auditada fail-closed**; dono ou staff.
- Escrita de `subscriptions` só via Server Actions com service role; RLS dono-lê + staff-lê; grants de escrita revogados a anon/authenticated.
- Re-aceitação de termos de risco registada em cada manifestação (`consent_given`+`terms_version`+IP), com constraint a exigir consentimento.
- Montante mínimo (anti-fracionamento) e limite de investidores parametrizados; o máximo respeita o parecer da Fase 0 (null até lá).
- `subscribed_amount`/`investor_count` refletem apenas `fundos_confirmados` — coerente com a decisão de mostrar progresso real, e menos sujeito a leitura de "pressão social" do que contar intenções.
