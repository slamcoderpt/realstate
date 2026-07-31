# TILWENI — CRM: origem «Programa João Gonçalves» + Agente/Intermediário

> Pedido do sócio (2026-07-31, depois de validar o mini CRM):
> «origem adiciona programa Joao Goncalves» · «adiciona tb Agente/intermediario»
> — e, à pergunta "na origem?": «nop campo à parte / pra podermos colocar quem
> trouxe o investidor / caso tenha de se pagar comissão».

Data: 2026-07-31. Base: CRM da Fatia A–C (`20260724100000_crm.sql`).
Estado: **implementado**.

---

## 1. O que muda

1. **Nova origem** no enum `crm_source`: `programa_joao_goncalves` — "Programa
   João Gonçalves" (PT) / "João Gonçalves Programme" (EN). Fica antes de `outro`,
   para `outro` continuar a ser o último da lista.
2. **Campo novo, à parte da origem**: `crm_leads.agent_name` — o
   agente/intermediário que trouxe o investidor. É **texto livre** e é
   **independente** da origem: um lead pode vir do "Programa João Gonçalves" *e*
   ter um agente, ou vir do website sem agente nenhum.

Porque não é uma origem: a origem responde a "por onde nos chegou"; o agente
responde a "a quem se paga comissão". São perguntas diferentes e um lead pode ter
resposta para as duas — juntá-las numa só lista obrigaria a escolher.

## 2. Modelo de dados

Migração `20260731090000_crm_origem_programa_agente.sql`:

- `alter type public.crm_source add value 'programa_joao_goncalves' before 'outro'`;
- `crm_leads.agent_name text not null default ''` (vazio = veio direto, sem
  intermediário — evita o terceiro estado do `null`);
- índice parcial `crm_leads_agent_idx` sobre `agent_name` onde `agent_name <> ''`:
  as consultas úteis são "leads deste agente" e "leads com agente" (comissões), e
  a maioria das linhas não tem agente.

**Texto livre e não tabela de agentes**: hoje só é preciso saber a quem se paga.
Modelar agentes como entidade (com contactos, % de comissão, histórico de
pagamentos) é outro módulo — quando o sócio o pedir, os nomes já registados
servem de ponto de partida. O nome é normalizado (trim) na escrita, para o mesmo
agente não aparecer duas vezes na lista de filtros.

## 3. Interface (back-office `/crm`)

- **Novo lead**: campo "Agente/Intermediário" ao lado de "Origem", com dica
  "Quem trouxe o investidor (para comissão)".
- **Ficha do lead** (página e modal do kanban): o mesmo campo, editável;
  gravar em branco limpa-o.
- **Cartão do kanban**: linha com o nome do agente (ícone de aperto de mão) só
  quando existe — cartões sem agente ficam como estavam.
- **Filtros**: novo filtro "Todos os agentes", ao lado do filtro de origem, e só
  aparece quando há pelo menos um lead com agente. É este filtro que dá a lista
  de leads a considerar para comissão de um agente.

## 4. Arrumação aproveitada

As listas de estados/origens/perfis estavam **repetidas à mão** em três
componentes de cliente (`KanbanBoard`, `LeadDetail`, `NewLeadForm`), porque
`lib/crm/service.ts` é `server-only`. Uma origem nova obrigava a tocar em quatro
sítios e a esquecer-se de um era silencioso. Passaram para
`src/lib/crm/constants.ts` (sem imports de servidor, atravessa a fronteira), com
o serviço a reexportá-las para não partir quem já as importava de lá.

## 5. Testes

- Integração (`tests/integration/crm.test.ts`): a origem nova é aceite; o agente
  guarda-se na criação com trim, é independente da origem, fica `''` quando não
  há, atualiza-se e limpa-se, e vem no `listLeads` (que alimenta o kanban).
- Paridade PT/EN das novas chaves: coberta pelo teste de mensagens existente.
