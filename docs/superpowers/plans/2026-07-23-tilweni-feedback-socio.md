# TILWENI — Feedback do sócio (ronda pós-Fase A)

> Documento de planeamento. Regista, ponto a ponto, o **estado atual** (validado
> no código), a **decisão** tomada e o que **falta**. NÃO implementar sem a
> decisão estar fechada. Legenda: ✅ existe · 🟡 parcial · ❌ falta.

Data de início: 2026-07-23. Base: `main` pós-Fase A (Fatias 0-6).

---

## 1. Catálogo com todos os estados + filtro — 🟡 parcial

**Estado atual:**
- Estados existem: `preparacao, subscricao, subscrito, em_curso, concluido, liquidado`
  (i18n: Em preparação / Em subscrição / Subscrito / Em curso / Concluído / Liquidado).
- Catálogo do investidor (`projetos/page.tsx` + `listCatalogue`) mostra **só** os
  projetos em `subscricao` (reforçado por RLS). Cards **sem badge de estado**.
- Back-office (`gestao-projetos/page.tsx`) mostra **todos** os estados com badge,
  mas **sem filtro**.

**Falta / a fazer:** badge de estado nos cards; filtro por estado (tabs/dropdown)
no catálogo e no back-office; decidir que estados o investidor vê.

**Decisão:** _(pendente — rever)_

---

## 2. ROI do investidor vs TIR do projeto (partilha de lucro) — 🟡 conceito em falta

**Estado atual:**
- Mostram-se **TIR** (inserida à mão) e **ROI do projeto** ((ARV − investimento)/
  investimento) — **ambos ao nível do projeto**.
- **Não existe** ROI do investidor nem partilha de lucro (50% proporcional ao
  capital). Não há campo/cálculo disso.

**Falta / a fazer:** modelar partilha de lucro (campo por projeto) + calcular e
apresentar o **retorno do investidor** distinto da TIR do projeto.

**Decisão:** _(pendente — precisa das regras exatas: % fixa 50/50? sempre
proporcional ao capital? como entra a TIR?)_

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

**Decisão:** _(pendente — rever âmbito e que gráficos)_

---

## 4. Imagens do imóvel e da obra — ✅ existe

- Imóvel: capa + galeria de fotos, visível ao investidor.
- Obra: fotos e vídeos por atualização de diário, visíveis ao investidor com
  subscrição ativa.

**Extras opcionais:** legendas por imagem, reordenar/apagar pela UI. _(baixa
prioridade, a confirmar)_

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

## 6. Dashboard: marcos de obra fora do sítio — 🟡 concordar com o sócio

**Estado atual:** dashboard mostra posições por projeto (bom) e, à parte, um painel
"Próximos marcos" que **agrega marcos de todas as obras** (top 5) — fora das páginas
de obra.

**Falta / a fazer:** tirar os marcos do dashboard (ou reduzir a resumo) e reforçá-los
**dentro de cada obra**, que é onde fazem sentido.

**Decisão:** _(pendente — confirmar: remover do dashboard vs. manter só um resumo)_

---

## 7. Fluxo pós-manifestação de interesse — ✅ existe (gerido por staff)

**Estado atual (resumo):** máquina de estados `interesse → contrato_assinado →
fundos_confirmados` (+ `cancelada`). A plataforma gere o processo e os acessos;
**assinatura de contrato e transferência bancária são externas**; o **staff** faz
avançar cada estado, carrega o PDF do contrato, mete a referência da transferência
e confirma os fundos. Sem assinatura digital nem pagamentos integrados.

**Possíveis melhorias (a decidir se entram):** assinatura digital do contrato na
plataforma; o investidor **rever/aceitar o contrato** in-app antes de "contrato
assinado"; comprovativo/integração de pagamento.

**Decisão:** _(pendente — decidir se alguma melhoria entra no âmbito)_

---

## Priorização (rascunho)

- **Rápidos:** 1 (badge + filtro), 6 (marcos p/ dentro da obra), 3-números (totais/%).
- **Médios:** 3-gráficos (lib), 5 (faturas na obra + pasta unificada).
- **De fundo:** 2 (ROI do investidor / partilha de lucro — precisa de regras).

## Registo de decisões

- **Ponto 5:** faturas = documentos da obra; anexáveis a rubrica de custo real **e**
  a atualização de obra (ambos). (2026-07-23)
