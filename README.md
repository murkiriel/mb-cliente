# mb-cliente

[![verify](https://github.com/Murkiriel/mb-cliente/actions/workflows/verify.yml/badge.svg)](https://github.com/Murkiriel/mb-cliente/actions/workflows/verify.yml) [![licença: AGPL-3.0](https://img.shields.io/badge/licen%C3%A7a-AGPL--3.0-blue)](LICENSE)

> ⚠️ Cliente **não oficial** da API de Integração MultBovinos, sem afiliação nem endosso da MultBovinos; use de acordo com os termos do seu contrato com o fornecedor.

Cliente Node.js para a API de Integração MultBovinos (MBWEB). Expõe a API como chamadas de método tipadas e trata sozinho autenticação, paginação, formato BR, limite silencioso de requisições e as alternativas documentadas para endpoints inviáveis.

**Requisitos:** Node.js 22+ · pacote **só ESM** (`import`, sem `require()`) · sem dependências de produção · tipos TypeScript incluídos

> 📖 Este README é um guia de uso com exemplos e decisões de projeto. A **referência completa de cada método** (parâmetros, formato de retorno, status ✅/⚠️/🔕/❌ de cada endpoint) e o **protocolo HTTP cru** da API estão em **[docs/api.md](docs/api.md)**.

---

## Instalação

O pacote não é publicado no npm. Instale direto do repositório, fixando uma tag (sempre com o prefixo `github:`; um `"mb-cliente": "^0.1.0"` no `package.json` procuraria no registro do npm, onde o nome não pertence a este projeto):

```bash
npm install github:Murkiriel/mb-cliente#v0.2.0
```

**Node.js 22+ e só ESM.** O pacote é `"type": "module"` e o mapa de `exports` só tem a condição `import`: use `import { MultBovinos } from 'mb-cliente'`. `require()` não é suportado. Subpaths públicos, cada um com o seu `.d.ts`: `mb-cliente/errors`, `mb-cliente/constants`, `mb-cliente/helpers` e `mb-cliente/parsers`.

**Credenciais:** você precisa de um usuário com acesso à API de Integração MultBovinos. Guarde e-mail e senha em variáveis de ambiente (os exemplos usam `MB_EMAIL` e `MB_PASS`; há um modelo em `.env.example`), nunca no código.

---

## Decisões de arquitetura

Escolhas que um leitor do código poderia confundir com lacuna, mas são deliberadas:

- **Camadas: `client` (HTTP cru) → `grid`/`erp`/`bi` (contratos de domínio).** O cliente HTTP não sabe nada sobre paginação de negócio, formato BR ou regra de qual endpoint precisa de fazenda selecionada — isso vive inteiramente na camada `erp`/`bi`. Mantém o cliente reutilizável se a API mudar de forma de paginação sem reescrever autenticação/transporte.
- **Sem espaçamento de chamadas nem sistema de plugins/interceptadores embutido** — ver justificativa em [Por que não há espaçamento de chamadas nem interceptador embutido](#por-que-não-há-espaçamento-de-chamadas-nem-interceptador-embutido). Resumo: só quem consome sabe o volume real de chamadas; embutir uma política genérica arriscaria estar errada para metade dos consumidores.
- **Fazenda selecionada é estado do servidor, então toda troca de fazenda passa por uma fila exclusiva por instância.** Ver [Fazenda selecionada e a fila exclusiva](#fazenda-selecionada-e-a-fila-exclusiva).
- **Falhas nunca viram "sem dados" caladas.** Resposta vazia no meio da paginação, coleta cortada por `maxPages`, opção desconhecida ou filtro de data que a API ignora: tudo lança erro ou aparece no resultado (`complete: false`), em vez de devolver um conjunto incompleto como se fosse inteiro.

---

## Início rápido

```js
import { MultBovinos } from 'mb-cliente'

const mb = new MultBovinos({
  email: process.env.MB_EMAIL,
  password: process.env.MB_PASS, // senha NUNCA em arquivo
})

const { token, properties } = await mb.connect()
// properties: [{ id: 1, nome: 'Fazenda A', cnpj: '...' }, ...]

// BI — leitura analítica
const { items: animais } = await mb.bi.animais.getAll() // todas as fazendas
const { items: movs } = await mb.bi.movMateriais.get({
  propertyId: properties[0].id, // endpoint por fazenda: propertyId ou selectProperty() antes
  from: '2026-06-01',
  to: '2026-06-30',
})

// ERP — transacional/cadastral
const summary = await mb.erp.sanitario.getVacinacoes({
  from: '2026-01-01',
  to: '2026-06-30',
  delayMs: 500, // opcional: o cliente não espaça as páginas por conta própria (padrão 0)
  onPage: (items) => db.vacinacoes.insertMany(items),
})
// summary.complete === true só quando o servidor disse que não havia mais páginas
```

> ⚠️ **Por padrão o cliente não tenta de novo em falha de rede** e não se recupera sozinho de uma queda de conexão (`NetworkError`); o relogin automático cobre só HTTP 401. Isso é deliberado (ver [Decisões de arquitetura](#decisões-de-arquitetura)), mas significa que **é sua responsabilidade** habilitar `retry` (opção `retry: { attempts, backoffMs }` do construtor, ver [Resiliência a falhas de rede](#resiliência-a-falhas-de-rede-novas-tentativas-e-espera-crescente-opcionais)) e tratar quedas de conexão longas antes de rodar em produção contra volumes grandes.

---

## Autenticação

### Login padrão

```js
const { token, properties } = await mb.connect()
// properties: [{ id: 2, nome: 'Fazenda B', cnpj: '' }, ...]
```

Retorna o token JWT e a lista de fazendas vinculadas à conta. Deve ser chamado antes de acessar `bi.*` ou `erp.*`.

> **Nota de campo:** a API retorna as fazendas no campo `fazendas` (não `propriedades`) quando o login é bem-sucedido. O cliente lê `fazendas ?? propriedades` para compatibilidade.

### Selecionar fazenda (endpoints ERP escopados)

Endpoints ERP como `getTratos` operam no contexto da fazenda selecionada no servidor. Selecione a fazenda antes de chamá-los, ou passe `propertyId` na própria chamada (ver [Escopo de fazenda nos grids do ERP](#escopo-de-fazenda-nos-grids-do-erp-propertyid)); os métodos de `erp.custos.*` e o relatório de Gestão Nutricional também recebem `propertyId` e fazem a seleção sozinhos:

```js
const { properties } = await mb.connect()

for (const prop of properties) {
  await mb.selectProperty(prop.id)

  // agora os endpoints ERP retornam dados desta fazenda
  await mb.erp.estoque.getTratos({
    from: '2026-06-01',
    to: '2026-06-30',
    onPage: (items) => db.tratos.insertMany(items),
  })
}
```

`selectProperty` lança `PropertyNotSelectedError` se o `propertyId` não estiver na lista retornada por `connect()`.

O token é renovado automaticamente quando expira (HTTP 401 → relogin transparente na próxima requisição).

### Reconectar sem perder a fazenda (`relogin`)

Para reconectar no meio de uma sessão (ex.: depois de uma queda longa de conexão), use **`mb.relogin()`**, não `connect()`:

```js
await mb.relogin() // novo login + reseleção da fazenda desejada; devolve { token, properties }
```

- `relogin()` faz um novo login e reseleciona a fazenda que a instância tinha (inclusive uma troca que estava em andamento). A reseleção **não conta como troca de fazenda**: paginações em andamento continuam.
- `connect()` começa uma **sessão nova, sem fazenda selecionada**. Se havia uma fazenda selecionada, as paginações em andamento são interrompidas com `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`).

### Fazenda selecionada e a fila exclusiva

A fazenda selecionada é **estado do servidor, por usuário**: se duas operações "seleciona e chama" se intercalarem na mesma instância, uma lê os dados da fazenda da outra. Por isso todo fluxo que seleciona fazenda roda numa **fila exclusiva por instância**, uma operação de cada vez, na ordem de chegada:

- `mb.connect()` e `mb.selectProperty()`;
- `erp.custos.*` com `propertyId` (selecionam a fazenda e fazem o POST na mesma seção);
- `erp.estoque.getRelatorioGestaoNutricionalLote()`, `reprocessRelatorioGestaoNutricionalLinha()` e `reprocessRelatorioGestaoNutricionalLote()` (sempre selecionam a fazenda do `propertyId` e fazem o POST na mesma seção);
- `bi.animais.getAll()`, `bi.movEstoque.getAll()` e `mb.forAllProperties()`;
- os `get()` por fazenda do BI com `propertyId` (`bi.animais`, `bi.movEstoque`, `bi.movMateriais`, `bi.suplementacao`, `bi.producaoRacao`);
- uma página de grid ERP com `propertyId` **diferente** da fazenda já selecionada (seleção e leitura na mesma seção).

A fila é reentrante: o callback de `mb.forAllProperties()` pode chamar `bi.suplementacao.get()` sem esperar por si mesmo. Trocar de fazenda ali dentro (`selectProperty()` ou um `propertyId` de outra fazenda) lança `ValidationError`: mudaria a fazenda no meio da operação de fora.

Os `get()` por fazenda do BI aceitam `propertyId` (seleciona e consulta na mesma seção). **Sem `propertyId`, exigem uma fazenda já selecionada nesta instância** e lançam `PropertyNotSelectedError` (com `endpoint`) em vez de devolver a fazenda que outra sessão do mesmo usuário tivesse deixado selecionada no servidor:

```js
// Uma das duas formas:
const { items } = await mb.bi.animais.get({ propertyId: 1 })

await mb.selectProperty(1)
const { items: movs } = await mb.bi.movEstoque.get()
```

**Grids ERP:** cada página entra na fila como **leitura compartilhada** (sem `propertyId`, ou com o `propertyId` da fazenda que já está selecionada). Várias páginas rodam juntas, mas nunca ao mesmo tempo que uma troca de fazenda; uma troca espera as páginas em voo, e uma página espera a troca. Uma **paginação** (`getTratos`/`getVacinacoes`/`getTratamentos`, os `iter*`, `mb.erp.pages()`/`collect()` e também o `paginate()` sobre qualquer método de grid) que vê a fazenda mudar entre duas páginas lança `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`) sem entregar a página misturada. Não mude de fazenda enquanto pagina.

**Leituras da fazenda já selecionada** (os `get()` do BI sem `propertyId` e os custos sem `propertyId`) também são leituras compartilhadas: rodam juntas entre si, só não junto de uma troca de fazenda.

**Relogin:** se a sessão expirar, o cliente reloga e reseleciona a fazenda **desejada**, inclusive uma troca que estava em andamento. Requisições que receberam 401 nesse meio esperam a reseleção terminar antes de repetir. Para reconectar por conta própria, use [`mb.relogin()`](#reconectar-sem-perder-a-fazenda-relogin).

> ⚠️ Como a seleção vale **por usuário no servidor**, dois processos (ou duas máquinas) usando a mesma conta ao mesmo tempo podem trocar a fazenda um do outro — a fila só protege dentro de uma instância. Não rode coletas simultâneas com o mesmo usuário.
>
> Nos grids por fazenda cujo registro traz a própria fazenda, o cliente confere cada página (`verifyRecordProperty`, ligado por padrão) e lança `PropertyNotSelectedError` com `reason: 'changed_by_another_session'` quando aparece registro de outra fazenda. Nos demais grids essa conferência não existe.

### Modo sem servidor (Lambda / Edge Functions)

Em ambientes sem estado, persista o retorno de `connect()` e reidrate a próxima instância sem fazer login novamente:

```js
// Primeira execução
const mb = new MultBovinos({ email, password: process.env.MB_PASS })
const { token, properties } = await mb.connect()
await cache.set('mb', { token, properties }) // Redis, SSM Parameter Store, etc.

// Execuções seguintes — token ainda válido
const cached = await cache.get('mb')
const mb = new MultBovinos({
  email,
  password: process.env.MB_PASS,
  token: cached.token,
  properties: cached.properties, // restaura lista de fazendas
})
// connect() não é necessário — já autenticado. A instância nova não tem
// fazenda selecionada: passe propertyId (ou chame selectProperty antes).
const { items } = await mb.bi.animais.get({ propertyId: cached.properties[0].id })

// Quando o token expirar, o cliente faz relogin automaticamente e continua
// Atualize o cache após:
await cache.set('mb', { token: mb.getToken(), properties: mb.getProperties() })
```

---

## API BI — Leitura analítica

Envelope `{ dados: [...] }` normalizado para `{ items, count }`.

> **Nota:** `bi.fazendas.get()` retorna muito mais registros do que as propriedades da conta: é o cadastro de **produtores/fazendas de origem do gado comprado** (os nomes batem com `animais.fornecedor` e `gta.produtor_texto`). Para rastrear a origem de um animal, prefira `bi.fornecedores.get()`: usa o mesmo `entidade_id` referenciado por `animais.fornecedor_id` e `gta.produtor`, enquanto `bi.fazendas` usa um `propriedade_id` próprio que não bate com ID nenhum do resto do sistema (só dá pra cruzar por nome). Ver "Rastreabilidade de origem" abaixo.

### Da conta inteira (independentes da fazenda selecionada)

```js
const { items } = await mb.bi.fazendas.get()
const { items } = await mb.bi.localidades.get()
const { items } = await mb.bi.fornecedores.get()
const { items } = await mb.bi.materiais.get()
const { items } = await mb.bi.dieta.get()
```

Todos os métodos do BI aceitam `timeoutMs`, que troca o prazo da instância só naquela chamada: `get({ timeoutMs })`, `get({ propertyId, from, to, timeoutMs })` e `getFormulacao(producaoId, { timeoutMs })`.

### Por propriedade (precisa de `propertyId` ou de uma fazenda selecionada)

Sem `propertyId` e sem `selectProperty()` antes, lançam `PropertyNotSelectedError` (ver [Fazenda selecionada e a fila exclusiva](#fazenda-selecionada-e-a-fila-exclusiva)).

```js
// Uma fazenda: propertyId seleciona e consulta na mesma seção exclusiva
const { items } = await mb.bi.animais.get({ propertyId: 1 })
const { items } = await mb.bi.movEstoque.get({ propertyId: 1 })

// ...ou a fazenda já selecionada nesta instância
await mb.selectProperty(1)
const { items } = await mb.bi.animais.get()

// Todas as fazendas (sequencial obrigatório — estado no servidor)
const { items, byProperty } = await mb.bi.animais.getAll()
// byProperty: Map<propertyId, Animal[]>

const { items } = await mb.bi.movEstoque.getAll()

// Fazenda grande: os mesmos registros em lotes, lidos aos poucos (a memória
// não cresce com o rebanho). onBatch é esperado antes do próximo lote.
const { count } = await mb.bi.animais.forEachBatch({ propertyId: 1 }, async (lote) => {
  await gravar(lote)
})

// Endpoints por-propriedade sem getAll() próprio — use mb.forAllProperties()
const suplementacao = await mb.forAllProperties(async (propId) => {
  const { items } = await mb.bi.suplementacao.get({ from: '2026-01-01', to: '2026-12-31' })
  return items
})
// Cada item recebe _propertyId automaticamente

// bi.suplementacao — escopo: por propriedade
const { items } = await mb.bi.suplementacao.get({
  propertyId: 1,
  from: '2026-01-01',
  to: '2026-12-31',
})

// bi.movMateriais — escopo: por propriedade.
// Janela de data obrigatória (params: from, to — YYYY-MM-DD), de 1 a 31 dias.
const { items } = await mb.bi.movMateriais.get({
  propertyId: 1,
  from: '2026-06-01',
  to: '2026-06-30',
})
```

### Produção de ração e formulação

`producaoRacao` é **por propriedade** e exige janela de data. O `producao_id` retornado é o ID interno da API MB — não confunda com IDs de produção exibidos em outros sistemas integrados.

```js
// 1. Lista de batidas por fazenda e período
await mb.selectProperty(1)
const { items } = await mb.bi.producaoRacao.get({ from: '2026-06-01', to: '2026-06-30' })
// items: [{ producao_id, data, batida, vagao, racao_id, racao,
//           responsavel_id, responsavel, quantidade_produzida, custo, custo_producao }]
// Nota: data retorna em formato DD/MM/YYYY

// 2. Formulação (ingredientes) de uma batida específica
const { items: formula } = await mb.bi.producaoRacao.getFormulacao(items[0].producao_id)
// formula: [{ ingrediente_id, ingrediente,
//             perc_ms_ingrediente, perc_ms_racao, perc_ms_formula, perc_ms_producao,
//             perc_mo_formula, perc_mo, perc_ms_racao_prod,
//             quantidade, custo_unitario, custo_total }]
// Nota: todos os campos numéricos chegam como string — aplicar parseFloat() antes de usar

// Padrão recomendado: janelas semanais por fazenda
const properties = mb.getProperties()
for (const prop of properties) {
  await mb.selectProperty(prop.id)
  for (const w of getWeeklyWindows(from, to)) {
    const { items } = await mb.bi.producaoRacao.get({ from: w.from, to: w.to })
    for (const r of items) {
      db.producaoRacao.upsert(r)
      const { items: formula } = await mb.bi.producaoRacao.getFormulacao(r.producao_id)
      db.producaoRacaoFormulacao.replaceFor(r.producao_id, formula)
    }
  }
}
```

> **Atenção ao desempenho:** `getFormulacao` faz uma requisição por batida. Com muitas batidas no período, uma carga inicial longa pode levar dezenas de minutos. Sincronizações incrementais são rápidas.

### Endpoints inviáveis (BI)

`obtenha-monitoramento-pesagem` (pesagem) e `obtenha-movimentacoes-gados-extra` (movimentação extra) não respondem: a conexão cai por volta de 300 s, mesmo com `timeoutMs: 600_000`, em todas as variações testadas. O cliente **não os expõe**. Alternativas:

- **pesagem:** `erp.animais.getMedicoesPesagem()` (pesagem real por animal), `bi.animais.get()` (`ultimo_peso`/`data_ultimo_peso`) e `bi.movEstoque.get()` (`peso` por evento);
- **movimentação extra:** transferências em parte em `bi.movEstoque.get()`; estado atual de local e lote em `bi.animais.get()`.

---

## API ERP — Transacional/Cadastral

Grid paginado. Números BR e datas BR são convertidos automaticamente, com estas regras:

- **Número** só é convertido quando tem pontuação BR: vírgula decimal (`"12,5"`, `"1.234,56"`) ou separador de milhar (`"1.045"`). Inteiro sem pontuação fica string (`"045"` continua `"045"`, `"01"` continua `"01"`), para não destruir brincos, currais e códigos.
- Campos `*_texto`, `*_usual` e identificadores (`identificacao`, `sisbov`, `codigo`, `documento`, `cpf`, `cnpj`, `cep`, `telefone`, `celular`, `ordem_servico`) **nunca** são convertidos.
- **Data** `DD/MM/YYYY` vira `YYYY-MM-DD` só se existir no calendário: `"31/02/2026"` fica como veio.
- **Data e hora** (`"08/03/2026 14:05"`, como em tratos e movimentações) **não** é convertida automaticamente, porque o formato com hora varia por endpoint. Para converter, use `parseBrDateTime` de `mb-cliente/parsers`: `"08/03/2026 14:05"` → `"2026-03-08 14:05"` (os segundos ficam, se vierem); data ou hora inexistente volta como veio.
- **HTML no lugar de número:** em alguns registros de tratos e de itens de trato, os campos `quantidade_decimal`, `valor_total`, `peso_balanca`, `peso_balanca_final` e `valor_unitario` podem vir com um trecho de HTML em vez do número. O parse não mexe nesse texto; trate o valor como ausente.

### Paginação

```js
// Uma página
const { items, count, hasMore, nextPage, filters, modelo } = await mb.erp.sanitario.getExames({
  page: 1,
})
// filters: declaração de filtros que o servidor manda junto (nome e tipo); modelo: nome do modelo no servidor

// Todas as páginas, processadas página a página
const summary = await mb.erp.sanitario.getVacinacoes({
  from: '2026-01-01',
  to: '2026-06-30',
  delayMs: 500, // pausa entre páginas, opcional (padrão 0: o cliente não espaça chamadas por conta própria)
  maxPages: 200, // limite por execução — retomar com startPage na próxima
  onPage: async (items, pageNum) => {
    await db.vacinacoes.insertMany(items)
    // return false para parar
  },
})
// summary: { totalFetched, pagesRead, stoppedAt, complete, nextPage, possiblyRateLimited }
if (!summary.complete) {
  // maxPages ou onPage interromperam: retome com { startPage: summary.nextPage }
}
```

`getVacinacoes`, `getTratamentos` e `getTratos` devolvem, além dos totais:

- `complete` — `true` **só** quando o servidor disse que não havia mais páginas. Com `maxPages` atingido ou `onPage` devolvendo `false`, vem `false`;
- `nextPage` — de onde retomar (`null` quando completo);
- `possiblyRateLimited` — a primeira página veio vazia e `allowEmpty` a absorveu;
- `scope: 'unverified'` — só quando `propertyId` foi usado num endpoint de escopo desconhecido (ver [Escopo de fazenda nos grids do ERP](#escopo-de-fazenda-nos-grids-do-erp-propertyid)).

**Iteradores assíncronos.** `erp.sanitario.iterVacinacoes`/`iterTratamentos` e `erp.estoque.iterTratos` são as versões `for await` dos três métodos acima (mesmas opções, sem `onPage`). Para qualquer outro método de página única, use `paginate(fetchPage, params)`, exportado na raiz e em `mb-cliente/helpers` (opções `page`, `maxPages`, `delayMs` — padrão 0 — e `signal`):

```js
import { paginate } from 'mb-cliente'

for await (const { items, page } of mb.erp.sanitario.iterVacinacoes({ from, to })) {
  await db.vacinacoes.insertMany(items)
}

for await (const { items, page } of paginate((p) => mb.erp.cadastros.getMateriais(p))) {
  await db.materiais.upsertMany(items)
}
```

Para juntar todas as páginas em memória, `collectPages(iterador)` (raiz e `mb-cliente/helpers`) aceita qualquer um desses iteradores e devolve `{ items, pagesRead, complete, nextPage, possiblyRateLimited, scope? }`:

```js
import { collectPages, paginate } from 'mb-cliente'

const { items, complete, nextPage } = await collectPages(
  paginate((p) => mb.erp.cadastros.getMateriais(p), { maxPages: 50 })
)
// complete === false → maxPages atingido; retome de nextPage
```

Regras da paginação (valem para `fetchAll`, `iter*`, `paginate` e `mb.erp.pages`/`collect`):

- **Resposta vazia depois da primeira página sempre lança `EmptyResponseError`**, mesmo com `allowEmpty`: o servidor tinha anunciado mais páginas, então o vazio é limite silencioso de requisições, nunca "fim".
- **`allowEmpty` vale só para a primeira página** e é escolha de quem chama: nenhum método liga sozinho. Com ele, uma primeira página vazia vira `{ items: [], possiblyRateLimited: true, reason: 'possibly_rate_limited' }` em vez de `EmptyResponseError`. Passe `{ allowEmpty: true }` quando souber que o módulo pode estar vazio na sua conta.
- **Opção desconhecida lança `ValidationError`**. Filtros do servidor vão em `extraParams` — ex.: `getEntradaMaterial({ from, to, extraParams: { documento: '123' } })`.
- **`from`/`to` lançam `ValidationError`** nos grids cujo filtro de data a API ignora: `erp.animais.getSaidas`, `getHistoricoMovimentacaoConfinamento`, `getMedicoesPesagem`, `getInventariosAnimais`, `erp.estoque.getGtas` e `getMovimentacaoMaterialItens`. Assim ninguém acha que recebeu só a janela.
- **`delayMs` é 0 por padrão**: o cliente não espaça as páginas por conta própria. Quem consome decide a pausa (ver [Por que não há espaçamento de chamadas](#por-que-não-há-espaçamento-de-chamadas-nem-interceptador-embutido)).
- **`timeoutMs`** troca o prazo da instância só nesta página (ou em cada página da coleta). Sem ele, vale o prazo sugerido pelo registro do endpoint, se houver (a sobra de cocho já usa 300 s), ou o da instância.
- **`signal`** (um `AbortSignal`) é aceito pelos métodos de página do ERP, pelos `fetchAll` e pelos `iter*`/`paginate`; também interrompe a espera `delayMs` entre páginas. Ver [Cancelamento](#cancelamento-signal).

### Escopo de fazenda nos grids do ERP (`propertyId`)

Todo método de página única do ERP, os `fetchAll` (`getVacinacoes`/`getTratamentos`/`getTratos`), os `iter*` e `mb.erp.fetchPage`/`pages`/`collect` aceitam **`propertyId`**: a página é lida com essa fazenda selecionada. O que acontece depende do escopo do endpoint, guardado no registro do cliente (`src/erp/registry.js`; tabela completa em [docs/api.md, seção 25.1](docs/api.md#251-escopo-e-filtro-de-cada-endpoint-registro)):

| Escopo do endpoint                                        | Com `propertyId`                                                                                                                                                                                                                          | Sem `propertyId`                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **por fazenda**                                           | Seleciona a fazenda. Se ela já é a selecionada, a leitura é compartilhada; senão, seleção e leitura rodam na mesma seção exclusiva da [fila](#fazenda-selecionada-e-a-fila-exclusiva). Depois, a fazenda selecionada é a do `propertyId`. | Exige fazenda já selecionada; sem ela, lança `PropertyNotSelectedError`. |
| **conta inteira**, **global** ou **vaza outras fazendas** | Lança `ValidationError`: a seleção não filtraria o resultado.                                                                                                                                                                             | Lê normalmente.                                                          |
| **desconhecido** (sem evidência)                          | Seleciona a fazenda como acima, e o resultado vem com `scope: 'unverified'` (não se confirmou que o endpoint respeita a seleção).                                                                                                         | Lê a fazenda que estiver selecionada.                                    |

```js
// Uma janela de tratos de uma fazenda, sem selectProperty() antes
const summary = await mb.erp.estoque.getTratos({
  propertyId: 1,
  from: '2026-06-01',
  to: '2026-06-07',
  onPage: (items) => db.tratos.insertMany(items),
})
// tratos é por fazenda (confirmado): a fazenda propertyId foi selecionada antes da coleta

// Grid por fazenda sem propertyId e sem fazenda selecionada → PropertyNotSelectedError
await mb.erp.estoque.getGtas() // lança, se nenhuma fazenda foi selecionada nesta instância

// Endpoint da conta inteira com propertyId → ValidationError
await mb.erp.cadastros.getMateriais({ propertyId: 1 }) // lança
```

Uma troca de fazenda no meio de uma coleta (por `selectProperty`, por outra chamada com `propertyId` diferente, por `connect()`…) interrompe a paginação com `PropertyNotSelectedError` (`reason: 'changed_during_pagination'`). Um `propertyId` fora da lista do login lança `PropertyNotSelectedError` (`propertyId`, `availableIds`), como `selectProperty()`.

### Qualquer grid pelo slug (`mb.erp.fetchPage` / `pages` / `collect`)

Para um grid sem método dedicado, ou para montar a chamada a partir de um nome guardado, use o acesso genérico pelo **slug** (o nome do recurso, sem barras nem query string, ex.: `'tratos'`). Tem o mesmo parse BR, a mesma fila de fazenda, o mesmo registro (filtro de data, escopo, prazo) e as mesmas guardas dos métodos dedicados:

```js
// Uma página (mesmas opções dos métodos de página única)
const page = await mb.erp.fetchPage('tipoanimal', { page: 1 })

// Iterador de páginas (opções de pages: startPage, maxPages, delayMs, além das de página)
for await (const { items, page } of mb.erp.pages('tratos', { propertyId: 1, from, to })) {
  await db.tratos.insertMany(items)
}

// Todas as páginas em memória: { items, pagesRead, complete, nextPage, possiblyRateLimited, scope? }
const { items, complete } = await mb.erp.collect('morte', { propertyId: 1, from, to })
```

Um slug com barra, espaço, maiúscula ou query string lança `ValidationError` (`field: 'slug'`) sem chamar a rede. Diferente de [`mb.raw`](#acesso-cru-mbraw--endpoints-sem-método-dedicado), o resultado já vem convertido do formato BR e paginado.

### Cadastros

```js
// Leitura
const { items } = await mb.erp.cadastros.getMateriais()
const { items } = await mb.erp.cadastros.getRacas()
// Vazio lança EmptyResponseError; se o cadastro pode estar vazio na sua conta,
// passe allowEmpty (aí vem [] com possiblyRateLimited: true)
const { items } = await mb.erp.cadastros.getCategorias({ allowEmpty: true })
const { items } = await mb.erp.cadastros.getRebanhos({ allowEmpty: true })

// Escrita
const contato = await mb.erp.cadastros.createContato({
  nome: 'Fornecedor XYZ',
  tipo_pessoa: 'PJ',
  categoria: 1,
  ativo: true,
  cnpj: '12345678000100',
})
await mb.erp.cadastros.updateContato(contato.id, { razao_social: 'XYZ Ltda' })

await mb.erp.cadastros.createMaterial({
  nome: 'Ivermectina 1%',
  grupo_material: 3,
  unidade_medida_compra: 7,
  unidade_medida_uso: 7,
  unidade_medida_venda_transf: 7,
  tipo_dose: 0,
  peso_para_dose: 0,
  codigo_erp: 'IVE001',
  ativo: true,
})
```

### Animais e eventos

```js
// Cadastro do rebanho de uma fazenda — use bi.animais.get()
const { items } = await mb.bi.animais.get({ propertyId: 1 })

// Entrada de animais — 2 passos obrigatórios
const entrada = await mb.erp.animais.findByOrdemServico('OS-2026-001')
await mb.erp.animais.updateEntradaFinanceiro(entrada.id, {
  data_aquisicao: '2026-06-15',
  valor_compra: 3500.0,
  fornecedor: 42,
})

// ATENÇÃO: campos financeiros de getVendas() retornam zerados
// Para receita real: bi.movEstoque.get() → campo valor_total nas saídas
const { items: vendas } = await mb.erp.animais.getVendas()
```

### Rastreabilidade de origem (produtor)

O animal, ao entrar no rebanho, carrega o **produtor** que o vendeu — a fazenda/pessoa de origem, essencial para rastreabilidade (SISBOV/GTA). Esse dado aparece em três lugares com IDs consistentes entre si:

```js
// bi.animais.get() — fornecedor_id é o produtor de origem do animal.
const { items } = await mb.bi.animais.get({ propertyId: 1 })
// items[i].fornecedor_id, items[i].fornecedor (nome)

// erp.estoque.getGtas() — o campo chama-se literalmente "produtor".
// Sem from/to: a API ignora o filtro de data deste grid, e o cliente lança
// ValidationError se você passar.
const { items: gtas } = await mb.erp.estoque.getGtas()
// gtas[i].produtor, gtas[i].produtor_texto (ex.: "FULANO DE TAL - CPF: 12345678900")
//
// gtas[i].fornecedor / fornecedor_texto: contraparte da movimentação — pode ser
// o MESMO produtor (compra) ou um comprador/frigorífico (venda), depende de
// tipo_saida. Não confundir com fornecedor_id de bi.animais.get().
//
// gtas[i].propriedade_fornecedor / propriedade_fornecedor_texto: preenchido só
// em transferência ENTRE propriedades da própria conta — aponta pra uma das
// suas próprias fazendas (mesmo id de mb.getProperties()), não um produtor externo.

// bi.fornecedores.get() — catálogo do produtor, com o MESMO entidade_id
// referenciado acima em fornecedor_id / produtor
const { items: fornecedores } = await mb.bi.fornecedores.get()
// fornecedores[i].entidade_id === animal.fornecedor_id === gta.produtor
// fornecedores[i]: { entidade_id, cpf_cnpj, nome, categoria, enderecos, ... }
```

**Não usar `bi.fazendas.get()` para isso** — parece o mesmo conceito (nomes batem), mas usa um `propriedade_id` próprio que não corresponde a `fornecedor_id`/`produtor` em nenhum outro endpoint. Ligar por ali exigiria casar por nome (com acerto incompleto); `bi.fornecedores` já dá o mesmo dado com uma chave exata.

### Sanitário

```js
// Vacinações — sujeitas a limite silencioso de requisições em coletas em massa
// Usar safeImport() para importação segura (ver seção abaixo)
await mb.erp.sanitario.getVacinacoes({ from, to, maxPages: 100, onPage })

// Tratamentos — período inteiro inviável (volume grande), filtrar por data
await mb.erp.sanitario.getTratamentos({ from: '2026-06-01', to: '2026-06-30' })

// GTA — filtro de data ignorado pelo servidor, sempre o período inteiro
// (from/to aqui lançam ValidationError)
await mb.erp.estoque.getGtas()

// Eventos reprodutivos — vazios em contas sem dados reprodutivos: sem
// allowEmpty, a resposta vazia lança EmptyResponseError
const { items } = await mb.erp.sanitario.getPartos({ allowEmpty: true })
const { items } = await mb.erp.sanitario.getCoberturas({ allowEmpty: true })
```

### Estoque

```js
// Arraçoamento — período inteiro inviável, filtrar por data. Usa a fazenda do
// propertyId (ou a da sessão, com selectProperty antes); se a fazenda mudar no
// meio da paginação, lança PropertyNotSelectedError em vez de misturar fazendas.
await mb.erp.estoque.getTratos({ propertyId: 1, from: '2026-06-01', to: '2026-06-30', onPage })

// Entrada de material / NFe — período inteiro inviável, filtrar por data
const { items } = await mb.erp.estoque.getEntradaMaterial({ from: '2026-06-01' })
await mb.erp.estoque.createEntradaMaterial({
  propriedade: 1,
  data: '2026-06-15',
  forma_pagamento: 1,
  contato: 42,
  responsavel: 5,
  itens: [{ produto: 100, quantidade: 10, valor_unitario: 25.5 }],
})

// Sobra de cocho — cálculo pesado no servidor. Sem filtro, CADA página
// recalcula do zero (minutos por página, horas no total) — inviável. Filtrado
// por from/to (janela curta, ex.: semanal) o cálculo fica escopado à janela,
// mas ainda leva alguns minutos.
// O cliente já usa 300 s de prazo neste endpoint (troque com timeoutMs);
// mantenha janelas curtas.
await mb.erp.estoque.getSobraCocho({ from: '2026-06-27', to: '2026-07-04' })
```

Os dados de tratos e itens de trato podem trazer HTML no lugar de alguns números (ver [API ERP](#api-erp--transacionalcadastral)).

### Custos (CPC 29)

> Todos os endpoints de custos selecionam a fazenda do `propertyId` e fazem o POST na mesma seção da [fila exclusiva](#fazenda-selecionada-e-a-fila-exclusiva): duas chamadas em paralelo na mesma instância não trocam a fazenda uma da outra. Onde `propertyId` é opcional, sem ele o endpoint vale para a conta inteira.
> Cálculo pesado (de segundos a alguns minutos) — consumir assíncrono, nunca síncrono. Por isso todo método de custos usa **300 s de prazo por padrão** (ou o `timeoutMs` da instância, se for maior); troque com a opção `timeoutMs` da chamada.

```js
// Custos de animais presentes
const custos = await mb.erp.custos.getCustosAtivos({
  propertyId: 1,
  referenceDate: '2026-06-30', // nunca no futuro: para o mês corrente, use ontem
  fromDate: '2026-01-01', // opcional
})
// → [{ categoria_texto, rebanho_texto, mes, qtd_animais, valor }]

// Custos de animais vendidos / mortos
await mb.erp.custos.getCustosVendidos({ propertyId: 1, from: '2026-01-01', to: '2026-06-30' })
await mb.erp.custos.getCustosMortos({ propertyId: 1, from: '2026-01-01', to: '2026-06-30' })

// CPC 29 — saldo do ativo biológico
// ATENÇÃO: valores zerados até pré-configuração no painel MB
const saldo = await mb.erp.custos.getSaldoBiologico({
  propertyId: 1,
  referenceDate: '2026-06-01', // dia 01 do mês
})

// Saída de material por data e tipo (date vai no corpo como data)
import { constants } from 'mb-cliente'
await mb.erp.custos.getSaidasMaterial({
  propertyId: 1,
  date: '2026-06-15',
  tipoSaida: constants.TIPO_SAIDA_MATERIAL.TRATAMENTO_ANIMAIS,
})

// Custo indireto — ESCRITA: rateia amount entre os animais presentes no último
// dia do mês (referenceMonth vai como mes_referencia, amount como valor)
await mb.erp.custos.sendCustoIndireto({
  propertyId: 1, // opcional — sem ele, rateia entre todos os animais da conta
  referenceMonth: '2026-06-01', // sempre dia 01
  amount: 1500,
  timeoutMs: 600_000, // opcional (padrão 300 s)
})
```

### Auditoria e replicação

Endpoints adicionais, sem tela correspondente no MBWEB.

```js
// Trilha de auditoria completa: quem mudou o quê, quando, valor antes/depois.
// Volume muito grande. from/to filtram de verdade — use sempre uma janela
// curta, nunca o período inteiro.
const { items } = await mb.erp.auditoria.getAuditoria({ from: '2026-06-01', to: '2026-06-02' })

// Regras/alertas de validação do MBDT (desktop) — catálogo pequeno.
await mb.erp.auditoria.getRegrasDeReplicacao()
```

`erp.auditoria.getEntidadeRegraDeReplicacao()` — ❌ HTTP 500 (falha do serializador, mesma classe de erro de `estoque.getMovimentacaoMaterial`) — a listagem quebra, mas a busca por id funciona: `getEntidadeRegraDeReplicacaoById(id)` (catálogo pequeno, ids sequenciais). `getLogDeReplicacao()`/`getLogReplicacaoAnimaisNaoExcluidos()` — resposta vazia na primeira tentativa; não confirmado se é limite de requisições ou tabela pouco ativa. Vazio lança `EmptyResponseError`; quem aceita o vazio passa `{ allowEmpty: true }`.

### Mais endpoints adicionais — configuração, itens e históricos

```js
// Configuração da conta: parâmetros de GMD/abate, rastreabilidade SISBOV,
// integração ERP/pesagem externa etc. 1 registro por conta.
const { items } = await mb.erp.auditoria.getConfiguracoesGerais()

// Usuários do sistema (contas de acesso, módulos liberados, propriedades vinculadas)
await mb.erp.auditoria.getUsuarios()

// Itens de movimentação de material / de trato — mais granulares que os
// endpoints "pai".
// getMovimentacaoMaterialItens: a API ignora from/to (nenhum filtro no servidor),
// e o cliente lança ValidationError se você passar. Buscar o período inteiro direto
// é inviável; caminho incremental via auditoria + busca por id
// (getMovimentacaoMaterialItemById / getMovimentacaoMaterialById).
await mb.erp.estoque.getMovimentacaoMaterialItens() // funciona mesmo com getMovimentacaoMaterial() quebrado
// getTratosItens: from/to FILTRA (o cliente traduz para movimentacao_material__data_0/_1)
await mb.erp.estoque.getTratosItens({ from: '2026-06-01', to: '2026-06-07' })

// Este SIM filtra por data de verdade
await mb.erp.estoque.getAplicacaoConsumoLoteAnimal({ from: '2026-06-01', to: '2026-06-07' })

// Histórico de movimentação de localização por animal — mais granular que
// animais.localizacao/localizacao_anterior (só "atual + anterior").
await mb.erp.animais.getHistoricoMovimentacaoLocalidades({ from: '2026-06-01', to: '2026-06-07' }) // filtra por data de verdade
await mb.erp.animais.getHistoricoMovimentacaoConfinamento() // a API ignora from/to: passar lança ValidationError
```

`erp.animais.getConfinamento(params)` lista os lotes da fazenda (10 por página, cada um com `animais[]`; `from`/`to` filtram pela data de abertura do lote). Respondia HTTP 500 até outubro de 2026. A busca por id também funciona: `getConfinamentoById(id)` (lote completo + `animais[]`; escopado pela propriedade da sessão: um lote de outra fazenda lança `NotFoundError`). A pesagem é uma integração com um servidor de terceiro (`configuracoesgerais` tem os campos `usuario_pesagem`/`senha_pesagem`/`servidor_pesagem`), não uma tabela interna — o que explica o timeout permanente do endpoint de pesagem do BI.

### Mais cadastros, estoque e animais

```js
// erp.cadastros — mais cadastros de referência
await mb.erp.cadastros.getEntidades() // cadastro genérico de pessoas/empresas
await mb.erp.cadastros.getContatosMaoDeObra() // subconjunto de getEntidades()
await mb.erp.cadastros.getLocalizacoes() // localidades com dados de cocho/GMD
await mb.erp.cadastros.getCurrais() // mesmo modelo de getLocalizacoes(), filtrado a currais
await mb.erp.cadastros.getGruposCurral()
await mb.erp.cadastros.getCategoriasGta()
await mb.erp.cadastros.getSequenciasMicroregioes() // sequências de numeração SISBOV
await mb.erp.cadastros.getConfiguracoesLayout()
await mb.erp.cadastros.getDispositivosMoveis() // celulares registrados nos apps MB
await mb.erp.cadastros.getCulturas() // catálogo de cultivares
await mb.erp.cadastros.getOperacoes()

// erp.estoque — movimentação/produção
await mb.erp.estoque.getTransferenciasPropriedade()
await mb.erp.estoque.getTransferenciasLoteAlimentar()
await mb.erp.estoque.getTransferenciasLoteFinalidade()
await mb.erp.estoque.getProgramasNutricionais()
await mb.erp.estoque.getTratosDiariosPrevistos() // previsão diária de trato por curral — from/to não testado
await mb.erp.estoque.getDefinicaoDiariaTratos({ from, to }) // filtra por data de verdade
await mb.erp.estoque.getProducaoDietas() // batidas de produção de dieta
await mb.erp.estoque.getRelatorioGestaoNutricionalLote({ propertyId, date: '2026-06-30' })
// relatório "Gestão Nutricional" por lote/curral — mesma tela/dados do
// relatório do MBWEB. Endpoint adicional, fora dos manuais oficiais. Devolve
// o resultado da última busca feita na fazenda: `date` e os filtros são ignorados,
// e o campo `filtro` diz de que busca o resultado veio. Seleciona a fazenda
// do propertyId na seção exclusiva da fila. Aceita timeoutMs e signal. Ver docs/api.md.

// Recálculo do mesmo relatório para uma data, numa linha de confinamento inteira.
// GRAVA num cache compartilhado: o resultado substitui o cache inteiro da fazenda e
// muda a tela de todos os usuários. Leva minutos e falha com frequência. Também
// seleciona a fazenda na seção exclusiva. Ver docs/api.md antes de usar.
await mb.erp.estoque.reprocessRelatorioGestaoNutricionalLinha({
  propertyId,
  date: '2026-06-29',
  linhaConfinamento,
})

// O mesmo, num curral só. Recalcular vários lotes em sequência deixa só o último no
// cache: para mais de um curral, use o recálculo por linha.
await mb.erp.estoque.reprocessRelatorioGestaoNutricionalLote({
  propertyId,
  date: '2026-06-29',
  loteConfinamento,
  linhaConfinamento,
})

// erp.animais
await mb.erp.animais.getInventariosAnimais() // eventos de contagem/inventário
```

Para o cadastro de animais, use `bi.animais.get()`.

**Módulos `erp.financeiro`, `erp.reproducao` e `erp.outros`**: rotas REST reais e confirmadas, que só trazem dados se a conta usa o módulo correspondente no MB (financeiro, IATF/embriões/sêmen, agrícola, gestão de contratos etc.). Resposta vazia lança `EmptyResponseError`, como em qualquer outro método; quem sabe que o módulo pode estar vazio na sua conta passa `{ allowEmpty: true }`.

```js
// erp.financeiro
await mb.erp.financeiro.getCotacoesDiarias()
await mb.erp.financeiro.getBancos({ allowEmpty: true })
await mb.erp.financeiro.getOrcamentos({ allowEmpty: true })
await mb.erp.financeiro.getMovimentacoesFinanceiras({ allowEmpty: true })
await mb.erp.financeiro.getMovimentacoesFinanceirasContas({ allowEmpty: true })
await mb.erp.financeiro.getContasFinanceiras({ allowEmpty: true })

// erp.reproducao — reprodução/genética/sêmen/embrião + ciclo agrícola solto
// (todos aceitam { allowEmpty: true }, como acima)
await mb.erp.reproducao.getCios()
await mb.erp.reproducao.getEstacoesMonta()
await mb.erp.reproducao.getEstacoesMontaIa()
await mb.erp.reproducao.getAcasalamentos()
await mb.erp.reproducao.getResultadosSexagem()
await mb.erp.reproducao.getResultadosDiagnosticoGestacao()
await mb.erp.reproducao.getAvaliacoesOvarianas()
await mb.erp.reproducao.getAspiracoesOvocitos()
await mb.erp.reproducao.getSafrasAnimal()
await mb.erp.reproducao.getAvaliacoesAtivo()
await mb.erp.reproducao.getComprasSemen()
await mb.erp.reproducao.getComprasSemenItens()
await mb.erp.reproducao.getVendasSemen()
await mb.erp.reproducao.getVendasSemenItens()
await mb.erp.reproducao.getMovimentacoesSemen()
await mb.erp.reproducao.getComprasEmbriao()
await mb.erp.reproducao.getVendasEmbriaoGrupo()
await mb.erp.reproducao.getTransferenciasLoteReprodutivo()
await mb.erp.reproducao.getTransferenciasLoteGenetico()
await mb.erp.reproducao.getComunicacoesAbczOnline()
await mb.erp.reproducao.getProblemas()
await mb.erp.reproducao.getAnosAgricolas()
await mb.erp.reproducao.getCiclosProducao()
await mb.erp.reproducao.getCiclosProducaoLocalidade()
await mb.erp.reproducao.getCentrosDistribuicao()
await mb.erp.reproducao.getSafras()
await mb.erp.reproducao.getAtividadesAgricolas()
await mb.erp.reproducao.getClassificacoes()
await mb.erp.reproducao.getRegrasTributarias()
await mb.erp.reproducao.getVariedades()

// erp.outros — equipamentos de curral, gestão de contratos comercial,
// vendas/agrícola avulsas
await mb.erp.outros.getBebedouros()
await mb.erp.outros.getCochosCompartilhados()
await mb.erp.outros.getGestaoContratos() // módulo comercial separado
await mb.erp.outros.getVendasAvulsas() // fora do fluxo de erp.animais.getVendas()
await mb.erp.outros.getImportacoesXmlNfe()
```

### Pesagem por animal — `getMedicoesPesagem()`

**O endpoint mais importante entre os adicionais:** pesagem real por animal. Substitui, na prática, o endpoint de pesagem do BI (timeout permanente, não exposto):

```js
const { items } = await mb.erp.animais.getMedicoesPesagem({ page: 1 })
// items[i]: { animal, animal_texto, sisbov, valor (peso), data_avaliacao,
//             idade_na_pesagem, localidade_texto, lote_alimentar_texto,
//             propriedade, propriedade_texto }
```

⚠️ **Atribua a propriedade pelo campo `propriedade` de cada registro, nunca pela fazenda selecionada na sessão.** `selectProperty()` não restringe corretamente este endpoint: a resposta traz animais de outras propriedades da mesma conta, além dos da fazenda selecionada. Cada registro traz o próprio campo `propriedade`/`propriedade_texto` correto (ver `src/erp/animais.js`). A API ignora `from`/`to`/`propriedade=` neste grid — o cliente lança `ValidationError` com `from`/`to` e também com `propertyId` —, então um sync completo precisa paginar tudo (muitas páginas numa conta grande).

Outros endpoints adicionais, distribuídos pelos módulos por tema: sanitário (`getDoencas`, `getDoencasTratamentos`, vacinas/vermífugos), genética/avaliação (`getGrausDeSangue`, `getAvaliacoesMorfologicas`, `getLotesDeAvaliacao`), propriedade/pessoas (`getEstabelecimentosRuraisExternos`, `getProprietarios`), fiscal (`getIcmsOrigem`, `getPisSituacaoTributaria`, `getCentrosDeCusto`), materiais/produção (`getEntradaMaterialItens`, `getPremisturas`), ativos (`getAtivos`, `getMaquinariosConfinamento`) e histórico/sincronização (`getHistoricoAcoesApp`, `getControleSincronizacaoCurral`).

Ver o código-fonte de cada módulo (`src/erp/*.js`) ou a [referência completa](docs/api.md) para o detalhe endpoint a endpoint; a lista completa seria longa demais para repetir aqui.

---

## Acesso cru (`mb.raw`) — endpoints sem método dedicado

`mb.raw.get(path, params?, { signal, timeoutMs }?)` e `mb.raw.post(path, body?, { signal, timeoutMs }?)` dão acesso de baixo nível a qualquer endpoint da API que ainda não tem método próprio no cliente, sem importar arquivos internos do pacote.

```js
const mb = new MultBovinos({ email, password, timeoutMs: 600_000 })
await mb.connect()

// GET {base}{path}?{params} — params null/undefined são omitidos
const pagina = await mb.raw.get('/producaopasto/', { page: 1, page_size: 50 })

// POST {base}{path} com o corpo em JSON (padrão {})
const resp = await mb.raw.post('/algum-endpoint/', { campo: 'valor' })

// Cancelar uma chamada (soma-se ao signal da instância, se houver)
const pagina2 = await mb.raw.get(
  '/producaopasto/',
  { page: 2 },
  { signal: AbortSignal.timeout(30_000) }
)
```

O que `mb.raw` **herda** do cliente HTTP, sem nenhuma diferença:

- autenticação (header `JWT`; sem `connect()` antes, lança `AuthError` sem chamar a rede);
- relogin automático em HTTP 401, com nova seleção da fazenda que estava ativa;
- `timeoutMs` (que cobre também a leitura do corpo), `retry` (só em GET) e `signal` da instância;
- a mesma classificação de erros: `AuthError`, `ClientError` (4xx; o 404 como `NotFoundError`), `ServerError` (5xx), `RateLimitError`/`InvalidPageError` (`{ detail }` como única chave, com HTTP 200), `TimeoutError`, `NetworkError`, `InvalidResponseError` (2xx não-JSON) e, **só em GET**, `EmptyResponseError` (`{ count: 0, results: [] }`). Escrita 2xx com corpo vazio, ou 204, devolve `null`.

O que `mb.raw` **não** faz, de propósito:

- **não parseia formato BR**: o retorno é o **JSON cru** da API, exatamente como veio (sem `parseErpRecord`, sem desembrulhar `dados`/`results`). Se precisar, use `mb-cliente/parsers`;
- **não pagina**, não faz espaçamento de chamadas e não tem interceptador (ver [Decisões de arquitetura](#decisões-de-arquitetura)); para um grid do ERP pelo slug, com parse e paginação, use [`mb.erp.fetchPage`/`pages`/`collect`](#qualquer-grid-pelo-slug-mberpfetchpage--pages--collect);
- **não valida o corpo da requisição**: só exige que `path` seja uma string relativa à base, começando com `/` (senão, `ValidationError` com `field: 'path'`).

> ⚠️ **Escrita na API é responsabilidade de quem chama.** `mb.raw.post` envia o que você mandar, inclusive operações que alteram dados no MultBovinos, que outros usuários da conta podem ver. Um `TimeoutError` ou `NetworkError` com `mayHaveSucceeded: true` significa que a escrita **pode ter sido aplicada**: repetir pode duplicar. Confira o estado antes de tentar de novo, e não faça novas tentativas em massa.

Quando um endpoint passar a ser usado com frequência, prefira um método dedicado em `erp`/`bi` (com validação, parse BR e status documentado em `docs/api.md`) em vez de espalhar chamadas `mb.raw` pelo código.

---

## Helpers

`forAllProperties` **não** é exportado como função: a versão crua exige objetos internos. O caminho público é o método **`mb.forAllProperties(callback, propertyIds?)`** (ver [Por propriedade](#por-propriedade-precisa-de-propertyid-ou-de-uma-fazenda-selecionada)).

Também na raiz e em `mb-cliente/helpers`: `paginate` e `collectPages` (ver [Paginação](#paginação)).

### `safeImport` — proteção contra limite silencioso de requisições

O grid ERP aplica um **limite silencioso de requisições** que retorna HTTP 200 com `count:0 / results:[]` — indistinguível de "sem dados". Um consumidor ingênuo pode zerar dados locais ao trocar o conteúdo por um resultado vazio ou cortado. O `safeImport` só troca os dados locais quando recebeu um conjunto **completo e não vazio**:

```js
import { safeImport } from 'mb-cliente'

const result = await safeImport({
  fetch: async () => {
    const items = []
    for await (const { items: page } of mb.erp.sanitario.iterVacinacoes({ from, to })) {
      items.push(...page)
    }
    // O laço só termina sem erro quando o servidor disse que não havia mais
    // páginas; uma página vazia no meio lança EmptyResponseError.
    return { items, complete: true }
  },
  // Troca TRANSACIONAL: apagar e inserir na mesma transação. Se falhar no meio,
  // a transação desfaz e os dados antigos ficam intactos.
  replace: (items) =>
    db.transaction(() => {
      db.vacinacoes.deleteWhere({ from, to })
      db.vacinacoes.insertMany(items)
    }),
  onRateLimit: (err) => logger.warn('Limite de requisições detectado — dados preservados', err),
})

// result.preserved === true  → dados locais intactos; veja result.reason
// result.preserved === false → replace(items) executado; result.inserted = quantidade
// result.reason: 'rate_limit_explicit' | 'empty_response_possibly_rate_limited'
//              | 'incomplete' | 'legitimately_empty'
```

- `fetch` pode devolver o array de itens ou `{ items, complete, possiblyRateLimited }`. Com `complete: false` (ex.: o `complete` de um `getVacinacoes` cortado por `maxPages`), os dados locais são preservados com `reason: 'incomplete'`.
- `RateLimitError` ou `EmptyResponseError` lançados pelo `fetch` também preservam os dados (e chamam `onRateLimit`). Qualquer outro erro propaga.
- `replace(items)` faz a troca numa operação só. Passar `insert`/`delete` (apagar e inserir em passos separados) lança `ValidationError`.

### `getWeeklyWindows` / `getMonthlyWindows` — quebrar intervalo em janelas

Endpoints ERP paginados com intervalos longos têm risco de timeout se enviados de uma vez. A prática recomendada é particionar em janelas menores:

```js
import { getWeeklyWindows, getMonthlyWindows } from 'mb-cliente'

// Janelas de 7 dias — recomendado para getTratos() (arraçoamento)
const windows = getWeeklyWindows('2026-03-28', '2026-06-26')
// → [{ from: '2026-03-28', to: '2026-04-03' },
//    { from: '2026-04-04', to: '2026-04-10' }, ...]

for (const { from, to } of windows) {
  await mb.erp.estoque.getTratos({ from, to, onPage: (items) => db.tratos.insertMany(items) })
  db.setLastSync('tratos', to, propId) // salva progresso a cada janela
}

// Janelas mensais — para bi.movMateriais (janela máxima de 31 dias corridos;
// por propriedade: propertyId ou selectProperty antes, uma fazenda por vez)
const monthly = getMonthlyWindows('2026-01-01', '2026-06-30')
// → [{ from: '2026-01-01', to: '2026-01-31' }, { from: '2026-02-01', to: '2026-02-28' }, ...]

for (const { from, to } of monthly) {
  const { items } = await mb.bi.movMateriais.get({ propertyId: propId, from, to })
  await db.movMateriais.upsertMany(items)
}
```

`getWeeklyWindows` aceita um terceiro parâmetro `days` (padrão 7) para janelas de outro tamanho; `days` que não é inteiro ≥ 1 lança `ValidationError`.

Validação de datas: `getWeeklyWindows`/`getMonthlyWindows` exigem datas `YYYY-MM-DD`, e `lastDayOfMonth`/`firstDayOfMonth` exigem `YYYY-MM`; fora disso, `ValidationError`. `countCalendarDays` (em `mb-cliente/parsers`) também lança `ValidationError` com data inválida, em vez de devolver `NaN`.

`lastDayOfMonth('2026-06')` → `'2026-06-30'` (fim de um mês já fechado — em custos, a data de referência nunca pode estar no futuro) e `firstDayOfMonth('2026-06')` → `'2026-06-01'` (referenceDate de `getSaldoBiologico`). Subpaths disponíveis: `mb-cliente/errors`, `mb-cliente/constants`, `mb-cliente/helpers`, `mb-cliente/parsers` (`parseBrNumber`, `parseBrDate`, `parseBrDateTime`, `parseErpRecord`, `parseErpPage`, `countCalendarDays`).

---

## Resiliência a falhas de rede (novas tentativas e espera crescente, opcionais)

A API MB tem quedas de conexão intermitentes (falha de transporte, não limite de requisições nem endpoint permanentemente inviável), que o cliente lança como `NetworkError` (`url`, `method`, `attempts`, `mayHaveSucceeded`, e o erro original do `fetch` em `cause`). Por padrão o cliente **não** tenta de novo. Para habilitar novas tentativas com espera exponencial:

```js
const mb = new MultBovinos({
  email,
  password,
  retry: { attempts: 3, backoffMs: 1000 }, // opcional — padrão: attempts:1 (sem nova tentativa), backoffMs:500
})
```

Regras (fixas, não configuráveis por chamada individual):

- Só em **GET** (idempotente) — nunca em `POST`/`PUT`/`PATCH`/`DELETE` (não duplica uma escrita nem recalcula um POST pesado de `erp.custos.*`).
- Só em **falha de transporte** (`fetch` rejeitando antes de qualquer resposta) — nunca em timeout (`TimeoutError`, quando `timeoutMs` estoura), nem em cancelamento por `signal`, nem em `RateLimitError`/`EmptyResponseError` (tentar de novo imediatamente nesses casos pioraria o limite de requisições).
- Espera exponencial: `backoffMs * 2^(tentativa-1)` entre tentativas. O cancelamento por `signal` também interrompe essa espera.
- `timeoutMs`, `retry.attempts` (inteiro ≥ 1) e `retry.backoffMs` (≥ 0) inválidos lançam `ValidationError` no construtor.

```js
import { NetworkError } from 'mb-cliente'

try {
  await mb.erp.cadastros.getMateriais()
} catch (e) {
  if (e instanceof NetworkError) {
    // Com as novas tentativas esgotadas: e.attempts tentativas, erro original em e.cause
    console.error(`Falhou após ${e.attempts} tentativa(s):`, e.cause)
  } else {
    throw e
  }
}
```

### Timeout

`timeoutMs` (padrão 90 s) cobre a requisição **inteira, incluindo a leitura do corpo**: um servidor que manda os cabeçalhos e trava o corpo também estoura o prazo e vira `TimeoutError` (`url`, `method`, `timeoutMs`, `mayHaveSucceeded`, `cause`).

O `timeoutMs` do construtor vale para toda a instância. Para trocar o prazo de uma chamada só, passe `timeoutMs` nela:

| Onde                                                                     | Prazo padrão da chamada                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Métodos de grid do ERP, `fetchAll`/`iter*`, `mb.erp.*`                   | O sugerido pelo registro do endpoint (sobra de cocho: 300 s) ou o da instância |
| Métodos do BI (`get({ timeoutMs })`, `getFormulacao(id, { timeoutMs })`) | O da instância                                                                 |
| `erp.custos.*`                                                           | 300 s, independente da instância                                               |
| `getRelatorioGestaoNutricionalLote`                                      | O da instância                                                                 |
| `reprocessRelatorioGestaoNutricionalLinha`                               | 600 s                                                                          |
| `reprocessRelatorioGestaoNutricionalLote`                                | 600 s                                                                          |
| `mb.raw.get`/`post` (terceiro argumento)                                 | O da instância                                                                 |

`timeoutMs` inválido (não positivo) lança `ValidationError`.

> ⚠️ **Escritas e `mayHaveSucceeded`.** Em `TimeoutError` e `NetworkError` de POST/PUT/PATCH/DELETE, `mayHaveSucceeded` é `true`: o servidor pode ter aplicado a escrita antes de a conexão cair. **Repetir pode duplicar o registro.** Confira o estado no servidor antes de tentar de novo.

### Cancelamento (`signal`)

Um `AbortSignal` cancela chamadas em andamento. O erro lançado é o **`reason` do signal**, como no `fetch` nativo (por padrão, um `DOMException` `"AbortError"`), nunca `TimeoutError`.

```js
const controller = new AbortController()

// Toda chamada desta instância (ex.: desligamento do processo)
const mb = new MultBovinos({ email, password, signal: controller.signal })

// Uma chamada do acesso cru (soma-se ao signal da instância)
await mb.raw.get('/producaopasto/', { page: 1 }, { signal: AbortSignal.timeout(30_000) })
await mb.raw.post('/algum-endpoint/', { campo: 'valor' }, { signal })

// Métodos de página do ERP, fetchAll e iteradores
await mb.erp.cadastros.getMateriais({ page: 1, signal })
await mb.erp.sanitario.getVacinacoes({ from, to, signal, onPage })
for await (const { items } of mb.erp.estoque.iterTratos({ from, to, signal })) {
  // ...
}
```

No `fetchAll`, nos `iter*` e no `paginate`, o signal também interrompe a espera `delayMs` entre páginas.

### Observabilidade (`diagnostics_channel`)

Para métricas e log sem interceptador, o cliente publica eventos **só de leitura** nos canais do `node:diagnostics_channel`:

```js
import diagnostics_channel from 'node:diagnostics_channel'

diagnostics_channel.subscribe(
  'mb-cliente:request',
  ({ method, path, status, durationMs, attempt }) => {
    console.log(
      `${method} ${path} → ${status ?? 'sem resposta'} em ${durationMs} ms (tentativa ${attempt})`
    )
  }
)
```

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

### Por que não há espaçamento de chamadas nem interceptador embutido

Decisão de arquitetura, não lacuna: o cliente **não** implementa espaçamento proativo entre chamadas nem um sistema de plugins/interceptadores. As duas camadas de resiliência que ele oferece — as novas tentativas acima e os tipos `RateLimitError`/`EmptyResponseError` (seção seguinte) — cobrem "a chamada falhou, o que aconteceu e o que fazer". Decidir _quanto espaçar_ entre chamadas em massa é responsabilidade de quem consome (ex.: `delayMs` nas paginações, pausas entre janelas), porque só quem consome sabe o padrão de uso real (quantas propriedades, quantos endpoints em paralelo, que volume por execução). Embutir uma política de espaçamento genérica arriscaria estar errada para metade dos consumidores.

---

## Tratamento de erros

As classes de erro são exportadas **na raiz** (`import { AuthError, ValidationError } from 'mb-cliente'`), no namespace `errors` (`errors.AuthError`) e no subpath `mb-cliente/errors`. Todas estendem `MultBovinosError`, que repassa `cause` ao `cause` nativo do `Error` (encadeamento padrão do Node).

```js
import {
  AuthError, // 401 — token inválido ou credenciais erradas; também login 400/403 e login sem token (cause = erro original)
  PropertyNotSelectedError, // fazenda fora da lista do login; endpoint por fazenda (BI ou grid) sem propertyId e sem fazenda selecionada (.endpoint); fazenda mudou no meio da paginação (.reason)
  RateLimitError, // limite explícito de requisições ({ detail } como única chave) — sempre HTTP 200; .page para retomar
  InvalidPageError, // { detail: "Página inválida." } com HTTP 200 — erro de paginação, NÃO é limite de requisições; .page
  ClientError, // HTTP 4xx real (403/405...) — NÃO é limite de requisições
  NotFoundError, // HTTP 404 (subclasse de ClientError) — na busca por id, em geral registro de outra fazenda ou id inexistente
  EmptyResponseError, // limite silencioso de requisições — NÃO apagar dados locais
  EndpointUnavailableError, // endpoint ❌ — ver .workaround para alternativa
  TimeoutError, // timeoutMs estourou, incluindo a leitura do corpo (padrão 90 s); .mayHaveSucceeded
  NetworkError, // falha de transporte (DNS, conexão, TLS); .attempts, .mayHaveSucceeded, .cause
  ServerError, // HTTP 5xx, com qualquer corpo
  InvalidResponseError, // 2xx com corpo não-JSON (ex.: HTML de proxy) ou GET 2xx sem corpo; .bodySnippet, .cause
  ValidationError, // parâmetros inválidos (from/to ausentes ou proibidos, opção desconhecida, propertyId num endpoint que não é por fazenda, slug inválido, etc.)
} from 'mb-cliente'

try {
  await mb.erp.sanitario.getVacinacoes({ from, to })
} catch (e) {
  if (e instanceof RateLimitError) {
    console.warn(`Limite de requisições ativo na página ${e.page} — aguardar antes de continuar`)
  } else if (e instanceof EmptyResponseError) {
    console.warn('Resposta vazia — possível limite silencioso de requisições, dados preservados')
  } else if (e instanceof TimeoutError || e instanceof NetworkError) {
    // Em escrita, mayHaveSucceeded === true: repetir pode duplicar
    console.error(`Falha em ${e.method} ${e.url} (pode ter sido aplicada: ${e.mayHaveSucceeded})`)
  } else {
    throw e
  }
}
```

> **`RateLimitError` vs `ClientError`:** a limitação real do servidor sempre responde com **HTTP 200** e `{ detail: "..." }` — nunca 429. O Django REST Framework usa esse mesmo formato `{ detail }` também para 404 (slug errado), 403 (permissão revogada) e 405, então o cliente checa o status HTTP antes de classificar: só um `{ detail }` em resposta não-4xx/5xx vira `RateLimitError` (ou `InvalidPageError`, quando o `detail` é "Página inválida"), e só quando `detail` é a **única** chave do objeto — uma resposta legítima com `detail` e outros campos é devolvida como dado. Qualquer outro `4xx` (exceto 401, que é `AuthError`) vira `ClientError` (`statusCode`, `body`); o 404, especificamente `NotFoundError`. Sem essa distinção, um erro real e permanente (ex.: endpoint com slug incorreto) seria mascarado para sempre como limite de requisições passageiro por quem usa `safeImport()`.
>
> **`NotFoundError`:** todo HTTP 404 vira `NotFoundError`, uma subclasse de `ClientError` (quem já trata `ClientError` continua pegando o 404). Nas buscas por id (`getConfinamentoById`, `getMovimentacaoMaterialById`, `getMovimentacaoMaterialItemById`, `getEntidadeRegraDeReplicacaoById`), em geral quer dizer que o registro é de outra fazenda ou que o id não existe — caso esperado, que dá para tratar com `instanceof NotFoundError` sem conferir `statusCode`:
>
> ```js
> import { NotFoundError } from 'mb-cliente'
>
> try {
>   const lote = await mb.erp.animais.getConfinamentoById(id)
> } catch (e) {
>   if (!(e instanceof NotFoundError)) throw e
>   // lote de outra fazenda (selecione a dona e tente de novo) ou id inexistente
> }
> ```
>
> **`RateLimitError.page`/`InvalidPageError.page`:** a página do GET paginado em que o erro chegou, para retomar a paginação dali.
>
> **`possiblyRateLimited`/`reason` em respostas vazias (`allowEmpty`):** quando quem chama passa `allowEmpty` e a primeira página vem vazia, o resultado traz `possiblyRateLimited: true` e `reason: 'possibly_rate_limited'` — pode ser fonte vazia de verdade ou limite silencioso de requisições. Nenhum método liga `allowEmpty` sozinho. `EmptyResponseError` só ocorre em requisições **GET** — o formato `{count:0, results:[]}` é uma semântica do grid ERP paginado (leitura), nunca deveria disparar numa escrita.

---

## TypeScript

O pacote inclui declarações completas. O autocompletar funciona sem configuração adicional:

```ts
import { MultBovinos, constants } from 'mb-cliente'
import type { Property, ConnectResult, ErpPageResult } from 'mb-cliente'

const mb = new MultBovinos({ email: '...', password: process.env.MB_PASS! })

// Todos os métodos têm assinatura tipada
const { token, properties }: ConnectResult = await mb.connect()
const page: ErpPageResult = await mb.erp.cadastros.getMateriais({ page: 1 })

// Constantes com tipo literal
const tipo = constants.TIPO_SAIDA_MATERIAL.TRATAMENTO_ANIMAIS // tipo: 25
```

- Os métodos mais usados devolvem **registros tipados** (`Trato`, `SobraCocho`, `Vacinacao`, `MedicaoPesagem`, `BiAnimal`…), com os campos declarados e o resto acessível como `unknown`. Decimais são `ApiDecimal` (`number | string`: alguns chegam como texto com ponto). Lista completa em [docs/api.md](docs/api.md#registros-tipados).
- Os subpaths `mb-cliente/errors`, `mb-cliente/constants`, `mb-cliente/helpers` e `mb-cliente/parsers` têm o seu próprio `.d.ts`.
- Só `MultBovinos` e as classes de erro são classes importáveis como valor. Os tipos das partes internas (`AnimaisBi`, `CadastrosErp`, `RawApi`…) são `interface`: servem para anotar tipos, não para `import` como valor.

---

## Referência rápida de endpoints

Status: ✅ funciona · ⚠️ funciona com ressalva · 🔕 só traz dados se o módulo é usado · ❌ quebrado no servidor. Detalhe em [docs/api.md](docs/api.md).

| Módulo                                                    | Método                                                                                                                                                                 | Status                                                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `raw`                                                     | `get(path, params?, opts?)` / `post(path, body?, opts?)`                                                                                                               | ✅ JSON cru, sem parse BR ([Acesso cru](#acesso-cru-mbraw--endpoints-sem-método-dedicado))                                               |
| `erp`                                                     | `fetchPage(slug, opts?)` / `pages(slug, opts?)` / `collect(slug, opts?)`                                                                                               | ✅ qualquer grid pelo slug, com parse BR ([Qualquer grid pelo slug](#qualquer-grid-pelo-slug-mberpfetchpage--pages--collect))            |
| `bi.fazendas`                                             | `get()`                                                                                                                                                                | ✅                                                                                                                                       |
| `bi.localidades`                                          | `get()`                                                                                                                                                                | ✅                                                                                                                                       |
| `bi.fornecedores`                                         | `get()`                                                                                                                                                                | ✅                                                                                                                                       |
| `bi.materiais`                                            | `get()`                                                                                                                                                                | ✅                                                                                                                                       |
| `bi.dieta`                                                | `get()`                                                                                                                                                                | ✅                                                                                                                                       |
| `bi.animais`                                              | `get({ propertyId? })` / `getAll()`                                                                                                                                    | ✅ por propriedade                                                                                                                       |
| `bi.movEstoque`                                           | `get({ propertyId? })` / `getAll()`                                                                                                                                    | ✅ por propriedade                                                                                                                       |
| `bi.movMateriais`                                         | `get({ from, to, propertyId? })`                                                                                                                                       | ⚠️ por propriedade, janela ≤ 31 dias                                                                                                     |
| `bi.suplementacao`                                        | `get({ from, to, propertyId? })`                                                                                                                                       | ✅ por propriedade                                                                                                                       |
| `bi.producaoRacao`                                        | `get({ from, to, propertyId? })`                                                                                                                                       | ✅ por propriedade                                                                                                                       |
| `bi.producaoRacao`                                        | `getFormulacao(producaoId, { timeoutMs? })`                                                                                                                            | ✅ ingredientes por batida                                                                                                               |
| (pesagem do BI)                                           | —                                                                                                                                                                      | ❌ não exposto: usar `erp.animais.getMedicoesPesagem()`                                                                                  |
| (movimentação extra do BI)                                | —                                                                                                                                                                      | ❌ não exposto: usar `movEstoque` parcialmente                                                                                           |
| `erp.cadastros`                                           | `get*/create*/update*`                                                                                                                                                 | ✅                                                                                                                                       |
| `erp.animais`                                             | `getSaidas/getMortes/getVendas`                                                                                                                                        | ✅ (venda ⚠️ zerada; getSaidas ⚠️ from/to lança `ValidationError`)                                                                       |
| `erp.animais`                                             | `findByOrdemServico` + `updateEntradaFinanceiro`                                                                                                                       | ✅ 2 passos                                                                                                                              |
| `erp.sanitario`                                           | `getVacinacoes/getTratamentos/getExames` + `iterVacinacoes/iterTratamentos`                                                                                            | ✅ com data                                                                                                                              |
| `erp.sanitario`                                           | `getProtocolos/getPartos/etc.`                                                                                                                                         | ✅ vazio lança `EmptyResponseError` (ou `allowEmpty`)                                                                                    |
| `erp.estoque`                                             | `getTratos/iterTratos/getEntradaMaterial`                                                                                                                              | ✅ com data                                                                                                                              |
| `erp.estoque`                                             | `getGtas`                                                                                                                                                              | ⚠️ API ignora filtro de data — sempre o período inteiro; from/to lança `ValidationError`                                                 |
| `erp.estoque`                                             | `createEntradaMaterial`                                                                                                                                                | ✅                                                                                                                                       |
| `erp.estoque.getSobraCocho`                               | com `from`/`to`                                                                                                                                                        | ⚠️ pesado (minutos), inviável sem filtro de data                                                                                         |
| `erp.estoque.getMovimentacaoMaterial`                     | —                                                                                                                                                                      | ❌ HTTP 500 (reconfirmado)                                                                                                               |
| `erp.estoque.getViaAplicacaoTratamento`                   | —                                                                                                                                                                      | ❌ HTTP 500 (reconfirmado)                                                                                                               |
| `erp.custos`                                              | `getCustosAtivos/Vendidos/Mortos`                                                                                                                                      | ✅                                                                                                                                       |
| `erp.custos`                                              | `getSaldoBiologico`                                                                                                                                                    | ✅ rota / ⚠️ zeros até pré-configuração                                                                                                  |
| `erp.custos`                                              | `sendCustoIndireto/getSaidasMaterial`                                                                                                                                  | ✅                                                                                                                                       |
| `erp.auditoria`                                           | `getAuditoria`                                                                                                                                                         | ✅ com data                                                                                                                              |
| `erp.auditoria`                                           | `getRegrasDeReplicacao`                                                                                                                                                | ✅                                                                                                                                       |
| `erp.auditoria.getEntidadeRegraDeReplicacao`              | —                                                                                                                                                                      | ❌ HTTP 500 (listagem) · ✅ `getEntidadeRegraDeReplicacaoById(id)`                                                                       |
| `erp.auditoria`                                           | `getLogDeReplicacao/getLogReplicacaoAnimaisNaoExcluidos`                                                                                                               | ⚠️ vazio na 1ª tentativa, não confirmado                                                                                                 |
| `erp.auditoria`                                           | `getConfiguracoesGerais/getUsuarios`                                                                                                                                   | ✅                                                                                                                                       |
| `erp.estoque`                                             | `getMovimentacaoMaterialItens`                                                                                                                                         | ⚠️ funciona, mas sem filtro no servidor; from/to lança `ValidationError` (incremental via auditoria + `getMovimentacaoMaterialItemById`) |
| `erp.estoque`                                             | `getTratosItens`                                                                                                                                                       | ✅ com data (from/to → `movimentacao_material__data_0/_1`)                                                                               |
| `erp.estoque`                                             | `getAplicacaoConsumoLoteAnimal`                                                                                                                                        | ✅ com data                                                                                                                              |
| `erp.animais`                                             | `getHistoricoMovimentacaoLocalidades`                                                                                                                                  | ✅ com data                                                                                                                              |
| `erp.animais`                                             | `getHistoricoMovimentacaoConfinamento`                                                                                                                                 | ⚠️ funciona, mas a API ignora from/to (período inteiro); passar lança `ValidationError`                                                  |
| `erp.animais.getConfinamento`                             | —                                                                                                                                                                      | ✅ por fazenda, filtro pela abertura do lote; páginas pesadas · ✅ `getConfinamentoById(id)`                                             |
| `erp.cadastros`                                           | `getEntidades/getContatosMaoDeObra/getLocalizacoes/getCurrais/getGruposCurral/getCategoriasGta/getSequenciasMicroregioes/getConfiguracoesLayout/getDispositivosMoveis` | ✅ (9 endpoints)                                                                                                                         |
| `erp.estoque`                                             | `getTransferenciasPropriedade/getTransferenciasLoteAlimentar/getTransferenciasLoteFinalidade/getProgramasNutricionais/getProducaoDietas`                               | ✅                                                                                                                                       |
| `erp.estoque`                                             | `getRelatorioGestaoNutricionalLote`                                                                                                                                    | ⚠️ devolve a última busca da fazenda; `date` e filtros ignorados                                                                         |
| `erp.estoque`                                             | `reprocessRelatorioGestaoNutricionalLinha`                                                                                                                             | ⚠️ escrita: recalcula a linha para a data; substitui o cache da fazenda; lento e instável                                                |
| `erp.estoque`                                             | `reprocessRelatorioGestaoNutricionalLote`                                                                                                                              | ⚠️ escrita: recalcula um curral para a data; substitui o cache da fazenda; lento e instável                                              |
| `erp.estoque.getTratosDiariosPrevistos`                   | —                                                                                                                                                                      | ✅ (from/to não testado ainda)                                                                                                           |
| `erp.estoque.getDefinicaoDiariaTratos`                    | com `from`/`to`                                                                                                                                                        | ✅ com data                                                                                                                              |
| `erp.animais.getInventariosAnimais`                       | —                                                                                                                                                                      | ✅                                                                                                                                       |
| `erp.financeiro`                                          | 21 métodos (`getBancos`, `getCotacoesDiarias`, `getContasPagar`… ver [docs/api.md](docs/api.md))                                                                       | 🔕 só com o módulo financeiro em uso                                                                                                     |
| `erp.reproducao`                                          | 70 métodos (reprodução/sêmen/embrião/ciclo agrícola)                                                                                                                   | 🔕 só com o módulo em uso                                                                                                                |
| `erp.outros`                                              | 39 métodos                                                                                                                                                             | 🔕 só com o módulo em uso                                                                                                                |
| `erp.animais.getMedicoesPesagem`                          | —                                                                                                                                                                      | ✅ pesagem real por animal; ⚠️ API ignora from/to (passar lança `ValidationError`), atribuir propriedade pelo campo do registro          |
| `erp.estoque`                                             | `getMovimentacaoMaterialById/getMovimentacaoMaterialItemById`                                                                                                          | ✅ busca por id (escopado pela sessão)                                                                                                   |
| `erp.auditoria.getHistoricoExecucaoViewPg`                | —                                                                                                                                                                      | ❌ HTTP 500 · ✅ `getHistoricoExecucaoViewPgUltimosItensFila()`                                                                          |
| `erp.estoque.getAplicacaoConsumoLoteAnimalIntercorrencia` | —                                                                                                                                                                      | ✅ (filtro de data real é `periodo`)                                                                                                     |
| `erp.cadastros`                                           | `getCulturas/getOperacoes`                                                                                                                                             | ✅                                                                                                                                       |

---

## Desenvolvimento

```bash
npm ci
npm test          # suíte completa (sem checagem de cobertura)
npm run coverage  # suíte + exigência de 100% de instruções/ramos/funções/linhas
npm run verify    # lint + format:check + typecheck + coverage
```

Os testes usam `fetch` mockado: não precisam de credencial e não acessam a rede. `test/live-contract.smoke.js` é um teste **opcional**, fora do `npm test`, que confirma contra a API real que o formato das respostas ainda bate com as suposições do cliente. Só faz leituras e precisa de credenciais reais:

```bash
MB_EMAIL=... MB_PASS=... npm run test:live
```

---

## Contribuindo

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir uma issue ou um pull request.

## Segurança

Não abra issue pública para vulnerabilidades. Veja como reportar em [SECURITY.md](SECURITY.md).

## Licença

[AGPL-3.0-only](LICENSE). Você pode usar, estudar, modificar e redistribuir este código; quem distribuir uma versão modificada, ou oferecê-la como serviço em rede, precisa disponibilizar o código-fonte correspondente sob a mesma licença.

O arquivo [LICENSE](LICENSE) traz o texto oficial da GNU Affero General Public License, versão 3, em inglês. É o único com validade jurídica: a Free Software Foundation não publica tradução oficial, e qualquer tradução serve só como referência.
