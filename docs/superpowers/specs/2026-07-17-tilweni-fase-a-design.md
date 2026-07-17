# TILWENI — Plataforma Privada de Investimento · Design da Fase A (Portal Privado MVP)

**Data:** 2026-07-17 · **Estado:** Aprovado em brainstorming, pendente revisão final do utilizador
**Fonte:** Roadmap Reestruturado v2 (Julho 2026) — Plataforma Privada de Investimento (invite-only)

---

## 1. Contexto e Objetivo

A TILWENI vai operar um **portal privado de investidores** (não um marketplace, não crowdfunding) para captação própria em projetos imobiliários. Três princípios inegociáveis condicionam todo o design:

1. **Oferta particular, não pública** — sem qualquer presença pública na V1: apenas página de login e páginas de convite, tudo com `noindex`.
2. **Acesso por convite nominativo** — registo impossível sem convite; log imutável de quem convidou quem e quando (prova documental do caráter privado da oferta).
3. **Mono-promotor** — apenas projetos da própria TILWENI; nunca promotores terceiros.

**Âmbito deste design: Fase A apenas** (Portal Privado MVP). Fases B (subscrição digital) e C (financeiro/fiscal) terão specs próprias mais tarde.

**Decisões de kick-off (respondidas pelo utilizador):**
- Parecer jurídico (Fase 0) em curso — construir a Fase A já, com limites legais **parametrizáveis** (tabela `platform_settings`) para ajustar sem redeploy quando o parecer chegar.
- Deploy: **Vercel + Supabase Cloud região UE**.
- Interface **bilingue PT (default) + EN**.
- Email via **SMTP Microsoft 365** (caixa própria da TILWENI).
- Design system novo, sóbrio, tom "private banking" — Tailwind + shadcn/ui.
- Escala do piloto: **~2 meses, <20 investidores, 1 projeto**.

**Critério de sucesso:** entrar em produção com o primeiro projeto piloto, com contratualização feita fora da plataforma, cumprindo todas as regras de comunicação da secção 9 do roadmap.

---

## 2. Arquitetura e Stack

**Abordagem escolhida:** monolito Next.js com back-office integrado (aprovada pelo utilizador face às alternativas "back-office em Supabase Studio/Retool" — rejeitada por contornar validações de negócio e audit log — e "API separada" — rejeitada por YAGNI).

- **Next.js 15 (App Router) + TypeScript**, deploy em Vercel. Toda a lógica sensível em Server Actions e Route Handlers; zero lógica de autorização no cliente.
- **Supabase Cloud (região UE — eu-central-1):** PostgreSQL; Supabase Auth com MFA TOTP obrigatório e signups públicos desativados; Storage com buckets privados e URLs assinadas de curta duração (~60s); Edge Functions apenas para tarefas agendadas (expiração de convites, processamento da fila de email).
- **UI:** Tailwind CSS 4 + shadcn/ui, tema sóbrio profissional.
- **i18n:** next-intl, routing por prefixo (`/pt`, `/en`), PT default. Emails no idioma preferido do investidor.
- **Email:** Nodemailer via SMTP Microsoft 365. Fila em tabela `email_outbox` com retry exponencial e dead-letter visível no back-office (SMTP 365 tem rate limit ~30 msg/min; a fila garante que nenhum envio se perde e que fica registado — relevante para o log de convites).

**Estrutura da aplicação (uma app, três áreas):**

```
app/
  [locale]/
    (auth)/        → login, 2FA, aceitar-convite/[token]
    (investor)/    → dashboard, projetos/[id], documentos, extratos, perfil
    (admin)/       → convites, KYC, projetos, obra, extratos, utilizadores, settings, audit
  api/             → webhooks e cron (protegidos)
lib/               → supabase clients, auth guards, audit, mail
supabase/
  migrations/      → SQL versionado (fonte de verdade do schema)
```

**Regras transversais:**
- `noindex` global (meta em todas as páginas + `robots.txt` Disallow all).
- Middleware: sessão obrigatória em tudo exceto login/aceitar-convite; role check por route group; enrolment MFA forçado no primeiro login; gating por estado KYC.
- Parâmetros legais/operacionais em `platform_settings` editável no back-office: nº máx. de investidores por projeto, validade de convites, textos de risco PT/EN, limiar de alerta de desvio orçamental.

**Ambientes:** dois projetos Supabase (staging + produção); migrações versionadas via Supabase CLI aplicadas por CI (GitHub Actions); preview deployments Vercel → staging; produção por promoção manual. Backups diários (plano Pro) + teste de restauro documentado mensal.

---

## 3. Modelo de Dados

| Grupo | Tabelas | Notas |
|---|---|---|
| Identidade | `profiles`, `invites` | `profiles` estende `auth.users`: role (`investor`, `project_manager`, `admin`, `auditor`), estado KYC, idioma preferido. `invites`: nome + email nominativo, token único (hash), quem convidou, validade, estado (pendente/aceite/expirado/revogado), data de aceitação, IP, versão dos termos aceites. |
| KYC | `kyc_submissions`, `kyc_documents` | Documentos no bucket `kyc`; decisão manual com revisor, data e nota registados. |
| Projetos | `projects`, `project_budget_lines`, `project_documents`, `project_milestones` | Estado do ciclo de vida (enum: `preparacao → subscricao → subscrito → em_curso → concluido → liquidado`); orçamento por rubrica com previsto vs. real; sala de documentos no bucket `project-docs`. |
| Participações | `subscriptions` | Investidor↔projeto: montante, estado (`interesse → contrato_assinado → fundos_confirmados`), referência ao PDF do contrato arquivado (bucket `contracts`). Na Fase A o contrato é preparado e assinado fora da plataforma. |
| Obra | `work_updates`, `work_update_media` | Diário de obra (texto/fotos/vídeos) ligado a milestones. Media no bucket `work-media`. |
| Extratos | `account_statements` | Upload mensal por projeto; data de publicação; correções criam nova versão visível (nunca substituição silenciosa). Bucket `statements`. |
| Notificações | `notifications`, `email_outbox` | In-app + fila de email com estado de envio e retries. |
| Config | `platform_settings` | Parâmetros legais/operacionais editáveis. |
| Auditoria | `audit_log` | Append-only (ver secção 4). |

---

## 4. Segurança

**Row Level Security — negação por defeito, RLS ativa em todas as tabelas:**
- Investidor **lê**: projetos em que tem subscription ativa **ou** em estado `subscricao` (catálogo privado); os seus próprios documentos, extratos dos seus projetos, o seu perfil/KYC, as suas notificações.
- Investidor **escreve**: apenas manifestação de interesse, aceitação de termos e upload de documentos KYC próprios. Todo o resto passa por Server Actions com service role e validações de negócio.
- `project_manager`/`admin` com políticas por role; `auditor` read-only sobre extratos e documentos fiscais.
- **Definição de pronto de cada feature inclui testes de RLS** a provar isolamento entre investidores.

**Audit log imutável:**
- `audit_log` INSERT-only: `REVOKE UPDATE, DELETE` a todos os roles incluindo service role; sem políticas UPDATE/DELETE; triggers em tabelas sensíveis (convites, KYC, estados de projeto, subscrições, publicações) + eventos aplicacionais (login, consulta de extrato, download de documento). Campos: ator, ação, entidade, payload JSONB, IP, timestamp.
- Downloads de documentos passam por Route Handler que **regista a consulta no audit log antes de emitir a URL assinada** (validade ~60s) — cumpre o "registo de consulta pelos investidores" do roadmap.

**Storage:** buckets privados `kyc/`, `project-docs/`, `work-media/`, `statements/`, `contracts/`; acesso exclusivamente por URLs assinadas emitidas server-side após verificação de autorização.

**Anti-crowdfunding by design:** sem barra de progresso de captação, sem contagem de investidores visível, sem countdown, sem referral, sem track record público. O investidor vê apenas o estado do projeto e a sua própria posição.

---

## 5. Módulos Funcionais

### 5.1 Convites e Registo
Fluxo custom sobre a fundação Supabase (o invite nativo `inviteUserByEmail` não cobre log imutável, validade configurável, revogação, IP, versão de termos, nem SMTP próprio):
1. Admin cria convite nominativo (nome + email) no back-office → registo em `invites`.
2. Email via `email_outbox` + SMTP 365 com link `/aceitar-convite/[token]` (validade default 14 dias, configurável).
3. Server Action valida token (não expirado/usado/revogado), regista aceitação ativa de termos + política de risco + declaração de iliquidez (checkboxes, versão do texto registada) + IP, cria conta via `auth.admin.createUser()`.
4. Primeiro login força enrolment MFA (TOTP). Convites expirados/revogados permanecem no histórico.

### 5.2 KYC e Onboarding
Estado `kyc_pending` após registo: upload de documento de identificação, comprovativo de morada e NIF. Middleware bloqueia catálogo até `kyc_approved`. Revisão manual no back-office (visualização inline), aprovação/rejeição com nota → audit log. Rejeição notifica com motivo e permite resubmissão. (KYC manual é adequado a <20 investidores; verificação automática fica no backlog V2+.)

### 5.3 Catálogo Privado e Ficha de Projeto
Lista: projetos em `subscricao` + projetos do próprio investidor. Ficha: localização, galeria, custo de aquisição, orçamento por rubrica, ARV, montante total, prazo estimado; indicadores calculados server-side (TIR estimada, ROI, margem, rentabilidade para o investidor); sala de documentos (caderneta predial, licenças, orçamento do empreiteiro, apólice de seguro); aviso de risco padronizado sempre visível.

### 5.4 Manifestação de Interesse (contratualização externa na Fase A)
"Manifestar interesse" com montante → re-aceitação registada dos termos de risco → notifica gestor. Contrato individual preparado pelo advogado e assinado via CMD/DocuSign **fora da plataforma**; o gestor regista a progressão (`interesse → contrato_assinado → fundos_confirmados`), arquiva o PDF na conta do investidor e valida a transferência para o IBAN dedicado do projeto. Limite máximo de investidores validado na Server Action ao confirmar.

### 5.5 Acompanhamento de Obra
Updates (texto + fotos/vídeos) associados a milestones; timeline previsto vs. real; orçamento previsto vs. custo real por rubrica com alerta interno (email a gestor/admin) quando o desvio excede o limiar configurado. Publicação → notificação in-app + email aos investidores do projeto.

### 5.6 Extratos e Transparência
Upload do PDF mensal do extrato da conta dedicada → publicação imediata aos investidores do projeto com notificação → cada consulta/download registada no audit log. Histórico permanente; correções criam nova versão visível.

### 5.7 Dashboard do Investidor
Capital investido por projeto, estado de cada projeto, retorno esperado, documentos recentes, próximos eventos (milestones), últimas atualizações.

### 5.8 Back-office
CRUD de projetos com máquina de estados explícita (só transições válidas, com confirmação e registo); aprovação de projeto por admin antes de disponibilização; gestão de convites e utilizadores; fila de KYC; publicação de obra/extratos; edição de `platform_settings`; viewer do audit log com filtros.

### 5.9 Emails (bilingues, idioma do investidor)
Convite, boas-vindas, KYC aprovado/rejeitado, nova atualização de obra, novo extrato, alerta de desvio (interno). Aviso de risco padronizado no rodapé de todos. Via `email_outbox` + SMTP 365; emails internos do Supabase Auth (reset de password) também apontados ao SMTP 365.

---

## 6. Tratamento de Erros

- Server Actions devolvem erros tipados, mensagens bilingues; nunca stack traces ao cliente.
- `email_outbox` com retry exponencial e dead-letter visível no back-office — nenhum convite/notificação falha silenciosamente.
- Transições de estado inválidas rejeitadas na base de dados (constraints + triggers), não só na aplicação.
- Uploads: validação de tipo/tamanho server-side; transação registo↔ficheiro para nunca deixar registos órfãos.

---

## 7. Estratégia de Testes

- **RLS (obrigatório por feature):** integração contra Supabase local (CLI) com utilizadores de teste por role — investidor A não lê dados de B; `kyc_pending` não acede ao catálogo; `audit_log` rejeita UPDATE/DELETE.
- **Unit (Vitest):** cálculos financeiros (TIR, ROI, margem, rentabilidade), máquinas de estados (projeto, subscrição), validação de limites.
- **E2E (Playwright):** aceitar convite → registo → MFA → KYC → catálogo; publicar extrato → notificação → consulta registada.
- **CI (GitHub Actions):** lint + typecheck + unit + RLS por PR; migrações → staging no merge; produção por promoção manual.

---

## 8. Sequência de Construção (~6-7 semanas, fatias verticais)

| # | Fatia | Conteúdo | Semana |
|---|---|---|---|
| 0 | Fundações | Repo, Next.js + Tailwind + shadcn, next-intl PT/EN, projetos Supabase staging/prod, CI, migração inicial (`profiles`, `platform_settings`, `audit_log` + triggers), middleware auth, noindex | 1 |
| 1 | Convites + Registo + MFA | Módulo 5.1 completo, incluindo `email_outbox` + SMTP | 2 |
| 2 | KYC | Upload, fila de revisão no back-office, gating do middleware | 3 |
| 3 | Projetos + Catálogo | Back-office de projetos, máquina de estados, ficha, sala de documentos, indicadores | 3-4 |
| 4 | Interesse + Subscrições | Manifestação de interesse, progressão manual, arquivo de contratos, limite de investidores | 5 |
| 5 | Obra + Extratos | Diário de obra, milestones, orçamento vs. real + alertas, extratos com audit de consulta | 6 |
| 6 | Dashboard + polimento | Dashboard do investidor, audit log viewer, E2E completos, teste de restauro de backup, hardening | 7 |

Cada fatia termina deployada em staging e demonstrável. A partir da fatia 4 a plataforma suporta o piloto em modo mínimo.

---

## 9. Fora de Âmbito (Fase A)

- Subscrição digital, geração assistida de contratos, assinatura digital integrada (Fase B).
- Motor de distribuição, retenção na fonte, comprovativos de rendimento, reconciliação, encerramento (Fase C).
- Site institucional, KYC automático, open banking, app mobile/PWA, mercado secundário, reinvestimento sugerido (backlog condicional V2+, sujeito a validação jurídica).
- Removidos em definitivo por risco de qualificação como crowdfunding: barra de progresso pública, track record público, referral, tickets baixos massificados, marketing digital de ofertas.

---

## 10. Riscos Específicos da Implementação

| Risco | Mitigação |
|---|---|
| Parecer jurídico altera limites a meio do desenvolvimento | Parâmetros legais em `platform_settings`; textos legais versionados em tabela, não hardcoded. |
| SMTP 365 com rate limits / bloqueio de envio | Fila `email_outbox` com retry + dead-letter; volume esperado é baixo (<20 investidores). |
| Fuga de dados entre investidores | RLS negação-por-defeito + testes de RLS obrigatórios por feature + URLs assinadas de curta duração. |
| Audit log contornado por acesso direto à BD | Triggers na base + REVOKE UPDATE/DELETE; operação exclusivamente pela aplicação (Studio apenas leitura em produção). |
| Indexação acidental da plataforma | noindex global + robots.txt + verificação em E2E. |
