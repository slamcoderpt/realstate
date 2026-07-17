# TILWENI — Ambientes

Registo dos ambientes da plataforma. **Nunca guardar chaves aqui** — apenas
refs de projeto, URLs e a indicação de *onde* estão guardados os secrets.

> Estado: **produção criada e com schema aplicado.** Falta a config de auth
> (signups/MFA) no dashboard, o staging e o Vercel. Ver
> `docs/superpowers/plans/2026-07-17-tilweni-fatia-0-fundacoes.md`.

---

## Visão geral

| Ambiente   | Onde corre        | Supabase                     | Deploy web (Vercel) | Signups | MFA (TOTP) |
| ---------- | ----------------- | ---------------------------- | ------------------- | ------- | ---------- |
| Local      | máquina do dev    | stack local (Docker)         | —                   | Off     | On         |
| Staging    | cloud             | `tilweni-staging` (pendente) | Preview             | Off     | On         |
| Produção   | cloud             | `tilweni-prod` (Pro) ✅       | Production          | Off*    | On*        |

\* Auth de produção (signups Off, MFA TOTP On) **ainda por configurar no dashboard** — ver checklist abaixo.

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
  - Project ref: `yhyyivzcugfjwjhazbto`
  - Região: `eu-central-1` (Central EU / Frankfurt)
  - API URL: `https://yhyyivzcugfjwjhazbto.supabase.co`
  - Plano: **Pro** (backups diários)
  - Auth: signups **Off**, MFA TOTP **On** — ⚠️ **por configurar no dashboard**
  - Migrações aplicadas: `foundations` ✅ (3 tabelas c/ RLS; advisors de segurança: 0)
- **Web (Vercel)** — equipa `Carlos' projects` (`team_pt2s1UPA8HMgthir4RkqVnpi`)
  - Projeto: `realstate` (`prj_oT6swWo8jHlbEZeJxRCIniZvITob`)
  - Método: **Import Git Repository** de `slamcoderpt/realstate` (CI/CD por push a `main`)
  - Ambiente Vercel: **Production**
  - URL de produção: `https://realstate-carlos-projects-c5e230d9.vercel.app`
  - Verificado ✅: `/` → 307 `/pt/login`; login PT/EN a 200; `X-Robots-Tag: noindex, nofollow`; `/robots.txt` = `Disallow: /`
  - ⚠️ Deployment Protection foi desligado para validação — **voltar a ligar** até go-live
- **Env vars** (Vercel → Settings → Environment Variables → Production; valores **não** aqui):
  - `NEXT_PUBLIC_SUPABASE_URL` → `https://yhyyivzcugfjwjhazbto.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable key do prod (pública)
  - `SUPABASE_SERVICE_ROLE_KEY` → de Supabase → Settings → API (marcar **Sensitive**)

---

## Procedimento de setup (Task 9)

- [x] **Criar `tilweni-prod`** em `eu-central-1` (org Pro). Ref `yhyyivzcugfjwjhazbto`.
- [x] **Aplicar a migração `foundations`** ao prod (via MCP `apply_migration`).
      3 tabelas com RLS; advisors de segurança sem problemas.
- [ ] **Auth do prod** (Dashboard → Authentication → Sign In / Up): desativar
      signups públicos; ativar MFA (TOTP). **← próximo passo manual**
- [ ] **Criar `tilweni-staging`** (adiado; requer outro slot/compute).
- [x] **Vercel:** Import Git de `slamcoderpt/realstate` na equipa `Carlos' projects`;
      env vars Production → prod. Framework Next.js, Root `./`, defaults de build.
- [x] **Deploy de verificação:** `/` → 307 `/pt/login`; login PT/EN a 200;
      `X-Robots-Tag: noindex, nofollow`; `/robots.txt` = `Disallow: /`. ✅
- [ ] **Reativar Deployment Protection** no Vercel (foi desligado p/ validação).
- [ ] **Repo privado:** `slamcoderpt/realstate` está público — tornar privado se
      não intencional (plano previa visibilidade privada).
- [ ] **Env vars Preview → staging** quando `tilweni-staging` existir.

---

## Notas

- As migrações SQL em `supabase/migrations/` são a fonte de verdade do schema —
  qualquer ambiente é reconstruível a partir delas.
- RLS é negação-por-defeito e está coberta por testes de integração
  (`tests/rls/`) contra o Supabase local; a definição de pronto exige-os verdes.
