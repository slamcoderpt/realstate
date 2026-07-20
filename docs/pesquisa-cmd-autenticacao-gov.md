# Pesquisa — Integração Autenticação.Gov / Chave Móvel Digital (CMD)

**Data:** 2026-07-20 · **Contexto:** futura validação de identidade do KYC de cidadãos
portugueses sem retenção de documentos (substitui o upload do Cartão de Cidadão).
Ver [docs/ambientes.md](ambientes.md) e o plano da Fatia 2.

> ⚠️ Factos recolhidos de documentação pública da AMA/ARTE. Os detalhes finais
> (lista exata de atributos, forma do fluxo OAuth) **têm de ser confirmados** na
> documentação de integração e na pasta *Atributos* quando o acesso for concedido.

## Ponto essencial

A Autenticação.Gov **não é uma API self-service**. Integrar exige um processo de
adesão formal junto da AMA/ARTE, com credenciais emitidas por ambiente. Não se
resolve com uma chave de API — é o item que está a ser tratado em paralelo.

## Protocolos suportados

- **SAML 2.0** — HTTP POST Binding + Web Browser SSO Profile.
- **OAuth 2.0 / OIDC** — pasta OAuth na documentação, com quick-start.

**Recomendação para esta app (Next.js):** usar **OAuth2/OIDC**, mais simples de
integrar num App Router com Server Actions/Route Handlers do que o SAML.

## Ambientes

- **Pré-produção** (para desenvolvimento/testes da integração).
- **Produção**.

Cada ambiente tem a sua configuração/credenciais próprias — o registo é por ambiente.

## Processo de adesão (onboarding)

1. Preencher o formulário em **"Solicitar adesão"** no portal autenticacao.gov.pt.
2. **Selecionar o serviço**: *Chave Móvel Digital (CMD)* (outros serviços na mesma
   página: SAFE/assinatura de fatura, Atributos Profissionais, GOV.PT, Sistema de
   Autorização).
3. Enviar o formulário em formato editável para **eid@arte.gov.pt** (a AMA passou a
   ARTE — Agência para a Reforma Tecnológica do Estado), referindo o nº de adesão
   recebido por email após submissão inicial.
4. Aceitar termos e condições.

Contactos de suporte: **eid@ama.pt** / **eid@arte.gov.pt**.

Elegibilidade de entidades privadas: a documentação pública não detalha restrições
explícitas; a linguagem do formulário acomoda vários tipos de entidade. **Confirmar
elegibilidade e eventuais custos diretamente com a AMA/ARTE.**

## Atributos

- A lista completa vive na pasta *Atributos no Autenticação.Gov* + schemas XML da
  documentação técnica (não extraída aqui — confirmar na integração real).
- Atributos tipicamente disponíveis: **nome completo**, **NIC** (nº identificação
  civil), **NIF** (nº identificação fiscal), **data de nascimento**, entre outros.
- **Consentimento por atributo:** o cidadão autoriza explicitamente que atributos
  são partilhados com a entidade, no próprio fluxo de autenticação.

**Implicação para o KYC PT:** se o NIF vier na asserção (a confirmar), a validação
CMD dá identidade + NIF verificados pelo Estado, permitindo **não reter qualquer
documento** — guarda-se apenas metadados de verificação (nome-confere, NIF,
timestamp, referência da asserção).

## Recursos oficiais

- Serviço de autenticação (doc técnica): https://github.com/amagovpt/doc-AUTENTICACAO
  e https://amagovpt.github.io/doc-AUTENTICACAO/
- Middleware / Cartão de Cidadão + CMD: https://github.com/amagovpt/autenticacao.gov
- Guia de integração (Mosaico): https://guias.mosaico.gov.pt/guias-praticos/integrar-com-o-servico-de-autenticacao/
- Manual de Integração do Fornecedor de Autenticação (PDF, autenticacao.gov.pt).
- SDKs disponíveis: C, C++, Java, C#.

## Como isto encaixa no código (design)

- A tabela `kyc_submissions` terá um campo **`verification_method`** (`document`
  agora, `cmd` no futuro). O caminho `cmd` regista metadados de verificação e não
  cria linhas em `kyc_documents`.
- O caminho `document` (esta Fatia 2) e o caminho `cmd` (futuro) coexistem: PT pode
  migrar para `cmd` quando o acesso AMA existir, estrangeiros mantêm `document`.
- Assim a integração real "encaixa" sem migração dolorosa nem reescrita do modelo.
