# TILWENI — CRM de investidores (pipeline + kanban)

> Proposta de estrutura para **validação** antes de implementar. Pedido do sócio:
> "um CRM dentro da plataforma para começar a qualificar os investidores, com um
> kanban, para não perdermos informação".

Data: 2026-07-24. Estado: **rascunho para validação — não implementar ainda.**

---

## 1. Objetivo e princípio

Um CRM **leve, dentro do back-office** para **captar e qualificar prospects**
ANTES de entrarem no funil que já existe:

```
[ CRM: lead → qualificação → convite ]  →  registo → KYC → catálogo → subscrição
        (NOVO, esta proposta)                 (já existe hoje)
```

**Princípio-chave:** o CRM vive *antes* do convite e **reutiliza** o que já
existe — não duplica. Um lead qualificado **converte-se num convite** (tabela
`invites` atual) e, quando a pessoa regista, liga-se ao `profile`. A partir daí,
KYC e subscrições continuam nos módulos atuais; o CRM só mostra um resumo/atalho.

Só para **staff** (admin / project_manager). Nada exposto a investidores.

---

## 2. Modelo de dados (novas tabelas `crm_*`)

**`crm_leads`** — o contacto/prospect:
- `id`, `full_name`, `email`, `phone`
- `source` — origem (referência, evento, website, linkedin, outro)
- `stage` — coluna do kanban (ver §3)
- `owner_id` — staff responsável (organização, não barreira de segurança)
- **Qualificação:** `investor_profile` (retail / qualificado / institucional),
  `estimated_ticket` (€ pretendido), `notes`
- **Ligações (conversão):** `converted_invite_id` (→ `invites`, nullable),
  `converted_user_id` (→ `profiles`, nullable)
- `tags text[]`, `last_activity_at`, `created_at`, `updated_at`

**`crm_activities`** — histórico / notas / follow-ups (o "não perder informação"):
- `id`, `lead_id`, `author_id`
- `type` — nota | chamada | email | reunião | mudança-de-estado
- `body`, `due_at` (follow-up agendado, nullable), `done boolean`
- `created_at`

**Stages** — no MVP um **enum fixo** (mais simples); configuráveis fica p/ depois:
`novo → contactado → qualificado → reuniao → convite_enviado → convertido` (+ `perdido`).

---

## 3. Kanban + vistas

- **Board por stage:** arrastar um cartão muda o `stage` e regista uma activity
  automática ("Movido para Qualificado").
- **Cartão:** nome · ticket estimado · owner · dias na coluna · próximo follow-up.
- **Filtros:** por owner, origem, tag. **Pesquisa** por nome/email.
- **Detalhe** (painel lateral ou página): dados + **timeline de atividades** +
  ações ("Adicionar nota", "Agendar follow-up", "Converter em convite").
- **Vista lista/tabela** alternativa ao board.

---

## 4. Ciclo de vida e integração (sem duplicar)

1. Lead entra em **`novo`** — criado à mão pelo staff (no MVP).
2. Qualificação move-o pelos stages, com notas/atividades a acumular.
3. **"Converter em convite"** → chama a Server Action de convites já existente,
   guarda `converted_invite_id`, move para **`convite_enviado`**.
4. Quando o convite é **aceite** (nasce o `profile`), liga-se `converted_user_id`
   e o lead vai para **`convertido`**. KYC/subscrições seguem nos módulos atuais;
   o cartão passa a mostrar um resumo com atalhos.
5. **Deduplicação:** ao criar/converter, se o email já existir em `profiles` ou
   `invites`, avisa em vez de recriar.

---

## 5. Permissões / segurança

- Tabelas `crm_*`: **staff-only** (RLS `current_user_role() in ('admin',
  'project_manager')`), como a `invites`. Escrita só por Server Actions (service
  role) + `audit_log`. Zero exposição a investidores.

---

## 6. Follow-ups (não perder o fio)

- Activity com `due_at` alimenta um painel **"Follow-ups de hoje / atrasados"**
  no back-office. Simples: lista do staff, sem motor de notificações novo no MVP.

---

## 7. Fatiamento proposto

- **Fatia A — MVP kanban:** ✅ IMPLEMENTADO (2026-07-24). `crm_leads` +
  `crm_activities` + stages (enum); criar lead, arrastar entre colunas (com
  registo automático da mudança), página de detalhe (edição + timeline + registar
  atividade/follow-up); RLS staff-only; entrada "CRM" na navegação do back-office.
  Migração `20260724100000_crm.sql`. Testes integração + RLS. _Conversão em
  convite fica para a Fatia B._
- **Fatia B — Conversão:** ✅ IMPLEMENTADO (2026-07-24). Botão "Converter em
  convite" na ficha do lead → reutiliza o mecanismo de convites existente.
  Deduplicação em 3 níveis (já convertido → no-op; email já é utilizador → liga
  e marca convertido; convite pendente existente → reutiliza). Auto-ligação ao
  aceitar o convite (`linkConvertedInvite` chamado de `acceptInvite`, best-effort).
  Sem migração (colunas já existiam). Testes de integração.
- **Fatia C — Produtividade:** ✅ IMPLEMENTADO (2026-07-24). Painel de
  **follow-ups por resolver** no topo do CRM (atrasados a vermelho) + "concluir";
  **métricas** (leads, valor em pipeline, convertidos, follow-ups); **filtros**
  por responsável/origem/tag no kanban; **tags** editáveis na ficha + chips no
  cartão. Sem migração (colunas `due_at`/`done`/`tags` já existiam). Testes.
- **Fatia D — Captação (futuro):** formulário público "quero investir" /
  landing que cria leads em `novo` automaticamente.

---

---

## Verificação com a app a correr (2026-07-29)

Até aqui o CRM tinha testes de dados (integração + RLS) mas **nunca tinha sido
usado**. Correu-se o stack local + a app e percorreu-se o fluxo no browser. O que
isso apanhou — e que nenhum teste de dados apanharia:

1. **ROI anualizado pelo prazo errado nos projetos fechados.** A ficha mostrava
   "Prazo real: 12 meses" e, ao lado, um ROI anualizado calculado sobre o prazo
   *previsto* (14) — 26,6% em vez de 31,7%. Subvalorizava o desempenho e
   contradizia o mosaico do lado. Corrigido: anualiza-se pelo prazo efetivo.
2. **Arrastar dependia só de estado React.** O id do cartão não viajava no
   `dataTransfer`; passou a viajar (contrato do HTML5 DnD, sem corrida com o
   `dragend`).
3. **Filtros e campos do formulário partilhavam rótulos** ("Origem" duas vezes na
   mesma página) — ambíguo para leitores de ecrã. Filtros passaram a ter rótulos
   próprios ("Filtrar por origem", …).
4. **`sendMail` sem timeouts.** Um SMTP que aceite a ligação e não responda
   pendurava a Server Action até o pedido morrer — observou-se um **convite
   criado sem o lead ficar ligado**. Com timeouts, o envio falha depressa, a
   entrada fica `failed` e o fluxo segue. (A deduplicação já auto-corrigia o lead
   na tentativa seguinte — confirmado no browser.)

**Verificado ponta a ponta no browser:** criar lead → arrastar → follow-up →
converter → aceitar o convite → lead "Convertido" ligado à conta, **sem convite
duplicado**.

## 9. Cobertura de testes

- **Integração** (16): serviço completo, conversão com deduplicação em 3 níveis,
  idempotência, follow-ups, tags e o **ciclo completo** (converter → aceitar →
  lead convertido) — este último fecha o `try/catch` silencioso do `acceptInvite`,
  onde uma regressão passaria despercebida.
- **RLS** (7): staff lê; investidor não lê nem escreve; anónimo não vê.
- **E2E** (`e2e/crm-flow.spec.ts`): o kanban no browser, incluindo o **arrastar**
  — a única interação que nenhum teste de dados alcança.

## 8. Questões para validar (sócio)

1. **Stages** — ok `Novo → Contactado → Qualificado → Reunião → Convite enviado
   → Convertido` (+ `Perdido`)? Fixos no início, ou já configuráveis?
2. **Campos de qualificação** — quais importam? (ticket estimado, perfil de
   investidor, origem, horizonte de investimento, …)
3. **Quem acede** — só `admin`, ou também `project_manager`?
4. **Captação inicial** — tudo manual (staff cria o lead), ou já querem o
   formulário público desde o início (Fatia D antecipada)?
5. **Follow-ups** — precisam de tarefas com data/lembrete, ou chega notas livres?
