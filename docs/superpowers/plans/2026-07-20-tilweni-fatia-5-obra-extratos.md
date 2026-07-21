# TILWENI Fase A — Fatia 5: Acompanhamento de Obra + Extratos · Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcos de obra (previsto vs. real), diário de obra com fotos e vídeos, orçado-vs-real por rubrica com alerta interno de desvio, e extratos mensais da conta dedicada com notificação aos investidores e consulta auditada.

**Architecture:** Segue os padrões das Fatias 2-4. Quatro tabelas novas (`project_milestones`, `work_updates`, `work_update_media`, `account_statements`) + `actual_amount` nas rubricas, todas com RLS (staff lê tudo; investidor lê o que pertence aos seus projetos) e escrita exclusiva via Server Actions com service role. Dois buckets privados: `work-media` (fotos+vídeos) e `statements` (PDF). **Vídeos sobem diretamente para o Storage** por URL assinada de upload — contornam o limite do Server Action, e o próprio bucket impõe `file_size_limit` + `allowed_mime_types` (a validação server-side por bytes não é possível num upload direto). Extratos são servidos por Route Handler **auditado fail-closed**. Notificações por email só para investidores com `fundos_confirmados`.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + Storage + RLS + signed upload URLs), Vitest + `pg`, next-intl, Tailwind + shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md](../specs/2026-07-17-tilweni-fase-a-design.md) (secções 3.5, 3.6, 5.5, 5.6).

---

## Decisões de slice (confirmadas com o utilizador)

- **Fatia única** cobrindo obra + extratos (o utilizador optou por não dividir). Organizada em 3 fases com checkpoints naturais.
- **Fotos e vídeos** no diário de obra. Vídeos por **upload direto ao Storage** (signed upload URL), com limites impostos no bucket.
- **Notificações só para `fundos_confirmados`** — quem tem dinheiro no projeto.

### Visibilidade (decisão de design, documentada para poder ser contestada)

- **Marcos, diário de obra e media:** visíveis a staff e a investidores com subscrição **ativa** (não cancelada) no projeto — coerente com a RLS de projetos da Fatia 4.
- **Extratos:** visíveis a staff e apenas a investidores com **`fundos_confirmados`** — são registos financeiros da conta que detém o dinheiro dos investidores; quem só manifestou interesse não tem motivo para os ver.

## Armadilhas conhecidas desta máquina (herdadas)

- **PowerShell escreve BOM** — SQL/TS sem BOM (Git Bash). Verificar `head -c 3 <f> | xxd -p` ≠ `efbbbf`.
- **Stack local 54421 (API) / 54422 (DB)**; `.env.test` é a fonte de verdade. Nunca hardcodar 54321.
- **`numeric` do Postgres**: normalizar para `number` no serviço (ver `src/lib/projects/service.ts`).
- **Funções `SECURITY DEFINER` recebem EXECUTE a PUBLIC + anon/authenticated por default** — se criares alguma, revoga dos três e concede só a `service_role` (ver `*_confirm_subscription_funds_atomic.sql`).
- **Tabelas novas trazem DML completo a anon/authenticated** — revogar (ver `*_revoke_anon_writes.sql`).
- **Route groups não mudam o URL** — cuidado com colisões (`/projetos` investidor vs `/gestao-projetos` staff).
- Escrever i18n de um namespace ANTES das páginas que o usam.
- **Servidores Next órfãos** dão output falso — confirmar PID.

## Estrutura de ficheiros

```
supabase/migrations/
  <ts>_obra_extratos.sql               # Task 2
src/lib/notify/
  investors.ts                         # Task 3: notifyConfirmedInvestors (partilhado obra+extratos)
src/lib/works/
  service.ts                           # Task 3: milestones, updates, budget actual + alerta
  storage.ts                           # Task 4: upload foto, signed upload URL (vídeo), signed read
src/lib/statements/
  service.ts                           # Task 9: publishStatement, listStatements
  storage.ts                           # Task 9: upload + signed read
src/lib/mail/templates.ts              # Tasks 5/10: +work_update_published, budget_deviation_alert, statement_published
src/app/[locale]/(admin)/gestao-projetos/[id]/obra/
  page.tsx, actions.ts                 # Tasks 6/7
  MediaUploader.tsx                    # Task 7: client (upload direto de vídeo)
src/app/[locale]/(admin)/gestao-projetos/[id]/extratos/
  page.tsx, actions.ts                 # Task 11
src/app/[locale]/projetos/[id]/obra/page.tsx        # Task 8
src/app/[locale]/projetos/[id]/extratos/page.tsx    # Task 12
src/app/api/works/media/[id]/route.ts               # Task 8 (URL assinada, sem audit)
src/app/api/statements/[id]/route.ts                # Task 12 (auditado, fail-closed)
messages/pt.json, messages/en.json     # Task 1
tests/rls/obra-extratos.test.ts        # Task 1
tests/integration/works.test.ts        # Task 3
tests/integration/statements.test.ts   # Task 9
```

---

## FASE A — Dados

### Task 1: i18n namespaces + testes RLS (a falhar)

**Files:**
- Modify: `messages/pt.json`, `messages/en.json`
- Create: `tests/rls/obra-extratos.test.ts`

- [ ] **Step 1: Adicionar a `messages/pt.json`** (antes do `}` final):

```json
  "Works": {
    "title": "Acompanhamento de obra",
    "milestones": "Marcos da obra",
    "planned": "Previsto",
    "actual": "Real",
    "diary": "Diário de obra",
    "budgetVsActual": "Orçamento vs. custo real",
    "line": "Rubrica",
    "budget": "Orçamento",
    "spent": "Executado",
    "deviation": "Desvio",
    "empty": "Ainda não há atualizações de obra.",
    "noMilestones": "Ainda não há marcos definidos.",
    "status_previsto": "Previsto",
    "status_em_curso": "Em curso",
    "status_concluido": "Concluído",
    "backToProject": "Voltar ao projeto"
  },
  "WorksAdmin": {
    "title": "Gestão de obra",
    "addMilestone": "Adicionar marco",
    "milestoneTitle": "Título do marco",
    "plannedDate": "Data prevista",
    "actualDate": "Data real",
    "status": "Estado",
    "save": "Guardar",
    "actualAmount": "Custo real (€)",
    "saveActuals": "Guardar custos reais",
    "publishUpdate": "Publicar atualização",
    "updateTitle": "Título",
    "updateBody": "Descrição",
    "linkMilestone": "Marco associado (opcional)",
    "none": "Nenhum",
    "media": "Imagens e vídeos",
    "addMedia": "Adicionar ficheiro",
    "uploading": "A carregar…",
    "uploadFailed": "Falha no carregamento.",
    "mediaHint": "Imagens (JPEG/PNG/WebP) até 200 MB; vídeos MP4/MOV até 200 MB."
  },
  "Statements": {
    "title": "Extratos da conta dedicada",
    "period": "Período",
    "published": "Publicado",
    "version": "Versão",
    "open": "Abrir",
    "empty": "Ainda não há extratos publicados.",
    "notice": "Cada consulta de um extrato fica registada no registo de auditoria."
  },
  "StatementsAdmin": {
    "title": "Extratos",
    "periodLabel": "Período (AAAA-MM)",
    "file": "Ficheiro (PDF)",
    "publish": "Publicar extrato",
    "empty": "Sem extratos publicados.",
    "newVersionHint": "Publicar o mesmo período cria uma nova versão; o histórico é permanente."
  }
```

- [ ] **Step 2: Adicionar as MESMAS chaves (traduzidas) a `messages/en.json`**

```json
  "Works": {
    "title": "Works progress",
    "milestones": "Milestones",
    "planned": "Planned",
    "actual": "Actual",
    "diary": "Works diary",
    "budgetVsActual": "Budget vs. actual cost",
    "line": "Line",
    "budget": "Budget",
    "spent": "Spent",
    "deviation": "Deviation",
    "empty": "No works updates yet.",
    "noMilestones": "No milestones defined yet.",
    "status_previsto": "Planned",
    "status_em_curso": "In progress",
    "status_concluido": "Completed",
    "backToProject": "Back to project"
  },
  "WorksAdmin": {
    "title": "Works management",
    "addMilestone": "Add milestone",
    "milestoneTitle": "Milestone title",
    "plannedDate": "Planned date",
    "actualDate": "Actual date",
    "status": "Status",
    "save": "Save",
    "actualAmount": "Actual cost (€)",
    "saveActuals": "Save actual costs",
    "publishUpdate": "Publish update",
    "updateTitle": "Title",
    "updateBody": "Description",
    "linkMilestone": "Related milestone (optional)",
    "none": "None",
    "media": "Images and videos",
    "addMedia": "Add file",
    "uploading": "Uploading…",
    "uploadFailed": "Upload failed.",
    "mediaHint": "Images (JPEG/PNG/WebP) up to 200 MB; MP4/MOV videos up to 200 MB."
  },
  "Statements": {
    "title": "Dedicated account statements",
    "period": "Period",
    "published": "Published",
    "version": "Version",
    "open": "Open",
    "empty": "No statements published yet.",
    "notice": "Every statement consultation is recorded in the audit log."
  },
  "StatementsAdmin": {
    "title": "Statements",
    "periodLabel": "Period (YYYY-MM)",
    "file": "File (PDF)",
    "publish": "Publish statement",
    "empty": "No statements published.",
    "newVersionHint": "Publishing the same period creates a new version; history is permanent."
  }
```

Confirmar: `node -e "JSON.parse(require('fs').readFileSync('messages/pt.json','utf8'));JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));console.log('ok')"`, `npm test -- tests/messages-parity.test.ts` (PASS), `npm run typecheck` (clean).

- [ ] **Step 3: Escrever `tests/rls/obra-extratos.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const funder = `obra-funder-${run}@test.local`;   // subscrição fundos_confirmados
const interested = `obra-int-${run}@test.local`;  // subscrição só em interesse
const outsider = `obra-out-${run}@test.local`;    // sem subscrição
const staff = `obra-staff-${run}@test.local`;

let projectId: string;
let milestoneId: string;
let updateId: string;
let statementId: string;

async function sub(userId: string, status: string) {
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: userId,
    amount: 20000,
    status,
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
}

beforeAll(async () => {
  const f = (await createTestUser(funder)).id;
  const i = (await createTestUser(interested)).id;
  await createTestUser(outsider);
  await createTestUser(staff, 'admin');

  const {data: p, error: pe} = await admin
    .from('projects')
    .insert({
      name: 'Obra RLS',
      location: 'Braga',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (pe) throw pe;
  projectId = p.id;

  await sub(f, 'fundos_confirmados');
  await sub(i, 'interesse');

  const {data: m, error: me} = await admin
    .from('project_milestones')
    .insert({project_id: projectId, title: 'Demolições', status: 'concluido'})
    .select('id')
    .single();
  if (me) throw me;
  milestoneId = m.id;

  const {data: u, error: ue} = await admin
    .from('work_updates')
    .insert({project_id: projectId, title: 'Semana 1', body: 'Arranque'})
    .select('id')
    .single();
  if (ue) throw ue;
  updateId = u.id;

  const {data: s, error: se} = await admin
    .from('account_statements')
    .insert({
      project_id: projectId,
      period: '2026-07',
      storage_path: `${projectId}/2026-07-v1.pdf`,
      original_filename: 'extrato.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1234
    })
    .select('id')
    .single();
  if (se) throw se;
  statementId = s.id;
});

describe('obra: marcos e diário', () => {
  it('investidor com subscrição ativa vê marcos', async () => {
    const c = await signInAs(interested);
    const {data, error} = await c
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor sem subscrição NÃO vê marcos', async () => {
    const c = await signInAs(outsider);
    const {data} = await c
      .from('project_milestones')
      .select('id')
      .eq('id', milestoneId);
    expect(data ?? []).toHaveLength(0);
  });

  it('investidor com subscrição ativa vê atualizações de obra', async () => {
    const c = await signInAs(interested);
    const {data} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(data).toHaveLength(1);
  });

  it('investidor sem subscrição NÃO vê atualizações', async () => {
    const c = await signInAs(outsider);
    const {data} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(data ?? []).toHaveLength(0);
  });

  it('staff vê tudo', async () => {
    const c = await signInAs(staff);
    const {data} = await c.from('work_updates').select('id').eq('id', updateId);
    expect(data).toHaveLength(1);
  });
});

describe('extratos: só quem tem fundos confirmados', () => {
  it('investidor com fundos confirmados vê o extrato', async () => {
    const c = await signInAs(funder);
    const {data, error} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor só com interesse NÃO vê o extrato', async () => {
    const c = await signInAs(interested);
    const {data} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(data ?? []).toHaveLength(0);
  });

  it('staff vê o extrato', async () => {
    const c = await signInAs(staff);
    const {data} = await c
      .from('account_statements')
      .select('id')
      .eq('id', statementId);
    expect(data).toHaveLength(1);
  });

  it('anónimo não vê nada', async () => {
    const anon = anonClient();
    const {data: a} = await anon.from('account_statements').select('id');
    const {data: b} = await anon.from('work_updates').select('id');
    expect(a ?? []).toHaveLength(0);
    expect(b ?? []).toHaveLength(0);
  });
});

describe('escrita bloqueada para investidores', () => {
  it('investidor NÃO escreve atualizações de obra', async () => {
    const c = await signInAs(funder);
    await c.from('work_updates').update({title: 'HACK'}).eq('id', updateId);
    const {data} = await admin
      .from('work_updates')
      .select('title')
      .eq('id', updateId)
      .single();
    expect(data!.title).toBe('Semana 1');
  });
});
```

- [ ] **Step 4: Correr — FALHA com 42P01** (`public.project_milestones` não existe). Provar a causa com um GET direto se o print do vitest for terso.

- [ ] **Step 5: Commit**

```bash
git add messages/pt.json messages/en.json tests/rls/obra-extratos.test.ts
git commit -m "feat(obra): namespaces i18n + testes RLS (a falhar — schema por criar)"
```

---

### Task 2: Migração (tabelas, actual_amount, buckets, RLS, audit, grants)

**Files:**
- Create: `supabase/migrations/<timestamp>_obra_extratos.sql`

- [ ] **Step 1: `supabase migration new obra_extratos`** (escrever SEM BOM).

- [ ] **Step 2: Escrever a migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 5 — Obra + Extratos
-- marcos, diário de obra (+media), custo real por rubrica, extratos.
-- RLS: staff lê tudo; investidor com subscrição ATIVA vê obra; extratos só
-- para quem tem fundos_confirmados (registos financeiros da conta dedicada).
-- Escrita: exclusivamente via Server Actions com service role.
-- ============================================================

create type public.milestone_status as enum ('previsto', 'em_curso', 'concluido');
create type public.media_type as enum ('photo', 'video');

-- Helpers de visibilidade (evitam repetir o EXISTS em cada policy).
create or replace function public.has_active_subscription(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.project_id = p_project
      and s.user_id = auth.uid()
      and s.status <> 'cancelada'
  );
$$;

create or replace function public.has_confirmed_subscription(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.project_id = p_project
      and s.user_id = auth.uid()
      and s.status = 'fundos_confirmados'
  );
$$;

-- SECURITY DEFINER: revogar de public/anon/authenticated e conceder só onde é
-- preciso. Estas são usadas DENTRO de policies (executadas no contexto do
-- utilizador), por isso authenticated PRECISA de execute — mas são apenas
-- leituras booleanas sobre as próprias subscrições do chamador, sem escrita.
revoke execute on function public.has_active_subscription(uuid) from public;
revoke execute on function public.has_confirmed_subscription(uuid) from public;
grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;
grant execute on function public.has_confirmed_subscription(uuid) to authenticated, service_role;

-- ---------- project_milestones ----------
create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  planned_date date,
  actual_date date,
  status public.milestone_status not null default 'previsto',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id);
alter table public.project_milestones enable row level security;

create policy "milestones: investidor com subscrição"
  on public.project_milestones for select to authenticated
  using (public.has_active_subscription(project_id));
create policy "milestones: staff"
  on public.project_milestones for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- work_updates ----------
create table public.work_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index work_updates_project_idx on public.work_updates (project_id, published_at desc);
alter table public.work_updates enable row level security;

create policy "work_updates: investidor com subscrição"
  on public.work_updates for select to authenticated
  using (public.has_active_subscription(project_id));
create policy "work_updates: staff"
  on public.work_updates for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- work_update_media ----------
create table public.work_update_media (
  id uuid primary key default gen_random_uuid(),
  work_update_id uuid not null references public.work_updates (id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index work_update_media_update_idx on public.work_update_media (work_update_id);
alter table public.work_update_media enable row level security;

create policy "work_media: herda a visibilidade da atualização"
  on public.work_update_media for select to authenticated
  using (
    exists (
      select 1 from public.work_updates w
      where w.id = work_update_id
        and (public.has_active_subscription(w.project_id)
             or public.current_user_role() in ('admin', 'project_manager'))
    )
  );

-- ---------- account_statements ----------
create table public.account_statements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  version integer not null default 1 check (version > 0),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, period, version)
);
create index account_statements_project_idx
  on public.account_statements (project_id, period desc, version desc);
alter table public.account_statements enable row level security;

-- Extratos: só investidores com fundos confirmados (e staff).
create policy "statements: investidor com fundos confirmados"
  on public.account_statements for select to authenticated
  using (public.has_confirmed_subscription(project_id));
create policy "statements: staff"
  on public.account_statements for select to authenticated
  using (public.current_user_role() in ('admin', 'project_manager'));

-- ---------- custo real por rubrica ----------
alter table public.project_budget_lines
  add column actual_amount numeric(12,2) not null default 0
    check (actual_amount >= 0);

-- ---------- Auditoria ----------
create trigger work_updates_audit
  after insert or update or delete on public.work_updates
  for each row execute function public.audit_row_change();
create trigger account_statements_audit
  after insert or update or delete on public.account_statements
  for each row execute function public.audit_row_change();

-- ---------- Storage ----------
-- work-media aceita upload DIRETO do browser (URL assinada), pelo que a
-- validação de tipo/tamanho tem de viver no bucket — é o único ponto que o
-- servidor de Storage impõe num upload direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('work-media', 'work-media', false, 209715200,
   array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('statements', 'statements', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------- Grants (hardening repo-wide) ----------
revoke insert, update, delete, truncate on public.project_milestones
  from anon, authenticated;
revoke insert, update, delete, truncate on public.work_updates
  from anon, authenticated;
revoke insert, update, delete, truncate on public.work_update_media
  from anon, authenticated;
revoke insert, update, delete, truncate on public.account_statements
  from anon, authenticated;
```

- [ ] **Step 3: Aplicar** — `head -c 3 supabase/migrations/*_obra_extratos.sql | xxd -p` (≠efbbbf), `supabase db reset`.

- [ ] **Step 4: Testes RLS — PASSAM** — `npm test -- tests/rls/obra-extratos.test.ts`

- [ ] **Step 5: Suite completa** — `npm test` (verde).

- [ ] **Step 6: Verificação DB** (colar output real):
```bash
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('work-media','statements');"
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='account_statements' and grantee='authenticated';"
```
Esperado: buckets privados com limites; `authenticated` só com SELECT.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_obra_extratos.sql
git commit -m "feat(obra): migração — marcos, diário, media, extratos, custo real, buckets, RLS, grants"
```

---

## FASE B — Obra

### Task 3: Notificações partilhadas + serviço de obra

**Files:**
- Create: `src/lib/notify/investors.ts`, `src/lib/works/service.ts`, `tests/integration/works.test.ts`

- [ ] **Step 1: Escrever `tests/integration/works.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  addMilestone,
  updateMilestone,
  listMilestones,
  publishWorkUpdate,
  listWorkUpdates,
  setActualAmount
} from '@/lib/works/service';

let staffId: string;
const noopMail = {transport: {sendMail: async () => ({})}};

async function makeProject(): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `Obra-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function funderOn(projectId: string): Promise<string> {
  const u = await createTestUser(`obra-svc-${randomUUID().slice(0, 8)}@test.local`);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status: 'fundos_confirmados',
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return u.id;
}

beforeAll(async () => {
  staffId = (await createTestUser(`obra-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('marcos', () => {
  it('adiciona e atualiza um marco', async () => {
    const projectId = await makeProject();
    const {id} = await addMilestone(projectId, {
      title: 'Demolições',
      plannedDate: '2026-08-01'
    });
    await updateMilestone(id, {status: 'concluido', actualDate: '2026-08-05'});
    const rows = await listMilestones(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('concluido');
    expect(rows[0].actual_date).toBe('2026-08-05');
  });
});

describe('publishWorkUpdate', () => {
  it('publica e notifica só investidores com fundos confirmados', async () => {
    const projectId = await makeProject();
    await funderOn(projectId);
    const {id} = await publishWorkUpdate(
      {projectId, title: 'Semana 1', body: 'Arranque da obra', createdBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(id).toBeTruthy();
    const feed = await listWorkUpdates(projectId);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Semana 1');
    // Um email na outbox para o investidor confirmado.
    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'work_update_published');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('setActualAmount', () => {
  it('grava o custo real na rubrica', async () => {
    const projectId = await makeProject();
    const {data: line, error} = await admin
      .from('project_budget_lines')
      .insert({project_id: projectId, name: 'Estrutura', phase: 'Obra', budget_amount: 10000, sort_order: 1})
      .select('id')
      .single();
    if (error) throw error;
    await setActualAmount(line.id, 9000, {locale: 'pt'}, noopMail);
    const {data: after} = await admin
      .from('project_budget_lines')
      .select('actual_amount')
      .eq('id', line.id)
      .single();
    expect(Number(after!.actual_amount)).toBe(9000);
  });

  it('dispara alerta de desvio acima do limiar', async () => {
    const projectId = await makeProject();
    const {data: line} = await admin
      .from('project_budget_lines')
      .insert({project_id: projectId, name: 'Cobertura', phase: 'Obra', budget_amount: 10000, sort_order: 1})
      .select('id')
      .single();
    // limiar default = 10% → 12000 é +20% ⇒ alerta
    await setActualAmount(line!.id, 12000, {locale: 'pt'}, noopMail);
    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'budget_deviation_alert');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA.**

- [ ] **Step 3: Implementar `src/lib/notify/investors.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {
  Locale,
  TemplateName,
  TemplatePayloadMap
} from '@/lib/mail/templates';

/**
 * Notifica por email os investidores de um projeto com fundos confirmados —
 * quem tem dinheiro no projeto. Decisão de slice da Fatia 5: manifestações de
 * interesse e contratos por transferir NÃO recebem estas notificações.
 * Falhas de envio não rebentam a operação (sendEmail regista em email_outbox).
 */
export async function notifyConfirmedInvestors<T extends TemplateName>(
  db: SupabaseClient,
  projectId: string,
  template: T,
  payload: TemplatePayloadMap[T],
  locale: Locale,
  deps: SendEmailDeps = {}
): Promise<number> {
  const {data: subs} = await db
    .from('subscriptions')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('status', 'fundos_confirmados');

  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  let sent = 0;
  for (const userId of userIds) {
    const {data} = await db.auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email) continue;
    await sendEmail(
      {toEmail: email, locale, template, payload},
      {db, transport: deps.transport}
    );
    sent++;
  }
  return sent;
}
```

- [ ] **Step 4: Implementar `src/lib/works/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {notifyConfirmedInvestors} from '@/lib/notify/investors';

/**
 * Acompanhamento de obra (server-only, service role). Escrita só por aqui,
 * chamada por Server Actions que garantem staff.
 */

export type MilestoneStatus = 'previsto' | 'em_curso' | 'concluido';

export type MilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  planned_date: string | null;
  actual_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
};

export type WorkUpdateRow = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  body: string;
  published_at: string;
};

export type MediaRow = {
  id: string;
  work_update_id: string;
  media_type: 'photo' | 'video';
  mime_type: string;
  sort_order: number;
};

export async function addMilestone(
  projectId: string,
  input: {title: string; plannedDate?: string | null},
  db: SupabaseClient = createAdminClient()
): Promise<{id: string}> {
  const {count} = await db
    .from('project_milestones')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  const {data, error} = await db
    .from('project_milestones')
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      planned_date: input.plannedDate ?? null,
      sort_order: (count ?? 0) + 1
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`criar marco falhou: ${error?.message ?? 'sem linha'}`);
  }
  return {id: data.id};
}

export async function updateMilestone(
  id: string,
  input: {
    title?: string;
    plannedDate?: string | null;
    actualDate?: string | null;
    status?: MilestoneStatus;
  },
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.plannedDate !== undefined) patch.planned_date = input.plannedDate;
  if (input.actualDate !== undefined) patch.actual_date = input.actualDate;
  if (input.status !== undefined) patch.status = input.status;
  const {error} = await db.from('project_milestones').update(patch).eq('id', id);
  if (error) throw new Error(`atualizar marco falhou: ${error.message}`);
}

export async function listMilestones(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<MilestoneRow[]> {
  const {data, error} = await db
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`listar marcos falhou: ${error.message}`);
  return (data ?? []) as MilestoneRow[];
}

export type PublishUpdateInput = {
  projectId: string;
  title: string;
  body: string;
  milestoneId?: string | null;
  createdBy: string;
  locale: Locale;
};

export async function publishWorkUpdate(
  input: PublishUpdateInput,
  deps: SendEmailDeps = {}
): Promise<{id: string}> {
  const db = deps.db ?? createAdminClient();
  const {data: project} = await db
    .from('projects')
    .select('name')
    .eq('id', input.projectId)
    .single();
  if (!project) throw new Error('projeto não encontrado');

  const {data, error} = await db
    .from('work_updates')
    .insert({
      project_id: input.projectId,
      milestone_id: input.milestoneId ?? null,
      title: input.title.trim(),
      body: input.body,
      created_by: input.createdBy
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`publicar atualização falhou: ${error?.message ?? 'sem linha'}`);
  }

  await notifyConfirmedInvestors(
    db,
    input.projectId,
    'work_update_published',
    {projectName: project.name, updateTitle: input.title.trim()},
    input.locale,
    {transport: deps.transport}
  );

  return {id: data.id};
}

export async function listWorkUpdates(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<WorkUpdateRow[]> {
  const {data, error} = await db
    .from('work_updates')
    .select('*')
    .eq('project_id', projectId)
    .order('published_at', {ascending: false});
  if (error) throw new Error(`listar atualizações falhou: ${error.message}`);
  return (data ?? []) as WorkUpdateRow[];
}

export async function listUpdateMedia(
  updateIds: string[],
  db: SupabaseClient = createAdminClient()
): Promise<MediaRow[]> {
  if (updateIds.length === 0) return [];
  const {data, error} = await db
    .from('work_update_media')
    .select('id, work_update_id, media_type, mime_type, sort_order')
    .in('work_update_id', updateIds)
    .order('sort_order', {ascending: true});
  if (error) throw new Error(`listar media falhou: ${error.message}`);
  return (data ?? []) as MediaRow[];
}

/**
 * Grava o custo real de uma rubrica e dispara alerta INTERNO ao staff se o
 * desvio exceder `budget_deviation_alert_pct` (spec 3.5).
 */
export async function setActualAmount(
  lineId: string,
  actual: number,
  opts: {locale: Locale},
  deps: SendEmailDeps = {}
): Promise<void> {
  const db = deps.db ?? createAdminClient();
  const {data: line} = await db
    .from('project_budget_lines')
    .select('name, budget_amount, project_id')
    .eq('id', lineId)
    .single();
  if (!line) throw new Error('rubrica não encontrada');

  const {error} = await db
    .from('project_budget_lines')
    .update({actual_amount: actual})
    .eq('id', lineId);
  if (error) throw new Error(`gravar custo real falhou: ${error.message}`);

  const budget = Number(line.budget_amount);
  if (budget <= 0) return;

  const {data: setting} = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'budget_deviation_alert_pct')
    .single();
  const threshold = Number(setting?.value ?? 10);
  const deviationPct = ((actual - budget) / budget) * 100;

  if (deviationPct > threshold) {
    await sendEmail(
      {
        toEmail: process.env.SMTP_USER ?? 'staff@tilweni.local',
        locale: opts.locale,
        template: 'budget_deviation_alert',
        payload: {
          lineName: line.name,
          budget: formatEur(budget),
          actual: formatEur(actual),
          deviationPct: deviationPct.toFixed(1)
        }
      },
      {db, transport: deps.transport}
    );
  }
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(n);
}
```

- [ ] **Step 5: Correr o teste (após a Task 5 dos templates) — PASSA.** Nota: `publishWorkUpdate` e `setActualAmount` usam templates criados na Task 5; **implementar a Task 5 antes de correr este teste até verde**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notify/investors.ts src/lib/works/service.ts tests/integration/works.test.ts
git commit -m "feat(obra): serviço de marcos/diário/custo real + notificação de investidores confirmados"
```

---

### Task 4: Storage de obra (foto por action, vídeo por URL assinada)

**Files:**
- Create: `src/lib/works/storage.ts`

- [ ] **Step 1: Implementar**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const WORK_MEDIA_BUCKET = 'work-media';

/** Tipos aceites — espelham `allowed_mime_types` do bucket (que é quem impõe). */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime'];

export function mediaTypeFor(mime: string): 'photo' | 'video' | null {
  if (ALLOWED_IMAGE_MIME.includes(mime)) return 'photo';
  if (ALLOWED_VIDEO_MIME.includes(mime)) return 'video';
  return null;
}

export function workMediaPath(updateId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${updateId}/${Date.now()}-${safe}`;
}

/**
 * URL assinada de UPLOAD para o browser enviar o ficheiro diretamente ao
 * Storage (vídeos excedem o limite do Server Action). O bucket impõe
 * file_size_limit e allowed_mime_types — é a validação efetiva neste caminho.
 */
export async function createMediaUploadUrl(
  path: string,
  db: SupabaseClient = createAdminClient()
): Promise<{path: string; token: string}> {
  const {data, error} = await db.storage
    .from(WORK_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`criar url de upload falhou: ${error?.message ?? 'sem url'}`);
  }
  return {path: data.path, token: data.token};
}

/** URL assinada de leitura (fotos e streaming de vídeo). */
export async function signedMediaUrl(
  path: string,
  expiresInSeconds = 300,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(WORK_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url media falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 2: typecheck + lint + commit**

```bash
npm run typecheck && npm run lint
git add src/lib/works/storage.ts
git commit -m "feat(obra): storage de media (upload server-side + URL assinada de upload direto)"
```

---

### Task 5: Templates de email (obra)

**Files:**
- Modify: `src/lib/mail/templates.ts`, `tests/unit/mail-templates.test.ts`

- [ ] **Step 1: Testes** (acrescentar ao ficheiro existente):

```ts
describe('templates obra', () => {
  it('work_update_published rende', () => {
    const r = renderTemplate('work_update_published', 'pt', {
      projectName: 'Campelos',
      updateTitle: 'Semana 1'
    });
    expect(r.html).toContain('Campelos');
    expect(r.html).toContain('Semana 1');
  });

  it('budget_deviation_alert rende', () => {
    const r = renderTemplate('budget_deviation_alert', 'pt', {
      lineName: 'Cobertura',
      budget: '10 000 €',
      actual: '12 000 €',
      deviationPct: '20.0'
    });
    expect(r.html).toContain('Cobertura');
    expect(r.html).toContain('20.0');
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA.**

- [ ] **Step 3: Estender `templates.ts`** — seguir o estilo das funções `renderX(locale, payload)` existentes (`layout()` + `esc()` em TODOS os valores interpolados).

União e payloads:
```ts
export type TemplateName =
  | 'invite'
  | 'welcome'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'subscription_interest'
  | 'subscription_confirmed'
  | 'work_update_published'
  | 'budget_deviation_alert';

export type WorkUpdatePublishedPayload = {
  projectName: string;
  updateTitle: string;
};
export type BudgetDeviationAlertPayload = {
  lineName: string;
  budget: string;
  actual: string;
  deviationPct: string;
};
```
Acrescentar ao `TemplatePayloadMap`:
```ts
  work_update_published: WorkUpdatePublishedPayload;
  budget_deviation_alert: BudgetDeviationAlertPayload;
```
Conteúdos:
- **work_update_published** (investidor): PT assunto "TILWENI — Nova atualização de obra"; corpo: "Há uma nova atualização no projeto {projectName}: «{updateTitle}». Entre na plataforma para ver os detalhes e as imagens." EN equivalente.
- **budget_deviation_alert** (interno/staff): PT assunto "TILWENI — Alerta de desvio orçamental"; corpo: "A rubrica «{lineName}» tem custo real {actual} face a um orçamento de {budget} — desvio de {deviationPct}%." EN equivalente.

Adicionar os dois `case` ao switch de `renderTemplate`.

- [ ] **Step 4: Correr templates + o teste de obra (Task 3) — ambos PASSAM.**
- [ ] **Step 5: typecheck (exaustividade) + commit**

```bash
npm run typecheck
git add src/lib/mail/templates.ts tests/unit/mail-templates.test.ts
git commit -m "feat(obra): templates de email (atualização publicada, alerta de desvio)"
```

---

### Task 6: Back-office — marcos e custo real

**Files:**
- Create: `src/app/[locale]/(admin)/gestao-projetos/[id]/obra/page.tsx`, `.../obra/actions.ts`

- [ ] **Step 1: Server Actions `actions.ts`** (só as de marcos e custos; as de atualização/media vêm na Task 7 e são adicionadas a este mesmo ficheiro):

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  addMilestone,
  updateMilestone,
  setActualAmount,
  type MilestoneStatus
} from '@/lib/works/service';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function addMilestoneAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const planned = String(formData.get('planned_date') ?? '');
  await addMilestone(projectId, {
    title: String(formData.get('title') ?? ''),
    plannedDate: planned || null
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function updateMilestoneAction(
  locale: Locale,
  projectId: string,
  milestoneId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const actual = String(formData.get('actual_date') ?? '');
  await updateMilestone(milestoneId, {
    status: String(formData.get('status') ?? 'previsto') as MilestoneStatus,
    actualDate: actual || null
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

export async function setActualAmountAction(
  locale: Locale,
  projectId: string,
  lineId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await setActualAmount(lineId, Number(formData.get('actual_amount') ?? 0), {
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}
```

- [ ] **Step 2: Página `obra/page.tsx`**

Server Component (`export const dynamic = 'force-dynamic'`; o `(admin)/layout.tsx` guarda staff). Carrega `listMilestones(id)` e as rubricas (`project_budget_lines` via `createAdminClient()`, incluindo `actual_amount`). Renderiza, com `getTranslations('WorksAdmin')` (`ta`) e `getTranslations('Works')` (`tw`):
- Secção **marcos**: tabela (título, data prevista, data real, estado) + por linha um form `updateMilestoneAction.bind(null, loc, id, m.id)` com `<select name="status">` (previsto/em_curso/concluido, rotulados por `tw('status_...')`) e `<input type="date" name="actual_date">`; abaixo um form `addMilestoneAction.bind(null, loc, id)` (título + data prevista).
- Secção **orçado-vs-real**: tabela das rubricas (rubrica, fase, orçamento, custo real, desvio %) + por linha um form `setActualAmountAction.bind(null, loc, id, line.id)` com `<input type="number" step="0.01" name="actual_amount" defaultValue={line.actual_amount}>` e botão `ta('saveActuals')`. Desvio = `((actual-budget)/budget*100).toFixed(1)` quando budget>0, senão "—".
Seguir o estilo de `(admin)/gestao-projetos/[id]/page.tsx` (shadcn Table/Input/Button/Badge). Adicionar um link para esta página a partir de `gestao-projetos/[id]/page.tsx` (rótulo `WorksAdmin.title`).

- [ ] **Step 3: build/typecheck/lint + commit**

```bash
npm run build && npm run typecheck && npm run lint
git add "src/app/[locale]/(admin)/gestao-projetos/[id]/obra" "src/app/[locale]/(admin)/gestao-projetos/[id]/page.tsx"
git commit -m "feat(obra): back-office de marcos e custo real por rubrica"
```

---

### Task 7: Back-office — publicar atualização + upload de media (vídeo direto)

**Files:**
- Modify: `src/app/[locale]/(admin)/gestao-projetos/[id]/obra/actions.ts` (acrescentar)
- Create: `src/app/[locale]/(admin)/gestao-projetos/[id]/obra/MediaUploader.tsx`
- Modify: `.../obra/page.tsx` (secção de publicação + uploader)

- [ ] **Step 1: Acrescentar Server Actions a `actions.ts`**

```ts
import {publishWorkUpdate} from '@/lib/works/service';
import {
  createMediaUploadUrl,
  workMediaPath,
  mediaTypeFor
} from '@/lib/works/storage';
import {createAdminClient} from '@/lib/supabase/admin';

export async function publishUpdateAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const milestone = String(formData.get('milestone_id') ?? '');
  await publishWorkUpdate({
    projectId,
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    milestoneId: milestone || null,
    createdBy: s.userId,
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}

/** Passo 1 do upload direto: devolve caminho + token assinado ao browser. */
export async function createUploadUrlAction(
  updateId: string,
  filename: string,
  mimeType: string
): Promise<{path: string; token: string} | {error: string}> {
  await requireStaff();
  if (!mediaTypeFor(mimeType)) return {error: 'mime'};
  const path = workMediaPath(updateId, filename);
  try {
    return await createMediaUploadUrl(path);
  } catch {
    return {error: 'upload_url'};
  }
}

/** Passo 3 do upload direto: regista a media depois de o browser a enviar. */
export async function registerMediaAction(
  locale: Locale,
  projectId: string,
  updateId: string,
  path: string,
  mimeType: string,
  sizeBytes: number
): Promise<void> {
  await requireStaff();
  const kind = mediaTypeFor(mimeType);
  if (!kind) throw new Error('tipo de ficheiro não permitido');
  const db = createAdminClient();
  const {count} = await db
    .from('work_update_media')
    .select('*', {count: 'exact', head: true})
    .eq('work_update_id', updateId);
  const {error} = await db.from('work_update_media').insert({
    work_update_id: updateId,
    storage_path: path,
    media_type: kind,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    sort_order: (count ?? 0) + 1
  });
  if (error) throw new Error(`registar media falhou: ${error.message}`);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/obra`);
}
```

- [ ] **Step 2: Client `MediaUploader.tsx`**

Componente `'use client'` que orquestra os 3 passos. Props: `{locale: string; projectId: string; updateId: string}`. Fluxo ao escolher um ficheiro:
1. `const res = await createUploadUrlAction(updateId, file.name, file.type)`; se `'error' in res` → mostrar `WorksAdmin.uploadFailed`.
2. `const supabase = createClient()` (de `@/lib/supabase/client`) e `await supabase.storage.from('work-media').uploadToSignedUrl(res.path, res.token, file)`. Se erro → `uploadFailed` (o bucket rejeita tipo/tamanho fora dos limites — é aqui que a validação efetiva acontece).
3. `await registerMediaAction(locale, projectId, updateId, res.path, file.type, file.size)`; depois `router.refresh()`.
Mostrar `WorksAdmin.uploading` enquanto decorre e o hint `WorksAdmin.mediaHint`. Usar `useState` para estado/erro. **Não importar nada server-only** — só as actions, o client Supabase e componentes de UI.

Estrutura de referência:
```tsx
'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {createUploadUrlAction, registerMediaAction} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export function MediaUploader({locale, projectId, updateId}: {locale: string; projectId: string; updateId: string}) {
  const t = useTranslations('WorksAdmin');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await createUploadUrlAction(updateId, file.name, file.type);
      if ('error' in res) throw new Error(res.error);
      const supabase = createClient();
      const {error} = await supabase.storage
        .from('work-media')
        .uploadToSignedUrl(res.path, res.token, file);
      if (error) throw error;
      await registerMediaAction(locale, projectId, updateId, res.path, file.type, file.size);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-1">
      <Input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={onPick} disabled={busy} />
      <p className="text-xs text-neutral-500">{t('mediaHint')}</p>
      {busy && <p className="text-xs text-neutral-500">{t('uploading')}</p>}
      {failed && <p role="alert" className="text-xs text-red-600">{t('uploadFailed')}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Ligar na página `obra/page.tsx`** — acrescentar uma secção "diário": um form de publicação (`publishUpdateAction.bind(null, loc, id)`) com título, descrição (`<textarea name="body">`) e `<select name="milestone_id">` (opção `WorksAdmin.none` + os marcos); e a lista de atualizações já publicadas (`listWorkUpdates`), cada uma com o seu `<MediaUploader updateId={u.id} .../>` e a media já carregada (contagem ou miniaturas via `/api/works/media/<id>` — Task 8).

- [ ] **Step 4: build/typecheck/lint** — confirmar que `MediaUploader` não importa server-only.

- [ ] **Step 5: Verificação real do upload direto** — com uma sessão staff, carregar uma imagem pequena e (se possível) um vídeo; confirmar que a linha aparece em `work_update_media` e o objeto no bucket. Testar também um tipo NÃO permitido (ex.: `.txt` renomeado) e confirmar que o **bucket** rejeita. Documentar observado vs. raciocinado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(admin)/gestao-projetos/[id]/obra"
git commit -m "feat(obra): publicar atualização + upload de media (vídeo direto ao Storage)"
```

---

### Task 8: Media servida + página de obra do investidor

**Files:**
- Create: `src/app/api/works/media/[id]/route.ts`, `src/app/[locale]/projetos/[id]/obra/page.tsx`

- [ ] **Step 1: Route Handler `/api/works/media/[id]`**

Sem audit (media de obra não é documento legal; segue o padrão das fotos de projeto). Gate: sessão + (subscrição ativa no projeto OU staff).

```ts
import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedMediaUrl} from '@/lib/works/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: media} = await db
    .from('work_update_media')
    .select('storage_path, work_update_id')
    .eq('id', id)
    .single();
  if (!media) return NextResponse.json({error: 'not_found'}, {status: 404});

  const {data: update} = await db
    .from('work_updates')
    .select('project_id')
    .eq('id', media.work_update_id)
    .single();
  if (!update) return NextResponse.json({error: 'not_found'}, {status: 404});

  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', update.project_id)
      .eq('user_id', session.userId)
      .neq('status', 'cancelada');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return NextResponse.json({error: 'forbidden'}, {status: 403});

  const url = await signedMediaUrl(media.storage_path, 300, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Página `/projetos/[id]/obra`**

Server Component (`force-dynamic`). Gate: `getSession()`; se não staff, exigir subscrição ativa no projeto (contar em `subscriptions`), senão `notFound()`. Carrega `listMilestones`, as rubricas com `actual_amount`, `listWorkUpdates` e `listUpdateMedia`. Renderiza com `getTranslations('Works')`:
- **Timeline de marcos**: lista com título, `Works.planned` (data prevista), `Works.actual` (data real) e o estado (`status_*`).
- **Orçado-vs-real**: tabela rubrica / orçamento / executado / desvio (%). Formatar em euros como nas outras páginas.
- **Diário de obra**: feed das atualizações (título, data, corpo) e, por atualização, a media: `<img src={`/api/works/media/${m.id}`}>` para `photo` (com `{/* eslint-disable-next-line @next/next/no-img-element */}`) e `<video controls src={`/api/works/media/${m.id}`}>` para `video`.
- Link `Works.backToProject` para `/{locale}/projetos/{id}`.
Adicionar também, na ficha (`/projetos/[id]/page.tsx`), um link para `/projetos/[id]/obra` quando o utilizador tem posição (usar o `mine` já existente).

- [ ] **Step 3: build/typecheck/lint + verificação** — rota no build; sem sessão → 401 na rota de media; investidor sem subscrição → 403. Documentar.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/works" "src/app/[locale]/projetos/[id]/obra" "src/app/[locale]/projetos/[id]/page.tsx"
git commit -m "feat(obra): media por URL assinada + página de acompanhamento do investidor"
```

---

## FASE C — Extratos

### Task 9: Serviço + storage de extratos

**Files:**
- Create: `src/lib/statements/storage.ts`, `src/lib/statements/service.ts`, `tests/integration/statements.test.ts`

- [ ] **Step 1: Teste de integração**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {publishStatement, listStatements} from '@/lib/statements/service';

let staffId: string;
const noopMail = {transport: {sendMail: async () => ({})}};

function pdf(name: string): File {
  // Assinatura de PDF válida.
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, {type: 'application/pdf'});
}

async function makeProject(): Promise<string> {
  const {data, error} = await admin
    .from('projects')
    .insert({
      name: `Ext-${randomUUID().slice(0, 6)}`,
      location: 'X',
      status: 'em_curso',
      total_amount: 100000,
      estimated_irr: 15,
      term_months: 8
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function funderOn(projectId: string): Promise<string> {
  const u = await createTestUser(`ext-${randomUUID().slice(0, 8)}@test.local`);
  const {error} = await admin.from('subscriptions').insert({
    project_id: projectId,
    user_id: u.id,
    amount: 20000,
    status: 'fundos_confirmados',
    consent_given: true,
    terms_version: 'v1'
  });
  if (error) throw error;
  return u.id;
}

beforeAll(async () => {
  staffId = (await createTestUser(`ext-staff-${randomUUID().slice(0, 8)}@test.local`, 'admin')).id;
});

describe('publishStatement', () => {
  it('publica o extrato, sobe o ficheiro e notifica confirmados', async () => {
    const projectId = await makeProject();
    await funderOn(projectId);
    const {id, version} = await publishStatement(
      {projectId, period: '2026-07', file: pdf('extrato.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(id).toBeTruthy();
    expect(version).toBe(1);

    const rows = await listStatements(projectId);
    expect(rows).toHaveLength(1);
    const {data: file} = await admin.storage.from('statements').download(rows[0].storage_path);
    expect(file).toBeTruthy();

    const {data: mails} = await admin
      .from('email_outbox')
      .select('template')
      .eq('template', 'statement_published');
    expect((mails ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('republicar o mesmo período cria uma NOVA versão (histórico permanente)', async () => {
    const projectId = await makeProject();
    await publishStatement(
      {projectId, period: '2026-08', file: pdf('a.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    const {version} = await publishStatement(
      {projectId, period: '2026-08', file: pdf('b.pdf'), publishedBy: staffId, locale: 'pt'},
      noopMail
    );
    expect(version).toBe(2);
    const rows = await listStatements(projectId);
    expect(rows).toHaveLength(2); // ambas as versões continuam visíveis
  });

  it('rejeita período mal formado', async () => {
    const projectId = await makeProject();
    await expect(
      publishStatement(
        {projectId, period: 'julho', file: pdf('a.pdf'), publishedBy: staffId, locale: 'pt'},
        noopMail
      )
    ).rejects.toThrow(/período|periodo/i);
  });
});
```

- [ ] **Step 2: Correr e confirmar FALHA.**

- [ ] **Step 3: `src/lib/statements/storage.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

export const STATEMENTS_BUCKET = 'statements';

export function statementPath(
  projectId: string,
  period: string,
  version: number,
  filename: string
): string {
  const safe = filename.replace(/[^\w.\-]/g, '_');
  return `${projectId}/${period}-v${version}-${safe}`;
}

export async function uploadStatement(
  path: string,
  file: File,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const {error} = await db.storage
    .from(STATEMENTS_BUCKET)
    .upload(path, buffer, {contentType: file.type, upsert: false});
  if (error) throw new Error(`upload extrato falhou: ${error.message}`);
}

export async function signedStatementUrl(
  path: string,
  expiresInSeconds = 60,
  db: SupabaseClient = createAdminClient()
): Promise<string> {
  const {data, error} = await db.storage
    .from(STATEMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`assinar url extrato falhou: ${error?.message ?? 'sem url'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 4: `src/lib/statements/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import type {SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {notifyConfirmedInvestors} from '@/lib/notify/investors';
import {statementPath, uploadStatement} from './storage';

/**
 * Extratos da conta dedicada (server-only, service role). Publicar o mesmo
 * período cria uma NOVA versão — o histórico é permanente e nada é substituído
 * em silêncio (spec 3.6).
 */

export type StatementRow = {
  id: string;
  project_id: string;
  period: string;
  version: number;
  storage_path: string;
  original_filename: string;
  published_at: string;
};

const PERIOD_RE = /^\d{4}-\d{2}$/;
const ALLOWED_MIME = ['application/pdf'];

export type PublishStatementInput = {
  projectId: string;
  period: string;
  file: File;
  publishedBy: string;
  locale: Locale;
};

export async function publishStatement(
  input: PublishStatementInput,
  deps: SendEmailDeps = {}
): Promise<{id: string; version: number}> {
  const db = deps.db ?? createAdminClient();

  if (!PERIOD_RE.test(input.period)) {
    throw new Error('período inválido (usar AAAA-MM)');
  }
  if (!ALLOWED_MIME.includes(input.file.type)) {
    throw new Error(`tipo de ficheiro não permitido: ${input.file.type}`);
  }

  const {data: project} = await db
    .from('projects')
    .select('name')
    .eq('id', input.projectId)
    .single();
  if (!project) throw new Error('projeto não encontrado');

  // Nova versão = max(version) + 1 para o período.
  const {data: existing} = await db
    .from('account_statements')
    .select('version')
    .eq('project_id', input.projectId)
    .eq('period', input.period)
    .order('version', {ascending: false})
    .limit(1);
  const version = ((existing?.[0]?.version as number | undefined) ?? 0) + 1;

  const path = statementPath(
    input.projectId,
    input.period,
    version,
    input.file.name
  );
  await uploadStatement(path, input.file, db);

  const {data, error} = await db
    .from('account_statements')
    .insert({
      project_id: input.projectId,
      period: input.period,
      version,
      storage_path: path,
      original_filename: input.file.name,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      published_by: input.publishedBy
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`publicar extrato falhou: ${error?.message ?? 'sem linha'}`);
  }

  await notifyConfirmedInvestors(
    db,
    input.projectId,
    'statement_published',
    {projectName: project.name, period: input.period},
    input.locale,
    {transport: deps.transport}
  );

  return {id: data.id, version};
}

export async function listStatements(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<StatementRow[]> {
  const {data, error} = await db
    .from('account_statements')
    .select('*')
    .eq('project_id', projectId)
    .order('period', {ascending: false})
    .order('version', {ascending: false});
  if (error) throw new Error(`listar extratos falhou: ${error.message}`);
  return (data ?? []) as StatementRow[];
}
```

- [ ] **Step 5: Correr o teste (após a Task 10) — PASSA.** (Depende do template `statement_published`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/statements tests/integration/statements.test.ts
git commit -m "feat(extratos): serviço de publicação com versionamento + storage"
```

---

### Task 10: Template de email do extrato

**Files:** Modify `src/lib/mail/templates.ts`, `tests/unit/mail-templates.test.ts`

- [ ] **Step 1: Teste**

```ts
describe('template extrato', () => {
  it('statement_published rende', () => {
    const r = renderTemplate('statement_published', 'pt', {
      projectName: 'Campelos',
      period: '2026-07'
    });
    expect(r.html).toContain('Campelos');
    expect(r.html).toContain('2026-07');
  });
});
```

- [ ] **Step 2: Confirmar FALHA.**
- [ ] **Step 3: Estender templates** — acrescentar `'statement_published'` à união `TemplateName`, o payload `export type StatementPublishedPayload = {projectName: string; period: string};`, a entrada no `TemplatePayloadMap`, a função de render (PT assunto "TILWENI — Novo extrato disponível"; corpo: "Foi publicado o extrato de {period} da conta dedicada do projeto {projectName}. Está disponível na sua área privada." EN equivalente) e o `case` no switch. `esc()` em tudo.
- [ ] **Step 4: Correr templates + `tests/integration/statements.test.ts` — PASSAM.**
- [ ] **Step 5: typecheck + commit**

```bash
git add src/lib/mail/templates.ts tests/unit/mail-templates.test.ts
git commit -m "feat(extratos): template de email de extrato publicado"
```

---

### Task 11: Back-office de extratos

**Files:** Create `src/app/[locale]/(admin)/gestao-projetos/[id]/extratos/page.tsx`, `.../extratos/actions.ts`

- [ ] **Step 1: Server Action**

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {publishStatement} from '@/lib/statements/service';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

export async function publishStatementAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return;
  await publishStatement({
    projectId,
    period: String(formData.get('period') ?? ''),
    file,
    publishedBy: s.userId,
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/extratos`);
}
```

- [ ] **Step 2: Página** — Server Component (`force-dynamic`), `listStatements(id)`; tabela (período, versão, ficheiro, data de publicação, link `/api/statements/<id>`); form de publicação (`<input name="period" placeholder="AAAA-MM">` + `<input type="file" name="file" accept="application/pdf">`) com o hint `StatementsAdmin.newVersionHint`. `getTranslations('StatementsAdmin')`. Link a partir de `gestao-projetos/[id]/page.tsx`.
- [ ] **Step 3: build/typecheck/lint + commit**

```bash
git add "src/app/[locale]/(admin)/gestao-projetos/[id]/extratos" "src/app/[locale]/(admin)/gestao-projetos/[id]/page.tsx"
git commit -m "feat(extratos): back-office de publicação de extratos"
```

---

### Task 12: Extrato auditado + página do investidor

**Files:** Create `src/app/api/statements/[id]/route.ts`, `src/app/[locale]/projetos/[id]/extratos/page.tsx`

- [ ] **Step 1: Route Handler auditado** (spec 3.6 exige registo de consulta):

```ts
import {NextResponse} from 'next/server';
import {getSession, isStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {signedStatementUrl} from '@/lib/statements/storage';

export async function GET(
  _req: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const session = await getSession();
  if (!session) return NextResponse.json({error: 'unauthorized'}, {status: 401});

  const {id} = await params;
  const db = createAdminClient();

  const {data: st} = await db
    .from('account_statements')
    .select('storage_path, project_id, period')
    .eq('id', id)
    .single();
  if (!st) return NextResponse.json({error: 'not_found'}, {status: 404});

  // Só staff ou investidor com fundos confirmados no projeto.
  let allowed = isStaff(session.role);
  if (!allowed) {
    const {count} = await db
      .from('subscriptions')
      .select('id', {count: 'exact', head: true})
      .eq('project_id', st.project_id)
      .eq('user_id', session.userId)
      .eq('status', 'fundos_confirmados');
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return NextResponse.json({error: 'forbidden'}, {status: 403});

  // Auditar ANTES de emitir a URL. Fail-closed: sem registo, sem documento.
  const {error: auditError} = await db.from('audit_log').insert({
    actor_id: session.userId,
    action: 'view_document',
    entity_type: 'account_statements',
    entity_id: id,
    payload: {project_id: st.project_id, period: st.period}
  });
  if (auditError) {
    return NextResponse.json({error: 'audit_failed'}, {status: 500});
  }

  const url = await signedStatementUrl(st.storage_path, 60, db);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Página `/projetos/[id]/extratos`** — Server Component (`force-dynamic`). Gate: sessão; se não staff, exigir subscrição `fundos_confirmados` no projeto, senão `notFound()`. Lista `listStatements(id)`: período, versão, data, link `Statements.open` para `/api/statements/<id>`. Mostrar o aviso `Statements.notice` (consultas são registadas). Link de volta ao projeto. Adicionar link para esta página na ficha quando o utilizador tem `fundos_confirmados`.
- [ ] **Step 3: Verificar o acesso auditado** — sem sessão → 401; investidor sem fundos confirmados → 403; com fundos → uma linha `view_document`/`account_statements` no audit_log ANTES da URL; fail-closed testável com um stub cujo insert falha → 500 e nenhuma URL. Documentar observado vs. raciocinado.
- [ ] **Step 4: Commit**

```bash
git add "src/app/api/statements" "src/app/[locale]/projetos/[id]/extratos" "src/app/[locale]/projetos/[id]/page.tsx"
git commit -m "feat(extratos): consulta auditada por URL assinada + página do investidor"
```

---

### Task 13: i18n final + verificação e2e

- [ ] **Step 1:** `npm test -- tests/messages-parity.test.ts`, `npm test`, `npm run typecheck && npm run lint && npm run build` — tudo verde, 0 warnings.
- [ ] **Step 2: Verificação e2e manual** com staff + investidor confirmado:
  1. Staff cria marcos, marca um como concluído com data real.
  2. Staff grava custos reais; um acima do limiar dispara o alerta (verificar `email_outbox` com `budget_deviation_alert`).
  3. Staff publica uma atualização de obra com uma foto e um vídeo; confirmar as linhas em `work_update_media` e os objetos no bucket.
  4. Investidor confirmado abre `/pt/projetos/<id>/obra` → vê timeline, orçado-vs-real e o diário com media a reproduzir.
  5. Staff publica um extrato `2026-07`; investidor confirmado abre `/pt/projetos/<id>/extratos` → abre o PDF; confirmar a linha `view_document` no audit_log.
  6. Republicar `2026-07` → cria versão 2, ambas visíveis.
  7. Um investidor só com `interesse` NÃO vê extratos (mas vê a obra).
  Documentar o observado; limpar dev server e portas.
- [ ] **Step 3: Commit final se houve ajustes.**

---

## Fora de âmbito

- **Dashboard/portefólio agregado** (Fatia 6).
- **Motor de distribuição, retenção na fonte, comprovativos** (Fase C).
- **Assinatura digital integrada** (Fase B).
- Notificações **in-app** (`notifications`): esta fatia usa email; o feed in-app fica para a Fatia 6.

## Notas de segurança/compliance

- **Upload direto de vídeo**: a validação de tipo/tamanho é imposta pelo **bucket** (`allowed_mime_types`, `file_size_limit`) — é o único ponto efetivo quando os bytes não passam pelo servidor da app. As actions validam o mime declarado antes de emitir a URL assinada (defesa adicional, não substitui o bucket).
- **Extratos**: bucket privado, acesso só server-side, **consulta auditada fail-closed**, e visíveis apenas a quem tem fundos confirmados.
- Escrita de todas as tabelas novas só via Server Actions com service role; grants de escrita revogados a anon/authenticated.
- As funções `has_active_subscription`/`has_confirmed_subscription` são `SECURITY DEFINER` mas só devolvem um booleano sobre as subscrições **do próprio chamador** (`auth.uid()`), sem escrita — por isso `authenticated` precisa (e pode) executá-las dentro das policies.
