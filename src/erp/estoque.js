import { ERP_SLUGS } from '../constants.js'
import { EndpointUnavailableError, ValidationError } from '../errors.js'
import { isoToUtc } from '../dates.js'
import { checkPositiveInt, checkTimeout } from '../validate.js'
import { atLeastInstance, callOptions } from '../callOptions.js'

// Prazo padrão do recálculo: o servidor leva de 1,5 a 5 minutos e costuma
// cortar a consulta por volta de 300 s; 600 s não deixa o cliente desistir antes.
const REPROCESS_TIMEOUT_MS = 600_000
// Meia-noite de Brasília em UTC (sem horário de verão desde 2019), como a tela
// do MBWEB manda a data.
const BRASILIA_MIDNIGHT_MS = 3 * 60 * 60 * 1000

// allowedLines: lista não vazia de ids de linhas de confinamento; a linha
// pedida tem de estar nela.
function checkAllowedLine(line, allowedLines) {
  if (!Array.isArray(allowedLines) || allowedLines.length === 0) {
    throw new ValidationError('allowedLines deve ser uma lista não vazia de ids de linha', {
      field: 'allowedLines',
      received: allowedLines,
    })
  }
  for (const id of allowedLines) checkPositiveInt(id, 'allowedLines')
  if (!allowedLines.includes(line)) {
    throw new ValidationError(
      `linhaConfinamento ${line} fora de allowedLines: o recálculo só vale para linhas de ` +
        'confinamento (recalcular uma linha de pasto é proibido)',
      { field: 'linhaConfinamento', received: line }
    )
  }
}

// Corpo do recálculo, igual ao da tela do MBWEB.
function reprocessBody({ propertyId, date, lotes, line }) {
  const midnight = isoToUtc(date, 'date') + BRASILIA_MIDNIGHT_MS
  return {
    data: new Date(midnight).toISOString(),
    dietas: [],
    produtos: [],
    propriedade: propertyId,
    reprocessar: true,
    produtos_texto: [],
    lotes_confinamento: lotes,
    linhas_confinamento: [line],
    exibir_media_acumulada: false,
    lotes_confinamento_texto: [],
    linhas_confinamento_texto: [],
  }
}

export class EstoqueErp {
  #grid
  #client
  #auth

  // client/auth só são usados pelo recálculo (reprocessRelatorioGestaoNutricionalLote).
  constructor(grid, client, auth) {
    this.#grid = grid
    this.#client = client
    this.#auth = auth
  }

  // Arraçoamento/leitura de cocho — fonte de peso de ração por localidade.
  // NOTA: campo peso_balanca é o peso de RAÇÃO fornecida ao cocho (não peso de animal).
  // Período inteiro inviável (volume grande). Filtrar por data.
  // options: { from?, to?, startPage?, maxPages?, delayMs?, onPage? }
  async getTratos(options = {}) {
    return this.#grid.fetchAll(ERP_SLUGS.TRATOS, options)
  }
  // Mesmas opções de getTratos(), como iterador: for await (const { items, page } of …)
  iterTratos(options = {}) {
    return this.#grid.pages(ERP_SLUGS.TRATOS, options)
  }

  // Entradas de material / NFe. Período inteiro inviável (trava depois de algumas dezenas de páginas).
  // params: { from?, to?, extraParams?: { documento?, contato?, valor_pagamento_0?, valor_pagamento_1? } }
  // (filtros extras só chegam ao servidor via extraParams — chave de topo desconhecida lança ValidationError)
  async getEntradaMaterial(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.ENTRADA_MATERIAL, params)
  }

  // body: { propriedade, documento?, data, forma_pagamento (1), contato (FK),
  //         responsavel (FK), criterio_calculo?, valor_desconto?, valor_frete?,
  //         fornecedor_frete?, valor_total?, valor_pagamento?,
  //         itens: [{ produto (FK), quantidade, valor_unitario, observacao? }] }
  async createEntradaMaterial(body) {
    return this.#grid.create(ERP_SLUGS.ENTRADA_MATERIAL, body)
  }

  // Guias de Trânsito Animal.
  // ATENÇÃO: filtro de data IGNORADO pelo servidor — retorna sempre o período inteiro.
  // from/to lançam ValidationError (registry.js).
  // Espelhar o conjunto inteiro em blocos.
  //
  // Rastreabilidade de origem — 3 campos de "contraparte", não confundir:
  //   produtor / produtor_texto: produtor original do gado (mesmo entidade_id
  //     de bi.fornecedores.get() e de bi.animais.get().fornecedor_id).
  //   fornecedor / fornecedor_texto: contraparte desta movimentação específica
  //     — pode ser o mesmo produtor (compra) OU um comprador/frigorífico
  //     (venda), depende de tipo_saida.
  //   propriedade_fornecedor / propriedade_fornecedor_texto: só preenchido em
  //     transferência ENTRE propriedades do próprio contrato — aponta pra uma
  //     das suas próprias fazendas (id de mb.getProperties()), não um terceiro.
  async getGtas(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.GTA, params)
  }

  // Sobra de ração no cocho por leitura/localidade.
  // RECLASSIFICADO (era ❌ "timeout"): sem filtro de data, pagina 10
  // registros por página e CADA página recalcula do zero (minutos por página)
  // — a leitura completa é inviável (horas). Só considerado
  // "timeout" antes porque só foi testado sem filtro.
  // Filtrando por from/to (ex.: janela semanal) o cálculo é escopado à
  // janela, mas ainda leva minutos mesmo para poucos registros — cálculo pesado por
  // natureza, mas viável como sincronização incremental (mesmo padrão de
  // erp.custos.*). O registro (registry.js) já dá 300 s de prazo às chamadas a
  // este endpoint.
  async getSobraCocho(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.SOBRA_COCHO, params)
  }

  // ❌ A LISTAGEM retorna HTTP 500 em toda variação (re-testado:
  // page_size=1, take/skip, ordering, propriedade=, data_0/data_1
  // — todas 500). MAS o registro individual funciona — use
  // getMovimentacaoMaterialById() (mesmo padrão do confinamento).
  getMovimentacaoMaterial() {
    throw new EndpointUnavailableError(
      `${ERP_SLUGS.MOV_MATERIAL} (listagem) retorna HTTP 500 — bug de serializador no servidor MB`,
      {
        slug: ERP_SLUGS.MOV_MATERIAL,
        reason:
          'HTTP 500 na listagem em toda variação testada (paginação mínima, ordering, filtros) — ' +
          'bug de serializador. A rota existe mas a listagem não funciona.',
        workaround:
          'getMovimentacaoMaterialById(id) funciona (ids descobríveis pelo campo ' +
          'movimentacao_material de getMovimentacaoMaterialItens()). Para saídas de material ' +
          'por data, usar erp.custos.getSaidasMaterial().',
      }
    )
  }

  // ✅ A busca por id de movimentacaomaterial FUNCIONA (confirmado;
  // a rota é a mesma que a interface web do MBWEB usa). Retorna o cabeçalho completo da movimentação (~129 campos:
  // data, documento, situacao, tipo_movimentacao, valores, NFe/SEFAZ...)
  // INCLUINDO o array `itens[]` embutido — o "pai" que getMovimentacaoMaterialItens()
  // não entrega. Também existe GET {id}/material-itens/ (mesmos itens, formato
  // BR string), redundante com o `itens[]` da própria busca por id.
  //
  // ⚠️ Escopado pela propriedade da SESSÃO: id de movimentação de outra
  // fazenda responde 404 — chame selectProperty() da fazenda dona antes.
  // Ids descobríveis pelo campo `movimentacao_material` dos registros de
  // getMovimentacaoMaterialItens().
  //
  // A resposta já vem em JSON limpo (números nativos) — não passa pelo
  // formato BR do grid, então não aplica parseErpRecord.
  async getMovimentacaoMaterialById(id) {
    return this.#grid.fetchOneJson(ERP_SLUGS.MOV_MATERIAL, id, 'getMovimentacaoMaterialById')
  }

  // ❌ HTTP 500 — bug de serializador no servidor MB. Re-testado
  // com o roteiro completo do confinamento: 500 também na busca por id /{id}/ (ids
  // 1..3) e em toda variação de listagem; formulario/ responde 400. Único ❌
  // sem rota de recuperação conhecida.
  getViaAplicacaoTratamento() {
    throw new EndpointUnavailableError(
      `${ERP_SLUGS.VIA_APLICACAO} retorna HTTP 500 — bug de serializador no servidor MB`,
      {
        slug: ERP_SLUGS.VIA_APLICACAO,
        reason:
          'HTTP 500 na listagem E na busca por id (re-testado) — bug de serializador. ' +
          'A rota existe mas não funciona em nenhuma forma de acesso.',
        workaround:
          'O rótulo da via é derivável do campo via_aplicacao_tratamento/_texto dos registros ' +
          'de erp.cadastros.getMateriais() quando preenchido.',
      }
    )
  }

  // Endpoint adicional. Itens de movimentacaomaterial, no nível de produto/valor —
  // funciona mesmo com a LISTAGEM do "pai" quebrada (HTTP 500).
  // TESTADO (re-confirmado): NENHUM filtro do servidor na listagem
  // — o grid declara `filters: []`, e data_0/data_1, movimentacao_material=,
  // propriedade=, ordering= e até o `keywords` declarado
  // (produto__nome__unaccent__icontains=) são todos ignorados (mesmo total
  // com ou sem). Período inteiro inviável DIRETO — mas existe caminho incremental INDIRETO
  // erp.auditoria.getAuditoria({from,to}) filtra por data de
  // verdade e seus registros com modelo "basico.movimentacaomaterialitem"
  // trazem o id do item no campo `identificador` → buscar via
  // getMovimentacaoMaterialItemById(id), ou agrupar pelo campo
  // movimentacao_material do item e buscar o pai inteiro com
  // getMovimentacaoMaterialById(id).itens[] (menos chamadas). Validado de
  // ponta a ponta: a data informada pela auditoria bate com a da busca por id.
  async getMovimentacaoMaterialItens(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.MOVIMENTACAO_MATERIAL_ITEM, params)
  }

  // ✅ A busca por id do ITEM funciona (confirmado). Retorna o item completo (~131 campos: data,
  // documento, qtd, valores, MS, geolocalização...) incluindo a FK
  // `movimentacao_material` para o cabeçalho — a ponta final do caminho
  // incremental via auditoria descrito em getMovimentacaoMaterialItens().
  // ⚠️ Diferente do confinamento, aqui `data` vem em formato BR
  // ("DD/MM/YYYY") — corpo cru, sem parse (tratar no consumidor).
  async getMovimentacaoMaterialItemById(id) {
    return this.#grid.fetchOneJson(
      ERP_SLUGS.MOVIMENTACAO_MATERIAL_ITEM,
      id,
      'getMovimentacaoMaterialItemById'
    )
  }

  // Endpoint adicional. Itens de getTratos(), mais granular
  // (por produto/insumo dentro de cada trato). Volume grande.
  // ✅ FILTRO DE DATA (confirmado): o grid declara o filtro como
  // `movimentacao_material__data` (DateFromToRangeFilter) — data_0/data_1
  // (o mapeamento padrão de from/to) é silenciosamente ignorado. Uma janela
  // de dias reduz o total em ordens de grandeza. O registro (registry.js) traduz from/to para a grafia
  // certa — sincronização incremental por data agora é viável.
  // Filtros extras declarados pelo grid (via extraParams): localidade=,
  // produto= (dieta), movimentacao_material__responsavel=,
  // movimentacao_material__nr_trato=.
  async getTratosItens(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TRATOS_ITEM, params)
  }

  // Endpoint adicional. Consumo de ração aplicado por lote de
  // animal (financeiro/fiscal, forma parecida com getEntradaMaterial).
  // TESTADO: from/to FUNCIONA de verdade — viável para sincronização incremental por
  // data.
  async getAplicacaoConsumoLoteAnimal(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.APLICACAO_CONSUMO_LOTE_ANIMAL, params)
  }

  // ── Endpoints adicionais ───────────────────────────────────────────────────

  // Histórico de transferência de animal entre propriedades (GTA de
  // transferência interna).
  async getTransferenciasPropriedade(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TRANSFERENCIA_PROPRIEDADE, params)
  }

  async getTransferenciasLoteAlimentar(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TRANSFERENCIA_LOTE_ALIMENTAR, params)
  }

  async getTransferenciasLoteFinalidade(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TRANSFERENCIA_LOTE_FINALIDADE, params)
  }

  async getProgramasNutricionais(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.PROGRAMA_NUTRICIONAL, params)
  }

  // Previsão diária de trato por curral (planejado) — complementa getTratos()
  // (realizado). Volume grande; filtro de data ainda não testado.
  async getTratosDiariosPrevistos(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TRATOS_DIARIOS_PREVISTOS, params)
  }

  // Plano de trato por curral/dieta. TESTADO: from/to filtra de verdade.
  async getDefinicaoDiariaTratos(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.DEFINICAO_DIARIA_TRATOS, params)
  }

  // Batidas de produção de dieta/ração (custo, vagão, responsável, tempo de
  // mistura) — visão ERP mais detalhada que bi.producaoRacao.
  async getProducaoDietas(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.PRODUCAO_DIETA, params)
  }

  // Relatório "Gestão Nutricional" por lote/curral -- a mesma tela e os
  // mesmos dados do relatório da tela do MBWEB.
  // Endpoint adicional, não documentado pela API oficial -- não é uma listagem/grid
  // paginada, é um POST de relatório com corpo de requisição fixo.
  //
  // A consulta não calcula nada: devolve o resultado da última busca feita naquela
  // fazenda, pela tela do MBWEB ou por recálculo, e `filtro` diz qual foi (data,
  // linhas e lotes). Por isso `date` (enviado como "data", exigido no corpo) e os
  // filtros são ignorados, e o resultado pode ser de um dia antigo, de uma linha de
  // pasto ou de um curral só. Confira `data_relatorio` e `filtro` antes de usar.
  // Para calcular um dia, use reprocessRelatorioGestaoNutricionalLinha.
  //
  // Linhas com `media: true` são subtotais do grupo, não currais, e há linhas sem
  // `localidade_id`.
  //
  // A fazenda propertyId é selecionada e o POST roda na mesma seção exclusiva
  // da fila. Resposta bruta: `{ dados: { localidades: [...], exibir_media,
  // data_alteracao_base, filtro } }` -- devolve `dados` diretamente.
  async getRelatorioGestaoNutricionalLote({
    propertyId,
    date,
    produtos = [],
    linhasConfinamento = [],
    lotesConfinamento = [],
    timeoutMs,
    signal,
  } = {}) {
    checkPositiveInt(propertyId, 'propertyId')
    isoToUtc(date, 'date')
    const body = {
      propriedade: propertyId,
      data: date,
      produtos,
      linhas_confinamento: linhasConfinamento,
      lotes_confinamento: lotesConfinamento,
    }
    return this.#postReport(propertyId, body, { timeoutMs, signal })
  }

  // Recálculo do relatório para uma data, numa linha de confinamento inteira. Mesmo
  // endpoint, com `reprocessar: true` e a lista de lotes vazia, como a tela envia:
  // o servidor recalcula de verdade, respeita a data e devolve todos os currais da
  // linha. Prefira este ao recálculo por lote.
  //
  // ⚠️ ESCREVE num cache compartilhado do MBWEB: o resultado substitui o cache
  // inteiro da fazenda, e a tela de Gestão Nutricional de todos os usuários passa a
  // mostrar só esta linha e este dia, até a próxima busca.
  //
  // Lento e instável: leva minutos e o servidor costuma cortar a consulta por volta
  // de 300 s (TimeoutError, NetworkError ou ServerError). Como toda escrita,
  // TimeoutError/NetworkError trazem mayHaveSucceeded: o recálculo pode ter sido
  // aplicado. Não repita em massa: quem chama decide quantos recálculos faz e com
  // que intervalo.
  //
  // Só vale para linhas de CONFINAMENTO: recalcular uma linha de pasto é proibido, e
  // o cliente não tem como saber o tipo da linha. Quem tem a lista das linhas de
  // confinamento passa allowedLines, e o método recusa qualquer outra antes de chamar.
  //
  // A fazenda é selecionada na seção exclusiva da fila, que fica ocupada durante
  // todo o recálculo (outras trocas de fazenda desta instância esperam).
  async reprocessRelatorioGestaoNutricionalLinha({
    propertyId,
    date,
    linhaConfinamento,
    allowedLines,
    timeoutMs = atLeastInstance(REPROCESS_TIMEOUT_MS, this.#client),
    signal,
  } = {}) {
    checkPositiveInt(propertyId, 'propertyId')
    checkPositiveInt(linhaConfinamento, 'linhaConfinamento')
    if (allowedLines !== undefined) checkAllowedLine(linhaConfinamento, allowedLines)
    const body = reprocessBody({ propertyId, date, lotes: [], line: linhaConfinamento })
    return this.#postReport(propertyId, body, { timeoutMs, signal })
  }

  // Recálculo de um curral só. Tem os mesmos avisos do recálculo por linha, e mais
  // um: o resultado também substitui o cache inteiro da fazenda, então a tela e a
  // consulta normal ficam só com este curral, e recalcular vários lotes em sequência
  // deixa só o último. Para mais de um curral, use o recálculo por linha.
  async reprocessRelatorioGestaoNutricionalLote({
    propertyId,
    date,
    loteConfinamento,
    linhaConfinamento,
    allowedLines,
    timeoutMs = atLeastInstance(REPROCESS_TIMEOUT_MS, this.#client),
    signal,
  } = {}) {
    checkPositiveInt(propertyId, 'propertyId')
    checkPositiveInt(loteConfinamento, 'loteConfinamento')
    checkPositiveInt(linhaConfinamento, 'linhaConfinamento')
    if (allowedLines !== undefined) checkAllowedLine(linhaConfinamento, allowedLines)
    const body = reprocessBody({
      propertyId,
      date,
      lotes: [loteConfinamento],
      line: linhaConfinamento,
    })
    return this.#postReport(propertyId, body, { timeoutMs, signal })
  }

  // POST do relatório com a fazenda selecionada na seção exclusiva; devolve
  // o conteúdo de `dados` (ou a resposta como veio). timeoutMs/signal só
  // desta chamada.
  async #postReport(propertyId, body, { timeoutMs, signal }) {
    // O HttpClient também valida o prazo, mas só depois que a fila trocou a
    // fazenda no servidor: validar antes evita uma troca à toa.
    if (timeoutMs !== undefined) checkTimeout(timeoutMs)
    const options = callOptions({ timeoutMs, signal })
    // signal também na fila: uma chamada cancelada enquanto esperava a vez
    // não chega a trocar a fazenda no servidor.
    const raw = await this.#auth.withProperty(
      this.#client,
      propertyId,
      () =>
        this.#client.post(
          `/${ERP_SLUGS.RELATORIO_GESTAO_NUTRICIONAL_LOTE}/?format=json`,
          body,
          options
        ),
      { signal }
    )
    return raw?.dados ?? raw
  }

  // Materiais/produção
  async getPremisturas(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.PREMISTURA, params)
  }
  async getProdutoServicos(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.PRODUTO_SERVICOS, params)
  }
  async getAlteracoesPercentualMateriaSeca(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.ALTERACAO_PERCENTUAL_MATERIA_SECA, params)
  }
  async getEntradaMaterialItens(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.ENTRADA_MATERIAL_ITEM, params)
  }
  async getEntradasSaidasMaterial(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.ENTRADA_SAIDA_MATERIAL, params)
  }
  async getAplicacoesConsumo(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.APLICACAO_CONSUMO, params)
  }
  // Itens de getAplicacaoConsumoLoteAnimal() (nível produto/valor) — mesma
  // forma de getMovimentacaoMaterialItens().
  async getAplicacaoConsumoLoteAnimalItens(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.APLICACAO_CONSUMO_LOTE_ANIMAL_ITEM, params)
  }

  // Avaliação de campo por trato (score de cocho, condição de cerca, água).
  // Filtro de data real é "periodo", não "data" (confirmado; registry.js traduz from/to).
  async getAplicacaoConsumoLoteAnimalIntercorrencia(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.APLICACAO_CONSUMO_LOTE_ANIMAL_INTERCORRENCIA, params)
  }

  // Saídas
  async getSaidasTransferenciaPropriedades(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.SAIDA_TRANSFERENCIA_PROPRIEDADES, params)
  }
  async getSaidasVendaPerda(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.SAIDA_VENDA_PERDA, params)
  }
  async getOutrasSaidas(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.OUTRAS_SAIDAS, params)
  }

  // Ativos/maquinário
  async getAtivos(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.ATIVOS, params)
  }
  async getMaquinariosConfinamento(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.MAQUINARIOS_CONFINAMENTO, params)
  }
  async getTiposAtivos(params = {}) {
    return this.#grid.fetchPage(ERP_SLUGS.TIPOS_ATIVOS, params)
  }
}
