# TILWENI — Ambientes

Registo dos ambientes da plataforma. **Nunca guardar chaves aqui** — apenas
refs de projeto, URLs e a indicação de *onde* estão guardados os secrets.

> Estado: **estrutura preenchida, refs por completar.** A criação dos projetos
> cloud (Task 9 do plano da Fatia 0) fica pendente da conta Supabase Pro correta.
> Ver `docs/superpowers/plans/2026-07-17-tilweni-fatia-0-fundacoes.md`.

---

## Visão geral

| Ambiente   | Onde corre        | Supabase             | Deploy web (Vercel) | Signups | MFA (TOTP) |
| ---------- | ----------------- | -------------------- | ------------------- | ------- | ---------- |
| Local      | máquina do dev    | stack local (Docker) | —                   | Off     | On         |
| Staging    | cloud             | `tilweni-staging`    | Preview             | Off     | On         |
| Produção   | cloud             | `tilweni-prod` (Pro) | Production          | Off     | On         |

Região alvo dos projetos cloud: **`eu-central-1`** (UE).

---

## Local (desenvolvimento)

- **Supabase:** stack local via `supabase start` (requer Docker).
  - API: `http://127.0.0.1:54421` · DB: `postgresql://postgres:postgres@127.0.0.1:54422/postgres`
  - Portas não-default (54421/54422/…) porque a gama 543xx está ocupada nesta
    máquina — ver `supabase/config.toml` e `.env.test`.
  - Signups desativados (`enable_signup = false`); MFA TOTP ativado.
- **App:** `npm run dev` → `http://localhost:3000` (redireciona para `/pt/login`).
- **Secrets:** `.env.local` (gitignored). As chaves demo do stack local vivem em
  `.env.test` (commitado de propósito — são JWTs públicos `iss: supabase-demo`,
  idênticos em todas as máquinas; nunca colocar aqui chaves cloud).

---

## Staging

- **Supabase**
  - Nome do projeto: `tilweni-staging`
  - Project ref: `<POR PREENCHER>`
  - Região: `eu-central-1`
  - API URL: `https://<ref>.supabase.co`
  - Plano: Free/Pro (org Pro) — `<CONFIRMAR>`
  - Auth: signups **Off**, MFA TOTP **On** (Dashboard → Authentication → Sign In / Up)
  - Migrações aplicadas: `foundations` (`supabase/migrations/…_foundations.sql`)
- **Web (Vercel)**
  - Ambiente Vercel: **Preview**
  - URL de preview: `<POR PREENCHER>`
- **Secrets** (guardados em Vercel → Project → Settings → Environment Variables → Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/publishable)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side, marcado como secret)

---

## Produção

- **Supabase**
  - Nome do projeto: `tilweni-prod`
  - Project ref: `<POR PREENCHER>`
  - Região: `eu-central-1`
  - API URL: `https://<ref>.supabase.co`
  - Plano: **Pro** (backups diários)
  - Auth: signups **Off**, MFA TOTP **On**
  - Migrações aplicadas: `foundations`
- **Web (Vercel)**
  - Ambiente Vercel: **Production**
  - URL de produção: `<POR PREENCHER>`
- **Secrets** (Vercel → Environment Variables → Production):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (secret server-side)

---

## Procedimento de setup (Task 9)

1. **Criar projetos** `tilweni-staging` e `tilweni-prod` em `eu-central-1` (org Pro).
   Confirmar custo antes de criar. Pro no prod (backups diários).
2. **Auth em ambos** (Dashboard → Authentication → Sign In / Up): desativar
   signups públicos; ativar MFA (TOTP).
3. **Aplicar migrações** a cada projeto:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   (ou aplicar a migração `foundations` diretamente via MCP `apply_migration`.)
4. **Vercel:** criar projeto ligado ao repo GitHub; configurar env vars por
   ambiente (Preview → staging, Production → prod).
5. **Deploy de verificação:** abrir o URL de preview → deve redirecionar para
   `/pt/login` e responder com o header de noindex:
   ```bash
   curl -sI <url> | grep -i x-robots
   # esperado: X-Robots-Tag: noindex, nofollow
   ```
6. **Preencher os refs/URLs acima** e commitar (sem chaves).

---

## Notas

- As migrações SQL em `supabase/migrations/` são a fonte de verdade do schema —
  qualquer ambiente é reconstruível a partir delas.
- RLS é negação-por-defeito e está coberta por testes de integração
  (`tests/rls/`) contra o Supabase local; a definição de pronto exige-os verdes.
