# TILWENI Fase A — Fatia 3: Catálogo de Projetos · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo privado de projetos + ficha de projeto (fotos, localização, orçamento por rubrica, ARV, montante, prazo, indicadores TIR/ROI/margem, sala de documentos, progresso de subscrição atrás de flag) + back-office de gestão de projetos com máquina de estados do ciclo de vida.

**Architecture:** Segue os padrões das Fatias 1-2. Tabelas `projects` + `project_budget_lines` + `project_documents` + `project_photos` com RLS (investidor lê apenas projetos em subscrição; staff lê tudo) e escrita exclusiva via Server Actions com service role. Dois novos buckets de Storage privados (`project-photos`, `project-docs`); documentos servidos por Route Handler auditado com URL assinada (como no KYC). Indicadores calculados server-side por módulo puro. Máquina de estados explícita. Sinais de subscrição atrás de `platform_settings.show_subscription_progress` (decisão do utilizador, sujeita ao parecer da Fase 0).

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + Storage + RLS), Vitest + `pg`, next-intl, Tailwind + shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md](../specs/2026-07-17-tilweni-fase-a-design.md) (secções 3.3, 5). Protótipo de referência (design/dados/lógica): `Prototipo_FIX_FLIP.html` (fora do repo; base para modelo de dados e layout).

---

## Decisões de slice (confirmadas com o utilizador)

- **Âmbito: catálogo + ficha + back-office.** Subscrição/manifestação de interesse é Fatia 4; acompanhamento de obra (orçado-vs-real, marcos, diário, extratos) é Fatia 5; dashboard/portefólio é Fatia 6.
- **Progresso de subscrição visível**, atrás de `platform_settings.show_subscription_progress` (default `true`). Contraria a spec anti-crowdfunding original; decisão consciente do utilizador (comunidade fechada), a validar no parecer da Fase 0 — por isso é um flag, não hardcoded.
- **Posições de outros investidores: agregadas/anónimas** (ex.: "N investidores subscreveram X"), nunca nomes/valores individuais de terceiros (RGPD). Cada investidor vê a sua própria posição nominal. Também atrás do mesmo flag.
- **Indicadores calculados** server-side a partir dos valores estáticos do projeto (aquisição, obra, ARV, montante, prazo, TIR estimada inserida pelo gestor): ROI e margem derivados; TIR é inserida. A estimativa por-investidor que depende do modelo de distribuição fica para a Fatia C.
- **Design:** paleta sóbria do protótipo — navy (`--ink #0F2036`), serif display (Source Serif 4/Georgia) para títulos, mono (IBM Plex Mono) para números, sobre fundo claro `#EEF2F6`. Adaptar a Tailwind/shadcn; não copiar o HTML inline do protótipo.

## Estados do ciclo de vida (spec secção 5)

`preparacao` → `subscricao` → `subscrito` → `em_curso` → `concluido` → `liquidado`

- `preparacao`: criado no back-office, invisível ao investidor.
- `subscricao`: visível no catálogo privado.
- `subscrito`/`em_curso`/`concluido`/`liquidado`: visível apenas a quem tem posição (Fatia 4 alarga a RLS). Nesta fatia, sem subscrições, o investidor vê apenas `subscricao`.

## Armadilhas conhecidas desta máquina (herdadas)

- **PowerShell escreve BOM** — escrever SQL/TS com Git Bash. Verificar `head -c 3 <f> | xxd -p` ≠ `efbbbf`.
- **Stack local na porta 54421** (API) / **54422** (DB); `.env.test` é a fonte de verdade. Nunca hardcodar 54321.
- **Route groups NÃO mudam o URL:** `(admin)/projetos` colidiria com o `/projetos` do investidor. Back-office fica em `(admin)/gestao-projetos`.
- **Servidores Next órfãos** dão output falso — confirmar PID (`Get-NetTCPConnection -LocalPort 3000,3001,3002`).
- Escrever mensagens i18n de um namespace **antes** das páginas que as usam (a augmentation de tipos tipa a partir de `pt.json`).

## Estrutura de ficheiros

```
supabase/migrations/
  <ts>_projects.sql                    # Task 3: enums, tabelas, RLS, audit, buckets, settings
src/lib/projects/
  indicators.ts                        # Task 1: cálculo ROI/margem (puro)
  states.ts                            # Task 4: máquina de estados (puro)
  service.ts                           # Task 5: create/update/transition/list/get (server-only, service role)
  storage.ts                           # Task 5: upload foto/doc + URLs assinadas
src/app/[locale]/projetos/
  page.tsx                             # Task 7: catálogo do investidor
  [id]/page.tsx                        # Task 8: ficha do projeto
src/app/[locale]/(admin)/gestao-projetos/    # NÃO /projetos (colisão)
  page.tsx                             # Task 6: lista + criação
  [id]/page.tsx                        # Task 6: edição, rubricas, estados, uploads
  actions.ts                           # Task 6: Server Actions (requireStaff)
src/app/api/projects/document/[id]/route.ts  # Task 8: doc auditado (URL assinada)
src/app/api/projects/photo/[id]/route.ts     # Task 8: foto (URL assinada, sem audit)
messages/pt.json, messages/en.json     # Task 2 (antecipa namespaces) / Task 9 (final)
tests/unit/project-indicators.test.ts  # Task 1
tests/unit/project-states.test.ts      # Task 4
tests/rls/projects.test.ts             # Task 2
tests/integration/projects.test.ts     # Task 5
```

---

### Task 1: Indicadores financeiros (puro, TDD)

**Files:**
- Create: `src/lib/projects/indicators.ts`, `tests/unit/project-indicators.test.ts`

- [ ] **Step 1: Escrever `tests/unit/project-indicators.test.ts`**

```ts
import {describe, it, expect} from 'vitest';
import {computeIndicators} from '@/lib/projects/indicators';

describe('computeIndicators', () => {
  it('calcula investimento, margem e ROI a partir dos valores base', () => {
    const r = computeIndicators({
      acquisitionCost: 120000,
      worksBudget: 48000,
      arv: 245000
    });
    expect(r.totalInvestment).toBe(168000);
    expect(r.grossMargin).toBe(77000); // 245000 - 168000
    expect(r.roiPct).toBeCloseTo(45.83, 1); // 77000/168000*100
  });

  it('ROI é 0 quando não há investimento', () => {
    const r = computeIndicators({
      acquisitionCost: 0,
      worksBudget: 0,
      arv: 0
    });
    expect(r.roiPct).toBe(0);
  });

  it('margem pode ser negativa (ARV abaixo do investimento)', () => {
    const r = computeIndicators({
      acquisitionCost: 100000,
      worksBudget: 50000,
      arv: 140000
    });
    expect(r.grossMargin).toBe(-10000);
    expect(r.roiPct).toBeCloseTo(-6.67, 1);
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/unit/project-indicators.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/projects/indicators.ts`**

```ts
/**
 * Indicadores financeiros de um projeto, calculados a partir dos valores base
 * inseridos pelo gestor. Puro e sem I/O — a TIR estimada é inserida pelo gestor
 * (o seu cálculo rigoroso depende do calendário de fluxos, fora do âmbito desta
 * fatia); aqui derivam-se investimento total, margem bruta e ROI.
 */

export type IndicatorInput = {
  acquisitionCost: number;
  worksBudget: number;
  arv: number;
};

export type Indicators = {
  totalInvestment: number;
  grossMargin: number;
  roiPct: number;
};

export function computeIndicators(input: IndicatorInput): Indicators {
  const totalInvestment = input.acquisitionCost + input.worksBudget;
  const grossMargin = input.arv - totalInvestment;
  const roiPct =
    totalInvestment > 0 ? (grossMargin / totalInvestment) * 100 : 0;
  return {totalInvestment, grossMargin, roiPct};
}
```

- [ ] **Step 4: Correr e confirmar que PASSA**

Run: `npm test -- tests/unit/project-indicators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/indicators.ts tests/unit/project-indicators.test.ts
git commit -m "feat(projetos): indicadores financeiros (investimento/margem/ROI)"
```

---

### Task 2: Namespaces i18n (antecipados) + testes RLS a falhar

**Files:**
- Modify: `messages/pt.json`, `messages/en.json`
- Create: `tests/rls/projects.test.ts`

Antecipar as mensagens (a augmentation de tipos exige-as antes das páginas) e escrever os testes RLS (que falham até à migração da Task 3).

- [ ] **Step 1: Adicionar os namespaces a `messages/pt.json`** (antes do `}` final, a seguir ao último namespace existente)

```json
  "Catalog": {
    "title": "Catálogo de projetos",
    "empty": "De momento não há projetos disponíveis para subscrição.",
    "term": "Prazo",
    "months": "{n} meses",
    "irr": "TIR estimada",
    "amount": "Montante do projeto",
    "subscribed": "{pct}% subscrito",
    "investorsCount": "{n} investidores subscreveram {amount}"
  },
  "ProjectDetail": {
    "location": "Localização",
    "acquisition": "Custo de aquisição",
    "works": "Orçamento de obra",
    "arv": "Valor estimado de venda (ARV)",
    "amount": "Montante total do projeto",
    "term": "Prazo estimado",
    "months": "{n} meses",
    "irr": "TIR estimada",
    "roi": "ROI estimado",
    "margin": "Margem bruta estimada",
    "budgetTitle": "Orçamento de obra por rubrica",
    "phase": "Fase",
    "line": "Rubrica",
    "budgetAmount": "Orçamento",
    "docsTitle": "Sala de documentos",
    "photosTitle": "Imagens",
    "myPosition": "A minha posição",
    "noPosition": "Ainda não subscreveu este projeto.",
    "subscriptionTitle": "Subscrição",
    "subscribedOf": "{pct}% do montante subscrito",
    "riskNotice": "O investimento envolve risco de perda total do capital, é ilíquido e não beneficia de garantia de retorno. As rentabilidades apresentadas são estimativas."
  },
  "ProjectAdmin": {
    "title": "Gestão de projetos",
    "new": "Novo projeto",
    "name": "Nome",
    "location": "Localização",
    "description": "Descrição",
    "acquisition": "Custo de aquisição (€)",
    "works": "Orçamento de obra (€)",
    "arv": "ARV (€)",
    "amount": "Montante total (€)",
    "irr": "TIR estimada (%)",
    "term": "Prazo (meses)",
    "status": "Estado",
    "save": "Guardar",
    "create": "Criar projeto",
    "budgetLines": "Rubricas de orçamento",
    "addLine": "Adicionar rubrica",
    "lineName": "Rubrica",
    "linePhase": "Fase",
    "lineAmount": "Orçamento (€)",
    "photos": "Imagens",
    "documents": "Documentos",
    "uploadPhoto": "Carregar imagem",
    "uploadDoc": "Carregar documento",
    "transition": "Mudar estado",
    "empty": "Sem projetos. Crie o primeiro."
  }
```

- [ ] **Step 2: Adicionar as MESMAS chaves (traduzidas) a `messages/en.json`**

```json
  "Catalog": {
    "title": "Project catalogue",
    "empty": "There are currently no projects available for subscription.",
    "term": "Term",
    "months": "{n} months",
    "irr": "Estimated IRR",
    "amount": "Project amount",
    "subscribed": "{pct}% subscribed",
    "investorsCount": "{n} investors subscribed {amount}"
  },
  "ProjectDetail": {
    "location": "Location",
    "acquisition": "Acquisition cost",
    "works": "Works budget",
    "arv": "Estimated sale value (ARV)",
    "amount": "Total project amount",
    "term": "Estimated term",
    "months": "{n} months",
    "irr": "Estimated IRR",
    "roi": "Estimated ROI",
    "margin": "Estimated gross margin",
    "budgetTitle": "Works budget by line",
    "phase": "Phase",
    "line": "Line",
    "budgetAmount": "Budget",
    "docsTitle": "Document room",
    "photosTitle": "Images",
    "myPosition": "My position",
    "noPosition": "You have not subscribed to this project yet.",
    "subscriptionTitle": "Subscription",
    "subscribedOf": "{pct}% of the amount subscribed",
    "riskNotice": "Investing involves the risk of total loss of capital, is illiquid and carries no guarantee of return. Figures shown are estimates."
  },
  "ProjectAdmin": {
    "title": "Project management",
    "new": "New project",
    "name": "Name",
    "location": "Location",
    "description": "Description",
    "acquisition": "Acquisition cost (€)",
    "works": "Works budget (€)",
    "arv": "ARV (€)",
    "amount": "Total amount (€)",
    "irr": "Estimated IRR (%)",
    "term": "Term (months)",
    "status": "Status",
    "save": "Save",
    "create": "Create project",
    "budgetLines": "Budget lines",
    "addLine": "Add line",
    "lineName": "Line",
    "linePhase": "Phase",
    "lineAmount": "Budget (€)",
    "photos": "Images",
    "documents": "Documents",
    "uploadPhoto": "Upload image",
    "uploadDoc": "Upload document",
    "transition": "Change status",
    "empty": "No projects. Create the first one."
  }
```

- [ ] **Step 3: Confirmar paridade + JSON válido**

Run: `npm test -- tests/messages-parity.test.ts`
Expected: PASS.

- [ ] **Step 4: Escrever `tests/rls/projects.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const investor = `proj-inv-${run}@test.local`;
const staff = `proj-staff-${run}@test.local`;

let prepId: string; // projeto em preparacao (invisível ao investidor)
let subId: string; // projeto em subscricao (visível)

beforeAll(async () => {
  await createTestUser(investor);
  await createTestUser(staff, 'admin');

  const {data: prep, error: e1} = await admin
    .from('projects')
    .insert({
      name: 'Projeto Preparação',
      location: 'Braga',
      status: 'preparacao',
      acquisition_cost: 100000,
      works_budget: 50000,
      arv: 200000,
      total_amount: 150000,
      estimated_irr: 15,
      term_months: 9
    })
    .select('id')
    .single();
  if (e1) throw e1;
  prepId = prep.id;

  const {data: sub, error: e2} = await admin
    .from('projects')
    .insert({
      name: 'Projeto Subscrição',
      location: 'Porto',
      status: 'subscricao',
      acquisition_cost: 120000,
      works_budget: 48000,
      arv: 245000,
      total_amount: 150000,
      estimated_irr: 21,
      term_months: 9
    })
    .select('id')
    .single();
  if (e2) throw e2;
  subId = sub.id;

  await admin.from('project_budget_lines').insert({
    project_id: subId,
    name: 'Demolições',
    phase: 'Preparação',
    budget_amount: 3200,
    sort_order: 1
  });
});

describe('projects RLS', () => {
  it('investidor vê projetos em subscricao', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .eq('id', subId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO vê projetos em preparacao', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .eq('id', prepId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('staff vê todos os projetos', async () => {
    const client = await signInAs(staff);
    const {data, error} = await client
      .from('projects')
      .select('id')
      .in('id', [prepId, subId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('investidor NÃO consegue escrever projetos', async () => {
    const client = await signInAs(investor);
    await client.from('projects').update({name: 'HACK'}).eq('id', subId);
    const {data} = await admin
      .from('projects')
      .select('name')
      .eq('id', subId)
      .single();
    expect(data!.name).toBe('Projeto Subscrição');
  });

  it('anónimo não vê projetos', async () => {
    const {data} = await anonClient().from('projects').select('id');
    expect(data ?? []).toHaveLength(0);
  });
});

describe('project_budget_lines RLS', () => {
  it('investidor vê rubricas de um projeto visível', async () => {
    const client = await signInAs(investor);
    const {data, error} = await client
      .from('project_budget_lines')
      .select('id')
      .eq('project_id', subId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it('investidor NÃO vê rubricas de um projeto em preparacao', async () => {
    await admin.from('project_budget_lines').insert({
      project_id: prepId,
      name: 'Secreta',
      phase: 'X',
      budget_amount: 1,
      sort_order: 1
    });
    const client = await signInAs(investor);
    const {data} = await client
      .from('project_budget_lines')
      .select('id')
      .eq('project_id', prepId);
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Correr os testes RLS — devem FALHAR com 42P01**

Run: `npm test -- tests/rls/projects.test.ts`
Expected: FAIL (`relation "public.projects" does not exist`).

- [ ] **Step 6: Commit**

```bash
git add messages/pt.json messages/en.json tests/rls/projects.test.ts
git commit -m "feat(projetos): namespaces i18n + testes RLS (a falhar — schema por criar)"
```

---

### Task 3: Migração dos projetos (tabelas, RLS, audit, Storage, settings)

**Files:**
- Create: `supabase/migrations/<timestamp>_projects.sql`

- [ ] **Step 1: Gerar o ficheiro**

```bash
supabase migration new projects
```

Escrever SEM BOM no ficheiro gerado.

- [ ] **Step 2: Escrever a migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 3 — Catálogo de Projetos
-- projects + budget_lines + documents + photos + RLS + audit +
-- buckets privados (project-photos, project-docs) + settings.
--
-- Investidor lê apenas projetos em 'subscricao' (catálogo privado). Fatia 4
-- alargará a RLS para incluir projetos onde o investidor tem subscrição.
-- Escrita: exclusivamente via Server Actions com service role.
-- ============================================================

create type public.project_status as enum (
  'preparacao', 'subscricao', 'subscrito', 'em_curso', 'concluido', 'liquidado'
);

create type public.project_doc_type as enum (
  'caderneta_predial', 'licenca', 'orcamento_empreiteiro', 'apolice_seguro', 'outro'
);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  description text not null default '',
  status public.project_status not null default 'preparacao',
  acquisition_cost numeric(12,2) not null default 0 check (acquisition_cost >= 0),
  works_budget numeric(12,2) not null default 0 check (works_budget >= 0),
  arv numeric(12,2) not null default 0 check (arv >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  subscribed_amount numeric(12,2) not null default 0 check (subscribed_amount >= 0),
  investor_count integer not null default 0 check (investor_count >= 0),
  estimated_irr numeric(5,2) not null default 0,
  term_months integer not null default 0 check (term_months >= 0),
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index projects_status_idx on public.projects (status);

alter table public.projects enable row level security;

-- Investidor lê projetos em subscricao (catálogo privado).
create policy "projects: investidor lê subscricao"
  on public.projects for select
  using (status = 'subscricao');

-- Staff lê todos.
create policy "projects: staff lê todos"
  on public.projects for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Sem políticas de escrita: só service role.

-- ---------- project_budget_lines ----------
create table public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  phase text not null default '',
  budget_amount numeric(12,2) not null default 0 check (budget_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_budget_lines_project_idx
  on public.project_budget_lines (project_id);

alter table public.project_budget_lines enable row level security;

-- Herdam a visibilidade do projeto pai.
create policy "budget_lines: visível se o projeto é visível"
  on public.project_budget_lines for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- project_photos ----------
create table public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_photos_project_idx on public.project_photos (project_id);

alter table public.project_photos enable row level security;

create policy "photos: visível se o projeto é visível"
  on public.project_photos for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- project_documents ----------
create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  doc_type public.project_doc_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index project_documents_project_idx
  on public.project_documents (project_id);

alter table public.project_documents enable row level security;

create policy "project_docs: visível se o projeto é visível"
  on public.project_documents for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'subscricao'
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- Auditoria (reutiliza audit_row_change da Fatia 0) ----------
create trigger projects_audit
  after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();

create trigger project_documents_audit
  after insert or update or delete on public.project_documents
  for each row execute function public.audit_row_change();

-- ---------- Storage: buckets privados ----------
-- Fotos e documentos servidos server-side com URLs assinadas. Documentos passam
-- por Route Handler auditado (como no KYC). Sem políticas em storage.objects.
insert into storage.buckets (id, name, public) values
  ('project-photos', 'project-photos', false),
  ('project-docs', 'project-docs', false)
on conflict (id) do nothing;

-- ---------- settings ----------
insert into public.platform_settings (key, value, description) values
  ('show_subscription_progress', 'true'::jsonb,
   'Mostrar progresso de subscrição (% subscrito, montante, contagem agregada) na ficha e catálogo. Decisão do utilizador; contraria a spec anti-crowdfunding original; validar no parecer da Fase 0.')
on conflict (key) do nothing;
```

- [ ] **Step 3: Aplicar e verificar sem BOM**

```bash
head -c 3 supabase/migrations/*_projects.sql | xxd -p   # ≠ efbbbf
supabase db reset
```

Expected: aplica todas as migrações incluindo `projects`. Sem erros.

- [ ] **Step 4: Correr os testes RLS — devem PASSAR**

Run: `npm test -- tests/rls/projects.test.ts`
Expected: PASS. Se "investidor NÃO vê preparacao" falhar, rever a policy de select.

- [ ] **Step 5: Suite completa (nada regrediu)**

Run: `npm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_projects.sql
git commit -m "feat(projetos): migração — projects/budget/docs/photos com RLS+audit, buckets, settings"
```

---

### Task 4: Máquina de estados (puro, TDD)

**Files:**
- Create: `src/lib/projects/states.ts`, `tests/unit/project-states.test.ts`

- [ ] **Step 1: Escrever `tests/unit/project-states.test.ts`**

```ts
import {describe, it, expect} from 'vitest';
import {canTransition, nextStates, type ProjectStatus} from '@/lib/projects/states';

describe('máquina de estados de projeto', () => {
  it('permite avançar sequencialmente', () => {
    expect(canTransition('preparacao', 'subscricao')).toBe(true);
    expect(canTransition('subscricao', 'subscrito')).toBe(true);
    expect(canTransition('subscrito', 'em_curso')).toBe(true);
    expect(canTransition('em_curso', 'concluido')).toBe(true);
    expect(canTransition('concluido', 'liquidado')).toBe(true);
  });

  it('não permite saltar estados', () => {
    expect(canTransition('preparacao', 'em_curso')).toBe(false);
    expect(canTransition('subscricao', 'liquidado')).toBe(false);
  });

  it('não permite recuar', () => {
    expect(canTransition('subscricao', 'preparacao')).toBe(false);
    expect(canTransition('liquidado', 'concluido')).toBe(false);
  });

  it('liquidado é terminal', () => {
    expect(nextStates('liquidado')).toEqual([]);
  });

  it('nextStates devolve os estados seguintes válidos', () => {
    expect(nextStates('preparacao')).toEqual<ProjectStatus[]>(['subscricao']);
    expect(nextStates('em_curso')).toEqual<ProjectStatus[]>(['concluido']);
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/unit/project-states.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/lib/projects/states.ts`**

```ts
/**
 * Máquina de estados do ciclo de vida de um projeto (spec secção 5).
 * Avanço estritamente sequencial; sem recuos (a correção de um projeto
 * publicado por engano faz-se por outra via, não implementada nesta fatia).
 */

export type ProjectStatus =
  | 'preparacao'
  | 'subscricao'
  | 'subscrito'
  | 'em_curso'
  | 'concluido'
  | 'liquidado';

const ORDER: ProjectStatus[] = [
  'preparacao',
  'subscricao',
  'subscrito',
  'em_curso',
  'concluido',
  'liquidado'
];

/** Estados válidos a seguir ao atual (apenas o imediatamente seguinte). */
export function nextStates(current: ProjectStatus): ProjectStatus[] {
  const i = ORDER.indexOf(current);
  const next = ORDER[i + 1];
  return next ? [next] : [];
}

export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  return nextStates(from).includes(to);
}
```

- [ ] **Step 4: Correr e confirmar que PASSA**

Run: `npm test -- tests/unit/project-states.test.ts`
Expected: PASS. (Nota: o teste "permite voltar de subscricao para preparacao (correção)" afirma `false` — o título é irónico; o recuo NÃO é permitido nesta fatia. Manter a asserção `false`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/states.ts tests/unit/project-states.test.ts
git commit -m "feat(projetos): máquina de estados do ciclo de vida (puro)"
```

---

### Task 5: Serviço + Storage (server-only, service role)

**Files:**
- Create: `src/lib/projects/storage.ts`, `src/lib/projects/service.ts`, `tests/integration/projects.test.ts`

- [ ] **Step 1: Escrever `tests/integration/projects.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  createProject,
  updateProject,
  transitionProject,
  addBudgetLine,
  listCatalogue,
  getProjectDetail
} from '@/lib/projects/service';

const run = randomUUID().slice(0, 8);
let staffId: string;

beforeAll(async () => {
  staffId = (await createTestUser(`proj-svc-${run}@test.local`, 'admin')).id;
});

describe('createProject / updateProject', () => {
  it('cria um projeto em preparacao e calcula indicadores no detalhe', async () => {
    const {id} = await createProject({
      name: 'Campelos',
      location: 'Guimarães',
      description: 'Reabilitação',
      acquisitionCost: 120000,
      worksBudget: 48000,
      arv: 245000,
      totalAmount: 150000,
      estimatedIrr: 21,
      termMonths: 9
    });
    expect(id).toBeTruthy();
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.project.status).toBe('preparacao');
    expect(detail!.indicators.totalInvestment).toBe(168000);
    expect(detail!.indicators.grossMargin).toBe(77000);
  });
});

describe('transitionProject', () => {
  it('avança preparacao → subscricao (e regista published_at)', async () => {
    const {id} = await createProject({
      name: 'X', location: 'Y', description: '',
      acquisitionCost: 1, worksBudget: 1, arv: 3, totalAmount: 2,
      estimatedIrr: 10, termMonths: 6
    });
    await transitionProject(id, 'subscricao');
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.project.status).toBe('subscricao');
    expect(detail!.project.published_at).not.toBeNull();
  });

  it('rejeita uma transição inválida', async () => {
    const {id} = await createProject({
      name: 'X', location: 'Y', description: '',
      acquisitionCost: 1, worksBudget: 1, arv: 3, totalAmount: 2,
      estimatedIrr: 10, termMonths: 6
    });
    await expect(transitionProject(id, 'em_curso')).rejects.toThrow(/transição/i);
  });
});

describe('listCatalogue', () => {
  it('devolve apenas projetos em subscricao', async () => {
    const {id} = await createProject({
      name: 'Cat', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await transitionProject(id, 'subscricao');
    const rows = await listCatalogue();
    expect(rows.every((r) => r.status === 'subscricao')).toBe(true);
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});

describe('addBudgetLine', () => {
  it('adiciona uma rubrica ao projeto', async () => {
    const {id} = await createProject({
      name: 'B', location: 'Z', description: '',
      acquisitionCost: 10, worksBudget: 10, arv: 30, totalAmount: 20,
      estimatedIrr: 12, termMonths: 8
    });
    await addBudgetLine(id, {name: 'Demolições', phase: 'Preparação', budgetAmount: 3200});
    const detail = await getProjectDetail(id, {staff: true});
    expect(detail!.budgetLines).toHaveLength(1);
    expect(detail!.budgetLines[0].budget_amount).toBe('3200.00');
  });
});
```

- [ ] **Step 2: Correr e confirmar que FALHA**

Run: `npm test -- tests/integration/projects.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `src/lib/projects/storage.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const PHOTOS_BUCKET = 'project-photos';
export const DOCS_BUCKET = 'project-docs';

export function projectObjectPath(
  projectId: string,
  kind: string,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${projectId}/${kind}-${Date.now()}-${safe}`;
}

export async function uploadProjectFile(
  bucket: string,
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(bucket)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload projeto falhou: ${error.message}`);
}

export async function signedProjectUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url projeto falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 4: Implementar `src/lib/projects/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {computeIndicators, type Indicators} from './indicators';
import {canTransition, type ProjectStatus} from './states';

/**
 * Lógica de projetos (server-only, service role). Escrita só por aqui, chamada
 * por Server Actions que garantem staff. RLS das tabelas é investidor-lê-
 * subscricao + staff-lê-tudo; a escrita nunca passa por RLS (service role).
 */

export type CreateProjectInput = {
  name: string;
  location: string;
  description: string;
  acquisitionCost: number;
  worksBudget: number;
  arv: number;
  totalAmount: number;
  estimatedIrr: number;
  termMonths: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  location: string;
  description: string;
  status: ProjectStatus;
  acquisition_cost: string;
  works_budget: string;
  arv: string;
  total_amount: string;
  subscribed_amount: string;
  investor_count: number;
  estimated_irr: string;
  term_months: number;
  cover_path: string | null;
  published_at: string | null;
};

export type BudgetLineRow = {
  id: string;
  name: string;
  phase: string;
  budget_amount: string;
  sort_order: number;
};

export type PhotoRow = {id: string; storage_path: string; sort_order: number};
export type DocRow = {
  id: string;
  doc_type: string;
  original_filename: string;
};

export type ProjectDetail = {
  project: ProjectRow;
  budgetLines: BudgetLineRow[];
  photos: PhotoRow[];
  documents: DocRow[];
  indicators: Indicators;
};

function num(v: string | number): number {
  return typeof v === 'number' ? v : Number(v);
}

export async function createProject(
  input: CreateProjectInput,
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {data, error} = await db
    .from('projects')
    .insert({
      name: input.name.trim(),
      location: input.location.trim(),
      description: input.description,
      acquisition_cost: input.acquisitionCost,
      works_budget: input.worksBudget,
      arv: input.arv,
      total_amount: input.totalAmount,
      estimated_irr: input.estimatedIrr,
      term_months: input.termMonths
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`criar projeto falhou: ${error?.message ?? 'sem linha'}`);
  }
  return {id: data.id};
}

export async function updateProject(
  id: string,
  input: Partial<CreateProjectInput>,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const patch: Record<string, unknown> = {updated_at: new Date().toISOString()};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.location !== undefined) patch.location = input.location.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.acquisitionCost !== undefined)
    patch.acquisition_cost = input.acquisitionCost;
  if (input.worksBudget !== undefined) patch.works_budget = input.worksBudget;
  if (input.arv !== undefined) patch.arv = input.arv;
  if (input.totalAmount !== undefined) patch.total_amount = input.totalAmount;
  if (input.estimatedIrr !== undefined) patch.estimated_irr = input.estimatedIrr;
  if (input.termMonths !== undefined) patch.term_months = input.termMonths;

  const {error} = await db.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(`atualizar projeto falhou: ${error.message}`);
}

export async function transitionProject(
  id: string,
  to: ProjectStatus,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {data: cur, error: readError} = await db
    .from('projects')
    .select('status')
    .eq('id', id)
    .single();
  if (readError || !cur) throw new Error(`projeto ${id} não encontrado`);
  if (!canTransition(cur.status as ProjectStatus, to)) {
    throw new Error(`transição inválida: ${cur.status} → ${to}`);
  }
  const patch: Record<string, unknown> = {
    status: to,
    updated_at: new Date().toISOString()
  };
  if (to === 'subscricao') patch.published_at = new Date().toISOString();
  const {error} = await db.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(`mudar estado falhou: ${error.message}`);
}

export async function addBudgetLine(
  projectId: string,
  input: {name: string; phase: string; budgetAmount: number},
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {count} = await db
    .from('project_budget_lines')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  const {error} = await db.from('project_budget_lines').insert({
    project_id: projectId,
    name: input.name.trim(),
    phase: input.phase.trim(),
    budget_amount: input.budgetAmount,
    sort_order: (count ?? 0) + 1
  });
  if (error) throw new Error(`adicionar rubrica falhou: ${error.message}`);
}

export type CatalogueRow = {
  id: string;
  name: string;
  location: string;
  status: ProjectStatus;
  total_amount: string;
  subscribed_amount: string;
  investor_count: number;
  estimated_irr: string;
  term_months: number;
  cover_path: string | null;
};

export async function listCatalogue(
  db: SupabaseClient = createAdminClient()
): Promise<CatalogueRow[]> {
  const {data, error} = await db
    .from('projects')
    .select(
      'id, name, location, status, total_amount, subscribed_amount, investor_count, estimated_irr, term_months, cover_path'
    )
    .eq('status', 'subscricao')
    .order('published_at', {ascending: false});
  if (error) throw new Error(`listar catálogo falhou: ${error.message}`);
  return (data ?? []) as CatalogueRow[];
}

export async function listAllProjects(
  db: SupabaseClient = createAdminClient()
): Promise<ProjectRow[]> {
  const {data, error} = await db
    .from('projects')
    .select('*')
    .order('created_at', {ascending: false});
  if (error) throw new Error(`listar projetos falhou: ${error.message}`);
  return (data ?? []) as ProjectRow[];
}

export async function getProjectDetail(
  id: string,
  opts: {staff: boolean},
  db: SupabaseClient = createAdminClient()
): Promise<ProjectDetail | null> {
  const {data: project} = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (!project) return null;
  // Investidor só acede a projetos em subscricao (a RLS já protege as leituras
  // de investidor; aqui, chamado com service role, aplicamos a mesma regra).
  if (!opts.staff && project.status !== 'subscricao') return null;

  const {data: budgetLines} = await db
    .from('project_budget_lines')
    .select('id, name, phase, budget_amount, sort_order')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const {data: photos} = await db
    .from('project_photos')
    .select('id, storage_path, sort_order')
    .eq('project_id', id)
    .order('sort_order', {ascending: true});
  const {data: documents} = await db
    .from('project_documents')
    .select('id, doc_type, original_filename')
    .eq('project_id', id);

  const indicators = computeIndicators({
    acquisitionCost: num(project.acquisition_cost),
    worksBudget: num(project.works_budget),
    arv: num(project.arv)
  });

  return {
    project: project as ProjectRow,
    budgetLines: (budgetLines ?? []) as BudgetLineRow[],
    photos: (photos ?? []) as PhotoRow[],
    documents: (documents ?? []) as DocRow[],
    indicators
  };
}
```

- [ ] **Step 5: Correr o teste de integração — PASSA**

Run: `npm test -- tests/integration/projects.test.ts`
Expected: PASS. (Nota: `numeric` do Postgres volta como string, ex.: `'3200.00'` — os testes assertam a string; se preferires número, converte no serviço, mas mantém consistência com o teste.)

- [ ] **Step 6: Suite + typecheck + lint**

```bash
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/projects/storage.ts src/lib/projects/service.ts tests/integration/projects.test.ts
git commit -m "feat(projetos): serviço create/update/transition/list + storage (service role, DI)"
```

---

### Task 6: Back-office de gestão de projetos

**Files:**
- Create: `src/app/[locale]/(admin)/gestao-projetos/page.tsx`, `src/app/[locale]/(admin)/gestao-projetos/[id]/page.tsx`, `src/app/[locale]/(admin)/gestao-projetos/actions.ts`

Segue o padrão de `(admin)/convites` e `(admin)/kyc-revisao`: Server Components com `force-dynamic`, Server Actions com `requireStaff()`, shadcn. O guard de staff já é feito pelo `(admin)/layout.tsx`; as actions chamam `requireStaff()` na mesma (defesa em profundidade).

- [ ] **Step 1: Server Actions `actions.ts`**

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  createProject,
  updateProject,
  transitionProject,
  addBudgetLine
} from '@/lib/projects/service';
import {
  uploadProjectFile,
  projectObjectPath,
  PHOTOS_BUCKET,
  DOCS_BUCKET
} from '@/lib/projects/storage';
import {createAdminClient} from '@/lib/supabase/admin';
import type {ProjectStatus} from '@/lib/projects/states';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function createProjectAction(
  locale: Locale,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await createProject({
    name: String(formData.get('name') ?? ''),
    location: String(formData.get('location') ?? ''),
    description: String(formData.get('description') ?? ''),
    acquisitionCost: Number(formData.get('acquisition_cost') ?? 0),
    worksBudget: Number(formData.get('works_budget') ?? 0),
    arv: Number(formData.get('arv') ?? 0),
    totalAmount: Number(formData.get('total_amount') ?? 0),
    estimatedIrr: Number(formData.get('estimated_irr') ?? 0),
    termMonths: Number(formData.get('term_months') ?? 0)
  });
  revalidatePath(`/${locale}/gestao-projetos`);
}

export async function updateProjectAction(
  locale: Locale,
  id: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await updateProject(id, {
    name: String(formData.get('name') ?? ''),
    location: String(formData.get('location') ?? ''),
    description: String(formData.get('description') ?? ''),
    acquisitionCost: Number(formData.get('acquisition_cost') ?? 0),
    worksBudget: Number(formData.get('works_budget') ?? 0),
    arv: Number(formData.get('arv') ?? 0),
    totalAmount: Number(formData.get('total_amount') ?? 0),
    estimatedIrr: Number(formData.get('estimated_irr') ?? 0),
    termMonths: Number(formData.get('term_months') ?? 0)
  });
  revalidatePath(`/${locale}/gestao-projetos/${id}`);
}

export async function transitionProjectAction(
  locale: Locale,
  id: string,
  to: ProjectStatus
): Promise<void> {
  await requireStaff();
  await transitionProject(id, to);
  revalidatePath(`/${locale}/gestao-projetos/${id}`);
}

export async function addBudgetLineAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await addBudgetLine(projectId, {
    name: String(formData.get('line_name') ?? ''),
    phase: String(formData.get('line_phase') ?? ''),
    budgetAmount: Number(formData.get('line_amount') ?? 0)
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}

export async function uploadPhotoAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = projectObjectPath(projectId, 'photo', file.name);
  await uploadProjectFile(PHOTOS_BUCKET, path, file, db);
  const {count} = await db
    .from('project_photos')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  await db.from('project_photos').insert({
    project_id: projectId,
    storage_path: path,
    sort_order: (count ?? 0) + 1
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}

export async function uploadDocAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('document');
  const docType = String(formData.get('doc_type') ?? 'outro');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = projectObjectPath(projectId, docType, file.name);
  await uploadProjectFile(DOCS_BUCKET, path, file, db);
  await db.from('project_documents').insert({
    project_id: projectId,
    doc_type: docType,
    storage_path: path,
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}
```

- [ ] **Step 2: Página de lista + criação `gestao-projetos/page.tsx`**

Server Component (`force-dynamic`). Lista `listAllProjects()` numa tabela shadcn (nome, localização, estado como Badge, montante); um formulário de criação (campos do `ProjectAdmin` namespace) que chama `createProjectAction.bind(null, loc)`; cada linha liga a `gestao-projetos/[id]`. Seguir a estrutura de `(admin)/convites/page.tsx`. Usar `getTranslations('ProjectAdmin')`.

Código de referência do formulário de criação (dentro do componente):
```tsx
<form action={createProjectAction.bind(null, loc)} className="grid gap-3 sm:grid-cols-2">
  <div><Label htmlFor="name">{t('name')}</Label><Input id="name" name="name" required /></div>
  <div><Label htmlFor="location">{t('location')}</Label><Input id="location" name="location" required /></div>
  <div className="sm:col-span-2"><Label htmlFor="description">{t('description')}</Label><Input id="description" name="description" /></div>
  <div><Label htmlFor="acquisition_cost">{t('acquisition')}</Label><Input id="acquisition_cost" name="acquisition_cost" type="number" step="0.01" /></div>
  <div><Label htmlFor="works_budget">{t('works')}</Label><Input id="works_budget" name="works_budget" type="number" step="0.01" /></div>
  <div><Label htmlFor="arv">{t('arv')}</Label><Input id="arv" name="arv" type="number" step="0.01" /></div>
  <div><Label htmlFor="total_amount">{t('amount')}</Label><Input id="total_amount" name="total_amount" type="number" step="0.01" /></div>
  <div><Label htmlFor="estimated_irr">{t('irr')}</Label><Input id="estimated_irr" name="estimated_irr" type="number" step="0.01" /></div>
  <div><Label htmlFor="term_months">{t('term')}</Label><Input id="term_months" name="term_months" type="number" /></div>
  <div className="sm:col-span-2"><Button type="submit">{t('create')}</Button></div>
</form>
```

- [ ] **Step 3: Página de edição `gestao-projetos/[id]/page.tsx`**

Server Component (`force-dynamic`) que carrega `getProjectDetail(id, {staff: true})`. Mostra: formulário de edição (mesmos campos, valores preenchidos, `updateProjectAction.bind(null, loc, id)`); os indicadores calculados (ROI, margem); as rubricas numa tabela + formulário `addBudgetLineAction`; upload de fotos (`uploadPhotoAction`) e documentos (`uploadDocAction`, com `<select name="doc_type">` dos `project_doc_type`); e os botões de transição de estado — para cada estado em `nextStates(project.status)`, um form que chama `transitionProjectAction.bind(null, loc, id, estado)`.

Importar `nextStates` de `@/lib/projects/states`. Para renderizar as fotos já carregadas, gerar URLs assinadas via `signedProjectUrl(PHOTOS_BUCKET, photo.storage_path)` (server-side, no render).

- [ ] **Step 4: Build + typecheck + lint**

```bash
npm run build && npm run typecheck && npm run lint
```

- [ ] **Step 5: Verificação manual**

Com uma sessão staff (ou verificação de que a rota `/pt/gestao-projetos` existe no build e que sem sessão redireciona), confirmar que o build lista `/[locale]/gestao-projetos` e `/[locale]/gestao-projetos/[id]`. Documentar o observado; limpar dev server.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(admin)/gestao-projetos"
git commit -m "feat(projetos): back-office de gestão (criar/editar, rubricas, estados, uploads)"
```

---

### Task 7: Catálogo do investidor

**Files:**
- Create: `src/app/[locale]/projetos/page.tsx`

Página do investidor (fora do grupo `(admin)`; o middleware já garante que só investidores com KYC aprovado chegam aqui). Lista `listCatalogue()` como cards sóbrios. Cada card: nome, localização, estado, TIR estimada, montante, prazo; **e, atrás do flag `show_subscription_progress`**, a barra de % subscrito + contagem agregada.

- [ ] **Step 1: Criar `src/app/[locale]/projetos/page.tsx`**

```tsx
import {getTranslations, setRequestLocale} from 'next-intl/server';
import Link from 'next/link';
import {listCatalogue} from '@/lib/projects/service';
import {createAdminClient} from '@/lib/supabase/admin';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

function eur(v: string | number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(Number(v));
}

export default async function CatalogPage({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Catalog');

  const projects = await listCatalogue();

  // Flag de progresso de subscrição.
  const db = createAdminClient();
  const {data: flag} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'show_subscription_progress')
    .single();
  const showProgress = flag?.value === true;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      {projects.length === 0 && (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const pct =
            Number(p.total_amount) > 0
              ? Math.round(
                  (Number(p.subscribed_amount) / Number(p.total_amount)) * 100
                )
              : 0;
          return (
            <Link key={p.id} href={`/${locale}/projetos/${p.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-neutral-500">{p.location}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('irr')}</span>
                    <span className="font-mono">{p.estimated_irr}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('amount')}</span>
                    <span className="font-mono">{eur(p.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('term')}</span>
                    <span className="font-mono">
                      {t('months', {n: p.term_months})}
                    </span>
                  </div>
                  {showProgress && (
                    <div className="pt-2">
                      <div className="h-1.5 w-full rounded bg-neutral-200">
                        <div
                          className="h-full rounded bg-neutral-800"
                          style={{width: `${Math.min(100, pct)}%`}}
                        />
                      </div>
                      <p className="mt-1 font-mono text-xs text-neutral-500">
                        {t('subscribed', {pct})}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build + typecheck + lint**

```bash
npm run build && npm run typecheck && npm run lint
```

Expected: rota `/[locale]/projetos` no build.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/projetos/page.tsx"
git commit -m "feat(projetos): catálogo do investidor (cards, progresso atrás de flag)"
```

---

### Task 8: Ficha do projeto + documentos/fotos auditados

**Files:**
- Create: `src/app/[locale]/projetos/[id]/page.tsx`, `src/app/api/projects/document/[id]/route.ts`, `src/app/api/projects/photo/[id]/route.ts`

- [ ] **Step 1: Route Handler de documento auditado `src/app/api/projects/document/[id]/route.ts`**

Emite URL assinada de 60s para um documento de projeto, registando a consulta no audit_log ANTES (fail-closed), como no KYC. Acessível a qualquer utilizador autenticado com acesso ao projeto — mas como os documentos de projeto são menos sensíveis que KYC e visíveis a investidores do catálogo, o gate é: sessão válida + o projeto do documento tem de estar visível ao utilizador (subscricao, ou staff). Verificação via service role.

```ts
import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedProjectUrl, DOCS_BUCKET} from '@/lib/projects/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: doc} = await db
    .from('project_documents')
    .select('storage_path, project_id')
    .eq('id', id)
    .single();
  if (!doc) return NextResponse.json({error: 'not_found'}, {status: 404});

  // O documento só é acessível se o projeto está visível ao utilizador.
  const {data: project} = await db
    .from('projects')
    .select('status')
    .eq('id', doc.project_id)
    .single();
  const visible =
    project?.status === 'subscricao' || isStaff(session.role);
  if (!visible) return NextResponse.json({error: 'forbidden'}, {status: 403});

  // Auditar a consulta ANTES de emitir a URL. Fail-closed.
  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'project_documents',
    entity_id: id,
    payload: {project_id: doc.project_id}
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedProjectUrl(DOCS_BUCKET, doc.storage_path, 60, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Route Handler de foto `src/app/api/projects/photo/[id]/route.ts`**

As fotos são menos sensíveis (não são documentos legais); emitem URL assinada sem entrada no audit_log, mas com o mesmo gate de visibilidade.

```ts
import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedProjectUrl, PHOTOS_BUCKET} from '@/lib/projects/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: photo} = await db
    .from('project_photos')
    .select('storage_path, project_id')
    .eq('id', id)
    .single();
  if (!photo) return NextResponse.json({error: 'not_found'}, {status: 404});

  const {data: project} = await db
    .from('projects')
    .select('status')
    .eq('id', photo.project_id)
    .single();
  const visible = project?.status === 'subscricao' || isStaff(session.role);
  if (!visible) return NextResponse.json({error: 'forbidden'}, {status: 403});

  const url = await signedProjectUrl(PHOTOS_BUCKET, photo.storage_path, 300, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 3: Ficha `src/app/[locale]/projetos/[id]/page.tsx`**

Server Component (`force-dynamic`) que carrega `getProjectDetail(id, {staff: <isStaff>})`. Mostra:
- cabeçalho: nome, localização, descrição, estado;
- galeria de fotos (cada `<img>` aponta para `/api/projects/photo/<photo.id>`);
- stat tiles: montante total, TIR estimada, prazo, ROI estimado, margem bruta (dos `indicators`);
- quadro orçamental por rubrica (tabela: rubrica, fase, orçamento);
- sala de documentos: links para `/api/projects/document/<doc.id>` (rotulados pelo `doc_type`);
- **atrás do flag `show_subscription_progress`**: barra de % subscrito + `t('subscribedOf', {pct})` + contagem agregada `t('investorsCount', {n: investor_count, amount: eur(subscribed_amount)})`;
- aviso de risco (`t('riskNotice')`) sempre visível;
- se o utilizador tiver posição (Fatia 4), a sua posição — nesta fatia, sem subscrições, mostrar `t('noPosition')`.

Usar `getSession()` para saber se é staff (passa a `getProjectDetail`). Se `getProjectDetail` devolver null (projeto inexistente ou não visível), `notFound()`.

Estrutura de referência (excerto dos stat tiles + progresso):
```tsx
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getSession, isStaff} from '@/lib/auth/staff';
import {getProjectDetail} from '@/lib/projects/service';
import {createAdminClient} from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// ... eur(), etc.

export default async function ProjectPage({params}: {params: Promise<{locale: string; id: string}>}) {
  const {locale, id} = await params;
  setRequestLocale(locale);
  const t = await getTranslations('ProjectDetail');
  const session = await getSession();
  const staff = session ? isStaff(session.role) : false;
  const detail = await getProjectDetail(id, {staff});
  if (!detail) notFound();

  const db = createAdminClient();
  const {data: flag} = await db.from('platform_settings').select('value').eq('key', 'show_subscription_progress').single();
  const showProgress = flag?.value === true;

  const {project: p, indicators, budgetLines, photos, documents} = detail;
  // ... render
}
```

Seguir a paleta sóbria (títulos serif, números mono). Adaptar do protótipo o layout de stat tiles e quadro orçamental, sem copiar o HTML inline.

- [ ] **Step 4: Build + typecheck + lint**

```bash
npm run build && npm run typecheck && npm run lint
```

- [ ] **Step 5: Verificação do acesso auditado**

Confirmar (a) a rota `/api/projects/document/[id]` no build; (b) que sem sessão devolve 401; (c) que uma consulta a um documento existente por um utilizador com acesso regista uma linha `view_document`/`project_documents` no audit_log antes de emitir a URL (verificar via admin client, à semelhança do KYC). Documentar observado vs. raciocinado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/projetos/[id]" "src/app/api/projects"
git commit -m "feat(projetos): ficha do projeto + documentos/fotos por URL assinada (docs auditados)"
```

---

### Task 9: i18n final + verificação e2e do slice

**Files:**
- Modify: `messages/pt.json`, `messages/en.json` (só se faltarem chaves detetadas na integração)

- [ ] **Step 1: Paridade + suite completa**

```bash
npm test -- tests/messages-parity.test.ts
npm test
npm run typecheck && npm run lint && npm run build
```

Expected: tudo verde; sem chaves i18n em falta.

- [ ] **Step 2: Verificação e2e manual do fluxo**

Com o stack local, um staff e um investidor de teste (KYC aprovado):
1. Staff cria um projeto no back-office, adiciona rubricas, sobe uma foto e um documento, transita para `subscricao`.
2. Investidor (KYC aprovado) abre `/pt/projetos` → vê o projeto no catálogo; com o flag ligado, vê a barra de % subscrito.
3. Abre a ficha → vê fotos (via URL assinada), indicadores, quadro orçamental, documentos (link auditado), aviso de risco.
4. Confirmar que um projeto em `preparacao` NÃO aparece ao investidor.
5. Desligar `show_subscription_progress` em `platform_settings` e confirmar que a barra desaparece (o flag funciona).

Documentar o observado. Limpar dev server e portas.

- [ ] **Step 3: Commit (se houve ajustes)**

```bash
git add -A
git commit -m "chore(projetos): ajustes finais de i18n e verificação da Fatia 3"
```

---

## Fora de âmbito (fatias seguintes)

- **Subscrição / manifestação de interesse** (Fatia 4) — botão "Investir", limite de investidores, `subscriptions`; alarga a RLS dos projetos a "onde tenho posição" e passa a alimentar `subscribed_amount`/`investor_count` a partir de subscrições reais (nesta fatia são campos manuais/seed).
- **Acompanhamento de obra** (Fatia 5) — orçado-vs-real por rubrica, marcos, diário de obra, extratos.
- **Dashboard/portefólio** (Fatia 6).
- **Integração CMD** (KYC PT) — independente.

## Notas de segurança/compliance

- Documentos de projeto: bucket privado, acesso só server-side por URL assinada, **consulta auditada** (fail-closed) no Route Handler. Fotos idem, sem audit (menos sensíveis).
- Escrita das tabelas `projects*` só via Server Actions com service role; RLS é investidor-lê-subscricao + staff-lê-tudo.
- **Progresso de subscrição e contagem agregada estão atrás de `show_subscription_progress`** — decisão consciente do utilizador que contraria a spec anti-crowdfunding original; sujeita ao parecer da Fase 0. Ver `memory/tilweni-decisao-progresso-subscricao.md`.
- Posições individuais de terceiros nunca são expostas (só agregado anónimo); cada investidor vê apenas a sua própria posição.
