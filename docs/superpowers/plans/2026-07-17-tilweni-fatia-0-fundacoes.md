# TILWENI Fase A — Fatia 0: Fundações · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundações da plataforma TILWENI — app Next.js 15 bilingue (PT/EN) com noindex total, Supabase local com migração inicial (profiles, platform_settings, audit_log imutável), RLS testada, middleware de autenticação e CI.

**Architecture:** Monolito Next.js 15 (App Router, `src/`) com Supabase como única fonte de dados. Migrações SQL versionadas em `supabase/migrations/` são a fonte de verdade do schema. RLS negação-por-defeito com testes de integração contra o Supabase local (definição de pronto).

**Tech Stack:** Next.js 15 + TypeScript, Tailwind CSS 4, shadcn/ui, next-intl v4, Supabase (Auth/Postgres/Storage) via `@supabase/ssr` + `@supabase/supabase-js`, Vitest, GitHub Actions, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md`

**Pré-requisitos da máquina:** Node 22+, Docker Desktop a correr (necessário para `supabase start`), Supabase CLI (`npm i -g supabase` ou scoop/choco).

---

### Task 1: Scaffold Next.js

**Files:**
- Create: aplicação Next.js na raiz do repo (`package.json`, `src/app/*`, `next.config.ts`, `tsconfig.json`, …)

- [ ] **Step 1: Afastar `.claude` temporariamente (o create-next-app rejeita diretórios com ficheiros fora da sua allowlist; `docs/` e `.git/` são permitidos, `.claude/` não)**

```bash
mv .claude ../realstate-claude-bak
```

- [ ] **Step 2: Scaffold**

```bash
npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Se perguntar por Turbopack, aceitar o default.

- [ ] **Step 3: Repor `.claude`**

```bash
mv ../realstate-claude-bak .claude
```

- [ ] **Step 4: Verificar que arranca**

```bash
npm run build
```

Expected: build conclui sem erros.

- [ ] **Step 5: Adicionar script `typecheck` ao `package.json` (na secção `scripts`)**

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 com TypeScript e Tailwind"
```

---

### Task 2: i18n (next-intl PT/EN) + noindex global

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`
- Create: `messages/pt.json`, `messages/en.json`
- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`
- Create: `src/app/robots.ts`
- Modify: `next.config.ts`, `src/middleware.ts` (criado aqui, estendido na Task 7)
- Delete: `src/app/page.tsx`, `src/app/layout.tsx` (substituídos pelas versões `[locale]`)

- [ ] **Step 1: Instalar next-intl**

```bash
npm install next-intl
```

- [ ] **Step 2: Criar `src/i18n/routing.ts`**

```ts
import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pt', 'en'],
  defaultLocale: 'pt'
});
```

- [ ] **Step 3: Criar `src/i18n/navigation.ts`**

```ts
import {createNavigation} from 'next-intl/navigation';
import {routing} from './routing';

export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);
```

- [ ] **Step 4: Criar `src/i18n/request.ts`**

```ts
import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {routing} from './routing';

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
```

- [ ] **Step 5: Criar `messages/pt.json`**

```json
{
  "Home": {
    "title": "TILWENI — Área Privada",
    "signedInAs": "Sessão iniciada como {email}"
  },
  "Login": {
    "title": "Entrar",
    "email": "Email",
    "password": "Palavra-passe",
    "submit": "Entrar",
    "error": "Credenciais inválidas"
  }
}
```

- [ ] **Step 6: Criar `messages/en.json`**

```json
{
  "Home": {
    "title": "TILWENI — Private Area",
    "signedInAs": "Signed in as {email}"
  },
  "Login": {
    "title": "Sign in",
    "email": "Email",
    "password": "Password",
    "submit": "Sign in",
    "error": "Invalid credentials"
  }
}
```

- [ ] **Step 7: Atualizar `next.config.ts` (plugin next-intl + header X-Robots-Tag global)**

```ts
import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 8: Mover `globals.css` e criar layout localizado. Apagar `src/app/layout.tsx` e `src/app/page.tsx`; criar `src/app/[locale]/layout.tsx`**

```tsx
import type {Metadata} from 'next';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';
import '../globals.css';

export const metadata: Metadata = {
  title: 'TILWENI',
  robots: {index: false, follow: false}
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

(`src/app/globals.css` mantém-se onde o scaffold o deixou; o import relativo `../globals.css` resolve a partir de `[locale]/`.)

- [ ] **Step 9: Criar `src/app/[locale]/page.tsx` (placeholder — substituído na Task 7)**

```tsx
import {useTranslations} from 'next-intl';

export default function HomePage() {
  const t = useTranslations('Home');
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
    </main>
  );
}
```

- [ ] **Step 10: Criar `src/middleware.ts` (só i18n por agora; a Task 7 acrescenta a sessão Supabase)**

```ts
import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
```

- [ ] **Step 11: Criar `src/app/robots.ts`**

```ts
import type {MetadataRoute} from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: '*', disallow: '/'}
  };
}
```

- [ ] **Step 12: Verificar**

```bash
npm run build && npm run typecheck
```

Expected: sem erros. `npm run dev` + abrir `http://localhost:3000` deve redirecionar para `/pt` e mostrar o título; `http://localhost:3000/robots.txt` deve devolver `Disallow: /`.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: i18n PT/EN com next-intl e noindex global (robots + meta + header)"
```

---

### Task 3: shadcn/ui

**Files:**
- Create: `components.json`, `src/components/ui/*`, `src/lib/utils.ts`

- [ ] **Step 1: Inicializar shadcn (base neutra, sóbria)**

```bash
npx shadcn@latest init --yes --base-color neutral
```

- [ ] **Step 2: Adicionar os componentes base usados nas próximas fatias**

```bash
npx shadcn@latest add button card input label badge table dialog dropdown-menu sonner
```

- [ ] **Step 3: Verificar**

```bash
npm run build && npm run typecheck
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: shadcn/ui com tema neutro sóbrio"
```

---

### Task 4: Supabase local + variáveis de ambiente

**Files:**
- Create: `supabase/config.toml` (via CLI), `.env.local`, `.env.test`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Inicializar o projeto Supabase**

```bash
supabase init
```

- [ ] **Step 2: Desativar signups públicos no `supabase/config.toml` — procurar a secção `[auth]` e definir**

```toml
[auth]
enable_signup = false
```

(Manter o resto da secção como está. Com signups desativados, contas só nascem via `auth.admin.createUser()` — é o comportamento de produção que queremos replicar localmente.)

- [ ] **Step 3: Arrancar o stack local (requer Docker)**

```bash
supabase start
```

Expected: imprime `API URL: http://127.0.0.1:54321`, `anon key: ...`, `service_role key: ...`. Estas chaves locais são fixas e públicas (demo JWTs do Supabase local) — podem ser commitadas em `.env.test`.

- [ ] **Step 4: Criar `.env.local` (gitignored) com as chaves impressas**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do passo 3>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do passo 3>
```

- [ ] **Step 5: Criar `.env.test` (commitado — só contém as chaves demo locais, nunca chaves cloud)**

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key do passo 3>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do passo 3>
```

- [ ] **Step 6: Criar `.env.example` (documentação das variáveis)**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 7: Garantir no `.gitignore`**

```
.env.local
.env*.local
```

(`.env.test` fica fora do ignore de propósito.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: Supabase local com signups desativados e env de teste"
```

---

### Task 5: Harness de testes RLS (testes primeiro — devem falhar)

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/rls/helpers.ts`, `tests/rls/foundations.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar dependências de teste**

```bash
npm install -D vitest dotenv
npm install @supabase/supabase-js
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    fileParallelism: false
  }
});
```

- [ ] **Step 3: Criar `tests/setup.ts`**

```ts
import {config} from 'dotenv';

config({path: '.env.test'});
```

- [ ] **Step 4: Criar `tests/rls/helpers.ts`**

```ts
import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

export const TEST_PASSWORD = 'test-password-123!';

/** Cliente com service role — bypassa RLS. Só para preparar dados de teste. */
export const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

/** Cliente anónimo, sem sessão. */
export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {persistSession: false, autoRefreshToken: false}
  });
}

export async function createTestUser(
  email: string,
  role: 'investor' | 'project_manager' | 'admin' | 'auditor' = 'investor'
) {
  const {data, error} = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true
  });
  if (error) throw error;
  if (role !== 'investor') {
    const {error: updateError} = await admin
      .from('profiles')
      .update({role})
      .eq('id', data.user.id);
    if (updateError) throw updateError;
  }
  return data.user;
}

export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const {error} = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD
  });
  if (error) throw error;
  return client;
}
```

- [ ] **Step 5: Criar `tests/rls/foundations.test.ts`**

```ts
import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser, signInAs, anonClient} from './helpers';

const run = randomUUID().slice(0, 8);
const investorA = `investor-a-${run}@test.local`;
const investorB = `investor-b-${run}@test.local`;

let idA: string;
let idB: string;

beforeAll(async () => {
  idA = (await createTestUser(investorA)).id;
  idB = (await createTestUser(investorB)).id;
});

describe('profiles', () => {
  it('perfil é criado automaticamente ao criar o utilizador', async () => {
    const {data, error} = await admin
      .from('profiles')
      .select('id, role, kyc_status, preferred_locale')
      .eq('id', idA)
      .single();
    expect(error).toBeNull();
    expect(data!.role).toBe('investor');
    expect(data!.kyc_status).toBe('pending');
    expect(data!.preferred_locale).toBe('pt');
  });

  it('investidor lê o seu próprio perfil', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client.from('profiles').select('id').eq('id', idA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('investidor NÃO lê o perfil de outro investidor', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client.from('profiles').select('id').eq('id', idB);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra silenciosamente
  });

  it('investidor NÃO consegue elevar o seu próprio role', async () => {
    const client = await signInAs(investorA);
    await client.from('profiles').update({role: 'admin'}).eq('id', idA);
    const {data} = await admin.from('profiles').select('role').eq('id', idA).single();
    expect(data!.role).toBe('investor');
  });
});

describe('platform_settings', () => {
  it('utilizador autenticado lê settings', async () => {
    const client = await signInAs(investorA);
    const {data, error} = await client
      .from('platform_settings')
      .select('key')
      .eq('key', 'invite_validity_days');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('anónimo NÃO lê settings', async () => {
    const {data} = await anonClient()
      .from('platform_settings')
      .select('key');
    expect(data ?? []).toHaveLength(0);
  });

  it('investidor NÃO escreve settings', async () => {
    const client = await signInAs(investorA);
    await client
      .from('platform_settings')
      .update({value: 999 as unknown as object})
      .eq('key', 'invite_validity_days');
    const {data} = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'invite_validity_days')
      .single();
    expect(data!.value).toBe(14);
  });
});

describe('audit_log (append-only)', () => {
  it('investidor NÃO lê o audit log', async () => {
    const client = await signInAs(investorA);
    const {data} = await client.from('audit_log').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('UPDATE é rejeitado mesmo com service role', async () => {
    const {data: inserted, error: insertError} = await admin
      .from('audit_log')
      .insert({action: 'test', entity_type: 'test', payload: {}})
      .select('id')
      .single();
    expect(insertError).toBeNull();

    const {error} = await admin
      .from('audit_log')
      .update({action: 'tampered'})
      .eq('id', inserted!.id);
    expect(error).not.toBeNull();
  });

  it('DELETE é rejeitado mesmo com service role', async () => {
    const {data: inserted} = await admin
      .from('audit_log')
      .insert({action: 'test-del', entity_type: 'test', payload: {}})
      .select('id')
      .single();

    const {error} = await admin.from('audit_log').delete().eq('id', inserted!.id);
    expect(error).not.toBeNull();
  });

  it('alterações a profiles ficam registadas no audit log', async () => {
    await admin.from('profiles').update({preferred_locale: 'en'}).eq('id', idB);
    const {data} = await admin
      .from('audit_log')
      .select('action, entity_type, entity_id')
      .eq('entity_type', 'profiles')
      .eq('entity_id', idB)
      .eq('action', 'update');
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 6: Adicionar scripts ao `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Correr os testes e confirmar que FALHAM (o schema ainda não existe)**

```bash
npm test
```

Expected: FAIL — erros do tipo `relation "public.profiles" does not exist` / falha ao criar utilizadores de teste.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: harness RLS com testes de fundações (a falhar — schema por criar)"
```

---

### Task 6: Migração inicial — profiles, platform_settings, audit_log

**Files:**
- Create: `supabase/migrations/00000000000001_foundations.sql`

- [ ] **Step 1: Criar a migração**

```bash
supabase migration new foundations
```

(O CLI gera `supabase/migrations/<timestamp>_foundations.sql` — usar esse ficheiro.)

- [ ] **Step 2: Escrever o conteúdo da migração**

```sql
-- ============================================================
-- TILWENI Fase A · Fatia 0 — Fundações
-- profiles, platform_settings, audit_log (append-only) + triggers
-- ============================================================

-- ---------- Tipos ----------
create type public.user_role as enum ('investor', 'project_manager', 'admin', 'auditor');
create type public.kyc_status as enum ('pending', 'submitted', 'approved', 'rejected');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'investor',
  kyc_status public.kyc_status not null default 'pending',
  preferred_locale text not null default 'pt' check (preferred_locale in ('pt', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Função security definer para consultar o role sem recursão de RLS
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy "profiles: ler o próprio"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: staff lê todos"
  on public.profiles for select
  using (public.current_user_role() in ('admin', 'project_manager'));

-- Investidor pode atualizar apenas campos não sensíveis do próprio perfil.
-- role e kyc_status são protegidos por trigger (abaixo); alterações de role/kyc
-- fazem-se por Server Action com service role.
create policy "profiles: atualizar o próprio"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  -- service role e triggers internos passam; utilizadores autenticados não podem
  -- alterar role nem kyc_status
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.role := old.role;
    new.kyc_status := old.kyc_status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Auto-criação de perfil quando nasce um auth.user
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'locale', 'pt')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- platform_settings ----------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "settings: autenticados leem"
  on public.platform_settings for select
  to authenticated
  using (true);

-- Sem políticas de escrita: escritas só via service role (Server Actions).

insert into public.platform_settings (key, value, description) values
  ('max_investors_per_project', 'null'::jsonb,
   'Nº máximo de investidores por projeto — definir após parecer jurídico (Fase 0)'),
  ('invite_validity_days', '14'::jsonb,
   'Validade dos convites nominativos, em dias'),
  ('budget_deviation_alert_pct', '10'::jsonb,
   'Limiar (%) de desvio orçamental que dispara alerta interno'),
  ('risk_notice', jsonb_build_object(
     'pt', 'O investimento envolve risco de perda total do capital investido, é ilíquido e não beneficia de qualquer garantia de retorno.',
     'en', 'This investment involves the risk of total loss of invested capital, is illiquid and carries no guarantee of return.'
   ),
   'Aviso de risco padronizado, incluído em todas as comunicações a investidores');

-- ---------- audit_log (append-only) ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit: admin e auditor leem"
  on public.audit_log for select
  using (public.current_user_role() in ('admin', 'auditor'));

-- Imutabilidade: sem grants de UPDATE/DELETE para ninguém (incl. service role)…
revoke update, delete on public.audit_log from anon, authenticated, service_role;

-- …e cinto-e-suspensórios: trigger que rejeita mesmo para superusers/owner.
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log é append-only: % não permitido', tg_op;
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

-- Trigger genérico de auditoria para tabelas sensíveis
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rec jsonb;
begin
  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key'),
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger platform_settings_audit
  after insert or update or delete on public.platform_settings
  for each row execute function public.audit_row_change();
```

- [ ] **Step 3: Aplicar a migração ao stack local**

```bash
supabase db reset
```

Expected: `Applying migration ..._foundations.sql... Finished supabase db reset`.

- [ ] **Step 4: Correr os testes — agora devem PASSAR**

```bash
npm test
```

Expected: PASS — todos os testes de `tests/rls/foundations.test.ts` verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: migração de fundações — profiles, settings e audit_log imutável com RLS testada"
```

---

### Task 7: Clientes Supabase, middleware de sessão e página de login

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`
- Create: `src/app/[locale]/(auth)/login/page.tsx`
- Modify: `src/middleware.ts`, `src/app/[locale]/page.tsx`

- [ ] **Step 1: Instalar dependências**

```bash
npm install @supabase/ssr server-only
```

- [ ] **Step 2: Criar `src/lib/supabase/client.ts` (browser)**

```ts
import {createBrowserClient} from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Criar `src/lib/supabase/server.ts` (Server Components/Actions — respeita RLS do utilizador)**

```ts
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({name, value, options}) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component — o middleware trata do refresh.
          }
        }
      }
    }
  );
}
```

- [ ] **Step 4: Criar `src/lib/supabase/admin.ts` (service role — NUNCA importar em código de cliente)**

```ts
import 'server-only';
import {createClient} from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {autoRefreshToken: false, persistSession: false}}
  );
}
```

- [ ] **Step 5: Criar `src/lib/supabase/middleware.ts`**

```ts
import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';

const PUBLIC_PATHS = [
  /^\/(pt|en)\/login$/,
  /^\/(pt|en)\/aceitar-convite\/.+$/
];

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({name, value, options}) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Nunca remover: revalida o token e mantém a sessão viva.
  const {
    data: {user}
  } = await supabase.auth.getUser();

  const {pathname} = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const locale = pathname.split('/')[1] === 'en' ? 'en' : 'pt';
    url.pathname = `/${locale}/login`;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 6: Atualizar `src/middleware.ts` para compor i18n + sessão**

```ts
import createMiddleware from 'next-intl/middleware';
import {type NextRequest} from 'next/server';
import {routing} from './i18n/routing';
import {updateSession} from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
```

- [ ] **Step 7: Criar `src/app/[locale]/(auth)/login/page.tsx`**

```tsx
'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

export default function LoginPage() {
  const t = useTranslations('Login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const supabase = createClient();
    const {error: signInError} = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (signInError) {
      setError(true);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl tracking-tight">
            TILWENI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {t('error')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 8: Atualizar `src/app/[locale]/page.tsx` para mostrar a sessão (smoke test do fluxo completo)**

```tsx
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';

export default async function HomePage() {
  const t = await getTranslations('Home');
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-neutral-500">
        {t('signedInAs', {email: user?.email ?? ''})}
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Verificação manual do fluxo — criar `scripts/create-demo-user.mjs`**

```js
import {createClient} from '@supabase/supabase-js';
import {config} from 'dotenv';

config({path: '.env.test'});

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const {data, error} = await admin.auth.admin.createUser({
  email: 'demo@tilweni.local',
  password: 'demo-password-1!',
  email_confirm: true
});

console.log(error ?? `criado: ${data.user.email}`);
```

Correr:

```bash
node scripts/create-demo-user.mjs
npm run dev
```

Expected: visitar `http://localhost:3000` sem sessão redireciona para `/pt/login`; login com `demo@tilweni.local` / `demo-password-1!` leva à home com o email visível; `/en/login` mostra a UI em inglês.

- [ ] **Step 10: Build + testes**

```bash
npm run build && npm run typecheck && npm test
```

Expected: tudo verde.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: clientes Supabase, middleware de sessão e página de login bilingue"
```

---

### Task 8: CI — GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - run: npm run lint

      - run: npm run typecheck

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase local (aplica migrações)
        run: supabase start

      - name: Testes (unit + RLS)
        run: npm test

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-not-used-at-build-time
```

- [ ] **Step 2: Commit e push (criar o repo remoto primeiro se ainda não existir)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck, testes RLS contra Supabase local e build"
```

Nota: o push para GitHub e a verificação do workflow ficam para quando o repositório remoto for criado (decisão do utilizador — nome/organização/visibilidade **privada**).

---

### Task 9: Ambientes cloud (staging + produção)

Esta task é de infraestrutura — sem código, com passos executáveis via Supabase MCP/CLI e dashboard. Requer confirmações do utilizador (custos e contas).

**Passos:**

- [ ] **Step 1: Criar dois projetos Supabase na região UE (`eu-central-1`): `tilweni-staging` e `tilweni-prod`** — via dashboard ou MCP. Plano Pro no `tilweni-prod` (backups diários). Confirmar custo com o utilizador antes de criar.

- [ ] **Step 2: Em ambos os projetos (Dashboard → Authentication → Sign In / Up):** desativar signups públicos; ativar MFA (TOTP).

- [ ] **Step 3: Ligar as migrações ao staging**

```bash
supabase link --project-ref <ref-staging>
supabase db push
```

Expected: migração `foundations` aplicada; verificar tabelas no dashboard.

- [ ] **Step 4: Repetir para produção**

```bash
supabase link --project-ref <ref-prod>
supabase db push
```

- [ ] **Step 5: Criar projeto Vercel** ligado ao repo GitHub; configurar env vars: Preview → chaves do staging; Production → chaves do prod (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` como secret server-side).

- [ ] **Step 6: Deploy de verificação:** abrir o URL de preview → deve redirecionar para `/pt/login` e responder com header `X-Robots-Tag: noindex, nofollow` (verificar com `curl -sI <url> | grep -i x-robots`).

- [ ] **Step 7: Documentar os refs dos projetos e URLs em `docs/ambientes.md`** (sem chaves — apenas refs, URLs e onde estão guardados os secrets) e commitar.

---

## Fora deste plano (fatias seguintes)

- Fatia 1: convites nominativos + registo + MFA enrolment + `email_outbox` + SMTP 365 — plano próprio após conclusão da Fatia 0.
- Fatias 2-6 conforme a spec (KYC, projetos/catálogo, interesse/subscrições, obra/extratos, dashboard/polimento).
- Playwright E2E entra na Fatia 1 (primeiro fluxo completo digno de E2E: aceitar convite → login → MFA).
