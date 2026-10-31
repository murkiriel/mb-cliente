# Changelog

Todas as mudanças notáveis deste pacote são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.3.0] - 2026-10-31

### Adicionado

- `erp.estoque.reprocessRelatorioGestaoNutricionalLinha()`: recalcula o relatório de Gestão Nutricional de uma linha de confinamento inteira em uma chamada, como a tela do MBWEB, com a mesma recusa de `allowedLines`.

### Corrigido

- Documentação do relatório de Gestão Nutricional: a consulta devolve o resultado da última busca feita na fazenda, pela tela ou por recálculo, e ignora a data e os filtros. Ela não é um cálculo diário do servidor. O recálculo por lote também substitui o cache inteiro da fazenda, então recalcular vários lotes em sequência deixa só o último.

## [0.2.0] - 2026-10-30

### Adicionado

- `bi.animais.forEachBatch(opts, onBatch)` e `bi.movEstoque.forEachBatch(opts, onBatch)`: os mesmos registros do `get()`, lidos em fluxo e entregues em lotes (`batchSize`, padrão 1000). Esses endpoints devolvem a fazenda inteira num único JSON; o `get()` converte tudo de uma vez, enquanto o `forEachBatch` mantém a memória no tamanho do lote, sem dependência nova. Num corpo de 65 MB, a leitura coube em 32 MB de heap. Mesma autenticação, relogin, prazo e classificação de erros do `get()`. O prazo cobre também o tempo do `onBatch`, e uma falha de rede depois do primeiro lote não é repetida.

## [0.1.0] - 2026-10-29

Primeira versão pública. Distribuída pelo GitHub (`npm install github:Murkiriel/mb-cliente#v0.1.0`); o pacote não é publicado no npm.

### Adicionado

- Cliente `MultBovinos` para a API de Integração MultBovinos (MBWEB), com as áreas `bi` (leitura analítica), `erp` (cadastros, animais, sanitário, estoque, custos, auditoria, financeiro, reprodução e outros) e `raw` (acesso cru a endpoints sem método dedicado).
- Autenticação por JWT com `connect()`, relogin automático e transparente em HTTP 401 (reselecionando a fazenda desejada) e reidratação de sessão para ambientes sem servidor (`token`/`properties` no construtor).
- Fila de fazenda por instância: trocas de fazenda (`selectProperty`, `erp.custos.*`, `getAll`, `forAllProperties`) rodam uma de cada vez, e as páginas de grid ERP rodam como leituras compartilhadas que nunca coincidem com uma troca. Uma paginação que vê a fazenda mudar lança `PropertyNotSelectedError` em vez de misturar dados. Trocar para outra fazenda dentro de uma seção (ex.: no callback de `forAllProperties`) lança `ValidationError`. Nos grids por fazenda cujo registro traz a fazenda, `verifyRecordProperty` (padrão `true`) confere cada página e lança `PropertyNotSelectedError` (`reason: 'changed_by_another_session'`) quando outra sessão da mesma conta trocou a fazenda no servidor.
- `timeoutMs` cobrindo a requisição inteira (inclusive a leitura do corpo), `retry` opcional com espera exponencial só em GET e cancelamento por `AbortSignal` na instância e por chamada.
- `mb.relogin()`: reconecta sem perder a fazenda (novo login e reseleção sem contar como troca, então as paginações em andamento continuam). `connect()` segue começando uma sessão nova, sem fazenda.
- Registro por endpoint do ERP (`src/erp/registry.js`) com o escopo de fazenda, o filtro de data que o servidor aplica, o campo de fazenda do registro e o prazo sugerido de cada grid, medidos ao vivo: 126 grids registrados, 125 com escopo conhecido (36 por fazenda, 83 da conta inteira, 5 globais, 1 que vaza outras fazendas).
- Opção `propertyId` nos métodos de página única do ERP, nos `fetchAll`/`iter*` e em `mb.erp.fetchPage`/`pages`/`collect`: seleciona a fazenda conforme o escopo do registro; recusa com `ValidationError` nos endpoints da conta inteira, globais ou que vazam outras fazendas; marca `scope: 'unverified'` nos de escopo desconhecido. Grids sabidamente por fazenda sem `propertyId` e sem fazenda selecionada lançam `PropertyNotSelectedError`.
- Acesso genérico a qualquer grid pelo slug: `mb.erp.fetchPage(slug, opts)`, `mb.erp.pages(slug, opts)` e `mb.erp.collect(slug, opts)`, e o helper `collectPages()` (na raiz e em `/helpers`) para juntar páginas em memória.
- `filters` (declaração de filtros do servidor) e `modelo` no resultado de cada página do ERP.
- `timeoutMs` por chamada nos grids do ERP (padrão do registro quando houver, como os 300 s da sobra de cocho), no BI (`get`, `getFormulacao`), nos custos (padrão de 300 s em todos), no relatório de Gestão Nutricional e no `mb.raw`.
- Erros tipados: `AuthError`, `PropertyNotSelectedError`, `RateLimitError`, `InvalidPageError`, `ClientError`, `NotFoundError` (HTTP 404, subclasse de `ClientError`), `EmptyResponseError`, `EndpointUnavailableError`, `TimeoutError`, `NetworkError`, `ServerError`, `InvalidResponseError` e `ValidationError`, todos derivados de `MultBovinosError`, com `mayHaveSucceeded` nas escritas interrompidas.
- Paginação com resultado verificável (`complete`, `nextPage`, `possiblyRateLimited`), iteradores `iterVacinacoes`/`iterTratamentos`/`iterTratos` e o helper genérico `paginate()`. `delayMs` é 0 por padrão: o cliente não espaça as páginas por conta própria. Resposta vazia no meio da paginação, opção desconhecida e `from`/`to` em grids cujo filtro de data a API ignora lançam erro em vez de devolver dados incompletos.
- Eventos de diagnóstico só de leitura no `node:diagnostics_channel` (`mb-cliente:request`, `retry`, `relogin`, `property-switch` e `empty-response`), sem token, senha, corpo nem query string: métricas e log sem interceptador.
- `safeImport()` para trocar dados locais só diante de um conjunto completo e não vazio, protegendo contra o limite silencioso de requisições da API.
- Conversão do formato BR (números e datas) nos grids ERP, sem tocar em rótulos, identificações e códigos, e os conversores públicos `parseBrNumber`, `parseBrDate`, `parseBrDateTime` (data e hora BR, não aplicado automaticamente), `parseErpRecord`, `parseErpPage` e `countCalendarDays`.
- Helpers de datas (`getWeeklyWindows`, `getMonthlyWindows`, `lastDayOfMonth`, `firstDayOfMonth`).
- `erp.estoque.reprocessRelatorioGestaoNutricionalLote()`: recálculo do relatório de Gestão Nutricional para uma data, num curral só, com trava contra recálculo da fazenda inteira, `allowedLines` opcional para recusar linhas que não são de confinamento e prazo próprio (padrão 10 min).
- Registros tipados nos métodos mais usados (`Trato`, `TratoItem`, `SobraCocho`, `DefinicaoDiariaTratos`, `Vacinacao`, `Tratamento`, `MedicaoPesagem`, `InventarioAnimal`, `Saida`, `Morte`, `Gta`, `Confinamento`, os do BI e outros), com `ApiDecimal` para os decimais e `ApiRecord` como base aberta.
- `erp.animais.getConfinamento(params)`: listagem dos lotes de confinamento por fazenda, que respondia HTTP 500 e voltou a funcionar (sonda de 2026-10-29); `from`/`to` filtram pela abertura do lote (`data_abertura`).
- Declarações TypeScript completas na raiz e nos subpaths `/errors`, `/constants`, `/helpers` e `/parsers`.

[0.2.0]: https://github.com/Murkiriel/mb-cliente/releases/tag/v0.2.0
[0.1.0]: https://github.com/Murkiriel/mb-cliente/releases/tag/v0.1.0
