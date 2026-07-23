# TILWENI — Feedback do sócio (ronda pós-Fase A)

> Documento de planeamento. Regista, ponto a ponto, o **estado atual** (validado
> no código), a **decisão** tomada e o que **falta**. NÃO implementar sem a
> decisão estar fechada. Legenda: ✅ existe · 🟡 parcial · ❌ falta.

Data de início: 2026-07-23. Base: `main` pós-Fase A (Fatias 0-6).

---

## 1. Catálogo com todos os estados + filtro — ✅ IMPLEMENTADO (2026-07-23)

> **Feito:** `listCatalogue` passa a devolver todos os estados != `preparacao`;
> `getProjectDetail` e as rotas `cover/photo/document` abrem a ficha a estados
> lançados; RLS de `projects`+`budget_lines`+`photos`+`documents` alargada
> (migração `20260723090000_catalogo_estados_lancados.sql`); catálogo com **badge
> de estado** por card e **filtro** (Todos · Em subscrição · Em curso · Fechados)
> no novo `CatalogueGrid` (client). Detalhes de obra/extratos continuam gated pela
> subscrição. Testes de integração/RLS atualizados.


**Estado atual:**
- Estados existem: `preparacao, subscricao, subscrito, em_curso, concluido, liquidado`
  (i18n: Em preparação / Em subscrição / Subscrito / Em curso / Concluído / Liquidado).
- Catálogo do investidor (`projetos/page.tsx` + `listCatalogue`) mostra **só** os
  projetos em `subscricao` (reforçado por RLS). Cards **sem badge de estado**.
- Back-office (`gestao-projetos/page.tsx`) mostra **todos** os estados com badge,
  mas **sem filtro**.

**Falta / a fazer:** badge de estado nos cards; filtro por estado (tabs/dropdown)
no catálogo e no back-office.

**✅ Decisão:** o investidor vê **TODOS os projetos lançados** — todos os estados
**exceto `preparacao`** —, **incluindo os já 100% financiados** (mais quantidade na
listagem, dá noção de escala). Os **detalhes de obra e os extratos continuam
reservados a quem investiu** (RLS atual mantém-se). Badge de estado em cada card +
filtro **Todos · Em subscrição · Em curso · Fechado** (fechado = concluído/liquidado).
Requer alterar `listCatalogue` e a RLS `"projects: investidor lê subscricao"` para
abrir a leitura da FICHA (não dos detalhes) a todos os estados != preparacao.

---

## 2. ROI do investidor vs TIR do projeto (partilha de lucro) — 🟡 conceito em falta

**Estado atual:**
- Mostram-se **TIR** (inserida à mão) e **ROI do projeto** ((ARV − investimento)/
  investimento) — **ambos ao nível do projeto**.
- **Não existe** ROI do investidor nem partilha de lucro (50% proporcional ao
  capital). Não há campo/cálculo disso.

**Falta / a fazer:** modelar partilha de lucro (parâmetro por projeto) + calcular e
apresentar o **retorno do investidor** distinto da TIR do projeto.

**✅ Decisão (fechada):** o "50%" era exemplo; o retorno é **proporcional ao que
cada investidor meteu**. Modelo:
- Lucro estimado = ARV − custo total (aquisição + obra)
- **Fatia TILWENI** = lucro × **% configurável por projeto** (default **50%**)
- **Pool dos investidores** = lucro × (1 − % TILWENI) — o restante
- Retorno de cada investidor = pool investidores × (montante investido ÷ total angariado)
- ROI do investidor % = retorno ÷ montante investido; a TIR fica como indicador do
  **projeto**, à parte.

Campo novo por projeto: `tilweni_profit_share_pct` (default 0.50). O que se mostra
ao investidor é **o retorno dele** (após a fatia TILWENI), não o lucro bruto do projeto.

---

## 3. Obra: totais, % de acabamento, gráficos — 🟡 parcial

**Estado atual:**
- Existe orçamento vs custo real **por rubrica**, com desvio % por linha + alerta
  por email ao staff acima de X%.
- **Não existe:** total agregado (Σ orçamento vs Σ executado), % global de execução,
  % de acabamento da obra (marcos só têm estado, sem %).
- **Gráficos: não existem** (nenhuma lib de gráficos instalada).

**Falta / a fazer:** linha de total + % de execução; % de progresso da obra;
gráficos no dashboard (instalar lib).

**✅ Decisão:** (i) linha de **total** (Σ orçamento vs Σ executado + desvio global) e
**% de execução do orçamento**; (ii) **% de acabamento da obra derivada dos marcos**
(concluídos ÷ total) — sem campo manual novo; (iii) **gráficos**: um da **carteira**
(capital por projeto/estado) no dashboard e um de **orçamento vs executado** na obra.
Instalar uma lib de gráficos leve.

---

## 4. Imagens do imóvel e da obra — ✅ existe

- Imóvel: capa + galeria de fotos, visível ao investidor.
- Obra: fotos e vídeos por atualização de diário, visíveis ao investidor com
  subscrição ativa.

**✅ Decisão:** deixar como está — **sem extras** (legendas/reordenar ficam de fora).

---

## 5. Pasta por projeto (documentos + faturas + extratos) — 🟡 parcial · **DECIDIDO**

**Enquadramento (sócio):** uma fatura é só um documento; o mecanismo seguro de
documentos já existe (bucket privado + URL assinada + auditoria, usado nos
documentos do imóvel, extratos e contratos). **As faturas são documentos da OBRA.**

**Estado atual:** documentos existem para o **imóvel** (Sala de documentos) e a
conta (extratos). A **obra só aceita fotos e vídeos** (`media_type = photo|video`)
— **não há forma de anexar documentos/faturas à obra**.

**✅ Decisão:**
- Dar à **obra** capacidade de anexar **documentos (faturas)** — PDF em bucket
  privado + URL assinada + auditoria, reaproveitando o mecanismo existente.
- Anexáveis a **AMBOS**: **(a)** cada **rubrica de custo real** (rastreabilidade —
  cada custo executado justificado pela sua fatura) **e (b)** cada **atualização
  de obra** (junto das fotos/vídeos dessa semana).
- Visíveis ao investidor com subscrição ativa (transparência).
- (Objetivo maior:) uma **"pasta do projeto"** única que junte documentos do
  imóvel + faturas da obra + extratos.

**Falta / a fazer:** tabela `work_documents` (ligável a rubrica e/ou a atualização),
upload no back-office da obra, visualização na página da obra + vista unificada.

---

## 6. Dashboard: marcos de obra fora do sítio — ✅ IMPLEMENTADO (2026-07-23)

> **Feito:** a página de obra passa a abrir com um **destaque de progresso** — %
> de acabamento derivada dos marcos (concluídos ÷ total) + barra + contagem "X de
> Y marcos concluídos"; os pontos da timeline de marcos passam a ter **cor por
> estado** (concluído sólido, em curso meio-tom, previsto discreto). O painel
> "Próximos marcos" do **dashboard mantém-se** (resumo transversal).


**Estado atual:** dashboard mostra posições por projeto (bom) e, à parte, um painel
"Próximos marcos" que **agrega marcos de todas as obras** (top 5) — fora das páginas
de obra.

**Falta / a fazer:** reforçar os marcos **dentro de cada obra**; manter também um
resumo no dashboard.

**✅ Decisão:** marcos **destacados dentro de cada obra** (com a % de acabamento do
ponto 3) **E** manter um **resumo no dashboard** (é importante ter lá também). Não
remover do dashboard.

---

## 7. Fluxo pós-manifestação de interesse — ✅ existe (gerido por staff)

**Estado atual (resumo):** máquina de estados `interesse → contrato_assinado →
fundos_confirmados` (+ `cancelada`). A plataforma gere o processo e os acessos;
**assinatura de contrato e transferência bancária são externas**; o **staff** faz
avançar cada estado, carrega o PDF do contrato, mete a referência da transferência
e confirma os fundos. Sem assinatura digital nem pagamentos integrados.

**Possíveis melhorias (sugeridas por mim, não pelo sócio):** assinatura digital do
contrato; rever/aceitar contrato in-app; comprovativo de pagamento.

**✅ Decisão:** **não mexer agora.** O fluxo fica como está; a explicação do fluxo
serve para enviar ao sócio. Melhorias adiadas.

---

## Priorização (rascunho)

- **Rápidos:** 1 (badge + filtro), 6 (marcos p/ dentro da obra), 3-números (totais/%).
- **Médios:** 3-gráficos (lib), 5 (faturas na obra + pasta unificada).
- **De fundo:** 2 (ROI do investidor / partilha de lucro — regras já definidas;
  precisa de campo `tilweni_profit_share_pct` + cálculo + apresentação).

## Registo de decisões (2026-07-23)

- **Ponto 1:** investidor vê todos os projetos lançados (estados != preparacao),
  incluindo 100% financiados; detalhes de obra/extratos só para quem investiu;
  badge + filtro.
- **Ponto 2:** lucro = ARV − custo total; **% configurável por projeto (default 50%)
  é a fatia da TILWENI**; o restante é o pool dos investidores, distribuído na
  proporção do investido. Mostra-se ao investidor o **retorno dele**, não o lucro bruto.
- **Ponto 3:** totais + % execução + % acabamento (por marcos) + 2 gráficos (lib leve).
- **Ponto 4:** sem alterações.
- **Ponto 5:** faturas = documentos da obra; anexáveis a rubrica de custo real **e**
  a atualização de obra.
- **Ponto 6:** marcos dentro de cada obra **e** resumo no dashboard.
- **Ponto 7:** não mexer agora (melhorias adiadas).
