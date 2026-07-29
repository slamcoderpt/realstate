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

- **Fatia A — MVP kanban:** `crm_leads` + `crm_activities` + stages (enum);
  criar lead, arrastar entre colunas, detalhe + notas; RLS staff; entrada na
  navegação do back-office. _Sem conversão automática ainda._
- **Fatia B — Conversão:** botão "Converter em convite" (liga à `invites`),
  auto-link on accept, deduplicação por email.
- **Fatia C — Produtividade:** follow-ups agendados + painel no back-office,
  filtros/tags, métricas simples por origem/stage.
- **Fatia D — Captação (futuro):** formulário público "quero investir" /
  landing que cria leads em `novo` automaticamente.

---

## 8. Questões para validar (sócio)

1. **Stages** — ok `Novo → Contactado → Qualificado → Reunião → Convite enviado
   → Convertido` (+ `Perdido`)? Fixos no início, ou já configuráveis?
2. **Campos de qualificação** — quais importam? (ticket estimado, perfil de
   investidor, origem, horizonte de investimento, …)
3. **Quem acede** — só `admin`, ou também `project_manager`?
4. **Captação inicial** — tudo manual (staff cria o lead), ou já querem o
   formulário público desde o início (Fatia D antecipada)?
5. **Follow-ups** — precisam de tarefas com data/lembrete, ou chega notas livres?
