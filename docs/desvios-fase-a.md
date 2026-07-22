# TILWENI — Desvios conscientes à spec da Fase A

O que a spec (`docs/superpowers/specs/2026-07-17-tilweni-fase-a-design.md`)
promete e a Fase A deliberadamente **não** faz, com a razão e o que seria
preciso para fechar. Isto existe para que um leitor da spec não confunda uma
decisão com um esquecimento — e para que nada disto passe despercebido numa
revisão jurídica ou técnica.

Última revisão: 2026-07-22 (fim da Fatia 6).

---

## 1. Aprovação de projeto por admin — NÃO implementada

**A spec diz** (5.8): *"aprovação de projeto por admin antes de
disponibilização"*.

**O que existe:** a máquina de estados (`src/lib/projects/states.ts`) avança
`preparacao → subscricao` sem passo de aprovação distinto. Qualquer staff —
`admin` **ou** `project_manager` — publica um projeto sozinho.

**Porquê:** decisão do utilizador em 2026-07-22, por menos fricção operacional
quando são as mesmas pessoas a preparar e a publicar.

**Risco assumido:** não há segregação de funções na publicação. Quem prepara um
projeto pode disponibilizá-lo a investidores sem revisão de outra pessoa. A
transição **fica auditada** (`projects` tem trigger de auditoria), portanto é
sempre possível saber quem publicou e quando — mas é um controlo detetivo, não
preventivo.

**Para fechar:** restringir a transição para `subscricao` a `role = 'admin'` na
Server Action, e registar o aprovador. Barato agora; mais caro depois de haver
projetos publicados e histórico a reinterpretar.

---

## 2. `storage.remove()` não funciona na stack local

**Onde importa:** `src/lib/statements/service.ts` limpa o PDF do bucket quando o
insert do extrato falha, para não deixar um ficheiro financeiro órfão.

**O problema:** na stack local, `storage.objects` tem um trigger
`protect_delete()` que exige o GUC `storage.allow_delete_query='true'`, e a
imagem `storage-api:v1.14.5` desta stack nunca o define. Qualquer `remove()`
devolve *"new row violates row-level security policy"* — para **todos** os
roles, incluindo `service_role`.

**Estado:** é desvio de versões da stack local, não defeito da app. Numa stack
alinhada a API define o GUC. O teste de limpeza injeta um cliente cujo único
override é o `remove`, para poder asserir o estado real do bucket; o serviço
continua a ser o que está sob teste.

**Por confirmar:** que a remoção funciona mesmo em produção. Enquanto não for
verificado, assumir que **pode haver PDFs órfãos** no bucket `statements` quando
um insert falha.

---

## 3. `work-media` valida o tipo declarado, não o conteúdo

**Onde importa:** o upload de fotos e vídeos de obra vai **direto do browser**
para o Storage por URL assinada — os bytes nunca passam pelo servidor, logo não
há onde inspecionar o conteúdo.

**O que foi verificado** (Fatia 5, empiricamente): o Supabase Storage compara o
cabeçalho `Content-Type` **declarado** com `allowed_mime_types`; não faz sniffing.
Um `.txt` renomeado para `.mp4` e declarado `video/mp4` é **aceite** pelo bucket.

**Risco assumido:** limitado — o caminho é staff-only (`requireStaff()` na
action que emite a URL assinada), e um ficheiro mal rotulado apenas não
reproduz. O objeto é servido com o `Content-Type` guardado, pelo que não há
caminho de execução no browser.

**Contraste deliberado:** os **extratos** sobem por Server Action, os bytes
passam pelo servidor, e por isso são validados por *magic bytes*
(`src/lib/kyc/filetype.ts`) — um ficheiro que declare `application/pdf` sem ser
PDF é rejeitado. A assimetria é consequência do caminho de upload, não
descuido.

**Para fechar:** validação pós-upload (descarregar o início do objeto e
verificar a assinatura) ou um webhook de Storage.

---

## 4. `audit_log.ip` é NULL nas linhas escritas por trigger

**A spec diz** (4): *"Campos: ator, ação, entidade, payload JSONB, IP,
timestamp"*.

**O que existe:** as rotas aplicacionais que auditam consultas de documentos
preenchem o IP (`src/lib/auth/request.ts`). A função de trigger
`audit_row_change()` grava `ip = NULL`.

**Porquê é estrutural, não omissão:** o trigger corre dentro da transação da
base de dados, onde não existe pedido HTTP nem cabeçalhos. Passá-lo exigiria que
cada escritor pusesse o valor num GUC de sessão antes de cada DML — o que só
cobriria os caminhos que passam por código nosso, e o valor do trigger é
precisamente cobrir também os que não passam (SQL direto, jobs, correções
manuais). Um IP herdado da última sessão seria pior que ausente.

**Como ler o log:** linhas com `action` in (`insert`,`update`,`delete`) vêm do
trigger — registam o que **mudou**, sem IP. Linhas com `action = 'view_document'`
vêm da aplicação — registam quem **consultou**, com IP. Documentado como
`comment on` na própria base de dados.

---

## 5. Contrato: sem validação de conteúdo no upload

O upload de contratos assinados (`contracts`) valida o tipo declarado mas ainda
não faz a verificação de *magic bytes* que os extratos e o KYC já fazem. Passa
por Server Action, portanto **é** tecnicamente possível — está por fazer, não
impedido.

---

## 6. Restauro de backup documentado mas não ensaiado

Ver [`restauro-backup.md`](restauro-backup.md). O procedimento está escrito; o
ensaio não foi executado. A cobertura dos **objetos de Storage** pelo backup da
base de dados está **por confirmar** — e é a parte com maior probabilidade de
falhar silenciosamente.
