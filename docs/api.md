# Referência da API — `mb-cliente`

> ⚠️ **Documentação não oficial, mantida pela comunidade, sem afiliação com a MultBovinos.** O comportamento da API de Integração MultBovinos (MBWEB) pode mudar sem aviso. Os status abaixo refletem o que foi observado em uso real até outubro de 2026; confira sempre no seu próprio ambiente antes de depender de um endpoint.

`mb-cliente` é um cliente Node.js **não oficial** para a API de Integração MultBovinos, distribuído sob a licença **AGPL-3.0-only**. Requer **Node.js 22+** e é **só ESM**.

Este documento tem duas partes:

- **Protocolo HTTP** ([seção 3](#3-protocolo-http)): como a API funciona por baixo — útil para quem usa o cliente e para quem fala com a API diretamente (curl, outra linguagem).
- **Referência do cliente** (seções 4 em diante): cada namespace (`bi.*`, `erp.*`, `raw`, helpers), com parâmetros, retorno e status de cada endpoint.

## Sumário

1. [Legenda de status](#1-legenda-de-status)
2. [Ambientes](#2-ambientes)
3. [Protocolo HTTP](#3-protocolo-http)
   - [3.1 Autenticação](#31-autenticação)
   - [3.2 Cabeçalhos](#32-cabeçalhos)
   - [3.3 Seleção de fazenda](#33-seleção-de-fazenda)
   - [3.4 Escopo: por contrato × por propriedade](#34-escopo-por-contrato--por-propriedade)
   - [3.5 Envelopes de resposta](#35-envelopes-de-resposta)
   - [3.6 Paginação do grid ERP](#36-paginação-do-grid-erp)
   - [3.7 Filtros de data](#37-filtros-de-data)
   - [3.8 Formatos BR](#38-formatos-br)
   - [3.9 Limite de requisições explícito e silencioso](#39-limite-de-requisições-explícito-e-silencioso)
   - [3.10 Códigos de resposta e erros](#310-códigos-de-resposta-e-erros)
   - [3.11 Limites de tempo](#311-limites-de-tempo)
   - [3.12 Eventos de diagnóstico](#312-eventos-de-diagnóstico)
4. [Início rápido](#4-início-rápido)
5. [Cliente e sessão](#5-cliente-e-sessão)
6. [Fila de fazenda](#6-fila-de-fazenda)
7. [Paginação](#7-paginação)
8. [Parse do formato BR](#8-parse-do-formato-br)
9. [Tipos comuns](#9-tipos-comuns)
10. [BI: leitura analítica](#10-bi-leitura-analítica)
11. [ERP: cadastros](#11-erp-cadastros)
12. [ERP: animais](#12-erp-animais)
13. [ERP: sanitário](#13-erp-sanitário)
14. [ERP: estoque](#14-erp-estoque)
15. [ERP: custos](#15-erp-custos)
16. [ERP: auditoria e replicação](#16-erp-auditoria-e-replicação)
17. [ERP: financeiro](#17-erp-financeiro)
18. [ERP: reprodução e genética](#18-erp-reprodução-e-genética)
19. [ERP: outros](#19-erp-outros)
20. [Acesso cru (raw)](#20-acesso-cru-raw)
21. [Helpers](#21-helpers)
22. [Erros](#22-erros)
23. [Constantes e subpaths](#23-constantes-e-subpaths)
24. [Endpoints adicionais sem método dedicado](#24-endpoints-adicionais-sem-método-dedicado)
25. [Matriz de viabilidade](#25-matriz-de-viabilidade)

- [25.1 Escopo e filtro de cada endpoint (registro)](#251-escopo-e-filtro-de-cada-endpoint-registro)

26. [Pegadinhas](#26-pegadinhas)

---

## 1. Legenda de status

| Símbolo | Significado                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Funcional — responde em tempo hábil, com dados reais.                                                                                                                   |
| ⚠️      | Funcional, com uma ressalva importante (filtro ignorado, campo zerado, escopo, desempenho). Leia a nota.                                                                |
| 🔕      | Rota real e confirmada, mas devolveu **0 registros** quando verificada — em geral porque o módulo não está em uso na conta. Pode ter dados na sua conta. Não é defeito. |
| ❌      | Inviável — não responde, HTTP 500 ou timeout permanente. No cliente, o método lança `EndpointUnavailableError` sem chamar a rede.                                       |

"Endpoint adicional, fora do manual oficial" indica uma rota que existe na API mas não aparece na documentação publicada pela MultBovinos.

---

## 2. Ambientes

| Ambiente | URL base                                 |
| -------- | ---------------------------------------- |
| Produção | `https://www.multbovinos.com/servicos`   |
| Teste    | `https://teste.multbovinos.com/servicos` |

Duas famílias de endpoints partem da mesma base:

- **BI** → `…/servicos/integracaobi/<slug>` — leitura analítica em massa, envelope `{ dados: [...] }`.
- **ERP** ("por serviços") → `…/servicos/<slug>/` — cadastros e transações, envelope de **grid paginado**.

No cliente: `new MultBovinos({ env: 'production' | 'test' })` (padrão `'production'`). Qualquer outro valor lança `Error` ("Ambiente desconhecido").

---

## 3. Protocolo HTTP

### 3.1 Autenticação

Toda requisição exige um token JWT obtido no login.

**`POST /login-integracao/`**

- Cabeçalhos: `Content-Type: application/json`, `Dispositivo: 8`. Sem `Authorization`.
- Corpo: `{ "email": "<usuário de integração>", "password": "<senha>" }`.
- Retorno: objeto com `token`, dados do usuário e a lista de fazendas da conta (campo `fazendas`; algumas versões usam `propriedades`), cada uma com `propriedade_id` (ou `id`), `nome` e `cnpj`.

Nas requisições seguintes, o token vai no cabeçalho `Authorization`, **prefixado com `JWT ` (com espaço)**:

```
Authorization: JWT eyJhbGciOiJI...
```

```bash
curl -s -X POST 'https://www.multbovinos.com/servicos/login-integracao/' \
  -H 'Content-Type: application/json' -H 'Dispositivo: 8' \
  -d '{"email":"'"$MB_EMAIL"'","password":"'"$MB_PASS"'"}'
# → { "token": "eyJ...", "fazendas": [{ "propriedade_id": 1, "nome": "...", "cnpj": "..." }, ...] }
```

Credencial errada pode voltar como 401, 400 ou 403. Um 200 sem `token` não é um login válido.

Nunca grave a senha em arquivo versionado: leia de variável de ambiente ou de um cofre de segredos.

### 3.2 Cabeçalhos

| Cabeçalho       | Quando                              | Valor                     |
| --------------- | ----------------------------------- | ------------------------- |
| `Authorization` | Toda requisição depois do login     | `JWT <token>`             |
| `Dispositivo`   | Toda requisição, inclusive o login  | `8` (sinaliza integração) |
| `Content-Type`  | Só quando há corpo (POST/PUT/PATCH) | `application/json`        |

### 3.3 Seleção de fazenda

**`POST /usuario/<propriedade_id>/selecione-propriedade/?format=json`**

- Sem corpo. Cabeçalhos `Authorization` e `Dispositivo`.
- Resposta: `{ "dados": true }` (HTTP 200).
- `<propriedade_id>` vem da lista de fazendas do login.

```bash
curl -s -X POST 'https://www.multbovinos.com/servicos/usuario/1/selecione-propriedade/?format=json' \
  -H 'Authorization: JWT '"$TOKEN" -H 'Dispositivo: 8'
```

Pontos importantes:

- O caminho é `selecione-propriedade`. A grafia `definir-propriedade` responde **404**.
- A seleção é **estado do servidor, por usuário**: vale para todas as sessões do mesmo usuário. Se dois processos usam a mesma credencial em fazendas diferentes ao mesmo tempo, um muda a fazenda do outro.
- Cada login zera a seleção.
- **Regra prática:** selecione uma fazenda logo depois do login, antes de consultar qualquer endpoint. Endpoints por propriedade (cadastro de animais, `custoporanimal/*`, saldo biológico) exigem a seleção; sem ela, podem responder 404 ou devolver a fazenda que ficou selecionada por outra sessão. Para varrer todas as fazendas, selecione uma de cada vez.

### 3.4 Escopo: por contrato × por propriedade

- **Por contrato:** devolve a base inteira da conta, independente da fazenda selecionada (ex.: cadastros do BI, cadastros do ERP).
- **Por propriedade:** devolve só a fazenda selecionada (ex.: `bi.animais`, `bi.movEstoque`, `bi.movMateriais`, custos, busca por id de confinamento e de movimentação de material).

O escopo de cada endpoint está indicado na referência. Há exceções documentadas, como `getMedicoesPesagem`, em que a seleção **não** restringe o resultado.

No cliente, o escopo de cada grid do ERP fica num registro, que decide o que a opção `propertyId` faz (seleciona a fazenda, recusa com `ValidationError` ou marca o resultado como não verificado): ver a [seção 25.1](#251-escopo-e-filtro-de-cada-endpoint-registro) e a [seção 6](#6-fila-de-fazenda).

### 3.5 Envelopes de resposta

**BI** — objeto com a chave `dados` (ausente quando não há registros):

```json
{ "dados": [{ "campo": "valor" }] }
```

**ERP** — grid paginado:

```json
{
  "links": { "next": "...?page=2", "previous": null },
  "columns": [],
  "count": 42,
  "results": [{}],
  "filters": {},
  "modelo": "venda"
}
```

Leia `results` (linhas da página) e `count` (total no servidor). `links.next` indica se há próxima página. O campo `filters` **declara os filtros que o servidor aceita de verdade** (nome e tipo) — consulte-o antes de concluir que um endpoint "não filtra". No cliente, `filters` e `modelo` vêm no resultado de cada página (`ErpPageResult`).

**Busca por id** (`GET /<slug>/<id>/?format=json`) — o registro como objeto JSON, sem envelope de grid. O formato dos campos varia por endpoint (ISO em uns, BR em outros).

### 3.6 Paginação do grid ERP

- Parâmetro `?page=N` (começa em 1).
- **10 registros por página, fixo** — não há parâmetro de tamanho de página.
- Cada página leva de alguns segundos a vários segundos; endpoints de cálculo (sobra de cocho) levam minutos por página.
- Para volumes grandes, filtre por data (onde o filtro funciona) e consuma em blocos espaçados.
- Uma página fora do intervalo pode voltar como `{ "detail": "Página inválida." }` **com HTTP 200**.

O BI não pagina: devolve o conjunto inteiro de uma vez. O volume é controlado por janela de data, quando o endpoint aceita.

### 3.7 Filtros de data

| API      | Parâmetros                 | Formato      | Observação                                                                                                                                                                       |
| -------- | -------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BI       | `data_inicio` / `data_fim` | `YYYY-MM-DD` | Obrigatórios em alguns endpoints (`movMateriais`, `suplementacao`, `producaoRacao`).                                                                                             |
| ERP grid | `data_0` / `data_1`        | `YYYY-MM-DD` | Opcionais. Alguns grids usam outro nome (ex.: `movimentacao_material__data_0/_1`, `periodo_0/_1`) e **ignoram** `data_0/_1` em silêncio. Outros ignoram qualquer filtro de data. |

O cliente traduz `from`/`to` para o nome certo de cada grid e lança `ValidationError` nos grids cujo filtro de data a API ignora (ver [seção 7](#7-paginação)).

### 3.8 Formatos BR

- **ERP grid:** números como string BR (`"1.234,56"`, `"12,5"`, `"-1,5"`), datas `DD/MM/YYYY`.
- **BI:** em geral tipos nativos e datas `YYYY-MM-DD`, com exceções anotadas (ex.: `producaoRacao.data` em `DD/MM/YYYY`; números da formulação como string).

O cliente converte as páginas de grid automaticamente ([seção 8](#8-parse-do-formato-br)). BI, busca por id e `raw` voltam como vieram.

### 3.9 Limite de requisições explícito e silencioso

O grid ERP limita requisições em sequência rápida, de duas formas:

1. **Explícito:** `{ "detail": "..." }` com **HTTP 200**, e `detail` como **única** chave do objeto (formato do Django REST Framework). Aparece tipicamente depois de algumas dezenas de páginas numa única rajada.
   - O mesmo formato `{ detail }` aparece em erros reais (404 de slug errado, 403, 405), mas sempre com o status HTTP correspondente. Só `200` é limite de requisições.
   - `detail` igual a "Página inválida." / "Invalid page." com 200 é erro de paginação, não limite de requisições.
   - Uma resposta com `detail` **e outros campos** é dado legítimo.
2. **Silencioso:** **HTTP 200 com corpo vazio** (`count: 0`, `results: []`, sem `detail`) — indistinguível de "não há dados". Já foi visto afetar o endpoint inteiro (até a página 1 sem filtro) depois de uso intenso. Recupera sozinho depois de minutos a horas.

**Regra obrigatória para quem espelha dados localmente:** nunca apague os dados locais antes de ter o que repor. Uma resposta vazia pode ser o limite silencioso de requisições; só substitua os dados quando a coleta voltou **completa e não vazia**, numa única transação. O helper [`safeImport`](#safeimport-fetch-replace-onratelimit-) implementa essa regra.

**Operação segura:** blocos pequenos (da ordem de 100 a 200 páginas), espaçados no tempo (por exemplo, a cada 15 minutos). Não rode testes em laço apertado contra endpoints grandes (`vacinacao`, `tratamentoanimal`, `tratos`): isso satura o limite da conta inteira.

### 3.10 Códigos de resposta e erros

| Resposta                                                         | Significado                                                             | No cliente                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 200 com dados                                                    | Sucesso                                                                 | Retorno normal                                                   |
| 200 com `{ detail }` (só essa chave)                             | Limite explícito de requisições                                         | `RateLimitError`                                                 |
| 200 com `{ detail: "Página inválida." }`                         | Página fora do intervalo                                                | `InvalidPageError`                                               |
| 200 com `count: 0` e `results: []` (GET)                         | Vazio legítimo **ou** limite silencioso de requisições                  | `EmptyResponseError` (ou página vazia com `allowEmpty`)          |
| 2xx com corpo não-JSON (ex.: HTML de proxy) ou GET 2xx sem corpo | Resposta inválida                                                       | `InvalidResponseError`                                           |
| 204, ou escrita 2xx sem corpo                                    | Sucesso sem conteúdo                                                    | `null`                                                           |
| 401                                                              | Token inválido ou vencido                                               | Relogin automático e uma nova tentativa; se repetir, `AuthError` |
| 400/403 no login                                                 | Credencial recusada                                                     | `AuthError`                                                      |
| 404                                                              | Slug errado, ou registro de outra fazenda / inexistente na busca por id | `NotFoundError` (subclasse de `ClientError`)                     |
| Outros 4xx (403, 405…)                                           | Erro de requisição                                                      | `ClientError`                                                    |
| 5xx                                                              | Erro do servidor                                                        | `ServerError`                                                    |
| Sem resposta (DNS, conexão, TLS)                                 | Falha de transporte                                                     | `NetworkError`                                                   |
| Prazo estourado                                                  | Timeout                                                                 | `TimeoutError`                                                   |

### 3.11 Limites de tempo

- O cliente usa `timeoutMs: 90000` por padrão, cobrindo a requisição **e a leitura do corpo**.
- Endpoints de cálculo (`erp.custos.*`, `getSobraCocho`) podem levar minutos: o cliente já usa **300 s** como prazo padrão neles (nos custos, fixo nos métodos; na sobra de cocho, pelo registro do endpoint). Vale o `timeoutMs` da instância quando ele for maior. Consuma-os fora do caminho de uma requisição de interface.
- Quase todo método aceita `timeoutMs` **por chamada**, que troca o prazo só naquela chamada: grids do ERP (inclusive `fetchAll`/`iter*` e `mb.erp.fetchPage`/`pages`/`collect`), BI, custos, relatório de Gestão Nutricional e `mb.raw`.
- Algo entre o cliente e o servidor derruba conexões por volta de **300 s**. Endpoints que não respondem dentro disso (a pesagem e a movimentação extra do BI) ficam de fora do cliente: aumentar o timeout não resolve.

### 3.12 Eventos de diagnóstico

O cliente não tem interceptador. Para métricas e log, ele publica eventos só de leitura nos canais do `node:diagnostics_channel` (`diagnostics_channel.subscribe('mb-cliente:request', fn)`):

| Canal                        | Quando                                                     | Mensagem                                                     |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `mb-cliente:request`         | Cada tentativa de cada requisição, ao terminar             | `{ method, path, page, status, error, attempt, durationMs }` |
| `mb-cliente:retry`           | Antes da espera de uma nova tentativa (`retry`, só GET)    | `{ method, path, page, attempt, nextAttempt, delayMs }`      |
| `mb-cliente:relogin`         | Ao fim de cada relogin (o automático do 401 e `relogin()`) | `{ ok, error, propertyId, durationMs }`                      |
| `mb-cliente:property-switch` | Cada seleção de fazenda confirmada pelo servidor           | `{ from, to, restore, generation }`                          |
| `mb-cliente:empty-response`  | Resposta vazia de grid, antes do `EmptyResponseError`      | `{ method, path, page }`                                     |

- `path` é o caminho sem a query string (ex.: `'/tratos/'`); `page` é a página do grid, quando houver.
- `status: null` quando não houve resposta; aí `error` traz só o nome do motivo (`'TimeoutError'`, `'AbortError'`, `'TypeError'` da falha de rede).
- `restore: true` é a reseleção do relogin, que não conta como troca (`generation` não muda).
- Nenhum evento leva token, senha, corpo, cabeçalho nem query string.
- Sem assinante, nada é montado e o comportamento do cliente é o mesmo. Uma exceção dentro do assinante não chega a quem chamou: o Node a relata como exceção não capturada. Mantenha o assinante simples.

---

## 4. Início rápido

```js
import { MultBovinos, EmptyResponseError } from 'mb-cliente'

const mb = new MultBovinos({
  email: process.env.MB_EMAIL,
  password: process.env.MB_PASS,
})

const { properties } = await mb.connect()
await mb.selectProperty(properties[0].id)

// BI por fazenda: com propertyId, seleciona e consulta na mesma seção
const animais = await mb.bi.animais.get({ propertyId: properties[0].id })
console.log(animais.count)

// ERP: uma página de grid, já convertida do formato BR
const page = await mb.erp.cadastros.getMateriais({ page: 1 })
console.log(page.items, page.hasMore)

// ERP: todas as páginas de uma janela, com iterador assíncrono
try {
  for await (const { items, page } of mb.erp.estoque.iterTratos({
    from: '2026-10-01',
    to: '2026-10-07',
  })) {
    console.log(page, items.length)
  }
} catch (err) {
  if (err instanceof EmptyResponseError)
    console.warn('possível limite de requisições na página', err.page)
  else throw err
}
```

---

## 5. Cliente e sessão

### `new MultBovinos(options)`

| Opção        | Tipo                        | Obrigatório | Descrição                                                                                                                       |
| ------------ | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `email`      | `string`                    | ✅          | Usuário de integração.                                                                                                          |
| `password`   | `string`                    | ✅          | Senha. Nunca em arquivo versionado.                                                                                             |
| `env`        | `'production' \| 'test'`    | —           | Padrão `'production'`. Outro valor lança `Error`.                                                                               |
| `timeoutMs`  | `number`                    | —           | Prazo por requisição, corpo incluído. Padrão `90000`. Não positivo → `ValidationError`.                                         |
| `token`      | `string`                    | —           | Token de uma sessão anterior (ambiente sem servidor, evita novo login).                                                         |
| `properties` | `Property[]`                | —           | Fazendas de uma sessão anterior (restaura sem `connect()`).                                                                     |
| `retry`      | `{ attempts?, backoffMs? }` | —           | Padrão `attempts: 1` (sem nova tentativa), `backoffMs: 500`. `attempts` inteiro ≥ 1 e `backoffMs` ≥ 0, senão `ValidationError`. |
| `signal`     | `AbortSignal`               | —           | Cancela todas as requisições da instância.                                                                                      |

**Novas tentativas:** só em **GET** (idempotente) e só em **falha de transporte** (o `fetch` rejeita sem resposta). Nunca em timeout, nunca em POST/PUT/PATCH/DELETE e nunca em respostas HTTP válidas (`RateLimitError`, `EmptyResponseError`). Espera `backoffMs * 2^(tentativa-1)` entre tentativas; a espera é interrompida pelo `signal`.

**Cancelamento:** o erro lançado é o `reason` do signal (por padrão um `DOMException` "AbortError"), como no `fetch` nativo — nunca `TimeoutError`.

### `connect()`

Autentica e devolve `Promise<ConnectResult>` — `{ token, properties }`. Começa uma **sessão nova, sem fazenda selecionada**. Se havia uma fazenda selecionada, isso conta como troca: paginações em andamento são interrompidas com `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`). Para reconectar no meio de uma sessão, use [`relogin()`](#relogin).

**Lança:** `AuthError` (credencial recusada, login sem token).

### `relogin()`

Reconecta **sem perder a fazenda**: faz um novo login e reseleciona a fazenda desejada da instância (inclusive uma troca que estava em andamento). A reseleção não conta como troca, então paginações em andamento continuam. Devolve `Promise<ConnectResult>`, como `connect()`. Chamadas concorrentes compartilham o mesmo relogin.

É o mesmo mecanismo do [relogin automático](#relogin-automático) em HTTP 401, disparado por quem chama — por exemplo, depois de uma queda longa de conexão.

**Lança:** `AuthError` (credencial recusada, login sem token) e os erros da reseleção da fazenda.

### `selectProperty(propertyId)`

Seleciona a fazenda no servidor. Entra na [fila de fazenda](#6-fila-de-fazenda) como operação exclusiva.

| Parâmetro    | Tipo     | Obrigatório | Descrição                                                  |
| ------------ | -------- | ----------- | ---------------------------------------------------------- |
| `propertyId` | `number` | ✅          | Precisa estar na lista de `connect()` / `getProperties()`. |

**Lança:** `PropertyNotSelectedError` (`propertyId`, `availableIds`) se o id não estiver na lista.

### `getToken()` / `getProperties()`

Métodos síncronos de leitura para guardar a sessão fora do processo (ex.: ambiente sem servidor). Devolvem `string | null` e `Property[]`.

```js
// primeira invocação
const { token, properties } = await mb.connect()
// próxima invocação
const mb2 = new MultBovinos({ email, password, token, properties })
```

### `forAllProperties(callback, propertyIds?)`

Percorre as fazendas **em sequência**: seleciona cada uma e chama `callback(propertyId, property)` numa seção exclusiva. Chamadas por fazenda feitas dentro do callback usam a fazenda da vez, sem travar.

| Parâmetro     | Tipo                                          | Obrigatório | Descrição                           |
| ------------- | --------------------------------------------- | ----------- | ----------------------------------- |
| `callback`    | `(propertyId, property) => Promise<object[]>` | ✅          | Deve devolver um array.             |
| `propertyIds` | `number[]`                                    | —           | Padrão: todas as fazendas do login. |

**Retorno:** `Promise<Array<object & { _propertyId: number }>>` — cada item ganha `_propertyId`. Ao final, a fazenda selecionada é a última da lista.

```js
const sup = await mb.forAllProperties(
  async () => (await mb.bi.suplementacao.get({ from: '2026-10-01', to: '2026-10-31' })).items
)
```

### `mb.bi` / `mb.erp` / `mb.raw`

Propriedades de leitura dos namespaces — ver seções 10 a 20.

### Relogin automático

Um 401 numa requisição autenticada dispara um novo login, a **reseleção da fazenda desejada** e uma única repetição da chamada. Chamadas concorrentes que recebem 401 compartilham o mesmo relogin (sem rajada de logins). Se o 401 se repetir, vira `AuthError`. A reseleção não conta como troca de fazenda: paginações em andamento seguem. Para disparar o mesmo processo por conta própria, use [`relogin()`](#relogin).

---

## 6. Fila de fazenda

Como a fazenda selecionada é estado do servidor, uma troca no meio de uma leitura faria a leitura devolver dados de outra fazenda. Cada instância de `MultBovinos` tem uma fila do tipo leitores/escritor:

- **Exclusiva** (roda sozinha): `connect()`, `selectProperty()`, `forAllProperties()`, `bi.animais.getAll()`, `bi.movEstoque.getAll()`, os `get()` do BI chamados **com** `propertyId`, os `erp.custos.*` com `propertyId`, `getRelatorioGestaoNutricionalLote()`, `reprocessRelatorioGestaoNutricionalLinha()` e `reprocessRelatorioGestaoNutricionalLote()` (sempre) e a página de grid ERP com um `propertyId` **diferente** da fazenda selecionada (seleção e leitura na mesma seção).
- **Compartilhada** (várias juntas, nunca junto de uma exclusiva): cada página de grid ERP sem `propertyId` ou com o `propertyId` da fazenda já selecionada, os `get()` do BI **sem** `propertyId` e os custos sem `propertyId`.
- A ordem de chegada é respeitada: uma leitura não ultrapassa uma troca que já está esperando.
- **Reentrante:** dentro de uma seção exclusiva (ex.: o callback de `forAllProperties`), qualquer chamada roda direto.
- **Sem troca dentro de uma seção:** `selectProperty()` ou um `propertyId` de **outra** fazenda pedidos dentro de uma seção exclusiva (o callback de `forAllProperties` ou de `getAll`) lançam `ValidationError` (`field: 'propertyId'`) antes de qualquer chamada: a troca mudaria a fazenda no meio da operação de fora. A mesma fazenda da seção continua valendo.

Garantias:

- `bi.animais.get()`, `bi.movEstoque.get()`, `bi.movMateriais.get()`, `bi.suplementacao.get()` e `bi.producaoRacao.get()` **sem** `propertyId` e sem fazenda selecionada lançam `PropertyNotSelectedError` (com `endpoint`), em vez de devolver a fazenda que outra sessão deixou selecionada.
- Os grids ERP sabidamente por fazenda (escopo "por fazenda" na [seção 25.1](#251-escopo-e-filtro-de-cada-endpoint-registro)) chamados **sem** `propertyId` e sem fazenda selecionada também lançam `PropertyNotSelectedError` (com `endpoint`).
- Uma paginação (`iter*`, `get*` com `fetchAll`, `paginate`, `mb.erp.pages`/`collect`) que vê a fazenda mudar entre duas páginas lança `PropertyNotSelectedError` com `reason: 'changed_during_pagination'`. A página da outra fazenda é requisitada, mas nunca entregue.

Limite: a fila protege só **dentro de uma instância**. Outra instância, outro processo ou outra máquina com o mesmo usuário pode mudar a fazenda no servidor sem que o cliente saiba. Não rode duas sessões do mesmo usuário em fazendas diferentes ao mesmo tempo.

**Conferência pelo registro (`verifyRecordProperty`, padrão `true`):** nos grids por fazenda cujo registro traz a fazenda (coluna "campo de fazenda" da [seção 25.1](#251-escopo-e-filtro-de-cada-endpoint-registro)), cada página é conferida com a fazenda com que foi lida. Um registro de outra fazenda lança `PropertyNotSelectedError` com `reason: 'changed_by_another_session'`, `propertyId` (a esperada) e `received` (a do registro). É o único sinal de que outra sessão trocou a fazenda. Nos grids sem esse campo não há conferência possível: a única garantia continua sendo não rodar dois processos com a mesma conta. Desligue com `new MultBovinos({ verifyRecordProperty: false })`.

### `propertyId` nos grids do ERP

Os métodos de página única do ERP, os `fetchAll` (`getVacinacoes`/`getTratamentos`/`getTratos`), os `iter*` e `mb.erp.fetchPage`/`pages`/`collect` aceitam `propertyId`. O efeito depende do escopo do endpoint no registro ([seção 25.1](#251-escopo-e-filtro-de-cada-endpoint-registro)):

| Escopo                                        | Com `propertyId`                                                                                                                                                  | Sem `propertyId`                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| por fazenda                                   | Seleciona a fazenda. Já selecionada: leitura compartilhada. Outra: seleção e leitura na mesma seção exclusiva. Depois, a fazenda selecionada é a do `propertyId`. | Exige fazenda selecionada; sem ela, `PropertyNotSelectedError`. |
| conta inteira, global ou vaza outras fazendas | `ValidationError` (`field: 'propertyId'`): a seleção não filtraria o resultado.                                                                                   | Lê normalmente.                                                 |
| desconhecido                                  | Seleciona como acima, e o resultado (página, `fetchAll` ou `collect`) vem com `scope: 'unverified'`.                                                              | Lê a fazenda que estiver selecionada.                           |

- `propertyId` precisa ser inteiro positivo (`ValidationError`) e estar na lista do login (`PropertyNotSelectedError` com `propertyId` e `availableIds`, como `selectProperty()`).
- Numa coleta com `propertyId`, só a primeira página pode trocar a fazenda; as seguintes já a encontram selecionada e rodam como leitura compartilhada. Uma troca feita por outra operação no meio da coleta lança `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`).
- As buscas por id (`get*ById`) não recebem `propertyId`: usam a fazenda selecionada na sessão. Um registro de outra fazenda responde `NotFoundError`.

---

## 7. Paginação

### Métodos de página única

A maioria dos `erp.*.get*()` busca **uma** página e devolve [`ErpPageResult`](#erppageresultt). Opções aceitas ([`FetchPageOptions`](#fetchpageoptions)): `page`, `from`, `to`, `extraParams`, `allowEmpty`, `signal`, `propertyId`, `timeoutMs` e `dateParam`.

- **Opção desconhecida lança `ValidationError`.** Filtros do servidor vão em `extraParams` (ex.: `getContatos({ extraParams: { nome: 'x' } })`).
- **`from`/`to` nos grids que ignoram data lança `ValidationError`:** `saida` (`getSaidas`), `gta` (`getGtas`), `historicomovimentacaolocalizacaoconfinamento` (`getHistoricoMovimentacaoConfinamento`), `medicoespesagem` (`getMedicoesPesagem`), `inventarioanimais` (`getInventariosAnimais`) e `movimentacaomaterialitem` (`getMovimentacaoMaterialItens`). Pagine o conjunto inteiro e filtre no cliente.
- **`propertyId`** lê a página com essa fazenda selecionada, conforme o escopo do endpoint ([seção 6](#propertyid-nos-grids-do-erp)).
- **`timeoutMs`** troca o prazo só desta página. Padrão: o sugerido pelo registro do endpoint (sobra de cocho: 300 s) ou o da instância.
- **`dateParam`** troca o nome do filtro de data no servidor (`from`/`to` viram `${dateParam}_0`/`_1`). O padrão vem do registro: `data` na maioria dos grids, o nome próprio onde o servidor usa outro (ex.: `movimentacao_material__data` em `tratositem`). Útil para testar um grid cujo filtro ainda não foi verificado.
- `extraParams.page` nunca sobrescreve o `page` explícito.
- Além dos itens, o resultado traz `filters` (a declaração de filtros que o servidor manda junto, com nome e tipo) e `modelo` (o nome do modelo no servidor), ou `null` quando não vierem.

### `allowEmpty`

- **Nenhum método liga `allowEmpty` sozinho.** É escolha de quem chama, para quando você sabe que o vazio é esperado na sua conta (ex.: módulos 🔕).
- Com `allowEmpty: true`, uma página vazia volta como `{ items: [], count: 0, hasMore: false, nextPage: null, possiblyRateLimited: true, reason: 'possibly_rate_limited' }` em vez de lançar `EmptyResponseError`.
- Na paginação, `allowEmpty` vale **só para a primeira página**. Uma resposta vazia depois que o servidor anunciou mais páginas sempre lança `EmptyResponseError` (com `page`, para retomar dali).

### Coleta inteira: `getVacinacoes` / `getTratamentos` / `getTratos`

Percorrem todas as páginas e chamam `onPage(items, pageNum)` a cada lote ([`FetchAllOptions`](#fetchalloptions--fetchallresult)). `onPage` devolvendo `false` interrompe. `delayMs` espaça as páginas e é **0 por padrão**: o cliente não espaça chamadas por conta própria, quem consome decide a pausa.

O resultado traz `complete`: **`true` só quando o servidor disse que não havia mais páginas**. Com `maxPages` ou `onPage` interrompendo, `complete` é `false` e `nextPage` diz de onde retomar. Confira `complete` antes de tratar a coleta como inteira. Com `propertyId` num endpoint de escopo desconhecido, o resultado traz também `scope: 'unverified'`.

### Iteradores: `iterVacinacoes` / `iterTratamentos` / `iterTratos`

As mesmas opções (sem `onPage`), como `AsyncGenerator<ErpPage>`. Cada passo traz o `ErpPageResult` mais `page`. `delayMs` padrão 0.

```js
for await (const { items, page, hasMore } of mb.erp.sanitario.iterVacinacoes({
  from: '2026-10-01',
  to: '2026-10-31',
  maxPages: 150,
})) {
  await gravar(items)
}
```

### `paginate(fetchPage, params?)`

Itera qualquer método de página única:

```js
import { paginate } from 'mb-cliente'

for await (const { items, page } of paginate((p) => mb.erp.cadastros.getMateriais(p), {
  maxPages: 20,
})) {
  console.log(page, items.length)
}
```

| Parâmetro    | Padrão     | Descrição                                               |
| ------------ | ---------- | ------------------------------------------------------- |
| `page`       | `1`        | Página inicial (inteiro ≥ 1).                           |
| `maxPages`   | sem limite | Inteiro ≥ 1.                                            |
| `delayMs`    | `0`        | Espera entre páginas (≥ 0), interrompida pelo `signal`. |
| `allowEmpty` | —          | Repassado só na primeira página.                        |
| `signal`     | —          | Repassado a cada página.                                |
| demais       | —          | Repassados ao método (`from`, `to`, `extraParams`).     |

Termina quando não há próxima página, em `maxPages` ou num `break`. Lança `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`) se a fazenda mudar entre páginas.

### Qualquer grid pelo slug: `mb.erp.fetchPage` / `pages` / `collect`

Acesso genérico a qualquer grid do ERP pelo **slug** (o nome do recurso, sem barras nem query string, ex.: `'tratos'`), inclusive os que não têm método dedicado. Mesmo parse BR, mesma fila de fazenda, mesmo registro (filtro de data, escopo, prazo) e mesmas guardas dos métodos dedicados.

| Método                         | Opções                                                                         | Retorno                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `mb.erp.fetchPage(slug, opts)` | As de [`FetchPageOptions`](#fetchpageoptions).                                 | `Promise<ErpPageResult>` — uma página.                                                                                           |
| `mb.erp.pages(slug, opts)`     | As de página (sem `page`) mais `startPage`, `maxPages` e `delayMs` (padrão 0). | `AsyncGenerator<ErpPage>` — como os `iter*`.                                                                                     |
| `mb.erp.collect(slug, opts)`   | As mesmas de `pages`.                                                          | `Promise<CollectResult>` — `{ items, pagesRead, complete, nextPage, possiblyRateLimited, scope? }`, todas as páginas em memória. |

```js
const page = await mb.erp.fetchPage('tipoanimal', { page: 1 })

for await (const { items, page } of mb.erp.pages('tratos', { propertyId: 1, from, to })) {
  await gravar(items)
}

const { items, complete, nextPage } = await mb.erp.collect('morte', {
  propertyId: 1,
  from: '2026-10-01',
  to: '2026-10-31',
  maxPages: 50,
})
```

**Lança:** `ValidationError` com slug que não seja só letras minúsculas, dígitos, `_` e `-` (`field: 'slug'`), além dos erros dos métodos dedicados (opção desconhecida, `from`/`to` num grid que ignora data, `propertyId` num endpoint que não é por fazenda).

`collect` usa o helper [`collectPages`](#collectpagespages), que serve também para juntar `paginate()` e os `iter*`.

---

## 8. Parse do formato BR

As páginas de grid ERP passam por `parseErpPage` automaticamente. As regras:

- **Número:** só vira número a string com pontuação BR — vírgula decimal (`"12,5"`, `"1.234,56"`) ou separador de milhar (`"1.045"`). Negativos (`"-1,5"`, `"-1.234,56"`) também.
- **Inteiro sem pontuação fica string:** `"045"`, `"01"` e `"1045"` não são convertidos (preserva brincos, currais e códigos com zero à esquerda).
- **Data:** `DD/MM/YYYY` vira `YYYY-MM-DD` **só se a data existe** no calendário. `"31/02/2026"` e `"29/02/2025"` ficam como vieram.
- **Campos protegidos, nunca convertidos:** nomes terminados em `_texto` ou `_usual`, e os campos `identificacao`, `sisbov`, `codigo`, `documento`, `cpf`, `cnpj`, `cep`, `telefone`, `celular` e `ordem_servico`.
- Objetos e arrays aninhados são percorridos recursivamente.
- **Data e hora** (`"08/03/2026 14:05"`, como em tratos e movimentações) **não é convertida automaticamente**: o formato com hora varia por endpoint. Use `parseBrDateTime` quando precisar.
- **HTML no lugar de número:** em alguns registros de tratos (`getTratos`) e itens de trato (`getTratosItens`), os campos `quantidade_decimal`, `valor_total`, `peso_balanca`, `peso_balanca_final` e `valor_unitario` podem vir com um trecho de HTML em vez do número. O parse deixa esse texto como veio; trate o valor como ausente.

Não passam pelo parse: respostas do BI, métodos de busca por id (`get*ById`), relatórios e custos, e `mb.raw`. Para converter por conta própria, use `mb-cliente/parsers`:

| Função                         | Descrição                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parseBrNumber(value)`         | Número BR → `number`; qualquer outra coisa volta igual.                                                                                                                                                      |
| `parseBrDate(value)`           | `DD/MM/YYYY` existente → `YYYY-MM-DD`; qualquer outra coisa volta igual.                                                                                                                                     |
| `parseBrDateTime(value)`       | `"08/03/2026 14:05"` → `"2026-03-08 14:05"` (os segundos ficam, se vierem). Hora local do servidor, sem fuso. Data ou hora inexistente e qualquer outra coisa voltam iguais. Não é aplicado automaticamente. |
| `parseErpRecord(record, key?)` | Aplica as regras acima a um registro (recursivo).                                                                                                                                                            |
| `parseErpPage(page)`           | Aplica `parseErpRecord` a `page.results`.                                                                                                                                                                    |
| `countCalendarDays(from, to)`  | Dias corridos inclusivos (`'2026-01-01'` → `'2026-01-31'` = 31). Data fora de `YYYY-MM-DD` ou inexistente lança `ValidationError`.                                                                           |

---

## 9. Tipos comuns

### `Property`

```ts
{ id: number, nome: string, cnpj: string | null }
```

### `ConnectResult`

```ts
{ token: string, properties: Property[] }
```

### `BiResult<T>`

```ts
{ items: T[], count: number }
```

### `ErpPageResult<T>`

```ts
{
  items: T[]
  count: number          // total no servidor, não o tamanho de items
  hasMore: boolean
  nextPage: number | null
  possiblyRateLimited?: boolean       // só quando allowEmpty absorveu um vazio
  reason?: 'possibly_rate_limited'    // idem
  filters?: unknown                   // declaração de filtros do servidor (nome e tipo), ou null
  modelo?: string | null              // nome do modelo no servidor (ex.: 'venda')
  scope?: 'unverified'                // propertyId usado num endpoint de escopo desconhecido
}
```

A página vazia devolvida por `allowEmpty` não traz `filters` nem `modelo`.

### `ErpPage<T>`

`ErpPageResult<T>` mais `page: number` — o que `paginate` e os `iter*` entregam.

### Registros tipados

Os métodos mais usados devolvem registros com os campos declarados no `index.d.ts`. Os nomes e tipos vêm do uso real de cada endpoint:

| Tipo                                                                                                  | Método                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Trato`, `TratoItem`                                                                                  | `erp.estoque.getTratos()` / `iterTratos()`, `getTratosItens()`                                                     |
| `SobraCocho` (com `sobra_cocho_itens: SobraCochoItem[]`)                                              | `erp.estoque.getSobraCocho()`                                                                                      |
| `DefinicaoDiariaTratos` (com `tratos_previstos: TratoPrevisto[]`)                                     | `erp.estoque.getDefinicaoDiariaTratos()`                                                                           |
| `Vacinacao`, `Tratamento`                                                                             | `erp.sanitario.getVacinacoes()`, `getTratamentos()` e os `iter*`                                                   |
| `MedicaoPesagem`, `InventarioAnimal`, `Saida`, `Morte`, `HistoricoMovimentacaoLocalidade`             | os métodos de mesmo nome em `erp.animais`                                                                          |
| `Confinamento` (com `animais: ConfinamentoAnimal[]`)                                                  | `erp.animais.getConfinamentoById()`                                                                                |
| `Gta`, `AplicacaoConsumoLoteAnimal`, `TransferenciaPropriedade`                                       | os métodos de mesmo nome em `erp.estoque`                                                                          |
| `BiAnimal`, `BiMovEstoque`, `BiSuplementacao`, `BiProducaoRacao`, `BiFormulacaoItem`, `BiMovMaterial` | `bi.animais`, `bi.movEstoque`, `bi.suplementacao`, `bi.producaoRacao.get()` / `getFormulacao()`, `bi.movMateriais` |

- Todo registro estende `ApiRecord` (`{ [field: string]: unknown }`): campos que a API mandar e o tipo não declarar continuam acessíveis, como `unknown`.
- Qualquer campo pode vir `null`.
- **`ApiDecimal` = `number | string`:** os decimais chegam como número (no ERP, já convertido do formato BR) ou como texto com ponto decimal (ex.: `"12.50"`), que o parse BR não converte. Use `Number()`.
- Datas sem hora do ERP chegam como `YYYY-MM-DD`; data e hora BR (ex.: `data_hora` dos inventários) ficam como vieram: converta com `parseBrDateTime`.
- Os outros métodos seguem com `Record<string, unknown>`. Para tipar um grid sem método dedicado, passe o tipo em `mb.erp.fetchPage<T>()`, `pages<T>()` e `collect<T>()`.

### `FetchPageOptions`

| Campo         | Tipo                                          | Descrição                                                                                                 |
| ------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `page`        | `number`                                      | Página (padrão 1). 10 itens por página, fixo.                                                             |
| `from`        | `string` (`YYYY-MM-DD`)                       | Início da janela, traduzido para o filtro do grid. Lança `ValidationError` nos grids que ignoram data.    |
| `to`          | `string` (`YYYY-MM-DD`)                       | Fim da janela. Idem.                                                                                      |
| `extraParams` | `Record<string, string \| number \| boolean>` | Filtros do servidor.                                                                                      |
| `allowEmpty`  | `boolean`                                     | Vazio vira página vazia em vez de `EmptyResponseError`.                                                   |
| `signal`      | `AbortSignal`                                 | Cancela a chamada.                                                                                        |
| `propertyId`  | `number`                                      | Lê com esta fazenda selecionada, conforme o escopo do endpoint ([seção 6](#propertyid-nos-grids-do-erp)). |
| `timeoutMs`   | `number`                                      | Prazo só desta página. Padrão: o do registro do endpoint, ou o da instância.                              |
| `dateParam`   | `string`                                      | Nome do filtro de data no servidor. Padrão: o do registro (em geral `data`).                              |

Qualquer outra chave lança `ValidationError`.

### `FetchAllOptions` / `FetchAllResult`

```ts
// Opções
{ from?, to?, startPage?, maxPages?, delayMs?, extraParams?, allowEmpty?, signal?,
  propertyId?, timeoutMs?, dateParam?,
  onPage?: (items, pageNum) => boolean | void | Promise<boolean | void> }
// delayMs: espera entre páginas, padrão 0. timeoutMs: prazo de cada página.

// Resultado
{
  totalFetched: number
  pagesRead: number
  stoppedAt: number | null       // página em que onPage devolveu false
  complete: boolean              // true só se o servidor disse que acabou
  nextPage: number | null        // de onde retomar quando complete é false
  possiblyRateLimited: boolean   // a 1ª página veio vazia e allowEmpty absorveu
  scope?: 'unverified'           // propertyId usado num endpoint de escopo desconhecido
}
```

### `CollectResult<T>`

O que `mb.erp.collect()` e `collectPages()` devolvem:

```ts
{
  items: T[]                     // todas as páginas juntas
  pagesRead: number
  complete: boolean              // true só se a última página lida disse que acabou
  nextPage: number | null        // de onde retomar quando complete é false
  possiblyRateLimited: boolean
  scope?: 'unverified'
}
```

---

## 10. BI: leitura analítica

Namespace `mb.bi`. Caminho `GET /integracaobi/<slug>`, envelope `{ dados }` normalizado para `{ items, count }`. Sem paginação e sem parse BR.

- **Por contrato:** `fazendas`, `localidades`, `fornecedores`, `materiais`, `dieta`.
- **Por propriedade:** `animais`, `movEstoque`, `movMateriais`, `suplementacao`, `producaoRacao`. Aceitam `propertyId` (seleciona e consulta na mesma seção exclusiva); sem ele, exigem fazenda já selecionada e lançam `PropertyNotSelectedError` caso contrário.
- **Prazo por chamada:** todo método aceita `timeoutMs`, que troca o prazo da instância só naquela chamada — `get({ timeoutMs })`, `get({ propertyId, from, to, timeoutMs })` e `getFormulacao(producaoId, { timeoutMs })`. Inválido (não positivo) lança `ValidationError`.

| Método                                                | Slug                                  | Escopo      | Status |
| ----------------------------------------------------- | ------------------------------------- | ----------- | ------ |
| `bi.fazendas.get()`                                   | `obtenha-cadastros-fazendas`          | contrato    | ✅     |
| `bi.localidades.get()`                                | `obtenha-cadastros-localidades`       | contrato    | ✅     |
| `bi.fornecedores.get()`                               | `obtenha-cadastros-fornecedores`      | contrato    | ✅     |
| `bi.materiais.get()`                                  | `obtenha-cadastros-materiais`         | contrato    | ✅     |
| `bi.dieta.get()`                                      | `obtenha-cadastros-dieta`             | contrato    | ✅     |
| `bi.animais.get({ propertyId? })` / `getAll(ids?)`    | `obtenha-cadastros-gados-sisbov`      | propriedade | ✅     |
| `bi.movEstoque.get({ propertyId? })` / `getAll(ids?)` | `obtenha-movimentacoes-gados-estoque` | propriedade | ✅     |
| `bi.movMateriais.get({ from, to, propertyId? })`      | `obtenha-movimentacoes-materiais`     | propriedade | ⚠️     |
| `bi.suplementacao.get({ from, to, propertyId? })`     | `obtenha-suplementacao-animal`        | propriedade | ✅     |
| `bi.producaoRacao.get({ from, to, propertyId? })`     | `obtenha-producao-racao`              | propriedade | ✅     |
| `bi.producaoRacao.getFormulacao(producaoId, opts?)`   | `obtenha-producao-racao-formulacao`   | —           | ✅     |
| (não exposto)                                         | `obtenha-monitoramento-pesagem`       | —           | ❌     |
| (não exposto)                                         | `obtenha-movimentacoes-gados-extra`   | —           | ❌     |

### `bi.fazendas.get()` ✅

Cadastro de **produtores/fazendas de origem** do gado comprado (rastreabilidade) — não confundir com as fazendas da própria conta (`mb.getProperties()`); costuma ter muito mais registros.

**Retorno:** `items: { id, nome, cnpj }[]`

> Para ligar um animal ao produtor de origem, use `bi.animais.get().fornecedor_id` × `bi.fornecedores.get().entidade_id` (chave exata). O `id` deste endpoint é de outro espaço de ids e só cruza por nome.

### `bi.localidades.get()` ✅

**Retorno:** `items: { localidade_id, localidade, tipo, area, area_calculada, setor, setor_ativo, propriedade, propriedade_ativo, lotacao_desejada, variedade, observacao, ativo }[]`

### `bi.fornecedores.get()` ✅

Pessoas e empresas: fornecedores de insumos, mão de obra e produtores de origem do gado (categoria `PROPRIETÁRIO`).

**Retorno:** `items: { entidade_id, cpf_cnpj, nome, nome_abreviado, razao_social, inscricao_estadual, inscricao_municipal, categoria, enderecos }[]`

### `bi.materiais.get()` ✅

**Retorno:** `items: { material_id, codigo_erp, codigo_material, nome, nome_abreviado, unidade_medida_uso, grupo_material_id, grupo_material_nome, subgrupo_material_id, subgrupo_material_nome, ativo }[]`

### `bi.dieta.get()` ✅

**Retorno:** `items: { lote_alimentar_id, descricao, ativo, planos_nutricionais }[]`

### `bi.animais.get({ propertyId? })` ✅

Cadastro completo do rebanho de uma fazenda.

**Retorno:** `items[]` com cerca de 40 campos, entre eles `identificacao_usual`, `numero_sisbov`, `sexo`, `categoria`, `situacao`, `localizacao`, `lote_alimentar`, `lote_avaliacao`, `lote_finalidade`, `fornecedor_id`, `primeiro_peso`, `data_primeiro_peso`, `ultimo_peso`, `data_ultimo_peso`, `valor_aquisicao`, `data_entrada_confinamento`, `peso_entrada_confinamento`, `data_previsao_abate`.

> Os campos de local e lote são `localizacao` e `lote_alimentar` / `lote_avaliacao` / `lote_finalidade` — não existem `localidade` nem `lote`.

### `bi.animais.getAll(propertyIds?)` ✅

Junta `get()` de todas as fazendas, uma de cada vez (exclusiva).

**Retorno:** `BiResult` mais `byProperty: Map<number, item[]>`, na ordem dos ids. Cada item ganha `_propertyId`. Ao final, a fazenda selecionada é a última da lista.

### `bi.movEstoque.get({ propertyId? })` ✅ / `getAll(propertyIds?)` ✅

Movimentações de estoque de animais (entradas, saídas, vendas, mortes) com peso e valor por evento. A grande maioria dos eventos traz peso, o que permite derivar uma série de peso por animal. `getAll` devolve `BiResult` com `_propertyId` em cada item.

**Retorno:** `items: { documento, entidade_id, data_evento, tipo, tipo_documento, identificacao_usual, localidade_id, valor_desconto, valor_frete, valor_unitario, valor_total, rendimento_carcaca, peso }[]`

> Receita real de venda está em `valor_total` deste endpoint (os campos financeiros de `erp.animais.getVendas()` vêm zerados).

### `bi.animais.forEachBatch(opts, onBatch)` / `bi.movEstoque.forEachBatch(opts, onBatch)` ✅

Os mesmos registros de `get()`, lidos aos poucos e entregues em lotes. Os dois endpoints devolvem o conjunto inteiro da fazenda num único JSON, sem paginação nem filtro de data: num rebanho grande, o corpo passa de dezenas de MB, e o `get()` converte tudo de uma vez (centenas de MB de memória). Com `forEachBatch`, a memória fica no tamanho do lote, qualquer que seja o tamanho da fazenda.

- **`opts`:** `{ propertyId?, batchSize?, timeoutMs? }`, com `batchSize` padrão 1000. `propertyId` segue o mesmo contrato do `get()`.
- **`onBatch(items)`:** recebe cada lote e é esperado antes da leitura continuar. Roda dentro da seção da fazenda, então não troque de fazenda nele. O `timeoutMs` cobre a leitura inteira, inclusive o tempo do `onBatch`.
- **Retorno:** `{ count }`, o total entregue. Resposta sem registros dá `{ count: 0 }` sem chamar `onBatch`.
- **Erros:** os mesmos do `get()`. Um erro lançado pelo `onBatch` interrompe a leitura e sai como foi lançado. Uma falha de rede depois do primeiro lote não é repetida (repetir entregaria os mesmos registros de novo): quem consome descarta o que recebeu, por exemplo desfazendo a transação.

```js
await mb.bi.animais.forEachBatch({ propertyId: 1 }, async (animais) => {
  await gravar(animais)
})
```

### `bi.movMateriais.get({ from, to, propertyId? })` ⚠️

Movimentações de materiais (compras, consumo nutricional, tratamentos, produção de ração).

| Parâmetro    | Tipo     | Obrigatório | Descrição                                                    |
| ------------ | -------- | ----------- | ------------------------------------------------------------ |
| `from`       | `string` | ✅          | `YYYY-MM-DD`                                                 |
| `to`         | `string` | ✅          | `YYYY-MM-DD`. Janela de **1 a 31 dias corridos**, inclusive. |
| `propertyId` | `number` | —           | Ver escopo acima.                                            |

**Lança:** `ValidationError` sem `from`/`to`, com data inválida, janela invertida ou maior que 31 dias.

> ⚠️ **Por propriedade:** o `propriedade_id` dos itens é sempre o da fazenda selecionada. Para todas as fazendas, use `forAllProperties` ou chame com cada `propertyId`.
>
> ⚠️ As linhas dos tipos 24 (Nutricional Confinamento), 25 (Tratamento de Animais) e 16/22 (Produção de Ração) vêm com `documento: null`; só as compras (tipo 1) trazem documento. A chave estável é **`movimentacao_material_id`**. As linhas do tipo 24 correspondem a `erp.estoque.getTratos()` (`trato.id == movimentacao_material_id`).

### `bi.suplementacao.get({ from, to, propertyId? })` ✅

`from`/`to` obrigatórios (`YYYY-MM-DD`), sem limite de janela.

**Retorno:** `items: { data, pasto, dieta, quantidade, unidade, percentual_materia_seca }[]`

### `bi.producaoRacao.get({ from, to, propertyId? })` ✅

Batidas de produção de ração. `from`/`to` obrigatórios.

**Retorno:** `items: { producao_id, data (DD/MM/YYYY), batida, vagao, racao_id, racao, responsavel_id, responsavel, quantidade_produzida, custo, custo_producao }[]`

### `bi.producaoRacao.getFormulacao(producaoId, { timeoutMs? })` ✅

Ingredientes de uma batida. `producaoId` é o `producao_id` de `get()`; sem ele, `ValidationError`. O segundo argumento, opcional, só leva `timeoutMs`.

**Retorno:** `items: { ingrediente_id, ingrediente, perc_ms_ingrediente, perc_ms_racao, perc_ms_formula, perc_ms_producao, perc_mo_formula, perc_mo, perc_ms_racao_prod, quantidade, custo_unitario, custo_total }[]` — os números chegam como **string**.

> Uma requisição por batida: sincronizar um período longo de várias fazendas pode levar dezenas de minutos.

### Pesagem e movimentação extra do BI ❌ (não expostos)

`obtenha-monitoramento-pesagem` e `obtenha-movimentacoes-gados-extra` não respondem em nenhuma variação (página, janela de um dia, fazenda isolada, animal único): a conexão cai por volta de 300 s. O cliente não tem método para eles.

- **Pesagem:** use `erp.animais.getMedicoesPesagem()` (pesagem por animal), `bi.animais.get()` (`ultimo_peso` / `data_ultimo_peso`) ou `bi.movEstoque.get()` (`peso` por evento).
- **Movimentação extra:** transferências estão em parte em `bi.movEstoque.get()`; o estado atual de local e lote está em `bi.animais.get()`.

---

## 11. ERP: cadastros

Namespace `mb.erp.cadastros`. Os `get*` aceitam [`FetchPageOptions`](#fetchpageoptions) e devolvem [`ErpPageResult`](#erppageresultt). Cadastros são **por contrato**: nos que o registro marca como conta inteira ou global, `propertyId` lança `ValidationError`. Exceções e escopo de cada slug na [seção 25.1](#251-escopo-e-filtro-de-cada-endpoint-registro) (ex.: `localizacao` é por fazenda).

### Contatos e materiais (com escrita)

| Método                         | Slug                      | Status | Descrição                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getContatos(params)`          | `contato`                 | ✅     | Fornecedores/contatos: `id, tipo_pessoa, nome, abreviatura, razao_social, cnpj, cpf, categoria, telefones, emails, enderecos, ativo`.                                                                                                                                                                 |
| `createContato(body)`          | `contato` (POST)          | ✅     | `body: { nome, tipo_pessoa: 'PJ' \| 'PF', categoria, ativo, cnpj?, razao_social?, inscricao_estadual?, inscricao_municipal?, cpf?, sexo?, data_nascimento?, telefones?, emails?, enderecos? }` → `{ id }`.                                                                                            |
| `updateContato(id, body)`      | `contato/{id}/` (PATCH)   | ✅     | Parcial: só os campos a alterar.                                                                                                                                                                                                                                                                      |
| `getGruposMaterial(params)`    | `grupomaterial`           | ✅     | `id, nome, tipo, ativo`.                                                                                                                                                                                                                                                                              |
| `createGrupoMaterial(body)`    | `grupomaterial` (POST)    | ✅     | `body: { nome, tipo?: 1-6, ativo? }`.                                                                                                                                                                                                                                                                 |
| `getSubgruposMaterial(params)` | `subgrupomaterial`        | ✅     | `id, nome, grupo_material, ativo`.                                                                                                                                                                                                                                                                    |
| `createSubgrupoMaterial(body)` | `subgrupomaterial` (POST) | ✅     | `body: { nome, grupo_material?, ativo? }`.                                                                                                                                                                                                                                                            |
| `getUnidadesMedidas(params)`   | `unidadesmedidas`         | ✅     | `id, nome, tipo_unidade, abreviatura, multiplicador`.                                                                                                                                                                                                                                                 |
| `createUnidadeMedida(body)`    | `unidadesmedidas` (POST)  | ✅     | `body: { nome, tipo_unidade: 1 UNIDADE \| 2 PESO \| 3 VOLUME \| 4 METRO, abreviatura?, multiplicador? }`.                                                                                                                                                                                             |
| `getMateriais(params)`         | `materiais`               | ✅     | `id, nome, grupo_material, unidade_medida_uso, codigo_erp, via_aplicacao_tratamento, ativo, …`.                                                                                                                                                                                                       |
| `createMaterial(body)`         | `materiais` (POST)        | ✅     | `body: { nome, grupo_material, unidade_medida_compra, unidade_medida_uso, unidade_medida_venda_transf, tipo_dose: 0, peso_para_dose: 0, codigo_erp, ativo?, abreviatura?, subgrupo_material?, fabricante?, preco_custo_material?, codigo_material?, codigo_fabricante?, via_aplicacao_tratamento? }`. |
| `updateMaterial(id, body)`     | `materiais/{id}/` (PUT)   | ✅     | Substituição completa.                                                                                                                                                                                                                                                                                |

Escritas que estouram o prazo ou perdem a conexão lançam `TimeoutError` / `NetworkError` com `mayHaveSucceeded: true`: o registro pode ter sido gravado, e repetir pode duplicar.

### Cadastros de referência

| Método                        | Slug             | Status | Notas                                                                                                               |
| ----------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `getRacoes(params)`           | `racao`          | ✅     |                                                                                                                     |
| `getContas(params)`           | `conta`          | ✅     | `id, codigo, descricao, ativo, codigo_erp, grupo_conta, centro_custo, percentual_pasto, percentual_confinamento, …` |
| `getGruposContas(params)`     | `grupoconta`     | ✅     |                                                                                                                     |
| `getFormasPagamento(params)`  | `formapagamento` | ✅     | `id, codigo_erp, codigo, descricao, descricao_impressao`                                                            |
| `getLotesAlimentares(params)` | `lotealimentar`  | ✅     |                                                                                                                     |
| `getLotesFinalidade(params)`  | `lotefinalidade` | ✅     |                                                                                                                     |
| `getRacas(params)`            | `raca`           | ✅     | `id, nome, sigla_internacional, especie, idade_desmame, peso_medio_nascimento, perc_rend_carcaca, …`                |
| `getPelagens(params)`         | `pelagem`        | ✅     | `id, nome, codigo_pmg, ativo`                                                                                       |
| `getPropriedades(params)`     | `propriedade`    | ✅     |                                                                                                                     |
| `getCategorias(params)`       | `categoria`      | 🔕     | Pode vir vazio em contas sem configuração de categoria: passe `{ allowEmpty: true }`.                               |
| `getRebanhos(params)`         | `rebanho`        | 🔕     | Idem.                                                                                                               |
| `getCidades(params)`          | `cidade`         | ⚠️     | Catálogo **nacional** (tipo IBGE), milhares de registros; inclui `id=0, nome="NAO IDENTIFICADO"`.                   |
| `getEstados(params)`          | `estado`         | ⚠️     | Catálogo nacional.                                                                                                  |
| `getPaises(params)`           | `pais`           | ✅     |                                                                                                                     |

### Rastreabilidade e organização

| Método                              | Slug                     | Status | Notas                                                                                                                                                                                           |
| ----------------------------------- | ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getEntidades(params)`              | `entidade`               | ✅     | Cadastro genérico de pessoas/empresas, mais amplo que `getContatos()`.                                                                                                                          |
| `getContatosMaoDeObra(params)`      | `contatomaodeobra`       | ✅     | Subconjunto de `getEntidades()` filtrado a mão de obra. O mesmo `id` pode aparecer em mais de uma página: deduplique por `id`.                                                                  |
| `getLocalizacoes(params)`           | `localizacao`            | ✅     | Localidades com dados de cocho e GMD (`sobra_cocho, ims_pv_media, ims_pv_5, peso_projetado, dias_cocho, consumo_mo, consumo_ms, grupo_curral, tipo_pastagem`) — mais rico que `bi.localidades`. |
| `getCurrais(params)`                | `currais`                | ✅     | Mesmo modelo de `getLocalizacoes()`, só currais de confinamento.                                                                                                                                |
| `getGruposCurral(params)`           | `grupocurral`            | ✅     | `id, total_animais, total_capacidade, num_currais, media_ims, media_dias_cocho, media_consumo_mo, propriedade, setor, centro_custo, responsavel`                                                |
| `getCategoriasGta(params)`          | `categoriagta`           | ✅     | `id, descricao, sexo, valor_minimo, valor_maximo, configuracao, ordem`                                                                                                                          |
| `getSequenciasMicroregioes(params)` | `sequenciasmicroregioes` | ✅     | Faixas de numeração de brincos SISBOV.                                                                                                                                                          |
| `getConfiguracoesLayout(params)`    | `configuracoeslayout`    | ✅     | Identidade visual da conta (`logo, icone, cor_padrao, nome_empresa, …`).                                                                                                                        |
| `getDispositivosMoveis(params)`     | `dispositivomovel`       | ✅     | Aparelhos registrados nos apps MB.                                                                                                                                                              |
| `getCulturas(params)`               | `cultura`                | ✅     | Cultivares/variedades agrícolas.                                                                                                                                                                |
| `getOperacoes(params)`              | `operacao`               | ⚠️     | Formato parecido com o de um material; uso exato incerto.                                                                                                                                       |

### Genética, avaliação e configuração (endpoints adicionais, fora do manual oficial)

| Método                                    | Slug                           | Status | Campos principais                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getGrausDeSangue(params)`                | `graudesangue`                 | ✅     | `id, sigla, descricao, ativo, codigo_pmg, abcz`                                                                                                                                                                                    |
| `getAvaliacoesMorfologicas(params)`       | `avaliacaomorfologica`         | ✅     | `id, nome, abreviatura, casas_decimais, menor_valor, maior_valor, tipo_avaliacao, sexo, obrigatorio, programa`                                                                                                                     |
| `getCorposLuteos(params)`                 | `corpoluteo`                   | ✅     | `id, descricao`                                                                                                                                                                                                                    |
| `getDetalhesSituacaoFemea(params)`        | `detalhesituacaofemea`         | ✅     | `id, codigo, descricao, aplica_a_machos, situacao`                                                                                                                                                                                 |
| `getConfiguracoesCategoria(params)`       | `configuracaocategoria`        | ✅     | `id, especie, criterio, padrao, …`                                                                                                                                                                                                 |
| `getConfiguracoesCategoriaGta(params)`    | `configuracaocategoriagta`     | ✅     | `id, descricao, …`                                                                                                                                                                                                                 |
| `getConfiguracaoPlanilhaGenetica(params)` | `configuracaoplanilhagenetica` | ✅     | Mapeamento de colunas de planilha de importação genética.                                                                                                                                                                          |
| `getConfiguracoesLeituraCocho(params)`    | `configuracoesleituracocho`    | ✅     | `id, descricao_leitura, tipo, score, perc_alteracao_ms, configuracoes_gerais`. Catálogo da conta inteira; o mesmo `id` pode se repetir na página seguinte e `hasMore` pode vir true com o catálogo completo — deduplique por `id`. |
| `getLotesDeAvaliacao(params)`             | `lotedeavaliacao`              | ✅     | `id, nome, descricao, sigla, ativo, codigo_pmg`                                                                                                                                                                                    |
| `getTiposPastagem(params)`                | `tipopastagem`                 | ✅     | `id, descricao`                                                                                                                                                                                                                    |
| `getDiasImprodutivos(params)`             | `diasimprodutivos`             | ✅     | `id, descricao, data, pais`                                                                                                                                                                                                        |
| `getTecnicasCongelacao(params)`           | `tecnicacongelacao`            | ✅     | `id, tipo, descricao, metodo_congelacao, metodo_descongelacao, padrao`                                                                                                                                                             |
| `getPreparacoesSemenConfig(params)`       | `preparacaosemenconfig`        | ✅     | `id, semen_sexado, extender, processamento, volume, semen`                                                                                                                                                                         |

### Propriedades, estabelecimentos e pessoas (endpoints adicionais)

| Método                                              | Slug                                 | Status | Notas                                                 |
| --------------------------------------------------- | ------------------------------------ | ------ | ----------------------------------------------------- |
| `getEstabelecimentosRuraisExternos(params)`         | `estabelecimentoruralexterno`        | ✅     | Propriedades de terceiros (fornecedores/compradores). |
| `getEstabelecimentosRuraisInternosExternos(params)` | `estabelecimentoruralinternoexterno` | ✅     | Próprias + externas.                                  |
| `getProprietarios(params)`                          | `proprietario`                       | ✅     | `id, cpf, cnpj, tipo_pessoa, propriedades, categoria` |
| `getProprietariosContato(params)`                   | `proprietariocontato`                | ✅     | Mesmo formato de `getEntidades()`.                    |
| `getSetores(params)`                                | `setor`                              | ✅     | `id, propriedade, nome, ativo, centro_de_custo`       |

### Fiscal e tributário (endpoints adicionais)

| Método                                     | Slug                           | Status | Campos principais                                                                            |
| ------------------------------------------ | ------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| `getCofinsSt(params)`                      | `cofinsst`                     | ✅     | `id, codigo, descricao, interno`                                                             |
| `getIcmsOrigem(params)`                    | `icmsorigem`                   | ✅     | `id, codigo, descricao, interno`                                                             |
| `getIcmsSt(params)`                        | `icmsst`                       | ✅     | `id, codigo, descricao, interno`                                                             |
| `getPisSituacaoTributaria(params)`         | `pissituacaotributaria`        | ✅     | `id, codigo, descricao, interno`                                                             |
| `getNaturezasOperacoes(params)`            | `naturezaoperacoes`            | ✅     | `id, codigo_erp, condicao_pagamento, descricao, codigo_fiscal, tipo_mp, ativo`               |
| `getCondicoesVenda(params)`                | `condicoesvenda`               | ✅     | `id, descricao, is_padrao, ativo`                                                            |
| `getCategoriasDeContato(params)`           | `categoriadecontato`           | ✅     | `id, descricao, e_padrao`                                                                    |
| `getTiposDeCategoriaDeContato(params)`     | `tipodecategoriadecontato`     | ✅     | `id, descricao, categoria`                                                                   |
| `getCentrosDeCusto(params)`                | `centrodecusto`                | ✅     | `id, codigo, descricao, ativo, codigo_erp`                                                   |
| `getContasRateio(params)`                  | `contarateio`                  | ✅     | `id, conta, propriedade, tipo_animal, rebanhos, racas, categorias, custo_cria, forma_rateio` |
| `getSituacoesMovimentacaoMaterial(params)` | `situacaomovimentacaomaterial` | ✅     | `id, descricao, interno, ordem`                                                              |
| `getTiposVendaDescarteDevolucao(params)`   | `tipovendadescartedevolucao`   | ✅     | `id, descricao, frigorifico, tipo, interno`                                                  |
| `getUnidadesCotacao(params)`               | `unidadecotacao`               | ✅     | `id, nome, simbolo, data_ultima_atualizacao, valor_ultima_atualizacao`                       |
| `getTiposAdv(params)`                      | `tiposadv`                     | ✅     | `id, descricao, forma_desativacao`                                                           |

---

## 12. ERP: animais

Namespace `mb.erp.animais`. Eventos do rebanho. **Para o cadastro de animais, use `bi.animais.get()`**.

### Entrada de animais (dois passos, com escrita)

#### `findByOrdemServico(ordemServico)` ✅

`POST /entrada/obtenha/` com `{ ordem_servico }` — busca a entrada pela ordem de serviço do app MB Curral.

**Retorno:** objeto da entrada, com `id` para o passo 2.

#### `updateEntradaFinanceiro(id, body)` ✅

`PUT /entrada/<id>/` — grava os dados financeiros da entrada.

| Campo do `body`                                                                                            | Obrigatório |
| ---------------------------------------------------------------------------------------------------------- | ----------- |
| `data_aquisicao`                                                                                           | ✅          |
| `fornecedor`, `fornecedor_leilao`, `fornecedor_corretor`, `fornecedor_frete`, `fornecedor_outras_despesas` | —           |
| `forma_pagamento`                                                                                          | —           |
| `total_animais`, `valor_leilao`, `valor_corretor`, `valor_frete`, `valor_outros`, `valor_compra`           | —           |

> A listagem completa de `entrada` estoura o timeout: este fluxo é para uma ordem de serviço por vez.

### Eventos e histórico

| Método                                         | Slug                                           | Status | Notas                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSaidas(params)`                            | `saida`                                        | ⚠️     | A API **ignora o filtro de data**: `from`/`to` lançam `ValidationError`. Pagine tudo e filtre no cliente. Observado como um lote histórico fixo, que não reflete a atividade corrente; vazio na página 1 é comum e real em várias fazendas (passe `allowEmpty`). |
| `getVendas(params)`                            | `venda`                                        | ⚠️     | Campos financeiros (`valor_total`, `valor_pagamento`, `media_arroba`) vêm **zerados**. Use para volume por cliente/período; receita em `bi.movEstoque`.                                                                                                          |
| `getMortes(params)`                            | `morte`                                        | ✅     | Causa e laudo. `from`/`to` filtram de verdade.                                                                                                                                                                                                                   |
| `getHistoricoMovimentacaoConfinamento(params)` | `historicomovimentacaolocalizacaoconfinamento` | ⚠️     | Movimentação entre currais (volume muito grande). A API **ignora o filtro de data**: `from`/`to` lançam `ValidationError`. Leitura completa inviável na prática.                                                                                                 |
| `getHistoricoMovimentacaoLocalidades(params)`  | `historicomovimentacaolocalizacaolocalidades`  | ✅     | Movimentação entre pastos (volume muito grande). `from`/`to` filtram de verdade — viável para sincronização incremental.                                                                                                                                         |
| `getInventariosAnimais(params)`                | `inventarioanimais`                            | ✅     | Eventos de contagem/inventário do rebanho, por fazenda. A API **ignora o filtro de data** (`from`/`to` lançam `ValidationError`). Ordem: `id` decrescente e estável — dá para ler só o que é novo parando no primeiro `id` já conhecido.                         |

### `getConfinamento(params)` ✅ / `getConfinamentoById(id)` ✅

A **listagem** `GET /confinamento/` → `getConfinamento(params)` (página única, [`FetchPageOptions`](#fetchpageoptions)). Respondia HTTP 500 até outubro de 2026; a sonda de 2026-10-29 a encontrou funcionando.

- **Por fazenda.** Cada registro traz `propriedade`, conferido pelo `verifyRecordProperty`.
- **Filtro de data:** `from`/`to` filtram pela **abertura do lote** (`data_abertura`, já no registro do cliente). O filtro `data` é ignorado pelo servidor.
- **Páginas pesadas:** 10 lotes por página, cada um com `animais[]`, levando segundos por página. Use a janela de abertura e pagine com calma.
- **Formato:** os números passam pelo parse BR. O mesmo lote por id (`getConfinamentoById`) vem cru: decimais como texto com ponto, e `null` onde a listagem traz `0`.

O **registro individual** funciona: `GET /confinamento/<id>/?format=json` → `getConfinamentoById(id)`. Devolve o lote completo (cerca de 120 campos: `data_abertura`, `data_saida`, `gpd`, `gpt`, `mortes`, `vendas`, `saldo`, programa nutricional, horários de trato…) **com o array `animais[]`**: `data_entrada`/`data_saida`, `peso_entrada` + `data_peso_entrada`, `ultimo_peso`, `permanencia`/`permanencia_conf` e o motivo de saída (`venda_item_id`, `descarte_id`, `saida_id`, `transferencia_propriedade_id`, `transferencia_localizacao_id`).

- **Por propriedade:** id de lote de outra fazenda responde 404 (`NotFoundError`). Selecione a fazenda dona antes; a busca por id não recebe `propertyId`.
- Lotes fechados continuam acessíveis.
- JSON limpo (datas ISO, números nativos), sem parse BR.
- Ids de lote aparecem no campo `confinamento` dos itens de `erp.estoque.getSobraCocho()`.
- `id` precisa ser inteiro positivo, senão `ValidationError` sem chamar a rede.

### `getMedicoesPesagem(params)` ✅ (com ressalvas)

`medicoespesagem` — endpoint adicional, fora do manual oficial. **Pesagem real por animal**; na prática substitui a pesagem do BI, que não responde.

**Campos:** `animal, animal_texto, sisbov, valor (peso), data_avaliacao, idade_na_pesagem, localidade_texto, lote_alimentar_texto, propriedade, propriedade_texto`

> ⚠️ **Escopo:** a fazenda selecionada **não** restringe o resultado — a resposta traz registros de outras fazendas da mesma conta. Cada registro traz o próprio `propriedade` / `propriedade_texto`, que é confiável: atribua a fazenda por esse campo, nunca pela sessão. `propertyId` é recusado.
>
> **Ordem:** decrescente por `data_avaliacao`, mas a paginação **não é estável no tempo** (pesagens novas deslocam as páginas): numa leitura longa, deduplique por `id` e confira a contagem no fim.
>
> ⚠️ **Sem filtro de data:** a API ignora `from`/`to` (o cliente lança `ValidationError`) e o parâmetro `propriedade`. Numa conta grande, a leitura completa tem muitas páginas: pesada, mas correta. Em paginações longas, `InvalidPageError` pode aparecer de forma transitória.

### Identificação e ciclo de vida SISBOV

| Método                                 | Slug                         | Status | Descrição                                                                                                                                                   |
| -------------------------------------- | ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAlteracoesSisbov(params)`          | `animalalteracaosisbov`      | ✅     | Histórico de alteração de identificação SISBOV.                                                                                                             |
| `getReidentificacoesSisbov(params)`    | `animalreidentificadosisbov` | ✅     | Reidentificações (troca de brinco).                                                                                                                         |
| `getAnimaisDesmamados(params)`         | `animaldesmamado`            | ✅     | Eventos de desmame.                                                                                                                                         |
| `getRecepcoesAnimais(params)`          | `recepcaoanimais`            | ✅     | Recepções de animais (entrada física).                                                                                                                      |
| `getMotivosDescarteReprodutor(params)` | `motivodescartereprodutor`   | ✅     | Catálogo de motivos de descarte de reprodutor.                                                                                                              |
| `getTiposMorte(params)`                | `tipomorte`                  | ✅     | Catálogo de tipos de morte.                                                                                                                                 |
| `getMachos(params)`                    | `macho`                      | ⚠️     | Parece um apelido/visão do cadastro de animais (o nome sugere "machos", mas o filtro exato não foi confirmado). Use `bi.animais.get()` como fonte primária. |

---

## 13. ERP: sanitário

Namespace `mb.erp.sanitario`.

### `getVacinacoes(options)` ✅ / `iterVacinacoes(options)`

`vacinacao` — vacinações com custo (evento sanitário preventivo). Usa [`FetchAllOptions`](#fetchalloptions--fetchallresult). ⚠️ Observado devolvendo **o mesmo conjunto** de `getTratamentos()` (mesmos ids). Ao juntar os dois, deduplique por `id` — nunca some as duas listas.

> ⚠️ Sujeito a [limite silencioso de requisições](#39-limite-de-requisições-explícito-e-silencioso) depois de muitas páginas seguidas. Consuma em blocos (100 a 200 páginas, espaçados) e use `safeImport()` para proteger os dados locais.

### `getTratamentos(options)` ✅ / `iterTratamentos(options)`

`tratamentoanimal` — tratamentos sanitários com custo por animal. Leitura completa inviável (volume muito grande): sempre filtre por data.

### `getExames(params)` 🔕

`exame` — exames reprodutivos/andrológicos com custo. Uma fazenda pode não ter nenhum exame; passe `{ allowEmpty: true }` se o vazio for esperado.

### Eventos reprodutivos clássicos 🔕

Rotas reais, vazias em contas que não usam o módulo reprodutivo. Passe `{ allowEmpty: true }` se o vazio for esperado.

| Método                   | Slug         |
| ------------------------ | ------------ |
| `getProtocolos(params)`  | `protocolo`  |
| `getOcorrencias(params)` | `ocorrencia` |
| `getSemens(params)`      | `semen`      |
| `getEmbrioes(params)`    | `embriao`    |
| `getCoberturas(params)`  | `cobertura`  |
| `getPartos(params)`      | `parto`      |

### Doenças e tratamentos (endpoints adicionais)

| Método                                      | Slug                            | Status | Descrição                                    |
| ------------------------------------------- | ------------------------------- | ------ | -------------------------------------------- |
| `getDoencas(params)`                        | `doenca`                        | ✅     | Catálogo de doenças.                         |
| `getDoencasTratamentos(params)`             | `doencatratamento`              | ✅     | Mapa doença ↔ tratamento.                    |
| `getSubgruposMaterialTratamentos(params)`   | `subgrupomaterialtratamentos`   | ✅     | Subgrupos de material usados em tratamentos. |
| `getSubgruposMaterialZoossanitario(params)` | `subgrupomaterialzoossanitario` | ✅     | Subgrupos de material zoossanitário.         |
| `getTiposProtocolo(params)`                 | `tipoprotocolo`                 | ✅     | Catálogo de tipos de protocolo.              |
| `getTratamentosHormonios(params)`           | `tratamentoshormonios`          | ✅     | Catálogo de tratamentos hormonais.           |
| `getTratamentosVacinasVermifugos(params)`   | `tratamentosvacinasvermifugos`  | ✅     | Catálogo de vacinas/vermífugos.              |

---

## 14. ERP: estoque

Namespace `mb.erp.estoque`.

### `getTratos(options)` ✅ / `iterTratos(options)`

`tratos` — arraçoamento/leitura de cocho por localidade. Leitura completa inviável (volume grande): filtre por data. Usa [`FetchAllOptions`](#fetchalloptions--fetchallresult).

> `peso_balanca` aqui é o peso de **ração** fornecida ao cocho, não de animal, e vem nulo na maioria dos registros. Para peso de animal, use `erp.animais.getMedicoesPesagem()`.
>
> Alguns registros trazem HTML no lugar do número em `quantidade_decimal`, `valor_total`, `peso_balanca`, `peso_balanca_final` ou `valor_unitario` (o mesmo vale para `getTratosItens`): trate como ausente. As datas com hora não são convertidas; use `parseBrDateTime` ([seção 8](#8-parse-do-formato-br)).
>
> `tratos` é **por fazenda** (confirmado): com `propertyId`, a fazenda é selecionada; sem `propertyId`, exige uma fazenda já selecionada.

### `getEntradaMaterial(params)` ✅ / `createEntradaMaterial(body)` ✅

`entradamaterial` — entradas de material / NF-e. A leitura completa trava depois de algumas dezenas de páginas: use janela de data.

| Parâmetro                                             | Descrição            |
| ----------------------------------------------------- | -------------------- |
| `from` / `to`                                         | Data de entrada.     |
| `extraParams.documento`                               | Número do documento. |
| `extraParams.contato`                                 | Id do fornecedor.    |
| `extraParams.valor_pagamento_0` / `valor_pagamento_1` | Faixa de valor.      |

**`createEntradaMaterial(body)`:** `propriedade` (✅) · `data` (✅) · `forma_pagamento` (✅, FK) · `contato` (✅, FK do fornecedor) · `responsavel` (✅, FK) · `documento` (✅ se a numeração automática estiver desligada) · `criterio_calculo?` (1 ou 2) · `valor_desconto?` · `valor_frete?` · `fornecedor_frete?` · `valor_total?` · `valor_pagamento?` · `itens: [{ produto (FK), quantidade, valor_unitario, observacao? }]` (✅).

### `getGtas(params)` ⚠️

`gta` — Guias de Trânsito Animal.

> A API **ignora o filtro de data** (devolve sempre o histórico inteiro): `from`/`to` lançam `ValidationError`. Espelhe o conjunto inteiro em blocos.
>
> Três campos de contraparte, não confundir: `produtor` / `produtor_texto` (produtor original do gado, mesmo `entidade_id` de `bi.fornecedores` e de `bi.animais.fornecedor_id`); `fornecedor` / `fornecedor_texto` (contraparte desta movimentação — produtor na compra, comprador/frigorífico na venda, conforme `tipo_saida`); `propriedade_fornecedor` / `propriedade_fornecedor_texto` (só em transferência entre fazendas da própria conta).

### `getSobraCocho(params)` ⚠️

`sobracocho` — sobra de ração no cocho por leitura/localidade.

> Cálculo pesado no servidor: cada página recalcula do zero (minutos por página). Sem filtro de data, a leitura completa leva horas. **Com `from`/`to`** (janela semanal) o cálculo fica escopado e responde em alguns minutos — viável como sincronização incremental. O registro já dá **300 s** de prazo padrão a este endpoint; troque com `timeoutMs` se precisar de mais.

### `getMovimentacaoMaterial()` ❌ / `getMovimentacaoMaterialById(id)` ✅

A listagem `GET /movimentacaomaterial/` responde HTTP 500 em todas as variações; `getMovimentacaoMaterial()` lança `EndpointUnavailableError` de forma síncrona.

O registro individual funciona: `GET /movimentacaomaterial/<id>/?format=json` → `getMovimentacaoMaterialById(id)`. Devolve o cabeçalho completo (cerca de 130 campos: `data`, `documento`, `situacao`, `tipo_movimentacao`, `tipo_entrada_saida`, valores, campos fiscais NF-e, `propriedade`, `localidade`…) **com o array `itens[]`**.

- **Por propriedade:** o mesmo id responde 404 (`NotFoundError`) com a fazenda errada e 200 com a dona.
- JSON limpo (números nativos).
- Ids aparecem no campo `movimentacao_material` dos registros de `getMovimentacaoMaterialItens()` e da auditoria.

Para saídas por data e tipo, há também `erp.custos.getSaidasMaterial()`.

### `getViaAplicacaoTratamento()` ❌

`viaaplicacaotratamento` — HTTP 500 na listagem **e** na busca por id. Sem rota de recuperação. Alternativa parcial: o campo `via_aplicacao_tratamento` / `via_aplicacao_tratamento_texto` de `erp.cadastros.getMateriais()`, quando preenchido.

### `getMovimentacaoMaterialItens(params)` ⚠️ / `getMovimentacaoMaterialItemById(id)` ✅

`movimentacaomaterialitem` — itens de movimentação de material (nível produto/valor).

> ⚠️ A listagem **não tem filtro nenhum no servidor** (o grid declara `filters: []`): data, chaves estrangeiras, ordenação e busca por texto são ignorados, e o total fica na casa dos milhões. `from`/`to` lançam `ValidationError`. Leitura completa inviável.

- **A busca por id funciona:** `GET /movimentacaomaterialitem/<id>/` → `getMovimentacaoMaterialItemById(id)`. Item completo (cerca de 130 campos) com a FK `movimentacao_material`. ⚠️ `data` vem em formato **BR** (`DD/MM/YYYY`), sem parse.
- **Receita incremental via auditoria:** `erp.auditoria.getAuditoria({ from, to, extraParams: { modelo: 'basico.movimentacaomaterialitem' } })` traz o id de cada item alterado no campo **`identificador`** (com `acao`: cadastrar/editar/excluir). Busque cada item por id, ou — com menos chamadas — agrupe pelo pai e use `getMovimentacaoMaterialById(item.movimentacao_material).itens[]`. O mesmo vale para `modelo: 'basico.movimentacaomaterial'`.

### `getTratosItens(params)` ✅

`tratositem` — itens de `getTratos()`, por produto/insumo (volume grande).

> O filtro real do servidor é **`movimentacao_material__data_0/_1`**; `data_0/_1` é ignorado em silêncio. O cliente traduz `from`/`to` para essa grafia — sincronização incremental viável.
>
> Filtros extras via `extraParams`: `localidade`, `produto` (dieta), `movimentacao_material__responsavel` (tratador), `movimentacao_material__nr_trato`.

### `getAplicacaoConsumoLoteAnimal(params)` ✅

`aplicacaoconsumoloteanimal` — consumo de ração aplicado por lote de animal. `from`/`to` filtram de verdade (uma janela semanal reduz bastante o volume).

### Transferências e programação de trato

| Método                                    | Slug                          | Status | Notas                                                                                                                                 |
| ----------------------------------------- | ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `getTransferenciasPropriedade(params)`    | `transferenciapropriedade`    | ✅     | Transferência de animais entre fazendas. `from`/`to` filtram de verdade.                                                              |
| `getTransferenciasLoteAlimentar(params)`  | `transferencialotealimentar`  | ✅     |                                                                                                                                       |
| `getTransferenciasLoteFinalidade(params)` | `transferencialotefinalidade` | ✅     |                                                                                                                                       |
| `getProgramasNutricionais(params)`        | `programanutricional`         | ✅     |                                                                                                                                       |
| `getTratosDiariosPrevistos(params)`       | `tratosdiariosprevistos`      | ⚠️     | Previsão diária de trato por curral (planejado), complementa `getTratos()` (realizado). Volume grande; filtro de data não verificado. |
| `getDefinicaoDiariaTratos(params)`        | `definicaodiariatratos`       | ✅     | Plano de trato por curral/dieta. `from`/`to` filtram de verdade.                                                                      |
| `getProducaoDietas(params)`               | `producaodieta`               | ✅     | Batidas de produção de dieta (custo, vagão, responsável, tempo de mistura) — mais detalhado que `bi.producaoRacao`.                   |

### `getRelatorioGestaoNutricionalLote({ propertyId, date, produtos?, linhasConfinamento?, lotesConfinamento?, timeoutMs?, signal? })` ✅ (com ressalva)

Endpoint adicional, fora do manual oficial: `POST /producaopasto/relatorio-gestao-nutricional-lote/?format=json`. É o mesmo relatório da tela "Gestão Nutricional" do MBWEB, por lote/curral.

| Parâmetro            | Tipo          | Obrigatório | Descrição                                                                                                                 |
| -------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `propertyId`         | `number`      | ✅          | Id da fazenda, enviado como `propriedade`. O método seleciona essa fazenda na fila exclusiva e faz o POST na mesma seção. |
| `date`               | `string`      | ✅          | `YYYY-MM-DD`, enviada como `data`. Exigida no corpo, mas **ignorada pelo servidor** (ver nota).                           |
| `produtos`           | `number[]`    | —           | Padrão `[]`.                                                                                                              |
| `linhasConfinamento` | `number[]`    | —           | Enviado como `linhas_confinamento`. Padrão `[]`. Ignorado pelo servidor (ver nota).                                       |
| `lotesConfinamento`  | `number[]`    | —           | Enviado como `lotes_confinamento`. Padrão `[]`. Ignorado pelo servidor (ver nota).                                        |
| `timeoutMs`          | `number`      | —           | Prazo só desta chamada. Padrão: o da instância.                                                                           |
| `signal`             | `AbortSignal` | —           | Cancela só esta chamada.                                                                                                  |

**Lança:** `ValidationError` sem `propertyId` (inteiro positivo), com `date` fora de `YYYY-MM-DD` ou inexistente, ou com `timeoutMs` inválido — antes de qualquer chamada.

**Retorno:** o conteúdo de `dados`: `{ localidades: [...], exibir_media, data_alteracao_base, filtro }`. Cada item de `localidades[]` tem cerca de 35 campos, entre eles `localidade, localidade_id, confinamento_id, qtd_cabecas, sexos, primeira_dt_entrada, peso_entrada, permanencia, diarias_lote, dieta_atual, qtd_fornecimento_ultima_dieta, transicao, consumo_mo, consumo_ms, cab_mo, cab_ms, custo_medio, rs_valor_mo, variacao_porc, sobra_d0..d3, ims_pv0, ims_pv1, ims_pv5, ims_pv_medio, peso_projetado, gpd_medio, peso_previsto_abate, data_relatorio`.

> ⚠️ **A consulta não calcula nada.** Ela devolve o resultado da última busca feita naquela fazenda, pela tela do MBWEB ou por recálculo. Por isso o servidor **ignora a data e os filtros** enviados. O resultado pode ser de um dia antigo, de uma linha de pasto ou de um curral só, e muda sempre que alguém busca na tela. O campo `filtro` diz de que busca o resultado veio (data, linhas e lotes), e `data_alteracao_base` diz há quanto tempo. Para calcular um dia, use o recálculo, abaixo.
>
> **Linhas de subtotal:** registros com `media: true` são médias do grupo, não currais — exclua-os ao somar. Há também linhas sem `localidade_id`.

### `reprocessRelatorioGestaoNutricionalLinha({ propertyId, date, linhaConfinamento, allowedLines?, timeoutMs?, signal? })` ⚠️ (escrita)

Mesmo endpoint, com `reprocessar: true` e a lista de lotes vazia, como a tela envia: o servidor **recalcula** o relatório para `date` e devolve todos os currais da linha, com o `data_relatorio` pedido. É o recálculo a preferir.

| Parâmetro           | Tipo          | Obrigatório | Descrição                                                                                                                 |
| ------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `propertyId`        | `number`      | ✅          | Id da fazenda, enviado como `propriedade`. O método seleciona essa fazenda na fila exclusiva e faz o POST na mesma seção. |
| `date`              | `string`      | ✅          | `YYYY-MM-DD`. Enviada como `data`, na meia-noite de Brasília, como a tela do MBWEB faz.                                   |
| `linhaConfinamento` | `number`      | ✅          | A linha de confinamento. Nunca uma linha de pasto (ver abaixo).                                                           |
| `allowedLines`      | `number[]`    | —           | Ids das linhas de confinamento da fazenda. Quando passado, uma `linhaConfinamento` fora da lista é recusada.              |
| `timeoutMs`         | `number`      | —           | Prazo só desta chamada. Padrão `600000` (10 min).                                                                         |
| `signal`            | `AbortSignal` | —           | Cancela só esta chamada.                                                                                                  |

**Lança:** `ValidationError` sem `propertyId` ou linha (inteiros positivos), com `date` inválida, com `timeoutMs` inválido ou com a linha fora de `allowedLines` — antes de qualquer chamada.

**Retorno:** o mesmo de `getRelatorioGestaoNutricionalLote`, com os currais da linha. Guarde a resposta: a próxima busca de qualquer pessoa troca o cache.

> ⚠️ **Grava num cache compartilhado do MBWEB.** O resultado substitui o cache inteiro da fazenda, e a tela de Gestão Nutricional de **todos os usuários** passa a mostrar só esta linha e este dia, até a próxima busca.
>
> ⚠️ **Lento e instável.** Leva minutos, e o servidor costuma cortar a consulta por volta de 300 s (`TimeoutError`, `NetworkError` ou `ServerError`). Uma linha com muitos currais pode passar desse limite. O corte é da conexão, não do cálculo: o servidor costuma terminar depois, em poucos minutos, e o resultado aparece na consulta normal, com o `filtro` da linha e da data pedidas. Antes de repetir, consulte. Como em toda escrita, `TimeoutError` e `NetworkError` trazem `mayHaveSucceeded: true`. Não repita em massa: o cliente não espaça chamadas, e decidir quantos recálculos fazer e com que intervalo é responsabilidade de quem chama.
>
> ⚠️ **Só linhas de confinamento.** Recalcular uma linha de pasto é proibido. O cliente não tem como saber se uma linha é de pasto: quem chama tem de saber, e pode passar `allowedLines` (as linhas de confinamento da fazenda) para o método recusar as outras.
>
> A fila de fazenda fica ocupada durante todo o recálculo: outras trocas de fazenda da mesma instância esperam.

### `reprocessRelatorioGestaoNutricionalLote({ propertyId, date, loteConfinamento, linhaConfinamento, allowedLines?, timeoutMs?, signal? })` ⚠️ (escrita)

Mesmo endpoint, com `reprocessar: true`: o servidor **recalcula** o relatório para `date`, num curral só. Diferente da consulta, o recálculo respeita a data e devolve o `data_relatorio` pedido.

| Parâmetro           | Tipo          | Obrigatório | Descrição                                                                                                                 |
| ------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `propertyId`        | `number`      | ✅          | Id da fazenda, enviado como `propriedade`. O método seleciona essa fazenda na fila exclusiva e faz o POST na mesma seção. |
| `date`              | `string`      | ✅          | `YYYY-MM-DD`. Enviada como `data`, na meia-noite de Brasília, como a tela do MBWEB faz.                                   |
| `loteConfinamento`  | `number`      | ✅          | **Um** lote de confinamento. Lista não é aceita.                                                                          |
| `linhaConfinamento` | `number`      | ✅          | A linha de confinamento do mesmo curral. Nunca uma linha de pasto (ver abaixo).                                           |
| `allowedLines`      | `number[]`    | —           | Ids das linhas de confinamento da fazenda. Quando passado, uma `linhaConfinamento` fora da lista é recusada.              |
| `timeoutMs`         | `number`      | —           | Prazo só desta chamada. Padrão `600000` (10 min).                                                                         |
| `signal`            | `AbortSignal` | —           | Cancela só esta chamada.                                                                                                  |

**Lança:** `ValidationError` sem `propertyId`, lote ou linha (inteiros positivos), com `date` inválida, com `timeoutMs` inválido ou com a linha fora de `allowedLines` — antes de qualquer chamada.

**Retorno:** o mesmo de `getRelatorioGestaoNutricionalLote`, com o curral recalculado.

> ⚠️ **Substitui o cache inteiro da fazenda.** A tela de Gestão Nutricional de **todos os usuários** e a consulta normal passam a ter só este curral, até a próxima busca. Recalcular vários lotes em sequência deixa só o último. Para mais de um curral, use `reprocessRelatorioGestaoNutricionalLinha`.
>
> ⚠️ **Lento e instável.** Leva de 1,5 a 5 minutos, e o servidor costuma cortar a consulta por volta de 300 s (`TimeoutError`, `NetworkError` ou `ServerError`). Como em toda escrita, `TimeoutError` e `NetworkError` trazem `mayHaveSucceeded: true`. Não repita em massa: o cliente não espaça chamadas, e decidir quantos recálculos fazer e com que intervalo é responsabilidade de quem chama.
>
> ⚠️ **Só linhas de confinamento.** Recalcular uma linha de pasto é proibido. O cliente não tem como saber se uma linha é de pasto: quem chama tem de saber, e pode passar `allowedLines` (as linhas de confinamento da fazenda) para o método recusar as outras.
>
> A fila de fazenda fica ocupada durante todo o recálculo: outras trocas de fazenda da mesma instância esperam.

### Materiais, saídas e ativos (endpoints adicionais)

| Método                                                | Slug                                       | Status | Descrição                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPremisturas(params)`                              | `premistura`                               | ✅     | Catálogo de pré-misturas.                                                                                                                                                                                                                    |
| `getProdutoServicos(params)`                          | `produtoservicos`                          | ✅     | Produtos/serviços.                                                                                                                                                                                                                           |
| `getAlteracoesPercentualMateriaSeca(params)`          | `alteracaopercentualmateriaseca`           | ✅     | Histórico de ajuste de % de matéria seca.                                                                                                                                                                                                    |
| `getEntradaMaterialItens(params)`                     | `entradamaterialitem`                      | ✅     | Itens de entrada de material.                                                                                                                                                                                                                |
| `getEntradasSaidasMaterial(params)`                   | `entradasaidamaterial`                     | ✅     | Entradas/saídas consolidadas.                                                                                                                                                                                                                |
| `getAplicacoesConsumo(params)`                        | `aplicacaoconsumo`                         | 🔕     | Aplicações de consumo (cabeçalho).                                                                                                                                                                                                           |
| `getAplicacaoConsumoLoteAnimalItens(params)`          | `aplicacaoconsumoloteanimalitem`           | ✅     | Itens de `getAplicacaoConsumoLoteAnimal()` (produto/valor). `from`/`to` filtram de verdade. Não trazem chave de volta para o cabeçalho.                                                                                                      |
| `getAplicacaoConsumoLoteAnimalIntercorrencia(params)` | `aplicacaoconsumoloteanimalintercorrencia` | ✅     | Avaliação de campo por trato: escore de cocho (1–5), condição de cerca, volume e qualidade da água, melhor pasto. O filtro real é `periodo`: o cliente traduz `from`/`to` para `periodo_0/_1`. Pode vir vazio: passe `{ allowEmpty: true }`. |
| `getSaidasTransferenciaPropriedades(params)`          | `saidatransferenciapropriedades`           | 🔕     | Saídas por transferência entre fazendas.                                                                                                                                                                                                     |
| `getSaidasVendaPerda(params)`                         | `saidavendaperda`                          | 🔕     | Saídas de venda/perda.                                                                                                                                                                                                                       |
| `getOutrasSaidas(params)`                             | `outrassaidas`                             | 🔕     | Demais saídas.                                                                                                                                                                                                                               |
| `getAtivos(params)`                                   | `ativos`                                   | ✅     | Cadastro de ativos/maquinário.                                                                                                                                                                                                               |
| `getMaquinariosConfinamento(params)`                  | `maquinariosconfinamento`                  | ✅     | Maquinário vinculado ao confinamento.                                                                                                                                                                                                        |
| `getTiposAtivos(params)`                              | `tiposativos`                              | ✅     | Catálogo de tipos de ativo.                                                                                                                                                                                                                  |

---

## 15. ERP: custos

Namespace `mb.erp.custos`. **Custeio por animal**: a API acumula custos mês a mês e os entrega **agrupados por categoria + rebanho + mês**. Para o custo acumulado até uma data, some os meses. Suporta recálculo retroativo.

> ⚠️ **Cálculo pesado no servidor** — de segundos a alguns minutos por chamada. Por isso todo método de custos usa **300 s de prazo por padrão**, ou o `timeoutMs` da instância, se for maior. Consuma fora de uma requisição de interface.

Comportamento comum:

- São `POST` em `/custoporanimal/…` (e `/movimentacaomaterial/buscar-saidas/`).
- Com `propertyId`, o cliente seleciona a fazenda e faz o POST **na mesma seção exclusiva** (chamadas paralelas na mesma instância rodam uma de cada vez) e envia `propriedade` no corpo. Depois, a fazenda selecionada é a do `propertyId`.
- Sem `propertyId` (onde é opcional), o endpoint vale para a conta inteira; o POST roda como leitura compartilhada.
- Parâmetro obrigatório ausente lança `ValidationError` sem chamar a rede.
- Todo método aceita **`timeoutMs`** (prazo só desta chamada, padrão `300000`); inválido (não positivo) lança `ValidationError` sem chamar a rede.
- A resposta é desembrulhada de `dados` quando vem nesse envelope; corpo vazio ou 204 devolve `null`.

### `getCustosAtivos({ propertyId, referenceDate, fromDate?, timeoutMs? })` ✅

Custos dos animais **presentes** no rebanho. Caminho `custoporanimal/exportacao-custos-animais-ativos-erp-v2`.

| Parâmetro       | Tipo     | Obrigatório | Descrição                                                                                                                                                                                      |
| --------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propertyId`    | `number` | ✅          |                                                                                                                                                                                                |
| `referenceDate` | `string` | ✅          | Data de referência `YYYY-MM-DD`, **nunca no futuro**: use ontem (o último dia que o MBWEB já fechou). Uma data futura, como o último dia do mês corrente, estoura o prazo ou devolve HTTP 400. |
| `fromDate`      | `string` | —           | Restringe ao intervalo `fromDate` → `referenceDate`.                                                                                                                                           |
| `timeoutMs`     | `number` | —           | Prazo só desta chamada. Padrão `300000`.                                                                                                                                                       |

**Retorno:** `{ categoria_texto, rebanho_texto, categoria_codigo, mes, qtd_animais, valor }[]`

### `getCustosVendidos({ propertyId, from, to, timeoutMs? })` ✅ / `getCustosMortos({ propertyId, from, to, timeoutMs? })` ✅

Mesmo formato de retorno, para animais **vendidos** ou **mortos** no período. Caminhos `…-vendidos-erp-v2` e `…-mortos-erp-v2`. `getCustosVendidos` é o mais pesado.

### `getSaldoBiologico({ propertyId?, referenceDate, timeoutMs? })` ⚠️

Saldo do ativo biológico (CPC 29), sintético: vivos, mortos e vendidos, com saldo inicial e final do mês. Caminho `custoporanimal/saldo-ativo-biologico-erp`.

| Parâmetro       | Tipo     | Obrigatório | Descrição                                |
| --------------- | -------- | ----------- | ---------------------------------------- |
| `propertyId`    | `number` | —           | Sem valor: todas as fazendas.            |
| `referenceDate` | `string` | ✅          | Dia `01` do mês (ver `firstDayOfMonth`). |
| `timeoutMs`     | `number` | —           | Padrão `300000`.                         |

**Retorno:** `{ vivos: { saldo_inicial, saldo_final }, mortos: {...}, vendidos: {...} }`

> ⚠️ Os valores vêm **zerados** até a configuração no MBWEB: Categorias → multiplicador "por peso @"; Financeiro → Cotações Diárias (arroba macho/fêmea); Custos → Configurações (% de imposto). Sem fazenda selecionada, o endpoint pode responder 404 direto na API.

### `sendCustoIndireto({ propertyId?, referenceMonth, amount, timeoutMs? })` ✅ (escrita)

Rateia um valor entre os animais presentes no último dia do mês. Caminho `custoporanimal/custo-indireto-erp`.

| Parâmetro        | Tipo     | Obrigatório | Descrição                                                            |
| ---------------- | -------- | ----------- | -------------------------------------------------------------------- |
| `propertyId`     | `number` | —           | Sem valor: rateia entre todos os animais da conta.                   |
| `referenceMonth` | `string` | ✅          | Sempre dia `01`, ex.: `'2026-06-01'`. Enviado como `mes_referencia`. |
| `amount`         | `number` | ✅          | Valor a ratear. Enviado como `valor`.                                |
| `timeoutMs`      | `number` | —           | Padrão `300000`.                                                     |

O campo `conta` vai fixo em `-2` (exigência da API). A resposta volta como veio (sem desembrulhar `dados`). Como toda escrita, `TimeoutError`/`NetworkError` trazem `mayHaveSucceeded: true`: confira antes de repetir.

```js
await mb.erp.custos.sendCustoIndireto({ propertyId: 1, referenceMonth: '2026-06-01', amount: 1500 })
```

### `getSaidasMaterial({ propertyId?, date, tipoSaida, timeoutMs? })` ✅

Saídas de material de um dia e um tipo. Caminho `movimentacaomaterial/buscar-saidas`.

| Parâmetro    | Tipo     | Obrigatório | Descrição                                          |
| ------------ | -------- | ----------- | -------------------------------------------------- |
| `propertyId` | `number` | —           | Seleciona a fazenda e envia `propriedade`.         |
| `date`       | `string` | ✅          | `YYYY-MM-DD`, enviada como `data`.                 |
| `tipoSaida`  | `number` | ✅          | Use [`TIPO_SAIDA_MATERIAL`](#tipo_saida_material). |
| `timeoutMs`  | `number` | —           | Padrão `300000`.                                   |

```js
import { constants } from 'mb-cliente'

const saidas = await mb.erp.custos.getSaidasMaterial({
  propertyId: 1,
  date: '2026-10-15',
  tipoSaida: constants.TIPO_SAIDA_MATERIAL.VENDA,
})
```

> Uma chamada cobre um dia e um tipo, sem paginação: sincronizar um histórico exige dias × tipos × fazendas chamadas. Os tipos 22 (produção de ração), 24 (nutricional confinamento) e 25 (tratamento de animais) repetem dados já disponíveis em `bi.producaoRacao`, `getTratos` e `getTratamentos`.

---

## 16. ERP: auditoria e replicação

Namespace `mb.erp.auditoria`. Endpoints adicionais, fora do manual oficial.

### `getAuditoria(params)` ⚠️

`auditoria` — trilha de auditoria: quem mudou o quê, quando, com o valor antes e depois (`conteudo_anterior` / `conteudo_novo`). Volume muito grande.

> - O parâmetro `contrato` é ignorado pelo servidor. Cada registro traz o próprio campo `contrato`; confira-o antes de consumir.
> - `from`/`to` **filtram de verdade**. Use sempre uma janela curta, nunca a leitura completa.
> - Cada registro tem `modelo` (`app_label.model_name`, ex.: `basico.movimentacaomaterial`), `identificador` (id do registro alterado) e `acao` (cadastrar/editar/excluir).
> - ⭐ **Filtro por modelo no servidor:** `extraParams: { modelo: '<app_label.model_name>' }` reduz drasticamente o volume e torna a auditoria uma base viável de sincronização incremental para endpoints sem filtro de data próprio (ver `getMovimentacaoMaterialItens` na [seção 14](#14-erp-estoque)).

```js
const page = await mb.erp.auditoria.getAuditoria({
  from: '2026-06-01',
  to: '2026-06-01',
  extraParams: { modelo: 'basico.movimentacaomaterial' },
})
const ids = new Set(page.items.map((r) => r.identificador))
```

### Demais métodos

| Método                                        | Slug                               | Status | Notas                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRegrasDeReplicacao(params)`               | `regradereplicacao`                | ✅     | Regras/alertas de validação do MBDT (desktop). Catálogo pequeno; cada registro tem a FK `entidade` / `entidade_texto`.                                                                                                                                                                                           |
| `getEntidadeRegraDeReplicacao()`              | `entidaderegradereplicacao`        | ❌     | Listagem HTTP 500; lança `EndpointUnavailableError`.                                                                                                                                                                                                                                                             |
| `getEntidadeRegraDeReplicacaoById(id)`        | `entidaderegradereplicacao/{id}/`  | ✅     | Catálogo dos tipos de entidade do sistema de replicação (`{ id, uid, descricao, … }`). Ids baixos e sequenciais, com buracos (`NotFoundError`) — enumerável por inteiro.                                                                                                                                         |
| `getLogDeReplicacao(params)`                  | `logdereplicacao`                  | ⚠️     | Veio vazio na verificação; não confirmado se é limite de requisições ou tabela pouco ativa. Passe `{ allowEmpty: true }` se o vazio for esperado.                                                                                                                                                                |
| `getLogReplicacaoAnimaisNaoExcluidos(params)` | `logreplicacaoanimaisnaoexcluidos` | ⚠️     | Idem.                                                                                                                                                                                                                                                                                                            |
| `getConfiguracoesGerais(params)`              | `configuracoesgerais`              | ✅     | Configuração da conta: parâmetros de GMD/abate (`peso_abate_inicial`/`final`, `qnt_dias_peso`, `peso_entrada_considerado`), rastreabilidade SISBOV, integração ERP e de pesagem externa. Um registro por conta. Os campos de pesagem externa indicam que a pesagem do BI depende de uma integração de terceiros. |
| `getUsuarios(params)`                         | `usuario`                          | ✅     | Contas de acesso ao MBWEB/MB Curral, com módulos liberados e fazendas vinculadas.                                                                                                                                                                                                                                |

### Sincronização de dispositivos e históricos

| Método                                                | Slug                                          | Status | Descrição                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHistoricoAcoesApp(params)`                        | `historicoacoesapp`                           | ✅     | Ações realizadas nos apps móveis.                                                                                                                                                                                                                                                                                                                        |
| `getHistoricoMovimentacaoLoteDeAvaliacao(params)`     | `historicomovimentacaolotedeavaliacao`        | ✅     | Mudanças de lote de avaliação.                                                                                                                                                                                                                                                                                                                           |
| `getHistoricoMovimentacaoProgramaNutricional(params)` | `historicomovimentacaoprogramanutricional`    | ✅     | Mudanças de programa nutricional. **Global**: a mesma resposta com qualquer fazenda selecionada (`propertyId` é recusado). `from`/`to` filtram de verdade.                                                                                                                                                                                               |
| `getControleSincronizacaoCurral(params)`              | `controlesincronizacaocurral`                 | ✅     | Sincronização do app MB Curral.                                                                                                                                                                                                                                                                                                                          |
| `getControleSincronizacaoMbTratos(params)`            | `controlesincronizacaombtratos`               | ✅     | Sincronização do app MB Tratos.                                                                                                                                                                                                                                                                                                                          |
| `getCurralErrosExecucaoEvento(params)`                | `curralerrosexecucaoevento`                   | ✅     | Erros de execução de evento no curral.                                                                                                                                                                                                                                                                                                                   |
| `getEstatisticasRotinaEstoqueAnimalDetalhe(params)`   | `estatisticasrotinaestoqueanimaldetalhe`      | ✅     | Estatísticas da rotina de estoque de animais.                                                                                                                                                                                                                                                                                                            |
| `getHistoricoExecucaoViewPg()`                        | `historicoexecucaoviewpg`                     | ❌     | Listagem HTTP 500; lança `EndpointUnavailableError`.                                                                                                                                                                                                                                                                                                     |
| `getHistoricoExecucaoViewPgUltimosItensFila()`        | `historicoexecucaoviewpg/ultimos-itens-fila/` | ✅     | `{ dados: [...] }` com as execuções recentes da fila de atualização dos agregados do servidor (`data_agendamento`, `inicio_execucao`, `fim_execucao`, `intervalo_execucao`, `status`, `status_texto`) — mostra quando o servidor recalculou os agregados pela última vez. A busca por id `historicoexecucaoviewpg/{id}/` também responde (via `mb.raw`). |

---

## 17. ERP: financeiro

Namespace `mb.erp.financeiro`. Rotas reais 🔕: só trazem dados se a conta usa o módulo financeiro do MB. Numa conta sem o módulo, a listagem vazia lança `EmptyResponseError`: passe `{ allowEmpty: true }` se esse é o seu caso.

| Método                                          | Slug                                | Descrição                                                                                                               |
| ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getBancos(params)`                             | `banco`                             | Cadastro de bancos.                                                                                                     |
| `getOrcamentos(params)`                         | `orcamento`                         | Orçamentos.                                                                                                             |
| `getMovimentacoesFinanceiras(params)`           | `movimentacaofinanceira`            | Movimentações financeiras (cabeçalho).                                                                                  |
| `getMovimentacoesFinanceirasContas(params)`     | `movimentacaofinanceiraconta`       | Movimentações por conta.                                                                                                |
| `getContasFinanceiras(params)`                  | `contafinanceiro`                   | Contas bancárias.                                                                                                       |
| `getCotacoesDiarias(params)`                    | `cotacoesdiarias`                   | ⚠️ **Exceção:** pode ter registros reais (cotações de moeda/arroba). Pré-requisito de `erp.custos.getSaldoBiologico()`. |
| `getBaixasMovimentacaoFinanceira(params)`       | `baixarmovimentacaofinanceira`      | Baixas.                                                                                                                 |
| `getCobrancasMovimentacaoFinanceira(params)`    | `cobrancamovimentacaofinanceira`    | Cobranças.                                                                                                              |
| `getConciliacoesMovimentacaoFinanceira(params)` | `conciliacaomovimentacaofinanceira` | Conciliações bancárias.                                                                                                 |
| `getContasPagar(params)`                        | `contaspagar`                       | Contas a pagar.                                                                                                         |
| `getContasReceber(params)`                      | `contasreceber`                     | Contas a receber.                                                                                                       |
| `getEmprestimos(params)`                        | `emprestimo`                        | Empréstimos.                                                                                                            |
| `getGruposRateioContaFinanceira(params)`        | `gruporateiocontafinanceiro`        | Grupos de rateio.                                                                                                       |
| `getMovimentacaoFinanceiraArquivos(params)`     | `movimentacaofinanceiraarquivos`    | Anexos.                                                                                                                 |
| `getOpcoesPagamento(params)`                    | `opcaopagamento`                    | Opções de pagamento.                                                                                                    |
| `getOrcamentosContrato(params)`                 | `orcamentocontrato`                 | Orçamentos por contrato.                                                                                                |
| `getProjetosFinanceiros(params)`                | `projetofinanceiro`                 | Projetos financeiros.                                                                                                   |
| `getRetencoesMovimentacaoFinanceira(params)`    | `retermovimentacaofinanceira`       | Retenções.                                                                                                              |
| `getTransferenciasBancarias(params)`            | `transferenciabancaria`             | Transferências bancárias.                                                                                               |
| `getRegrasPauta(params)`                        | `regrapauta`                        | Regras de pauta (precificação).                                                                                         |
| `getCustosMensaisAnimais(params)`               | `custosmensaisanimais`              | Custos mensais por animal.                                                                                              |

---

## 18. ERP: reprodução e genética

Namespace `mb.erp.reproducao`. Rotas reais 🔕: só trazem dados se a conta usa o módulo correspondente (IATF, embriões, sêmen ou agrícola). Numa conta sem o módulo, passe `{ allowEmpty: true }`.

### Reprodução: eventos e diagnóstico

| Método                                                                                                                | Descrição                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `getCios(params)`                                                                                                     | Registros de cio.                                            |
| `getEstacoesMonta`, `getEstacoesMontaIa`, `getEstacoesMontaCampo`, `getEstacoesMontaControlada`, `getEstacoesMontaTe` | Estações de monta por modalidade.                            |
| `getAcasalamentos`, `getAcasalamentosCobertura`                                                                       | Acasalamentos planejados / realizados.                       |
| `getResultadosSexagem`                                                                                                | Sexagem fetal.                                               |
| `getResultadosDiagnosticoGestacao`, `getResultadosDiagnosticoGestacaoModal`                                           | Diagnóstico de gestação.                                     |
| `getAvaliacoesOvarianas`                                                                                              | Avaliação ovariana.                                          |
| `getAspiracoesOvocitos`, `getCobrancasAspiracaoOvocitos`                                                              | Aspiração de oócitos e cobrança.                             |
| `getCoberturasDiagnosticoGestacao`, `getCoberturasTe`                                                                 | Coberturas ligadas a diagnóstico / transferência de embrião. |
| `getCruzamentos`                                                                                                      | Planejamento de cruzamentos.                                 |
| `getDescartesReprodutor`                                                                                              | Descarte de reprodutor.                                      |
| `getDetalhesSituacaoMacho`                                                                                            | Situação reprodutiva do macho.                               |
| `getFemeas`                                                                                                           | Cadastro reprodutivo de fêmeas.                              |
| `getIdentificacoesAcasalamento`                                                                                       | Identificação de acasalamento.                               |
| `getGruposEvento`                                                                                                     | Agrupador de eventos reprodutivos.                           |
| `getMotivosCancelamento`, `getMotivosVisita`                                                                          | Catálogos de motivo.                                         |
| `getScoresFezes`                                                                                                      | Escore de fezes.                                             |
| `getTiposOcorrencia`, `getTiposProblema`, `getProblemas`                                                              | Ocorrências e problemas reprodutivos.                        |
| `getVisitasRgnRgd`                                                                                                    | Visitas RGN/RGD (registro genealógico).                      |

### Genética, sêmen e embrião

| Método                                                                                                                    | Descrição                               |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `getAvaliacoesAtivo`                                                                                                      | Avaliação de reprodutor ativo.          |
| `getComprasSemen`, `getComprasSemenItens`                                                                                 | Compra de sêmen.                        |
| `getVendasSemen`, `getVendasSemenItens`                                                                                   | Venda de sêmen.                         |
| `getMovimentacoesSemen`, `getOrigensSemen`                                                                                | Movimentação e origem de sêmen.         |
| `getComprasEmbriao`, `getVendasEmbriaoGrupo`                                                                              | Compra/venda de embrião.                |
| `getTransferenciasLoteReprodutivo`, `getTransferenciasLoteGenetico`                                                       | Transferência de lote.                  |
| `getLotesGeneticos`, `getLotesReprodutivos`                                                                               | Cadastro de lotes.                      |
| `getCdcFiv`, `getProdutosFiv`, `getTiposProdutoFiv`                                                                       | Produção in vitro (FIV).                |
| `getRaques`                                                                                                               | Raques (armazenamento).                 |
| `getMedicoesGeneticas`, `getMedicoesMorfologicas`                                                                         | Medições genéticas/morfológicas.        |
| `getTiposDescarteEmbriao`                                                                                                 | Catálogo de descarte de embrião.        |
| `getTourosMultiplos`                                                                                                      | Touros múltiplos.                       |
| `getTratamentosAnimalDoenca`                                                                                              | Vínculo tratamento ↔ doença por animal. |
| `getParametrosPrevisao`                                                                                                   | Parâmetros de previsão reprodutiva.     |
| `getMbivfWebFemea`, `getMbivfWebFemeaReceptora`, `getMbivfWebSemen`                                                       | Módulo MB IVF.                          |
| `getComunicacoesAbczOnline`                                                                                               | Comunicação com ABCZ Online.            |
| `getAgrupadoresCoberturasAbcz`, `getAgrupadoresMortesAbcz`, `getAgrupadoresNascimentosAbcz`, `getAgrupadoresPesagensAbcz` | Agrupadores de sincronização ABCZ.      |

### Agrícola e safra

| Método                                                                                 | Descrição                 |
| -------------------------------------------------------------------------------------- | ------------------------- |
| `getSafrasAnimal`, `getSafras`, `getAnosAgricolas`                                     | Ciclo de safra.           |
| `getCiclosProducao`, `getCiclosProducaoLocalidade`                                     | Ciclo produtivo agrícola. |
| `getCentrosDistribuicao`                                                               | Centros de distribuição.  |
| `getAtividadesAgricolas`, `getClassificacoes`, `getRegrasTributarias`, `getVariedades` | Módulo agrícola.          |

Todos recebem `params?: FetchPageOptions`. Os slugs estão em `constants.REPRODUCAO_SLUGS`.

### ❌ Indisponíveis

Rotas quebradas no servidor, **sem método no cliente**:

| Slug                                  | Motivo                | Alternativa                       |
| ------------------------------------- | --------------------- | --------------------------------- |
| `planejamentosafra`                   | HTTP 500 na listagem. | —                                 |
| `agrupadorcoberturasabczcoberturas`   | HTTP 500.             | `getAgrupadoresCoberturasAbcz()`  |
| `agrupadormortesabczmortes`           | HTTP 500.             | `getAgrupadoresMortesAbcz()`      |
| `agrupadornascimentosabcznascimentos` | Timeout / HTTP 500.   | `getAgrupadoresNascimentosAbcz()` |
| `agrupadorpesagensabczpesagens`       | HTTP 500.             | `getAgrupadoresPesagensAbcz()`    |

---

## 19. ERP: outros

Namespace `mb.erp.outros`. Rotas reais 🔕: equipamentos de curral, gestão de contratos comerciais, produção agrícola e vendas avulsas, que só trazem dados se a conta usa o módulo correspondente. Passe `{ allowEmpty: true }` se o vazio for esperado.

### Equipamentos de curral e cocho

| Método                                        | Descrição                            |
| --------------------------------------------- | ------------------------------------ |
| `getBebedouros`, `getBotijoes`, `getCanecas`  | Equipamentos.                        |
| `getCochosCompartilhados`                     | Cochos compartilhados entre currais. |
| `getLimpezasBebedouro`                        | Limpeza de bebedouro.                |
| `getManutencoesAtivoMaquinario`               | Manutenção de ativo/maquinário.      |
| `getArvoresDeProcesso`, `getRecursosEmTalhao` | Processo/talhão.                     |

### Gestão de contratos (módulo comercial)

| Método                                                            | Descrição                                          |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `getContratoProgramaSequencias`                                   | Sequências de programa de contrato.                |
| `getContratosVinculados`                                          | Contratos vinculados.                              |
| `getEventosGestaoContratos`, `getEventosContato`                  | Eventos de gestão de contrato/contato.             |
| `getGestaoContratos`                                              | Cadastro de gestão de contratos.                   |
| `getMensagensGestaoContratos`, `getMensagensGestaoContratosItens` | Mensagens.                                         |
| `getParcerias`                                                    | Parcerias comerciais.                              |
| `getEventoCavalgada2018`                                          | Evento pontual de marketing (resquício histórico). |

### Produção, pedidos e vendas avulsas

| Método                                                                                   | Descrição                                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getProcessosProducao`, `getProducoes`, `getProducoesPasto`, `getProducoesPremistura`    | Produção agrícola/pré-mistura.                                                                   |
| `getProdutosCategoriaAnimais`                                                            | Produtos por categoria de animal.                                                                |
| `getProgramasNutricionaisPasto`, `getProgramasNutricionaisPastoRaca`                     | Programas nutricionais de pasto.                                                                 |
| `getSaidasTransferenciaCentroDistribuicao`                                               | Saída para centro de distribuição.                                                               |
| `getSituacoesContato`                                                                    | Situações de contato.                                                                            |
| `getUsosPessoalEpi`                                                                      | Uso pessoal / EPI.                                                                               |
| `getImportacoesXmlNfe`                                                                   | Importação de XML de NF-e.                                                                       |
| `getOrigensMovimentacaoMaterial`, `getMotivosPerdaMovimentacaoMaterial`                  | Catálogos de movimentação de material.                                                           |
| `getVendasAvulsas`, `getVendasComplementares`, `getVendasContrato`, `getVendasGenericas` | Vendas fora de `erp.animais.getVendas()`.                                                        |
| `getPedidosEntrada`, `getPedidosVendas`, `getPedidoVenda`                                | Pedidos.                                                                                         |
| `getAgendamentosAtividade`                                                               | Agendamento de atividades.                                                                       |
| `getEstoqueRelatorioInsumosItens`                                                        | ⚠️ Itens do relatório de estoque de insumos; veio vazio na verificação (resultado inconclusivo). |

Os slugs estão em `constants.OUTROS_SLUGS`.

### ❌ Indisponíveis

Rotas quebradas no servidor, **sem método no cliente**:

| Slug                        | Motivo                                           | Alternativa                         |
| --------------------------- | ------------------------------------------------ | ----------------------------------- |
| `racaopremistura`           | HTTP 500 na listagem e na busca por id.          | —                                   |
| `estoque-relatorio-insumos` | HTTP 500 na listagem; busca por id responde 404. | `getEstoqueRelatorioInsumosItens()` |

---

## 20. Acesso cru (raw)

`mb.raw.get(path, params?, options?)` / `mb.raw.post(path, body?, options?)` — acesso de baixo nível a qualquer endpoint sem método dedicado.

| Parâmetro        | Tipo                                                               | Obrigatório | Descrição                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`           | `string`                                                           | ✅          | Relativo à base do ambiente, começando com `/` (ex.: `'/tipoanimal/'`). Outro formato lança `ValidationError` (`field: 'path'`) sem chamar a rede. |
| `params` (`get`) | `Record<string, string \| number \| boolean \| null \| undefined>` | —           | Query string; `null`/`undefined` são omitidos. Padrão `{}`.                                                                                        |
| `body` (`post`)  | valor serializável em JSON                                         | —           | Enviado como `application/json`. Padrão `{}`.                                                                                                      |
| `options`        | `{ signal?: AbortSignal, timeoutMs?: number }`                     | —           | `signal` cancela só esta chamada (soma-se ao `signal` da instância); `timeoutMs` troca o prazo da instância só nesta chamada.                      |

**Retorno:** `Promise<T>` (padrão `unknown`) — o **JSON cru**, exatamente como veio: sem parse BR, sem desembrulhar `dados`/`results` e sem paginação. Para converter formato BR, use `mb-cliente/parsers`.

**Herda do cliente HTTP:** cabeçalhos `Authorization: JWT` e `Dispositivo: 8` (sem `connect()` antes, `AuthError` sem chamar a rede); relogin automático em 401 com reseleção da fazenda; `timeoutMs` e `retry` da instância (novas tentativas só em GET); a classificação de erros da [seção 22](#22-erros) — `EmptyResponseError` só em GET.

**Não faz, de propósito:** espaçamento de chamadas, interceptadores, validação do corpo da requisição, parse BR. **Não passa pela fila de fazenda**: se o endpoint for por propriedade, garanta a seleção antes e não mude de fazenda em paralelo.

```js
import { parseErpPage } from 'mb-cliente/parsers'

const raw = await mb.raw.get('/tipoanimal/', { page: 1 })
const page = parseErpPage(raw) // converte números e datas BR de results
```

> ⚠️ **Escrita é responsabilidade de quem chama.** `mb.raw.post` envia exatamente o que receber, e alguns endpoints de relatório alteram dados ou caches compartilhados do servidor, com efeito para todos os usuários da conta. Depois de `TimeoutError` / `NetworkError` numa escrita, `mayHaveSucceeded` é `true`: repetir pode duplicar. Não repita POST em massa.

---

## 21. Helpers

Exportados na raiz (`import { … } from 'mb-cliente'`) e em `mb-cliente/helpers`.

### `safeImport({ fetch, replace, onRateLimit? })`

Troca os dados locais **só** quando recebeu um conjunto **completo e não vazio**. Protege contra o limite silencioso de requisições (vazio indistinguível de fonte vazia) e contra coleta cortada no meio.

| Parâmetro     | Tipo                                                                   | Obrigatório | Descrição                                                                               |
| ------------- | ---------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `fetch`       | `() => Promise<items[] \| { items, complete?, possiblyRateLimited? }>` | ✅          | Busca os dados. Pode devolver o resultado de uma coleta com `complete`.                 |
| `replace`     | `(items) => Promise<void>`                                             | ✅          | Troca os dados locais. **Deve ser transacional** (apagar e inserir na mesma transação). |
| `onRateLimit` | `(err) => Promise<void>`                                               | —           | Chamado quando `RateLimitError` / `EmptyResponseError` preservou os dados.              |

Passar `insert`/`delete` (assinatura antiga) lança `ValidationError`.

| Situação                                                           | Retorno                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `RateLimitError` capturado                                         | `{ preserved: true, reason: 'rate_limit_explicit' }`                  |
| `EmptyResponseError` capturado, ou vazio com `possiblyRateLimited` | `{ preserved: true, reason: 'empty_response_possibly_rate_limited' }` |
| `complete: false`                                                  | `{ preserved: true, reason: 'incomplete' }`                           |
| Vazio                                                              | `{ preserved: true, reason: 'legitimately_empty' }`                   |
| Dados recebidos                                                    | `replace(items)` → `{ preserved: false, inserted: n }`                |

Outros erros propagam.

```js
import { safeImport } from 'mb-cliente'

const result = await safeImport({
  fetch: async () => {
    const items = []
    const r = await mb.erp.estoque.getTratos({
      from: '2026-10-01',
      to: '2026-10-07',
      onPage: (lote) => {
        items.push(...lote)
      },
    })
    return { items, complete: r.complete, possiblyRateLimited: r.possiblyRateLimited }
  },
  replace: async (items) => db.transaction(() => substituirTratos(items)),
})
```

### `paginate(fetchPage, params?)`

Ver [seção 7](#paginatefetchpage-params).

### `collectPages(pages)`

Junta em memória todas as páginas de um iterador — `paginate()`, os `iter*` ou `mb.erp.pages()` — e devolve [`CollectResult`](#collectresultt): `{ items, pagesRead, complete, nextPage, possiblyRateLimited, scope? }`. `complete` é `true` só quando a última página lida disse que não havia mais; com `maxPages` atingido, `nextPage` diz de onde retomar. Os erros do iterador propagam (ex.: `EmptyResponseError` no meio da coleta).

```js
import { collectPages, paginate } from 'mb-cliente'

const { items, complete, nextPage } = await collectPages(
  paginate((p) => mb.erp.cadastros.getMateriais(p), { maxPages: 50 })
)
```

`mb.erp.collect(slug, opts)` é o atalho para `collectPages(mb.erp.pages(slug, opts))`.

### `getWeeklyWindows(from, to, days = 7)`

Janelas de `days` dias corridos entre duas datas, inclusive as pontas. `days` inteiro ≥ 1 e datas `YYYY-MM-DD` válidas, senão `ValidationError`.

```js
getWeeklyWindows('2026-03-28', '2026-04-10')
// → [{ from: '2026-03-28', to: '2026-04-03' }, { from: '2026-04-04', to: '2026-04-10' }]
```

### `getMonthlyWindows(from, to)`

Janelas por mês-calendário, recortadas nas pontas. Útil com `bi.movMateriais` (janela ≤ 31 dias).

```js
getMonthlyWindows('2023-01-01', '2023-03-31')
// → [{ from: '2023-01-01', to: '2023-01-31' }, { from: '2023-02-01', to: '2023-02-28' },
//    { from: '2023-03-01', to: '2023-03-31' }]
```

### `lastDayOfMonth(yearMonth)` / `firstDayOfMonth(yearMonth)`

`yearMonth` em `YYYY-MM` (mês 01 a 12), senão `ValidationError`.

```js
lastDayOfMonth('2026-06') // '2026-06-30' — para mês fechado; em custos, nunca uma data futura
firstDayOfMonth('2026-06') // '2026-06-01' — referenceDate de getSaldoBiologico
```

---

## 22. Erros

Todas as classes são exportadas **na raiz** (`import { AuthError } from 'mb-cliente'`), no namespace `errors` e em `mb-cliente/errors`. Todas estendem `MultBovinosError extends Error`, que copia o contexto do construtor como propriedades da instância e repassa `cause` ao `cause` nativo do `Error`.

| Classe                     | Quando                                                                                                                                                                                                                                                                                                                                   | Propriedades                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `MultBovinosError`         | Classe-base; nunca lançada diretamente.                                                                                                                                                                                                                                                                                                  | —                                                                                                       |
| `AuthError`                | Login recusado (401, 400 ou 403), login sem token, 401 repetido depois do relogin, ou chamada autenticada sem `connect()`.                                                                                                                                                                                                               | `statusCode`, `serverMessage`, `cause` (o `ClientError` original no 400/403)                            |
| `PropertyNotSelectedError` | (a) `selectProperty(id)` ou `propertyId` com id fora da lista do login; (b) BI por fazenda ou grid ERP sabidamente por fazenda sem `propertyId` e sem fazenda selecionada; (c) fazenda mudou durante uma paginação.                                                                                                                      | (a) `propertyId`, `availableIds`; (b) `endpoint`; (c) `endpoint`, `reason: 'changed_during_pagination'` |
| `RateLimitError`           | HTTP 200 com `{ detail }` como única chave.                                                                                                                                                                                                                                                                                              | `detail`, `slug`, `page`                                                                                |
| `InvalidPageError`         | HTTP 200 com `{ detail: "Página inválida." }`. Pode ser transitório em paginações longas sem filtro; quem chama decide se espera e tenta de novo.                                                                                                                                                                                        | `detail`, `slug`, `page`                                                                                |
| `EmptyResponseError`       | GET com HTTP 200, `count: 0` e `results: []` — vazio legítimo ou limite silencioso de requisições. **Nunca apague dados locais por causa dele.**                                                                                                                                                                                         | `possiblyRateLimited: true`, `slug`, `page`                                                             |
| `ClientError`              | HTTP 4xx que não é 401 (403, 405…; o 404 vira a subclasse `NotFoundError`).                                                                                                                                                                                                                                                              | `statusCode`, `body`                                                                                    |
| `NotFoundError`            | HTTP 404 (subclasse de `ClientError`): slug errado ou, nas buscas por id (`get*ById`), em geral registro de outra fazenda ou id inexistente — caso esperado, que se trata com `instanceof` sem conferir `statusCode`.                                                                                                                    | `statusCode` (`404`), `body`                                                                            |
| `ServerError`              | HTTP 5xx, com qualquer corpo.                                                                                                                                                                                                                                                                                                            | `statusCode`, `body`                                                                                    |
| `InvalidResponseError`     | 2xx com corpo não-JSON (ex.: HTML de proxy), GET 2xx sem corpo, ou página de grid sem `results`.                                                                                                                                                                                                                                         | `statusCode`, `slug`, `bodySnippet` (200 primeiros caracteres), `cause`                                 |
| `TimeoutError`             | A requisição, **incluindo a leitura do corpo**, passou do `timeoutMs`.                                                                                                                                                                                                                                                                   | `url`, `method`, `timeoutMs`, `mayHaveSucceeded`, `cause`                                               |
| `NetworkError`             | Falha de transporte (DNS, conexão, TLS) depois de esgotadas as tentativas.                                                                                                                                                                                                                                                               | `url`, `method`, `attempts`, `mayHaveSucceeded`, `cause`                                                |
| `EndpointUnavailableError` | Método marcado ❌ — lançado de forma síncrona, sem requisição.                                                                                                                                                                                                                                                                           | `slug`, `reason`, `workaround`                                                                          |
| `ValidationError`          | Parâmetro inválido detectado antes de chamar a API: opção desconhecida, `from`/`to` em grid que ignora data, `propertyId` em endpoint que não é por fazenda, janela inválida, obrigatório ausente, `timeoutMs`/`retry` inválidos, `path` inválido no `raw`, slug inválido em `mb.erp.fetchPage`/`pages`/`collect`, data fora de formato. | `field`, `received`                                                                                     |

**`mayHaveSucceeded`:** `true` em POST/PUT/PATCH/DELETE — a escrita pode ter sido aplicada no servidor, e repetir pode duplicar o registro. `false` em GET.

**Cancelamento** por `signal` não usa nenhuma destas classes: o erro é o `reason` do signal.

```js
import { EmptyResponseError, NetworkError, TimeoutError } from 'mb-cliente'

try {
  await mb.erp.cadastros.getContatos({ page: 3 })
} catch (err) {
  if (err instanceof EmptyResponseError) {
    // preservar dados locais e tentar mais tarde, a partir de err.page
  } else if (err instanceof TimeoutError || err instanceof NetworkError) {
    // em GET, seguro repetir; em escrita, checar err.mayHaveSucceeded
  } else throw err
}
```

---

## 23. Constantes e subpaths

### Subpaths do pacote

| Import                 | Conteúdo                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `mb-cliente`           | `MultBovinos`, classes de erro, namespace `errors`, helpers, namespace `constants`, tipos.                                                |
| `mb-cliente/errors`    | Classes de erro.                                                                                                                          |
| `mb-cliente/constants` | Constantes abaixo.                                                                                                                        |
| `mb-cliente/helpers`   | `safeImport`, `paginate`, `collectPages`, janelas de data (`getWeeklyWindows`, `getMonthlyWindows`, `lastDayOfMonth`, `firstDayOfMonth`). |
| `mb-cliente/parsers`   | `parseBrNumber`, `parseBrDate`, `parseBrDateTime`, `parseErpRecord`, `parseErpPage`, `countCalendarDays`.                                 |

Todos têm declarações TypeScript.

### `BASE_URL`

```js
{ production: 'https://www.multbovinos.com/servicos', test: 'https://teste.multbovinos.com/servicos' }
```

### `BI_SLUGS` / `ERP_SLUGS` / `REPRODUCAO_SLUGS` / `FINANCEIRO_SLUGS` / `OUTROS_SLUGS`

Mapas `NOME → 'slug'` usados por cada namespace. Úteis para depuração e para montar chamadas com `mb.raw`.

### `CUSTO_PATHS`

```js
{
  INDIRETO: 'custoporanimal/custo-indireto-erp',
  ATIVOS: 'custoporanimal/exportacao-custos-animais-ativos-erp-v2',
  VENDIDOS: 'custoporanimal/exportacao-custos-animais-vendidos-erp-v2',
  MORTOS: 'custoporanimal/exportacao-custos-animais-mortos-erp-v2',
  SALDO_BIOLOGICO: 'custoporanimal/saldo-ativo-biologico-erp',
  BUSCAR_SAIDAS: 'movimentacaomaterial/buscar-saidas',
}
```

> **Grafia crítica:** `animais` (português), não `animals`. Com o inglês, a rota existe mas responde 405 (POST) ou 404 (GET).

### `TIPO_SAIDA_MATERIAL`

| Chave                      | Valor | Significado                |
| -------------------------- | ----- | -------------------------- |
| `VENDA`                    | 2     | Venda                      |
| `PERDA`                    | 3     | Perda                      |
| `CONSUMO_GERAL`            | 4     | Consumo geral              |
| `ORCAMENTO`                | 5     | Orçamento                  |
| `USO_PESSOAL_EPI`          | 8     | Uso pessoal / EPI          |
| `NUTRICIONAL_PASTO`        | 20    | Nutricional — pasto        |
| `PRODUCAO_RACAO`           | 22    | Produção de ração          |
| `PRODUCAO_PRE_MISTURA`     | 23    | Produção de pré-mistura    |
| `NUTRICIONAL_CONFINAMENTO` | 24    | Nutricional — confinamento |
| `TRATAMENTO_ANIMAIS`       | 25    | Tratamento de animais      |
| `MANUT_MAQUINARIOS`        | 27    | Manutenção de maquinários  |
| `ATIVO_FIXO`               | 28    | Ativo fixo                 |
| `PROCESSAMENTO`            | 30    | Processamento              |
| `AJUSTE_INVENTARIO`        | 31    | Ajuste de inventário       |

---

## 24. Endpoints adicionais sem método dedicado

Rotas que respondem HTTP 200 com corpo coerente, mas sem método próprio no cliente — use [`mb.raw`](#20-acesso-cru-raw). Todas ⚠️: filtro de data e volume não verificados. Respostas de grid vêm em formato BR (use `parseErpPage`).

### Custos

| Endpoint                                                 | Tipo | Descrição                                                                                               |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `GET /execucaocalculocusto/`                             | Grid | Histórico de execuções de cálculo de custo: mês de referência, status, duração, fila, mensagem de erro. |
| `GET /custosanimaisporarroba/carregar-ultimos-calculos/` | Ação | `{ cpc: { mes_referencia, data_calculo } }` — último cálculo de custo por arroba.                       |
| `POST /custosanimaisporarroba/carregar-cotacao-arroba/`  | Ação | Cotação de arroba (macho/fêmea) para uma data — corpo `{ processando_custoarroba, data_geral }`.        |
| `GET /custoscargainicial/buscar-ultima-carga-realizada/` | Ação | `{ mes_referencia }` da última carga inicial de custo.                                                  |
| `GET /custosmensaisrateados/datas-preenchidas/`          | Ação | `{ rateamento_por_propriedade, datas: [] }` — meses com rateio preenchido.                              |

### Gráficos e agregados

Respostas `{ dados: {...} }` com números já agregados. A maioria aceita `data_inicial` / `data_final` no corpo, mas o `filtro` devolvido nem sempre bate com a janela pedida.

| Endpoint                                                  | Descrição                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /graficos/obtenha-lotacao-media/`                    | Configuração do cálculo de lotação média.                                                      |
| `GET /graficos/propriedades/`                             | Fazendas da conta com contagem de animais/eventos.                                             |
| `POST /graficos/consumo-retiro/`                          | Consumo por retiro/pasto no período.                                                           |
| `POST /graficos/estoque-faixa-peso/`                      | Estoque por faixa de peso, com `animal_id` por faixa.                                          |
| `POST /graficos/estoque-faixa-peso-arroba-valor/`         | Idem, com valor em arroba.                                                                     |
| `POST /graficos/estoque/`                                 | Movimentação de estoque agregada (entradas, saídas, mortes, vendas).                           |
| `POST /graficos/mortalidade/`                             | Mortalidade por faixa etária.                                                                  |
| `POST /graficos/taxa-lotacao/`                            | Taxa de lotação (UA/ha) atual e média.                                                         |
| `POST /graficos-reprodutivo/jbj-entrada-animal/`          | Entradas mês a mês com peso médio/GMD.                                                         |
| `POST /graficos-reprodutivo/jbj-transferencia-animal/`    | Transferências mês a mês com GMD/GPD.                                                          |
| `POST /graficos-reprodutivo/jbj-venda-animal/`            | Vendas mês a mês com GMD/GPD.                                                                  |
| `POST /medicoes/dashboard-controle-ponderal/`             | GMD/GPD/peso médio por período (`data_inicial`, `data_final`, `tipo`, `rebanho`, `situacoes`). |
| `POST /demonstrativoestoquecategoria/dashboard/`          | Movimentação de estoque por categoria.                                                         |
| `POST /estoqueanimaissegmentocategoria/dashboard/`        | Movimentação por categoria, segmentada por lote.                                               |
| `POST /relatorioestoqueanimaiscategoria/lista-analitico/` | Lista analítica de animais por categoria numa data.                                            |

### Identificação e SISBOV

| Endpoint                             | Tipo | Descrição                                                  |
| ------------------------------------ | ---- | ---------------------------------------------------------- |
| `GET /animaladvertencia/`            | Grid | Advertências por animal (filtro `tipos_adv`).              |
| `GET /cancelamentobrincoeletronico/` | Grid | Cancelamentos de brinco eletrônico (filtro `data`).        |
| `GET /cancelamentobrincosisbov/`     | Grid | Cancelamentos de brinco SISBOV (filtro `data`).            |
| `GET /cancelamentobrincousual/`      | Grid | Cancelamentos de brinco usual.                             |
| `GET /entradaideletronico/`          | Grid | Pedidos de brinco eletrônico (sequência, cor, quantidade). |
| `GET /entradaidusual/`               | Grid | Pedidos de brinco usual.                                   |

### Cadastro e configuração

| Endpoint                                                                                                              | Tipo              | Descrição                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `GET /configuracao-abastecimento/por-tipo/`                                                                           | Ação              | Configuração de abastecimento (combustível, óleo, peças).                               |
| `GET /configuracao-fazenda/obtenha_configuracao/`                                                                     | Ação              | Configuração da fazenda ativa (opções de IA, recálculo de trato, categoria GTA padrão). |
| `GET /configuracoesgeraisreprodutivo/configuracoes-gerais/`                                                           | Ação              | Configuração de desmame por fazenda.                                                    |
| `GET /contrato-relatorio/possui-filhos/`                                                                              | Ação              | `{ dados: boolean }` — se a conta tem subcontratos.                                     |
| `GET /modulo/selecao/`                                                                                                | Seleção           | Módulos habilitados na conta.                                                           |
| `GET /pastagem/selecao/`                                                                                              | Seleção           | Pastos por fazenda.                                                                     |
| `GET /programa/programas-selecionados/`                                                                               | Ação              | Programas genéticos selecionados.                                                       |
| `GET /programa/selecao-com-abcz/`                                                                                     | Seleção           | Programas, incluindo os da ABCZ.                                                        |
| `GET /tipoanimal/`, `/tipoanimal/selecao/`, `/tipoanimal/selecao-com-sexo/`                                           | Grid / Seleção    | Tipos de animal (reprodução, engorda, doadora…).                                        |
| `GET /tipogrupomaterial/selecao/`                                                                                     | Seleção           | Tipos de grupo de material (filtro `id__in`).                                           |
| `GET /funcoesemail/selecao/`                                                                                          | Seleção           | Funções de notificação por e-mail.                                                      |
| `GET /gerenciaremails/formulario/`, `/gerenciaremails/gerenciar_email/`, `/gerenciaremails/gerenciar_email_usuarios/` | Formulário / Ação | Quem recebe notificação por módulo.                                                     |
| `GET /loggenericoimportacao/`                                                                                         | Grid              | Log de importações (filtros `propriedade`, `rotina`).                                   |

Muitos endpoints de grid também expõem `GET /<slug>/formulario/` (estrutura do modelo) e `GET /<slug>/<id>/` (registro individual).

---

## 25. Matriz de viabilidade

Visão consolidada dos endpoints centrais.

| Endpoint                                                                                                                                                       | API | Veredito                                  | Observação                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `obtenha-cadastros-*` (fazendas, localidades, fornecedores, materiais, dieta)                                                                                  | BI  | ✅                                        | Por contrato.                                                                                                                                    |
| `obtenha-cadastros-gados-sisbov`                                                                                                                               | BI  | ✅                                        | Por propriedade.                                                                                                                                 |
| `obtenha-movimentacoes-gados-estoque`                                                                                                                          | BI  | ✅                                        | Por propriedade.                                                                                                                                 |
| `obtenha-suplementacao-animal`                                                                                                                                 | BI  | ✅                                        | Janela livre.                                                                                                                                    |
| `obtenha-producao-racao`                                                                                                                                       | BI  | ✅                                        |                                                                                                                                                  |
| `obtenha-movimentacoes-materiais`                                                                                                                              | BI  | ✅ janela ≤ 31 dias · ❌ leitura completa | Por propriedade.                                                                                                                                 |
| `obtenha-monitoramento-pesagem`                                                                                                                                | BI  | ❌                                        | Conexão cai por volta de 300 s em todas as variações. Use `getMedicoesPesagem`, `bi.animais` (último peso) ou `bi.movEstoque` (peso por evento). |
| `obtenha-movimentacoes-gados-extra`                                                                                                                            | BI  | ❌                                        | Idem. Parcialmente derivável de `movEstoque` + cadastro.                                                                                         |
| `racao`, `conta`, `grupoconta`, `formapagamento`, `unidadesmedidas`, `grupomaterial`, `subgrupomaterial`, `raca`, `pelagem`, `lotealimentar`, `lotefinalidade` | ERP | ✅                                        | Volumes pequenos.                                                                                                                                |
| `contato`, `materiais`, `morte`                                                                                                                                | ERP | ✅                                        |                                                                                                                                                  |
| `venda`                                                                                                                                                        | ERP | ⚠️                                        | Valores zerados.                                                                                                                                 |
| `saida`, `gta`                                                                                                                                                 | ERP | ⚠️                                        | Filtro de data ignorado.                                                                                                                         |
| `exame`                                                                                                                                                        | ERP | 🔕                                        |                                                                                                                                                  |
| `tratamentoanimal`, `tratos`, `vacinacao`                                                                                                                      | ERP | ✅ com janela · ❌ leitura completa       | Sujeitos ao limite silencioso de requisições.                                                                                                    |
| `entradamaterial`                                                                                                                                              | ERP | ✅ com janela · ❌ leitura completa       |                                                                                                                                                  |
| `entrada` (animais)                                                                                                                                            | ERP | ⚠️                                        | Listagem estoura o timeout; use o fluxo por ordem de serviço.                                                                                    |
| `sobracocho`                                                                                                                                                   | ERP | ✅ com janela · ❌ leitura completa       | Cálculo pesado; o cliente já usa 300 s de prazo.                                                                                                 |
| `movimentacaomaterial`                                                                                                                                         | ERP | ❌ listagem · ✅ por id                   |                                                                                                                                                  |
| `viaaplicacaotratamento`                                                                                                                                       | ERP | ❌                                        | 500 na listagem e na busca por id.                                                                                                               |
| `confinamento`                                                                                                                                                 | ERP | ✅ (desde 2026-10) · ✅ por id            |                                                                                                                                                  |
| `custoporanimal/*` (ativos, vendidos, mortos)                                                                                                                  | ERP | ✅                                        | POST, grafia `animais`, cálculo pesado.                                                                                                          |
| Saldo biológico (CPC 29)                                                                                                                                       | ERP | ✅ rota · ⚠️ dados                        | Zerado sem configuração prévia.                                                                                                                  |
| `buscar-saidas`                                                                                                                                                | ERP | ✅                                        | Um dia e um tipo por chamada.                                                                                                                    |

> Endpoints que só têm problema de **volume** (muitas páginas rápidas) se resolvem com janelas de data e blocos. Endpoints com problema de **não resposta** (a menor fatia já estoura o tempo) não têm fatia que responda — o caminho é uma fonte alternativa.

---

### 25.1 Escopo e filtro de cada endpoint (registro)

O cliente guarda o que se sabe de cada grid em `src/erp/registry.js`, e é isso que decide o que `propertyId`, `from`/`to` e o prazo fazem:

- **por fazenda** — `propertyId` seleciona a fazenda; sem `propertyId`, exige uma fazenda já selecionada.
- **conta inteira**, **global** e **vaza outras fazendas** — `propertyId` lança `ValidationError` (não filtraria).
- **desconhecido** (todo endpoint fora da tabela) — `propertyId` seleciona a fazenda e o resultado vem com `scope: 'unverified'`; sem `propertyId`, lê a fazenda que estiver selecionada.
- **filtro ignorado** — `from`/`to` lançam `ValidationError`; **não testado** — `from`/`to` viram `data_0`/`data_1`, sem garantia de que o servidor filtra (confira o campo `filters` da página).
- **campo de fazenda** — o campo do registro que diz a fazenda dele. Nos grids por fazenda, o cliente confere esse campo em cada página (`verifyRecordProperty`, [seção 6](#6-fila-de-fazenda)).

| slug                                           | escopo               | filtro de data                | campo de fazenda | prazo sugerido |
| ---------------------------------------------- | -------------------- | ----------------------------- | ---------------- | -------------- |
| `alteracaopercentualmateriaseca`               | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `animalalteracaosisbov`                        | conta inteira        | ignorado (lança)              | —                | —              |
| `animaldesmamado`                              | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `animalreidentificadosisbov`                   | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `aplicacaoconsumo`                             | por fazenda          | `data`                        | `propriedade`    | —              |
| `aplicacaoconsumoloteanimal`                   | por fazenda          | `data`                        | `propriedade`    | —              |
| `aplicacaoconsumoloteanimalintercorrencia`     | desconhecido         | `periodo`                     | —                | —              |
| `aplicacaoconsumoloteanimalitem`               | por fazenda          | `data`                        | —                | —              |
| `ativos`                                       | conta inteira        | ignorado (lança)              | —                | —              |
| `auditoria`                                    | global               | `data`                        | —                | —              |
| `avaliacaomorfologica`                         | conta inteira        | não testado                   | —                | —              |
| `categoria`                                    | conta inteira        | não testado                   | —                | —              |
| `categoriadecontato`                           | conta inteira        | não testado                   | —                | —              |
| `categoriagta`                                 | conta inteira        | não testado                   | —                | —              |
| `centrodecusto`                                | conta inteira        | não testado                   | —                | —              |
| `cidade`                                       | global               | não testado                   | —                | —              |
| `cofinsst`                                     | conta inteira        | não testado                   | —                | —              |
| `condicoesvenda`                               | conta inteira        | não testado                   | —                | —              |
| `configuracaocategoria`                        | conta inteira        | não testado                   | —                | —              |
| `configuracaocategoriagta`                     | conta inteira        | não testado                   | —                | —              |
| `configuracaoplanilhagenetica`                 | conta inteira        | não testado                   | —                | —              |
| `configuracoesgerais`                          | conta inteira        | não testado                   | —                | —              |
| `configuracoeslayout`                          | conta inteira        | não testado                   | —                | —              |
| `configuracoesleituracocho`                    | conta inteira        | não testado                   | —                | —              |
| `confinamento`                                 | por fazenda          | `data_abertura`               | `propriedade`    | —              |
| `conta`                                        | conta inteira        | não testado                   | —                | —              |
| `contarateio`                                  | conta inteira        | não testado                   | `propriedade`    | —              |
| `contato`                                      | conta inteira        | não testado                   | —                | —              |
| `contatomaodeobra`                             | conta inteira        | não testado                   | —                | —              |
| `controlesincronizacaocurral`                  | conta inteira        | `data`                        | —                | —              |
| `controlesincronizacaombtratos`                | conta inteira        | `data`                        | —                | —              |
| `corpoluteo`                                   | conta inteira        | não testado                   | —                | —              |
| `cultura`                                      | conta inteira        | não testado                   | —                | —              |
| `currais`                                      | por fazenda          | não testado                   | —                | —              |
| `curralerrosexecucaoevento`                    | conta inteira        | ignorado (lança)              | —                | —              |
| `definicaodiariatratos`                        | por fazenda          | `data`                        | —                | —              |
| `detalhesituacaofemea`                         | conta inteira        | não testado                   | —                | —              |
| `diasimprodutivos`                             | conta inteira        | não testado                   | —                | —              |
| `dispositivomovel`                             | conta inteira        | não testado                   | —                | —              |
| `doenca`                                       | conta inteira        | ignorado (lança)              | —                | —              |
| `doencatratamento`                             | conta inteira        | ignorado (lança)              | —                | —              |
| `entidade`                                     | conta inteira        | não testado                   | —                | —              |
| `entradamaterial`                              | por fazenda          | `data`                        | `propriedade`    | —              |
| `entradamaterialitem`                          | por fazenda          | não testado                   | —                | —              |
| `entradasaidamaterial`                         | por fazenda          | ignorado (lança)              | —                | —              |
| `estabelecimentoruralexterno`                  | conta inteira        | não testado                   | —                | —              |
| `estabelecimentoruralinternoexterno`           | conta inteira        | não testado                   | —                | —              |
| `estado`                                       | global               | não testado                   | —                | —              |
| `estatisticasrotinaestoqueanimaldetalhe`       | conta inteira        | ignorado (lança)              | —                | —              |
| `exame`                                        | por fazenda          | não testado                   | `propriedade`    | —              |
| `formapagamento`                               | conta inteira        | não testado                   | —                | —              |
| `graudesangue`                                 | conta inteira        | não testado                   | —                | —              |
| `grupoconta`                                   | conta inteira        | não testado                   | —                | —              |
| `grupocurral`                                  | conta inteira        | não testado                   | `propriedade`    | —              |
| `grupomaterial`                                | conta inteira        | não testado                   | —                | —              |
| `gta`                                          | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `historicoacoesapp`                            | conta inteira        | `data`                        | —                | —              |
| `historicomovimentacaolocalizacaoconfinamento` | por fazenda          | ignorado (lança)              | —                | —              |
| `historicomovimentacaolocalizacaolocalidades`  | por fazenda          | `data`                        | —                | —              |
| `historicomovimentacaolotedeavaliacao`         | conta inteira        | `data`                        | —                | —              |
| `historicomovimentacaoprogramanutricional`     | global               | `data`                        | —                | —              |
| `icmsorigem`                                   | conta inteira        | não testado                   | —                | —              |
| `icmsst`                                       | conta inteira        | não testado                   | —                | —              |
| `inventarioanimais`                            | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `localizacao`                                  | por fazenda          | não testado                   | `propriedade`    | —              |
| `lotealimentar`                                | conta inteira        | não testado                   | —                | —              |
| `lotedeavaliacao`                              | conta inteira        | não testado                   | —                | —              |
| `lotefinalidade`                               | conta inteira        | não testado                   | —                | —              |
| `macho`                                        | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `maquinariosconfinamento`                      | conta inteira        | ignorado (lança)              | —                | —              |
| `materiais`                                    | conta inteira        | não testado                   | —                | —              |
| `medicoespesagem`                              | vaza outras fazendas | ignorado (lança)              | —                | —              |
| `morte`                                        | por fazenda          | `data`                        | `propriedade`    | —              |
| `motivodescartereprodutor`                     | conta inteira        | ignorado (lança)              | —                | —              |
| `movimentacaomaterial`                         | por fazenda          | não testado                   | —                | —              |
| `movimentacaomaterialitem`                     | conta inteira        | ignorado (lança)              | —                | —              |
| `naturezaoperacoes`                            | conta inteira        | não testado                   | —                | —              |
| `operacao`                                     | conta inteira        | não testado                   | —                | —              |
| `outrassaidas`                                 | por fazenda          | não testado                   | `propriedade`    | —              |
| `pais`                                         | conta inteira        | não testado                   | —                | —              |
| `pelagem`                                      | conta inteira        | não testado                   | —                | —              |
| `pissituacaotributaria`                        | conta inteira        | não testado                   | —                | —              |
| `premistura`                                   | conta inteira        | ignorado (lança)              | —                | —              |
| `preparacaosemenconfig`                        | conta inteira        | não testado                   | —                | —              |
| `producaodieta`                                | por fazenda          | ignorado (lança)              | —                | —              |
| `produtoservicos`                              | conta inteira        | ignorado (lança)              | —                | —              |
| `programanutricional`                          | por fazenda          | não testado                   | `propriedade`    | —              |
| `propriedade`                                  | conta inteira        | não testado                   | —                | —              |
| `proprietario`                                 | conta inteira        | não testado                   | —                | —              |
| `proprietariocontato`                          | conta inteira        | não testado                   | —                | —              |
| `raca`                                         | conta inteira        | não testado                   | —                | —              |
| `racao`                                        | conta inteira        | não testado                   | —                | —              |
| `rebanho`                                      | conta inteira        | não testado                   | —                | —              |
| `recepcaoanimais`                              | por fazenda          | ignorado (lança)              | `propriedade`    | —              |
| `regradereplicacao`                            | global               | não testado                   | —                | —              |
| `saida`                                        | por fazenda          | ignorado (lança)              | —                | —              |
| `saidatransferenciapropriedades`               | por fazenda          | `data`                        | `propriedade`    | —              |
| `saidavendaperda`                              | por fazenda          | `data`                        | `propriedade`    | —              |
| `sequenciasmicroregioes`                       | conta inteira        | não testado                   | —                | —              |
| `setor`                                        | conta inteira        | não testado                   | `propriedade`    | —              |
| `situacaomovimentacaomaterial`                 | conta inteira        | não testado                   | —                | —              |
| `sobracocho`                                   | por fazenda          | `data`                        | `propriedade`    | 300 s          |
| `subgrupomaterial`                             | conta inteira        | não testado                   | —                | —              |
| `subgrupomaterialtratamentos`                  | conta inteira        | ignorado (lança)              | —                | —              |
| `subgrupomaterialzoossanitario`                | conta inteira        | ignorado (lança)              | —                | —              |
| `tecnicacongelacao`                            | conta inteira        | não testado                   | —                | —              |
| `tipodecategoriadecontato`                     | conta inteira        | não testado                   | —                | —              |
| `tipomorte`                                    | conta inteira        | ignorado (lança)              | —                | —              |
| `tipopastagem`                                 | conta inteira        | não testado                   | —                | —              |
| `tipoprotocolo`                                | conta inteira        | ignorado (lança)              | —                | —              |
| `tiposadv`                                     | conta inteira        | não testado                   | —                | —              |
| `tiposativos`                                  | conta inteira        | ignorado (lança)              | —                | —              |
| `tipovendadescartedevolucao`                   | conta inteira        | não testado                   | —                | —              |
| `transferencialotealimentar`                   | por fazenda          | `data`                        | —                | —              |
| `transferencialotefinalidade`                  | por fazenda          | `data`                        | —                | —              |
| `transferenciapropriedade`                     | conta inteira        | `data`                        | —                | —              |
| `tratamentoanimal`                             | por fazenda          | `data`                        | `propriedade`    | —              |
| `tratamentoshormonios`                         | conta inteira        | ignorado (lança)              | —                | —              |
| `tratos`                                       | por fazenda          | `data`                        | `propriedade`    | —              |
| `tratosdiariosprevistos`                       | conta inteira        | ignorado (lança)              | —                | —              |
| `tratositem`                                   | por fazenda          | `movimentacao_material__data` | —                | —              |
| `unidadecotacao`                               | conta inteira        | não testado                   | —                | —              |
| `unidadesmedidas`                              | conta inteira        | não testado                   | —                | —              |
| `usuario`                                      | conta inteira        | ignorado (lança)              | —                | —              |
| `vacinacao`                                    | por fazenda          | `data`                        | `propriedade`    | —              |
| `venda`                                        | por fazenda          | não testado                   | `propriedade`    | —              |

A sonda de 2026-10-29 comparou a contagem da primeira página sem fazenda selecionada e com uma fazenda selecionada (escopo) e com e sem uma janela de 7 dias (filtro de data). A segunda sonda, ampla, no mesmo dia, mediu os grids que restavam com método de página: a primeira página sem fazenda e com duas fazendas diferentes, e o filtro de data com uma janela recente e uma de 2020 ("ignorado" só quando as duas devolvem o total). Também conferiu o campo `propriedade` dos registros nos grids por fazenda: em todos os registros vistos, ele era a fazenda selecionada. Seguem desconhecidos os grids que vieram vazios em todas as consultas (protocolo, ocorrência, sêmen, embrião, cobertura, parto, os dois logs de replicação e a intercorrência) e `tratamentosvacinasvermifugos`, que estourou o prazo com fazenda selecionada.

## 26. Pegadinhas

### Usando o cliente

| Sintoma                                                              | Causa                                                                                           | Solução                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PropertyNotSelectedError` num `bi.*.get()` ou num grid por fazenda  | Endpoint por fazenda sem `propertyId` e sem seleção.                                            | Passe `{ propertyId }` ou chame `mb.selectProperty()` antes.                                                                |
| `PropertyNotSelectedError` com `reason: 'changed_during_pagination'` | A fazenda mudou entre duas páginas (outra operação na mesma instância, ou `connect()` no meio). | Não mude de fazenda enquanto pagina; termine a coleta antes. Para reconectar, use `mb.relogin()`.                           |
| `ValidationError` com `field: 'propertyId'`                          | Endpoint da conta inteira, global ou que vaza outras fazendas.                                  | Tire o `propertyId`; nos que vazam, atribua a fazenda pelo campo de cada registro.                                          |
| Resultado com `scope: 'unverified'`                                  | `propertyId` num endpoint cujo escopo ainda não foi confirmado.                                 | Confira no seu ambiente se a seleção filtra o resultado antes de confiar nela.                                              |
| `NotFoundError` numa busca por id                                    | Registro de outra fazenda, ou id inexistente.                                                   | Selecione a fazenda dona e tente de novo; se persistir, o id não existe.                                                    |
| Campo numérico de trato com HTML                                     | A API devolve HTML no lugar do número em alguns registros.                                      | Trate como ausente.                                                                                                         |
| Dados de outra fazenda num endpoint por propriedade                  | Outra sessão do mesmo usuário mudou a seleção no servidor.                                      | Uma sessão ativa por usuário; ou uma credencial por processo.                                                               |
| `ValidationError` "opção desconhecida"                               | Filtro do servidor passado como opção de primeiro nível.                                        | Mova para `extraParams`.                                                                                                    |
| `ValidationError` com `field: 'from/to'`                             | Grid cujo filtro de data a API ignora.                                                          | Remova `from`/`to`, pagine tudo e filtre no cliente.                                                                        |
| `EmptyResponseError` num endpoint que sempre teve dados              | Limite silencioso de requisições.                                                               | Use `safeImport`; espace os blocos; retome de `err.page`.                                                                   |
| `EmptyResponseError` num módulo que você não usa                     | Módulo vazio na sua conta.                                                                      | Passe `{ allowEmpty: true }`.                                                                                               |
| Coleta "terminou" mas faltam dados                                   | `maxPages` ou `onPage` interromperam.                                                           | Confira `complete` e retome de `nextPage`.                                                                                  |
| Timeout num endpoint que "deveria" responder                         | Leitura completa de um grid gigante, ou cálculo pesado.                                         | Use janela de data onde o filtro funciona; custos e sobra de cocho já usam 300 s, e `timeoutMs` na chamada aumenta o prazo. |
| `EndpointUnavailableError`                                           | Método ❌.                                                                                      | Veja `err.workaround`; teste a busca por id quando houver.                                                                  |
| Brinco `"045"` continua string                                       | Inteiros sem pontuação não são convertidos (de propósito).                                      | Converta você mesmo se a coluna for numérica.                                                                               |
| Valores R$ zerados em `getVendas()`                                  | Campos não preenchidos na origem.                                                               | Receita em `bi.movEstoque.get().valor_total`.                                                                               |
| `getSaldoBiologico()` devolve zeros                                  | Configuração pendente no MBWEB.                                                                 | Configure categorias, cotações e % de imposto.                                                                              |
| Pesagem e movimentação extra do BI não existem no cliente            | Endpoints inviáveis (a conexão cai por volta de 300 s).                                         | `getMedicoesPesagem()`, `bi.animais` (último peso), `bi.movEstoque` + `bi.animais`.                                         |
| Campo `localidade`/`lote` do animal é `undefined`                    | Os campos não existem no cadastro.                                                              | Use `localizacao` e `lote_alimentar` / `lote_avaliacao` / `lote_finalidade`.                                                |

### Falando direto com a API

| Sintoma                                | Causa                                                      | Solução                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 404 em endpoint ERP                    | Slug errado.                                               | ERP usa **minúsculas concatenadas, sem hífen** (`grupomaterial`); BI usa **hífens** (`obtenha-cadastros-fazendas`). Confira em `constants`. |
| 401 / token rejeitado                  | Falta o prefixo `JWT `.                                    | `Authorization: JWT <token>`.                                                                                                               |
| `definir-propriedade` responde 404     | Grafia errada.                                             | `POST /usuario/<id>/selecione-propriedade/`.                                                                                                |
| A seleção não reduz o resultado        | Endpoint por contrato (ou exceção como `medicoespesagem`). | Esperado.                                                                                                                                   |
| `custoporanimal/*` responde 404        | Fazenda não selecionada.                                   | Selecione a fazenda antes.                                                                                                                  |
| Filtro de data sem efeito              | Endpoint ignora o filtro, ou usa outro nome.               | Consulte `filters` na resposta do grid; espelhe em blocos quando não houver filtro.                                                         |
| 200 vazio depois de muitas requisições | Limite silencioso de requisições.                          | Espere (minutos a horas); nunca apague dados locais por causa de um vazio.                                                                  |
| Números e datas como texto             | Formato BR do grid.                                        | Converta `"1.234,56"` e `DD/MM/YYYY` (ou use `parseErpPage`).                                                                               |
