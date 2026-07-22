# TILWENI Fatia 6 — Dashboard + Polimento (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Fase A — dashboard do investidor, notificações in-app, back-office de auditoria/settings/utilizadores, casca de navegação e E2E dos fluxos críticos.

**Architecture:** Notificações passam a ser gravadas ao lado dos emails já existentes (`notifyConfirmedInvestors` e um novo `notifyUser`), guardando `type` + `payload` em vez de texto renderizado — a cópia vive no i18n e acompanha a mudança de idioma. A app ganha finalmente uma casca (cabeçalho + navegação + sino), porque hoje as páginas existem desligadas umas das outras. O back-office ganha as três vistas em falta da spec 5.8. Escrita continua exclusivamente por Server Actions com service role.

**Tech Stack:** Next.js 15 (App Router, Server Components, Server Actions), Supabase (Postgres + RLS + Storage), next-intl v4, shadcn/ui, Vitest, Playwright.

---

## Decisões desta fatia (tomadas pelo utilizador, 2026-07-22)

1. **Notificações in-app entram** — a spec promete "in-app + email" em três secções e só existia email.
2. **A aprovação de projeto por admin NÃO entra.** A spec 5.8 diz "aprovação de projeto por admin antes de disponibilização", mas mantém-se o comportamento atual: qualquer staff (`admin` ou `project_manager`) transita `preparacao → subscricao`. Fica registado como **desvio consciente** (Task 11), não como esquecimento.
3. **E2E dos fluxos críticos**, com o restauro de backup documentado como procedimento manual em vez de executado contra produção.

## Estado de partida (verificado, 2026-07-22)

- `main` = `origin/main` = `d2c3c5f`; 215 testes verdes; typecheck/lint/build limpos.
- 17 migrações, todas aplicadas em local e em `tilweni-prod`. Prod e local idênticos nas métricas de segurança.
- **A app não tem chrome nenhum**: `src/app/[locale]/layout.tsx` só monta `NextIntlClientProvider`, existem 2 `<Link>` em toda a app e não há seletor de idioma. Por isso a Task 4 (casca) não é cosmética — sem ela o dashboard e o sino não têm onde viver.
- `src/app/[locale]/page.tsx` ainda é o stub da Fatia 0 (mostra o email do utilizador).
- Papéis: `investor`, `project_manager`, `admin`, `auditor`. `isStaff` = admin + project_manager. `canReadStatements` = staff + auditor.
- A política do `audit_log` admite **`admin` e `auditor`** — **não** `project_manager`.

## Armadilhas conhecidas (mordidas neste repo)

- **PowerShell escreve UTF-8 com BOM** e parte o Supabase CLI. Escrever ficheiros BOM-free; verificar `head -c 3 <f> | xxd -p` ≠ `efbbbf`.
- **Portas 54421 (API) / 54422 (DB)**, não as 54321 por defeito. `.env.test` é a fonte de verdade.
- **Route groups não mudam URLs.** Já provocaram duas colisões aqui.
- **Política sem `to authenticated` aplica-se ao `anon`.** Já produziu um leak. Toda a política nova leva `to authenticated`.
- **`revoke ... from public` não chega** — revogar sempre de `public, anon, authenticated` e reconceder a quem precisa.
- **Não se pode escrever jsonb `null` via PostgREST** (`{value: null}` vira SQL NULL e viola o `not null`). Ver Task 8.
- **Asserção oca**: `expect(data ?? []).toHaveLength(0)` também passa quando a tabela não existe (`42P01` devolve `data: null`). Usar sempre `expect(error).toBeNull()` ao lado, ou os helpers `expectAnonCannotRead` / `expectRowHidden` de `tests/rls/helpers.ts`.

## Estrutura de ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_notifications.sql` | tabela `notifications`, enum, RLS, grants, RPC `set_platform_setting` |
| `src/lib/notifications/service.ts` | criar, listar, contar não-lidas, marcar lidas (server-only, service role) |
| `src/lib/notify/investors.ts` (modificar) | passa a gravar notificação além do email |
| `src/components/AppShell.tsx` | cabeçalho + navegação por papel + sino |
| `src/components/NotificationBell.tsx` | client component: contagem + dropdown + marcar lida |
| `src/app/[locale]/page.tsx` (reescrever) | dashboard do investidor |
| `src/app/[locale]/notificacoes/page.tsx` | histórico completo de notificações |
| `src/app/[locale]/auditoria/page.tsx` | viewer do audit log (admin + auditor) |
| `src/app/[locale]/(admin)/definicoes/` | edição de `platform_settings` (admin) |
| `src/app/[locale]/(admin)/utilizadores/` | listagem e mudança de papel (admin) |
| `e2e/jornada-investidor.spec.ts` | E2E do fluxo crítico ponta a ponta |
| `docs/restauro-backup.md` | procedimento de restauro documentado |

---

## FASE A — Notificações (base)

### Task 1: i18n namespaces + testes RLS de notificações (a falhar)

**Files:**
- Modify: `messages/pt.json`, `messages/en.json`
- Create: `tests/rls/notifications.test.ts`

- [ ] **Step 1: Acrescentar namespaces a AMBOS os ficheiros** (chaves idênticas — `tests/messages-parity.test.ts` compara recursivamente).

`pt.json`:
```json
  "Nav": {
    "dashboard": "Início",
    "projects": "Projetos",
    "notifications": "Notificações",
    "backoffice": "Back-office",
    "invites": "Convites",
    "kycQueue": "Verificações",
    "projectsAdmin": "Gestão de projetos",
    "settings": "Definições",
    "users": "Utilizadores",
    "audit": "Auditoria",
    "signOut": "Terminar sessão",
    "language": "Idioma"
  },
  "Dashboard": {
    "title": "A minha área",
    "invested": "Capital investido",
    "projectsCount": "Projetos",
    "expectedReturn": "Retorno estimado",
    "myPositions": "As minhas posições",
    "project": "Projeto",
    "amount": "Montante",
    "status": "Estado",
    "irr": "TIR estimada",
    "noPositions": "Ainda não tem posições. Veja os projetos disponíveis.",
    "browseProjects": "Ver projetos",
    "upcomingMilestones": "Próximos marcos",
    "noMilestones": "Sem marcos agendados.",
    "latestUpdates": "Últimas atualizações de obra",
    "noUpdates": "Sem atualizações recentes.",
    "recentDocuments": "Documentos recentes",
    "noDocuments": "Sem documentos recentes.",
    "riskNotice": "O investimento envolve risco de perda total do capital, é ilíquido e não beneficia de garantia de retorno. As rentabilidades apresentadas são estimativas."
  },
  "Notifications": {
    "title": "Notificações",
    "empty": "Não tem notificações.",
    "markAllRead": "Marcar todas como lidas",
    "unreadCount": "{n} por ler",
    "viewAll": "Ver todas",
    "type_kyc_approved": "Identidade verificada",
    "type_kyc_rejected": "Verificação não aceite",
    "type_subscription_confirmed": "Fundos confirmados",
    "type_work_update": "Nova atualização de obra",
    "type_statement": "Novo extrato disponível",
    "body_kyc_approved": "A sua identidade foi verificada. Já pode aceder aos projetos.",
    "body_kyc_rejected": "A verificação não foi aceite. Volte a submeter os documentos.",
    "body_subscription_confirmed": "Os seus fundos para {projectName} foram confirmados.",
    "body_work_update": "{projectName}: {updateTitle}",
    "body_statement": "Extrato de {period} do projeto {projectName}."
  },
  "AuditAdmin": {
    "title": "Registo de auditoria",
    "when": "Quando",
    "actor": "Ator",
    "action": "Ação",
    "entity": "Entidade",
    "entityId": "ID",
    "ip": "IP",
    "payload": "Detalhe",
    "filterAction": "Ação",
    "filterEntity": "Entidade",
    "filterFrom": "De",
    "filterTo": "Até",
    "apply": "Filtrar",
    "clear": "Limpar",
    "empty": "Sem registos para estes filtros.",
    "system": "Sistema",
    "triggerNote": "Linhas escritas por trigger não têm ator nem IP — o registo da alteração vem da base de dados, sem contexto de pedido.",
    "prev": "Anteriores",
    "next": "Seguintes"
  },
  "SettingsAdmin": {
    "title": "Definições da plataforma",
    "key": "Chave",
    "value": "Valor (JSON)",
    "description": "Descrição",
    "save": "Guardar",
    "saved": "Definição guardada.",
    "invalidJson": "JSON inválido.",
    "noLimit": "Sem limite",
    "hint": "O valor é JSON: texto entre aspas, números sem aspas, `null` para \"sem limite\"."
  },
  "UsersAdmin": {
    "title": "Utilizadores",
    "name": "Nome",
    "email": "Email",
    "role": "Papel",
    "kyc": "KYC",
    "createdAt": "Registado",
    "save": "Guardar",
    "empty": "Sem utilizadores.",
    "cannotDemoteSelf": "Não pode retirar-se a si próprio o papel de administrador.",
    "role_investor": "Investidor",
    "role_project_manager": "Gestor de projeto",
    "role_admin": "Administrador",
    "role_auditor": "Auditor"
  }
```

`en.json` — mesmas chaves, traduzidas no tom das existentes (`"dashboard": "Home"`, `"invested": "Invested capital"`, `"type_statement": "New statement available"`, `"triggerNote": "Rows written by a trigger carry no actor or IP — the record of the change comes from the database, without request context."`, etc.).

- [ ] **Step 2: Escrever `tests/rls/notifications.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  admin,
  createTestUser,
  signInAs,
  expectAnonCannotRead,
  expectRowHidden
} from './helpers';

const run = randomUUID().slice(0, 8);
const dono = `notif-dono-${run}@test.local`;
const outro = `notif-outro-${run}@test.local`;
const staff = `notif-staff-${run}@test.local`;

let donoId: string;
let notifId: string;

beforeAll(async () => {
  donoId = (await createTestUser(dono)).id;
  await createTestUser(outro);
  await createTestUser(staff, 'admin');

  const {data, error} = await admin
    .from('notifications')
    .insert({
      user_id: donoId,
      type: 'work_update',
      payload: {projectName: 'Campelos', updateTitle: 'Semana 1'},
      href: '/projetos/x/obra'
    })
    .select('id')
    .single();
  if (error) throw error;
  notifId = data.id;
});

describe('notifications RLS', () => {
  it('o dono lê a sua notificação', async () => {
    const c = await signInAs(dono);
    const {data, error} = await c
      .from('notifications')
      .select('id, type, payload')
      .eq('id', notifId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].type).toBe('work_update');
  });

  it('outro investidor NÃO lê a notificação alheia', async () => {
    const c = await signInAs(outro);
    await expectRowHidden(c, 'notifications', notifId);
  });

  // Notificações são pessoais: nem o staff as lê. O back-office não tem
  // nenhuma vista de "notificações de X", e dar-lhe leitura seria alargar o
  // acesso a dados pessoais sem caso de uso.
  it('staff NÃO lê notificações de investidores', async () => {
    const c = await signInAs(staff);
    await expectRowHidden(c, 'notifications', notifId);
  });

  it('anónimo não lê nada', async () => {
    await expectAnonCannotRead('notifications');
  });

  it('o dono NÃO consegue marcar como lida por escrita direta', async () => {
    // Marcar como lida passa por Server Action com service role, como todas as
    // escritas deste repo. Sem grant de UPDATE, falha antes da RLS.
    const c = await signInAs(dono);
    await c
      .from('notifications')
      .update({read_at: new Date().toISOString()})
      .eq('id', notifId);
    const {data} = await admin
      .from('notifications')
      .select('read_at')
      .eq('id', notifId)
      .single();
    expect(data!.read_at).toBeNull();
  });
});
```

- [ ] **Step 3: Correr — FALHA com 42P01** (`public.notifications` não existe).

Run: `npm test -- tests/rls/notifications.test.ts`
Expected: FAIL. Se o print do vitest for terso, provar a causa com um GET direto:
`curl -s "http://127.0.0.1:54421/rest/v1/notifications?select=id" -H "apikey: <service key de .env.test>" -H "Authorization: Bearer <mesma>"` → `42P01`.

- [ ] **Step 4: Parity + typecheck**

Run: `npm test -- tests/messages-parity.test.ts` (PASSA) e `npm run typecheck` (limpo).

- [ ] **Step 5: Commit**

```bash
git add messages/pt.json messages/en.json tests/rls/notifications.test.ts
git commit -m "feat(notificacoes): namespaces i18n + testes RLS (a falhar — schema por criar)"
```

---

### Task 2: Migração — notifications + RPC de settings

**Files:**
- Create: `supabase/migrations/<timestamp>_notifications.sql`

- [ ] **Step 1: `npx supabase migration new notifications`** (escrever SEM BOM).

- [ ] **Step 2: Escrever a migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 6 — Notificações in-app + RPC de settings
--
-- A spec (secções 3, 5.5, 5.6) promete "in-app + email"; até aqui só existia
-- email. Uma notificação é PESSOAL: só o dono a lê — nem staff, nem auditor.
--
-- Guarda-se `type` + `payload`, NÃO texto renderizado. A cópia vive no i18n
-- (namespace `Notifications`), pelo que uma notificação antiga acompanha a
-- mudança de idioma do utilizador em vez de ficar congelada na língua que ele
-- usava no dia em que foi criada. É também a razão para não haver colunas
-- title/body: seriam cópia duplicada entre a BD e as mensagens.
-- ============================================================

create type public.notification_type as enum (
  'kyc_approved',
  'kyc_rejected',
  'subscription_confirmed',
  'work_update',
  'statement'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- Índice parcial para a contagem de não-lidas do sino, que corre em cada pedido.
create index notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: dono lê"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

-- Sem política de escrita: marcar como lida passa por Server Action com service
-- role, como todas as escritas deste repo.

-- ---------- Grants ----------
revoke insert, update, delete, truncate on public.notifications
  from anon, authenticated;
revoke select on public.notifications from anon;
grant select on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

-- ============================================================
-- RPC para escrever platform_settings
--
-- PORQUÊ existir: `platform_settings.value` é `jsonb NOT NULL` e o "sem limite"
-- de `max_investors_per_project` é o jsonb `null`. Via PostgREST não há forma de
-- o escrever — `{value: null}` é serializado como SQL NULL e falha com 23502.
-- Isto já mordeu o repo uma vez (o reset dos testes de subscrição era um no-op
-- silencioso, ver tests/integration/subscriptions.test.ts). O back-office de
-- definições precisa de escrever jsonb null, logo precisa deste caminho.
--
-- O valor entra como TEXTO e é convertido aqui: a string 'null' torna-se jsonb
-- null, e não SQL NULL. Um JSON inválido rebenta no cast, que é o que se quer.
-- ============================================================
create or replace function public.set_platform_setting(
  p_key text,
  p_value_json text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_settings
  set value = p_value_json::jsonb,
      updated_at = now()
  where key = p_key;
  if not found then
    raise exception 'definição % não existe', p_key;
  end if;
end;
$$;

-- SECURITY DEFINER: revogar dos TRÊS (revogar só de PUBLIC não remove o grant
-- explícito que o Supabase dá a anon/authenticated — armadilha já documentada
-- em 20260721151000_definer_helpers_sem_anon.sql). Só o service_role executa;
-- a autorização de "quem é admin" é feita na Server Action.
revoke execute on function public.set_platform_setting(text, text)
  from public, anon, authenticated;
grant execute on function public.set_platform_setting(text, text)
  to service_role;
```

**Antes de aplicar, confirmar contra o schema real:** `public.platform_settings` tem coluna `updated_at`? Se não tiver, retirar essa linha do UPDATE (não inventar a coluna). Verificar com:
`docker exec supabase_db_realstate psql -U postgres -d postgres -c "\d public.platform_settings"`.

- [ ] **Step 3: Aplicar**

Run: `head -c 3 supabase/migrations/*_notifications.sql | xxd -p` (≠ `efbbbf`), depois `npx supabase db reset`.

- [ ] **Step 4: Testes RLS — PASSAM**

Run: `npm test -- tests/rls/notifications.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Suite completa** — `npm test` verde (215 + 5).

- [ ] **Step 6: Verificação na BD** (colar output real):
```bash
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select policyname, roles, cmd from pg_policies where tablename='notifications';"
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='notifications' and grantee in ('anon','authenticated');"
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select proname, proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='set_platform_setting';"
```
Esperado: uma política SELECT `{authenticated}`; `anon` sem nada, `authenticated` só com SELECT; a função só com `postgres` e `service_role`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_notifications.sql
git commit -m "feat(notificacoes): migração — tabela, RLS, grants + RPC set_platform_setting"
```

---

### Task 3: Serviço de notificações + integração nos escritores

**Files:**
- Create: `src/lib/notifications/service.ts`, `tests/integration/notifications.test.ts`
- Modify: `src/lib/notify/investors.ts`, `src/lib/kyc/service.ts`, `src/lib/subscriptions/service.ts`

- [ ] **Step 1: Escrever `tests/integration/notifications.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {
  createNotification,
  listNotifications,
  countUnread,
  markAllRead
} from '@/lib/notifications/service';

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser(`notif-svc-${randomUUID().slice(0, 8)}@test.local`)).id;
});

describe('serviço de notificações', () => {
  it('cria, lista e conta não-lidas', async () => {
    const u = (await createTestUser(`n1-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({
      userId: u,
      type: 'statement',
      payload: {projectName: 'Campelos', period: '2026-07'},
      href: '/projetos/x/extratos'
    });
    const rows = await listNotifications(u);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('statement');
    expect(rows[0].payload.projectName).toBe('Campelos');
    expect(await countUnread(u)).toBe(1);
  });

  it('markAllRead zera a contagem e é idempotente', async () => {
    const u = (await createTestUser(`n2-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: u, type: 'kyc_approved', payload: {}});
    await createNotification({userId: u, type: 'kyc_approved', payload: {}});
    expect(await countUnread(u)).toBe(2);
    await markAllRead(u);
    expect(await countUnread(u)).toBe(0);
    await markAllRead(u);
    expect(await countUnread(u)).toBe(0);
  });

  it('markAllRead NÃO toca nas notificações de outro utilizador', async () => {
    const a = (await createTestUser(`n3-${randomUUID().slice(0, 8)}@test.local`)).id;
    const b = (await createTestUser(`n4-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: a, type: 'kyc_approved', payload: {}});
    await createNotification({userId: b, type: 'kyc_approved', payload: {}});
    await markAllRead(a);
    expect(await countUnread(b)).toBe(1);
  });

  it('listNotifications ordena da mais recente para a mais antiga', async () => {
    const u = (await createTestUser(`n5-${randomUUID().slice(0, 8)}@test.local`)).id;
    await createNotification({userId: u, type: 'kyc_approved', payload: {n: 1}});
    await createNotification({userId: u, type: 'kyc_rejected', payload: {n: 2}});
    const rows = await listNotifications(u);
    expect(rows[0].payload.n).toBe(2);
  });

  void userId;
});
```

E acrescentar a `tests/integration/works.test.ts` e `tests/integration/statements.test.ts`, dentro dos testes de publicação já existentes, a asserção de que a notificação in-app **também** foi criada — e que o investidor só com `interesse` **não** a recebeu:

```ts
    // In-app além do email, e só para quem tem fundos confirmados.
    const {data: notifs, error: notifErr} = await admin
      .from('notifications')
      .select('user_id, type')
      .eq('type', 'work_update')          // 'statement' no teste de extratos
      .eq('user_id', funderId);
    expect(notifErr).toBeNull();
    expect(notifs).toHaveLength(1);

    const {data: naoConfirmado} = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', interessadoId);
    expect(naoConfirmado ?? []).toHaveLength(0);
```
(Os testes dessas fatias já criam um investidor `fundos_confirmados` e um `interesse` — reutilizar os ids que já lá estão em vez de criar novos.)

- [ ] **Step 2: Correr e confirmar FALHA** (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/notifications/service.ts`**

```ts
import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Notificações in-app (server-only, service role). Guardam `type` + `payload`;
 * a cópia é renderizada no cliente a partir do namespace i18n `Notifications`,
 * para que uma notificação antiga acompanhe a mudança de idioma.
 */

export type NotificationType =
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'subscription_confirmed'
  | 'work_update'
  | 'statement';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: Record<string, string | number>;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  payload?: Record<string, string | number>;
  href?: string | null;
};

/**
 * Criar uma notificação NUNCA deve rebentar a operação de negócio que a
 * originou — publicar uma atualização de obra tem de continuar a valer mesmo
 * que a notificação falhe. Devolve `false` em vez de lançar, à imagem do que
 * `sendEmail` já faz para o email.
 */
export async function createNotification(
  input: CreateNotificationInput,
  db: SupabaseClient = createAdminClient()
): Promise<boolean> {
  const {error} = await db.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    payload: input.payload ?? {},
    href: input.href ?? null
  });
  if (error) {
    console.error(`criar notificação falhou: ${error.message}`);
    return false;
  }
  return true;
}

export async function listNotifications(
  userId: string,
  limit = 50,
  db: SupabaseClient = createAdminClient()
): Promise<NotificationRow[]> {
  const {data, error} = await db
    .from('notifications')
    .select('id, type, payload, href, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(limit);
  if (error) throw new Error(`listar notificações falhou: ${error.message}`);
  return (data ?? []) as NotificationRow[];
}

export async function countUnread(
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<number> {
  const {count, error} = await db
    .from('notifications')
    .select('id', {count: 'exact', head: true})
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`contar não-lidas falhou: ${error.message}`);
  return count ?? 0;
}

export async function markAllRead(
  userId: string,
  db: SupabaseClient = createAdminClient()
): Promise<void> {
  const {error} = await db
    .from('notifications')
    .update({read_at: new Date().toISOString()})
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw new Error(`marcar como lidas falhou: ${error.message}`);
}
```

- [ ] **Step 4: Ligar aos escritores existentes**

Em `src/lib/notify/investors.ts`, dentro do ciclo que já envia email a cada investidor confirmado, criar também a notificação. O mapeamento template → tipo é explícito (não derivar por string):

```ts
const TEMPLATE_TO_NOTIFICATION: Partial<Record<TemplateName, NotificationType>> = {
  work_update_published: 'work_update',
  statement_published: 'statement'
};
```
Passar `href` para a página relevante do projeto (`/projetos/<id>/obra`, `/projetos/<id>/extratos`) e reaproveitar o `payload` que já vai para o email (`projectName`, `updateTitle` / `period`) — as chaves i18n `body_work_update` e `body_statement` esperam exatamente esses nomes.

Em `src/lib/kyc/service.ts` (decisão de KYC) e `src/lib/subscriptions/service.ts` (transição para `fundos_confirmados`), chamar `createNotification` para o utilizador em causa, com os tipos `kyc_approved`/`kyc_rejected` e `subscription_confirmed`. **Ler primeiro esses ficheiros** e seguir o ponto onde o email já é enviado, para a notificação e o email nascerem do mesmo sítio.

- [ ] **Step 5: Correr até verde**

Run: `npm test` (toda a suite), `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications tests/integration/notifications.test.ts src/lib/notify/investors.ts src/lib/kyc/service.ts src/lib/subscriptions/service.ts tests/integration/works.test.ts tests/integration/statements.test.ts
git commit -m "feat(notificacoes): serviço + gravação in-app ao lado dos emails existentes"
```

---

## FASE B — Investidor

### Task 4: Casca da aplicação (cabeçalho, navegação, sino)

**Files:**
- Create: `src/components/AppShell.tsx`, `src/components/NotificationBell.tsx`, `src/app/[locale]/notificacoes/page.tsx`, `src/app/[locale]/notificacoes/actions.ts`
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: `AppShell.tsx`** — Server Component. Recebe `{locale, children}`. Lê `getSession()`; **se não houver sessão, renderiza só `children`** (as páginas de login/MFA/aceitar-convite não podem ganhar cabeçalho nem tentar contar notificações).

Com sessão, renderiza um `<header>` com:
- marca "TILWENI" com link para `/`;
- navegação por papel: investidor vê `Nav.dashboard` e `Nav.projects`; staff (`isStaff`) vê ainda `Nav.invites` (`/convites`), `Nav.kycQueue` (`/kyc-revisao`), `Nav.projectsAdmin` (`/gestao-projetos`) e, **só `admin`**, `Nav.settings` (`/definicoes`) e `Nav.users` (`/utilizadores`); `admin` **ou** `auditor` vê `Nav.audit` (`/auditoria`);
- `<NotificationBell locale={locale} initialCount={await countUnread(session.userId)} />`;
- o email da sessão e um botão `Nav.signOut`.

Usar `Link` de `@/i18n/navigation` (não de `next/link`) para as rotas manterem o locale.

- [ ] **Step 2: Montar no layout**

Em `src/app/[locale]/layout.tsx`, envolver `{children}` com `<AppShell locale={locale}>`. **Cuidado:** o layout raiz é o único sítio onde `generateStaticParams` corre; o `AppShell` lê sessão, logo passa a haver render dinâmico nas páginas que o usam. Confirmar no `npm run build` que nenhuma página que devia ser estática rebenta — se houver conflito, marcar o `AppShell` como `dynamic = 'force-dynamic'` no seu próprio segmento em vez de desativar a geração estática global.

- [ ] **Step 3: `NotificationBell.tsx`** — `'use client'`. Props `{locale: string; initialCount: number}`. Mostra um sino com a contagem (`Notifications.unreadCount`) quando `> 0`. Ao abrir (usar `DropdownMenu` do shadcn, já disponível), busca as últimas 10 por Server Action, renderiza cada uma com `t(\`type_${n.type}\`)` como título e `t(\`body_${n.type}\`, n.payload)` como corpo, linka ao `href` quando existir, e mostra `Notifications.viewAll` para `/notificacoes`. Botão `Notifications.markAllRead` chama a Server Action e põe a contagem a 0.

**Não importar nada `server-only`** — só as actions e componentes de UI. Um import server-only num componente cliente parte o build, e é essa a verificação.

- [ ] **Step 4: `notificacoes/actions.ts`**

```ts
'use server';

import {getSession} from '@/lib/auth/staff';
import {
  listNotifications,
  markAllRead,
  countUnread
} from '@/lib/notifications/service';
import type {NotificationRow} from '@/lib/notifications/service';

/**
 * Todas as actions derivam o utilizador da SESSÃO — nunca de um parâmetro. Um
 * `userId` vindo do cliente seria um IDOR: qualquer pessoa leria ou marcaria as
 * notificações de outra.
 */
export async function myNotificationsAction(limit = 10): Promise<NotificationRow[]> {
  const session = await getSession();
  if (!session) return [];
  return listNotifications(session.userId, limit);
}

export async function markAllReadAction(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  await markAllRead(session.userId);
  return countUnread(session.userId);
}
```

- [ ] **Step 5: Página `/notificacoes`** — Server Component (`force-dynamic`), sessão obrigatória (senão `notFound()`), lista completa com a mesma renderização i18n, estado lido/não-lido visível, e `Notifications.empty` quando vazio.

- [ ] **Step 6: Verificar**

Run: `npm run build && npm run typecheck && npm run lint && npm test`
Expected: tudo verde, 0 warnings; as novas rotas aparecem na tabela do build.

- [ ] **Step 7: Commit**

```bash
git add src/components src/app/[locale]/notificacoes "src/app/[locale]/layout.tsx"
git commit -m "feat(app): casca com navegação por papel + sino de notificações"
```

---

### Task 5: Dashboard do investidor

**Files:**
- Rewrite: `src/app/[locale]/page.tsx`
- Create: `src/lib/dashboard/service.ts`, `tests/integration/dashboard.test.ts`

- [ ] **Step 1: Teste do serviço** — `tests/integration/dashboard.test.ts`, cobrindo `getInvestorDashboard(userId)`:
  - soma como **capital investido** apenas as subscrições `fundos_confirmados` (uma `interesse` no mesmo projeto não entra);
  - devolve as posições do utilizador com o projeto associado;
  - **não** devolve nada de projetos onde o utilizador não tem posição (criar um segundo projeto com outro investidor e provar que não aparece);
  - marcos futuros vêm ordenados por `planned_date` ascendente e excluem os `concluido`;
  - atualizações de obra vêm da mais recente para a mais antiga.

Assegurar `expect(error).toBeNull()` em qualquer expectativa de zero linhas.

- [ ] **Step 2: Correr e confirmar FALHA.**

- [ ] **Step 3: `src/lib/dashboard/service.ts`** — server-only, service role. Uma função `getInvestorDashboard(userId)` que devolve:

```ts
export type DashboardData = {
  investedTotal: number;          // soma de amount onde status = 'fundos_confirmados'
  positions: Array<{
    projectId: string;
    projectName: string;
    projectStatus: string;
    amount: number;
    status: string;
    estimatedIrr: number;
  }>;
  upcomingMilestones: Array<{
    projectId: string;
    projectName: string;
    title: string;
    plannedDate: string;
  }>;
  latestUpdates: Array<{
    projectId: string;
    projectName: string;
    title: string;
    publishedAt: string;
  }>;
  recentStatements: Array<{
    id: string;
    projectName: string;
    period: string;
    publishedAt: string;
  }>;
};
```

Regras que o serviço tem de respeitar (são as mesmas da RLS, aplicadas aqui porque o service role a bypassa):
- posições = subscrições do utilizador com `status <> 'cancelada'`;
- marcos e atualizações = só dos projetos dessas posições;
- **extratos = só dos projetos onde a posição é `fundos_confirmados`** — a assimetria com a obra é deliberada e não pode ser unificada;
- normalizar numéricos com `Number()` (o PostgREST devolve `numeric` como string).

- [ ] **Step 4: Reescrever `src/app/[locale]/page.tsx`**

Server Component, `force-dynamic`. Sem sessão → redirecionar para `/login` (o middleware já o faz, mas a página não deve assumir). Se a sessão for de staff, mostrar o mesmo dashboard (um admin também pode ser investidor) — não bifurcar.

Layout com `getTranslations('Dashboard')`:
- três `Card` no topo: `invested` (soma formatada em euros), `projectsCount`, `expectedReturn` (média das TIR ponderada pelo montante, ou `—` se não houver posições);
- tabela `myPositions` (projeto, montante, estado, TIR) com link para cada ficha; `noPositions` + botão `browseProjects` quando vazio;
- três blocos: `upcomingMilestones`, `latestUpdates`, `recentDocuments`, cada um com o seu estado vazio;
- rodapé com `Dashboard.riskNotice`.

Formatar euros como as outras páginas. Usar **só** chaves que existem no namespace `Dashboard`.

- [ ] **Step 5: Verificar** — `npm test`, `npm run build`, `typecheck`, `lint`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard "src/app/[locale]/page.tsx" tests/integration/dashboard.test.ts
git commit -m "feat(dashboard): área do investidor com posições, marcos, atualizações e extratos"
```

---

## FASE C — Back-office

### Task 6: Viewer do audit log

**Files:**
- Create: `src/app/[locale]/auditoria/page.tsx`
- Modify: `src/lib/auth/staff.ts` (novo predicado)

- [ ] **Step 1: Predicado `canReadAudit`**

```ts
/**
 * O audit_log é legível por `admin` e `auditor` — NÃO por `project_manager`
 * (é o que a política "audit: admin e auditor leem" diz desde a Fatia 0). Por
 * isso esta página NÃO pode viver sob o route group (admin), cujo layout deixa
 * entrar project_manager: um PM veria a página e uma tabela vazia.
 */
export function canReadAudit(role: string): boolean {
  return role === 'admin' || role === 'auditor';
}
```

- [ ] **Step 2: Página `/auditoria`** — Server Component (`force-dynamic`), **fora** de `(admin)`. Gate próprio: `getSession()` + `canReadAudit(session.role)`, senão `notFound()`.

Lê o `audit_log` com service role, com filtros vindos de `searchParams`: `action`, `entity` (`entity_type`), `from`, `to` (datas), e paginação por `page` (50 por página, `range()`). Junta o nome do ator a partir de `profiles` (uma query por lote de ids, não uma por linha) e mostra `AuditAdmin.system` quando `actor_id` é null.

Tabela: quando, ator, ação, entidade, id, IP, detalhe (`payload` em `<pre>` truncado). Mostrar o aviso `AuditAdmin.triggerNote` — explica porque metade das linhas não tem ator nem IP, que é a primeira pergunta de quem abre esta página.

Navegação `prev`/`next` preservando os filtros.

- [ ] **Step 3: Verificação real do gate** (documentar observado vs. raciocinado):
  - `auditor` → vê a página;
  - `admin` → vê a página;
  - `project_manager` → **404**;
  - investidor → **404**.

Conduzir com um spec Playwright descartável (apagar depois, não commitar) ou com pedidos autenticados. O login passa pelo TOTP — usar `otplib` a ler o segredo de `/pt/mfa`, como nas fatias anteriores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/auditoria" src/lib/auth/staff.ts
git commit -m "feat(auditoria): viewer do audit log com filtros (admin e auditor)"
```

---

### Task 7: Edição de platform_settings

**Files:**
- Create: `src/app/[locale]/(admin)/definicoes/page.tsx`, `.../definicoes/actions.ts`

- [ ] **Step 1: `actions.ts`**

```ts
'use server';

import {requireStaff} from '@/lib/auth/staff';
import {createAdminClient} from '@/lib/supabase/admin';
import {revalidatePath} from 'next/cache';
import type {Locale} from '@/lib/mail/templates';

/**
 * Definições são só para `admin`: `requireStaff()` deixaria passar
 * project_manager, que não deve mexer em limites legais/operacionais
 * (montante mínimo, limite de investidores, versões de termos).
 */
async function requireAdmin() {
  const s = await requireStaff();
  if (s.role !== 'admin') throw new Error('acesso restrito a administradores');
  return s;
}

export async function saveSettingAction(
  locale: Locale,
  key: string,
  formData: FormData
): Promise<void> {
  await requireAdmin();
  const raw = String(formData.get('value') ?? '');

  // Validar aqui para dar erro legível; o cast no RPC é a rede de segurança.
  try {
    JSON.parse(raw);
  } catch {
    throw new Error('json_invalido');
  }

  // Via RPC porque o PostgREST não consegue escrever jsonb `null`
  // ({value: null} vira SQL NULL e viola o not null) — e `null` é exatamente o
  // valor de "sem limite" de max_investors_per_project.
  const db = createAdminClient();
  const {error} = await db.rpc('set_platform_setting', {
    p_key: key,
    p_value_json: raw
  });
  if (error) throw new Error(`guardar definição falhou: ${error.message}`);
  revalidatePath(`/${locale}/definicoes`);
}
```

- [ ] **Step 2: Página** — Server Component (`force-dynamic`), sob `(admin)` mas com verificação própria de `admin` (o layout só garante staff). Lista todas as `platform_settings` (chave, descrição, valor) com um `<textarea name="value">` por linha contendo `JSON.stringify(value)`, e um botão `SettingsAdmin.save` por linha (`saveSettingAction.bind(null, loc, s.key)`). Mostrar o `SettingsAdmin.hint`.

Um investidor ou PM que chegue aqui leva o redirect/erro do guard — **verificar**, não assumir.

- [ ] **Step 3: Verificação real** (colar output):
  - guardar `max_investors_per_project` = `null` e confirmar na BD que ficou **jsonb null** e não SQL NULL:
    `select key, value, jsonb_typeof(value) from platform_settings where key='max_investors_per_project';` → `null | null`;
  - guardar um número (`3`) e confirmar; repor `null`;
  - guardar JSON inválido e confirmar que dá erro sem escrever.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/(admin)/definicoes"
git commit -m "feat(back-office): edição de platform_settings via RPC (jsonb null incluído)"
```

---

### Task 8: Gestão de utilizadores

**Files:**
- Create: `src/app/[locale]/(admin)/utilizadores/page.tsx`, `.../utilizadores/actions.ts`
- Create: `tests/integration/users-admin.test.ts`

- [ ] **Step 1: Teste do serviço de mudança de papel**

Cobrir, em `tests/integration/users-admin.test.ts`, a função `changeUserRole({actorId, targetId, role})`:
  - um admin promove um investidor a `project_manager` e o `profiles.role` muda;
  - **um admin não se pode despromover a si próprio** (lança) — é a proteção contra ficar sem nenhum admin;
  - um papel inválido é rejeitado;
  - a mudança fica registada no `audit_log` (o trigger de `profiles` já o faz — asserir a linha).

- [ ] **Step 2: Correr e confirmar FALHA.**

- [ ] **Step 3: Implementar** a função em `src/lib/users/service.ts` (server-only, service role) e as Server Actions com `requireAdmin` (mesmo predicado da Task 7 — extrair para `src/lib/auth/staff.ts` como `requireAdmin()` em vez de duplicar).

- [ ] **Step 4: Página** — lista `profiles` com email vindo de `auth.admin.listUsers()` (juntar por id), papel num `<select>`, estado de KYC e data de registo. Um form por linha com `UsersAdmin.save`. Mostrar `UsersAdmin.cannotDemoteSelf` quando a action recusa.

- [ ] **Step 5: Verificar** — `npm test`, `build`, `typecheck`, `lint`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(admin)/utilizadores" src/lib/users tests/integration/users-admin.test.ts src/lib/auth/staff.ts
git commit -m "feat(back-office): gestão de utilizadores e papéis"
```

---

## FASE D — Fecho

### Task 9: E2E dos fluxos críticos

**Files:**
- Create: `e2e/jornada-investidor.spec.ts`
- Modify: `e2e/invite-flow.spec.ts` (se a casca nova partir seletores existentes)

- [ ] **Step 1: Escrever o spec da jornada completa**

Um teste que percorre, contra a stack local e a app construída (`next build && next start`, como a config existente já faz):
1. staff cria convite → investidor aceita (define password) → **MFA**: lê o segredo de `/pt/mfa`, gera o código com `otplib`, chega a aal2;
2. investidor submete KYC → staff aprova → investidor deixa de ser reencaminhado para `/kyc`;
3. staff cria projeto e publica-o em `subscricao` → investidor vê-o no catálogo;
4. investidor manifesta interesse → staff avança para `contrato_assinado` e confirma fundos;
5. staff publica atualização de obra e um extrato;
6. investidor: **o sino mostra notificações não lidas**, o dashboard mostra a posição e o capital investido, a página de obra mostra a atualização e a de extratos abre o PDF;
7. confirmar no `audit_log` a linha `view_document` da consulta do extrato.

Semear o mínimo por service role (utilizador staff, por exemplo) e conduzir o resto pela UI — é a UI que se quer testar.

- [ ] **Step 2: Correr** — `npm run e2e`. Expected: verde. Colar o output real.

- [ ] **Step 3: Confirmar que o `invite-flow.spec.ts` existente continua verde** com a casca nova.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): jornada completa do investidor (convite → extrato auditado)"
```

---

### Task 10: Procedimento de restauro de backup + desvios registados

**Files:**
- Create: `docs/restauro-backup.md`
- Modify: `docs/ambientes.md`, `docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md`

- [ ] **Step 1: `docs/restauro-backup.md`** — procedimento manual, passo a passo, para o plano Pro do Supabase: onde ficam os backups diários, como fazer PITR/restauro para um projeto novo, como validar que o restauro está bom (contagens por tabela, últimas linhas do `audit_log`, buckets), e quanto tempo demora. Incluir o que NÃO é coberto: os objetos de Storage e o `auth.users` seguem o mesmo backup, mas confirmar antes de depender disso.

- [ ] **Step 2: Registar os desvios conscientes** numa secção nova da spec (ou em `docs/ambientes.md` se preferires manter a spec imutável):
  - **aprovação de projeto por admin** — não implementada por decisão de 2026-07-22; qualquer staff publica;
  - **`storage.remove()`** — não funciona na stack local (skew de imagem); confirmar em produção;
  - **conteúdo de `work-media`** — o bucket valida o Content-Type *declarado*, não o conteúdo; caminho é staff-only.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: procedimento de restauro de backup + desvios conscientes da Fase A"
```

---

### Task 11: Verificação final da Fase A

- [ ] **Step 1: Suite completa e limpeza**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`
Expected: tudo verde, 0 warnings.

- [ ] **Step 2: Verificação de segurança na BD** — repetir o retrato que já usámos, e confirmar que continua igual **com a tabela nova incluída**:
```bash
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select count(*) from pg_policies where schemaname='public' and roles <> '{authenticated}';"
docker exec supabase_db_realstate psql -U postgres -d postgres -c "select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');"
```
Esperado: **0** e **0**. Se `notifications` aparecer, a Task 2 falhou em algum grant.

- [ ] **Step 3: Aplicar a migração nova a produção** (MCP `apply_migration`), e repetir lá as duas queries acima mais os advisors de segurança. Esperado: 0, 0, e os mesmos 3 WARN irredutíveis (`current_user_role`, `has_active_subscription`, `has_confirmed_subscription`).

- [ ] **Step 4: Merge e push**

```bash
git checkout main
git merge --no-ff feat/fatia-6-dashboard-polimento
npm test
git push origin main
git branch -d feat/fatia-6-dashboard-polimento
```

---

## Fora de âmbito (confirmado)

- Aprovação de projeto por admin (decisão de 2026-07-22).
- Execução real do restauro de backup contra produção.
- Notificações por push/web-push; digest de email.
- Tudo o que a spec já lista na secção 9 (Fase B/C).
