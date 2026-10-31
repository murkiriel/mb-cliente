// mb-cliente — declarações TypeScript
// Node.js 22+, ESM

// ── Primitivos ───────────────────────────────────────────────────────────────

export interface Property {
  id: number
  nome: string
  cnpj: string | null
}

export interface ConnectResult {
  token: string
  properties: Property[]
}

// ── Resultados BI ─────────────────────────────────────────────────────────────

export interface BiResult<T = Record<string, unknown>> {
  items: T[]
  count: number
}

export interface AnimaisGetAllResult<T = Record<string, unknown>> extends BiResult<T> {
  byProperty: Map<number, T[]>
}

// ── Resultados ERP ────────────────────────────────────────────────────────────

export interface ErpPageResult<T = Record<string, unknown>> {
  items: T[]
  count: number
  hasMore: boolean
  nextPage: number | null
  /** true quando a página veio vazia e `allowEmpty` a absorveu: pode ser
   * fonte vazia de verdade ou limite silencioso de requisições. */
  possiblyRateLimited?: boolean
  /** Presente só quando possiblyRateLimited é true. */
  reason?: 'possibly_rate_limited'
  /** Declaração de filtros que o servidor manda junto com a página (nome e tipo). */
  filters?: unknown
  /** Nome do modelo no servidor (ex.: `'venda'`). */
  modelo?: string | null
  /** `'unverified'` quando `propertyId` foi usado num endpoint de escopo desconhecido:
   * a fazenda foi selecionada, mas não se confirmou que o endpoint respeita a seleção. */
  scope?: 'unverified'
}

/** Página de {@link paginate} / `iter*()`: o resultado da página mais o número dela. */
export interface ErpPage<T = Record<string, unknown>> extends ErpPageResult<T> {
  page: number
}

/**
 * Opções dos métodos de página única do ERP. Qualquer outra chave lança
 * `ValidationError` — filtros do servidor vão em `extraParams`.
 */
export interface FetchPageOptions {
  page?: number
  /** YYYY-MM-DD. Nos grids cujo filtro de data a API ignora, lança `ValidationError`. */
  from?: string
  /** YYYY-MM-DD. Nos grids cujo filtro de data a API ignora, lança `ValidationError`. */
  to?: string
  extraParams?: Record<string, string | number | boolean | undefined>
  /** Resposta vazia vira `{ items: [], possiblyRateLimited: true }` em vez de
   * `EmptyResponseError`. Escolha de quem chama — nenhum método liga sozinho. */
  allowEmpty?: boolean
  signal?: AbortSignal
  /** Lê com esta fazenda selecionada. Recusado (`ValidationError`) nos endpoints que são da
   * conta inteira, globais ou que vazam outras fazendas; nos de escopo desconhecido o
   * resultado vem com `scope: 'unverified'`. */
  propertyId?: number
  /** Prazo só desta chamada (padrão: o sugerido pelo registro do endpoint, ou o da instância). */
  timeoutMs?: number
  /** Nome do filtro de data no servidor (padrão: o do registro do endpoint, em geral `'data'`). */
  dateParam?: string
}

/** Opções de `getVacinacoes`/`getTratamentos`/`getTratos` e dos `iter*()`.
 * Qualquer outra chave lança `ValidationError`. */
export interface FetchAllOptions<T = Record<string, unknown>> {
  from?: string
  to?: string
  startPage?: number
  maxPages?: number
  /** Espera entre páginas, em ms (padrão 0: o cliente não espaça chamadas por conta própria).
   * Interrompida pelo `signal`. */
  delayMs?: number
  extraParams?: Record<string, string | number | boolean | undefined>
  /** Vale só para a PRIMEIRA página (janela que pode estar vazia de verdade).
   * Resposta vazia depois dela sempre lança `EmptyResponseError`. */
  allowEmpty?: boolean
  signal?: AbortSignal
  /** Ver {@link FetchPageOptions.propertyId}. */
  propertyId?: number
  /** Prazo de cada página. */
  timeoutMs?: number
  dateParam?: string
  /** Só em `get*()`; retornar `false` interrompe. */
  onPage?: (items: T[], pageNum: number) => boolean | void | Promise<boolean | void>
}

export interface FetchAllResult {
  totalFetched: number
  pagesRead: number
  /** Página em que `onPage` retornou false, ou null. */
  stoppedAt: number | null
  /** true só quando o servidor disse que não havia mais páginas. false quando
   * `maxPages` ou `onPage` interromperam — aí `nextPage` diz de onde retomar. */
  complete: boolean
  nextPage: number | null
  /** A primeira página veio vazia e `allowEmpty` a absorveu. */
  possiblyRateLimited: boolean
  /** Ver {@link ErpPageResult.scope}. */
  scope?: 'unverified'
}

// ── Registros ────────────────────────────────────────────────────────────────
// Campos que os registros trazem, conferidos no uso real de cada endpoint. A
// API pode mandar outros campos: eles continuam acessíveis, como `unknown`.
// No ERP, datas sem hora já vêm convertidas para YYYY-MM-DD; data e hora BR
// ("DD/MM/YYYY HH:MM:SS") ficam como vieram (ver parseBrDateTime). Qualquer
// campo pode vir null.

/** Decimal da API: número (no ERP, já convertido do formato BR) ou texto com
 * ponto decimal, como o servidor manda alguns campos (ex.: `"12.50"`). Converta com `Number()`. */
export type ApiDecimal = number | string

/** Base dos registros: os campos não declarados continuam acessíveis. */
export interface ApiRecord {
  [field: string]: unknown
}

/** `erp.estoque.getTratos()` — trato realizado (arraçoamento por curral). */
export interface Trato extends ApiRecord {
  id: number
  data_trato: string | null
  hora_inicio_trato: string | null
  hora_fim_trato: string | null
  nr_trato: number | null
  localidade: number | null
  localidade_texto: string | null
  dieta: number | string | null
  /** Pode vir com HTML no lugar do número: trate como ausente. */
  quantidade_decimal: ApiDecimal | null
  responsavel: number | null
  responsavel_texto: string | null
  tipo_entrada_saida: number | null
  tipo_entrada_saida_texto: string | null
  /** Pode vir com HTML no lugar do número: trate como ausente. */
  valor_total: ApiDecimal | null
  uid: string | null
  data_ultima_alteracao: string | null
}

/** `erp.estoque.getTratosItens()` — item de trato, por produto. */
export interface TratoItem extends ApiRecord {
  id: number
  /** Id do trato (`Trato.id`). */
  movimentacao_material: number | null
  data_trato: string | null
  hora_inicio_trato: string | null
  hora_fim_trato: string | null
  nr_trato: number | null
  responsavel: number | string | null
  localidade: number | null
  localidade_texto: string | null
  produto: number | null
  produto_texto: string | null
  lote_alimentar: number | null
  lote_alimentar_texto: string | null
  tipo_entrada_saida: number | string | null
  /** Este e os outros três decimais podem vir com HTML no lugar do número. */
  quantidade_decimal: ApiDecimal | null
  peso_balanca: ApiDecimal | null
  peso_balanca_final: ApiDecimal | null
  valor_unitario: ApiDecimal | null
  uid: string | null
}

/** Item de {@link SobraCocho}: um curral. */
export interface SobraCochoItem extends ApiRecord {
  id: number
  localizacao_texto: string | null
  /** Id do lote de confinamento (ver `erp.animais.getConfinamentoById`). */
  confinamento: number | null
  confinamento_texto: string | null
  racao: number | null
  racao_texto: string | null
  saldo: number | null
  qtde_animais: number | null
  sobra: ApiDecimal | null
  score_atual: number | null
  dia_conf: number | null
  permanencia_media: number | null
  permanencia_media_conf: number | null
  possui_trato: boolean | number | null
  realizado_todos_tratos: boolean | number | null
}

/** `erp.estoque.getSobraCocho()` — leitura de cocho do dia, com um item por curral. */
export interface SobraCocho extends ApiRecord {
  id: number
  data: string | null
  qtde_curral: number | null
  responsavel_texto: string | null
  uid: string | null
  sobra_cocho_itens: SobraCochoItem[] | null
}

/** Horário de trato previsto, dentro de {@link DefinicaoDiariaTratos}. */
export interface TratoPrevisto extends ApiRecord {
  id: number
  nr_trato: number | null
  data: string | null
  localizacao_texto: string | null
  qtde_animais: number | null
  dieta_texto: string | null
  perc_trato: ApiDecimal | null
  qtde_mo_trato_previsto: ApiDecimal | null
  qtde_mo_trato: ApiDecimal | null
  uid: string | null
}

/** `erp.estoque.getDefinicaoDiariaTratos()` — plano de trato de um curral num dia. */
export interface DefinicaoDiariaTratos extends ApiRecord {
  id: number
  data: string | null
  curral: string | null
  confinamento: number | null
  confinamento_texto: string | null
  dieta: number | null
  dieta_texto: string | null
  qtde_animais: number | null
  machos: number | null
  femeas: number | null
  total_a_ofertar: ApiDecimal | null
  total_previsto: ApiDecimal | null
  permanencia_media: number | null
  permanencia_media_conf: number | null
  observacao: string | null
  uid: string | null
  tratos_previstos: TratoPrevisto[] | null
}

/** `erp.sanitario.getVacinacoes()`. Observado com o mesmo conjunto de `getTratamentos()`. */
export interface Vacinacao extends ApiRecord {
  id: number
  animal_id_usual: string | null
  data: string | null
  tratamento: number | null
  tratamento_texto: string | null
  tipo: string | null
  dose: ApiDecimal | null
  custo: ApiDecimal | null
  quantidade: ApiDecimal | null
  unidade: string | null
  carencia: number | string | null
  localizacao_atual: string | null
  uid: string | null
}

/** `erp.sanitario.getTratamentos()`. */
export interface Tratamento extends ApiRecord {
  id: number
  identificacao_animal: string | null
  data: string | null
  tratamento: number | null
  tratamento_texto: string | null
  tratamento_subgrupo: string | null
  tipo_tratamento: string | null
  doenca: string | null
  dose: ApiDecimal | null
  custo: ApiDecimal | null
  quantidade: ApiDecimal | null
  unidade: string | null
  carencia: number | string | null
  localizacao_atual: string | null
  uid: string | null
}

/** `erp.animais.getMedicoesPesagem()` — pesagem por animal. A fazenda é a do campo
 * `propriedade`: a seleção não restringe este endpoint. */
export interface MedicaoPesagem extends ApiRecord {
  id: number
  propriedade: number | null
  animal: number | null
  animal_texto: string | null
  /** Peso, em kg. */
  valor: ApiDecimal | null
  data_avaliacao: string | null
  idade_na_pesagem: number | null
  localidade_texto: string | null
  lote_alimentar_texto: string | null
}

/** `erp.animais.getInventariosAnimais()` — evento de contagem do rebanho. */
export interface InventarioAnimal extends ApiRecord {
  id: number
  animal: number | null
  animal_texto: string | null
  animal_sexo: string | null
  animal_raca: string | null
  animal_situacao: string | null
  /** Data e hora BR ("DD/MM/YYYY HH:MM:SS"): ver parseBrDateTime. */
  data_hora: string | null
  inventario_tipo_texto: string | null
  metodo_coleta_texto: string | null
  responsavel_texto: string | null
  uid: string | null
}

/** `erp.animais.getSaidas()`. */
export interface Saida extends ApiRecord {
  id: number
  animal_id_usual: string | null
  data: string | null
  tipo: number | null
  tipo_texto: string | null
  destino: string | null
  documento: string | null
  observacao: string | null
  uid: string | null
}

/** `erp.animais.getMortes()`. */
export interface Morte extends ApiRecord {
  id: number
  animal_identificacao_usual: string | null
  data: string | null
  causa: string | null
  animal_categoria: string | null
  animal_sexo: string | null
  localizacao_texto: string | null
  localizacao_nome: string | null
  peso: ApiDecimal | null
  documento: string | null
  observacao: string | null
  uid: string | null
}

/** `erp.estoque.getGtas()` — Guia de Trânsito Animal. */
export interface Gta extends ApiRecord {
  id: number
  tipo_texto: string | null
  serie: string | null
  numero: string | null
  destino: number | string | null
  emissao: string | null
  validade: string | null
  total_animais: number | null
  placa: string | null
  /** Distingue venda/saída externa (0) de transferência interna (1). */
  tipo_saida: number | null
  produtor: number | null
  produtor_texto: string | null
  fornecedor: number | null
  fornecedor_texto: string | null
  propriedade_fornecedor: number | null
  propriedade_fornecedor_texto: string | null
  uid: string | null
}

/** `erp.animais.getHistoricoMovimentacaoLocalidades()` — movimentação de animal entre localidades. */
export interface HistoricoMovimentacaoLocalidade extends ApiRecord {
  id: number
  animal: number | null
  animal_texto: string | null
  animal_sexo: string | null
  data: string | null
  localizacao_origem: number | null
  localizacao_origem_texto: string | null
  localizacao_destino: number | null
  localizacao_destino_texto: string | null
  tipo_movimentacao_texto: string | null
  origem_informacao: string | null
  usuario_inclusao: string | null
  observacao: string | null
  uid: string | null
}

/** `erp.estoque.getAplicacaoConsumoLoteAnimal()` — consumo aplicado por lote. */
export interface AplicacaoConsumoLoteAnimal extends ApiRecord {
  id: number
  data: string | null
  localidade: number | null
  localidade_texto: string | null
  tipo_entrada_saida: number | null
  tipo_entrada_saida_texto: string | null
  valor_total: ApiDecimal | null
  responsavel_texto: string | null
  nr_trato: number | null
  documento: string | null
  uid: string | null
}

/** `erp.estoque.getTransferenciasPropriedade()` — um animal transferido entre fazendas do
 * contrato. O endpoint é da conta inteira: a fazenda está nos campos de origem e destino. */
export interface TransferenciaPropriedade extends ApiRecord {
  id: number
  propriedade_origem: number | null
  propriedade_origem_texto: string | null
  propriedade_destino: number | null
  propriedade_destino_texto: string | null
  animal: number | null
  animal_idusual: string | null
  animal_sexo: string | null
  data: string | null
  localidade_destino: number | null
  localidade_destino_texto: string | null
  documento: string | null
  gta_texto: string | null
  produtor_origem_texto: string | null
  produtor_destino_texto: string | null
  responsavel_texto: string | null
  origem_informacao: string | null
  uid: string | null
}

/** Animal dentro de {@link Confinamento}. Use os campos `*_conf` para o ciclo de
 * confinamento; os sem sufixo seguem a posição atual do animal. */
export interface ConfinamentoAnimal extends ApiRecord {
  id: number
  animal_id: number | null
  identificacao_usual: string | null
  sexo_texto: string | null
  raca: string | null
  data_entrada_conf: string | null
  data_saida: string | null
  peso_entrada: ApiDecimal | null
  data_peso_entrada: string | null
  ultimo_peso: ApiDecimal | null
  permanencia_conf: number | null
  venda_item_id: number | null
  descarte_id: number | null
  saida_id: number | null
  transferencia_propriedade_id: number | null
  transferencia_localizacao_id: number | null
  valor_arroba: ApiDecimal | null
  rend_carcaca: ApiDecimal | null
}

/** `erp.animais.getConfinamentoById()` — lote de confinamento completo (JSON cru, sem parse BR). */
export interface Confinamento extends ApiRecord {
  id: number
  data_abertura: string | null
  data_saida: string | null
  qtde_inicial: number | null
  qtde_atual_femeas: number | null
  qtde_atual_machos: number | null
  peso_inicial: ApiDecimal | null
  ultimo_peso: ApiDecimal | null
  sexo: string | null
  valor_arroba: ApiDecimal | null
  perc_rendimento_carcaca: ApiDecimal | null
  animais: ConfinamentoAnimal[] | null
}

/** `bi.animais.get()` — cadastro do animal (sem parse BR). */
export interface BiAnimal extends ApiRecord {
  identificacao_usual: string | null
  identificacao_eletronica: string | null
  numero_registro: string | null
  numero_sisbov: string | null
  certificadora: string | null
  data_certificacao: string | null
  nome: string | null
  sexo: string | null
  categoria: string | null
  data_nascimento: string | null
  idade_meses: number | null
  data_aquisicao: string | null
  situacao: string | null
  estado_id: number | null
  estado: string | null
  tipo_id: number | null
  tipo: string | null
  raca_id: number | null
  raca: string | null
  grau_sangue: string | null
  pelagem: string | null
  rebanho: string | null
  localizacao: string | null
  localizacao_anterior: string | null
  lote_avaliacao: string | null
  lote_alimentar: string | null
  lote_finalidade: string | null
  proprietario: string | null
  /** Produtor de origem (mesmo `entidade_id` de `bi.fornecedores`). */
  fornecedor_id: number | null
  fornecedor: string | null
  fornecedor_frete: string | null
  valor_aquisicao: ApiDecimal | null
  valor_frete: ApiDecimal | null
  primeiro_peso: ApiDecimal | null
  data_primeiro_peso: string | null
  ultimo_peso: ApiDecimal | null
  data_ultimo_peso: string | null
  data_entrada_confinamento: string | null
  peso_entrada_confinamento: ApiDecimal | null
  data_previsao_abate: string | null
}

/** `bi.movEstoque.get()` — evento de entrada/saída de animal. */
export interface BiMovEstoque extends ApiRecord {
  documento: string | null
  entidade_id: number | null
  data_evento: string | null
  tipo: string | null
  tipo_documento: string | null
  identificacao_usual: string | null
  localidade_id: number | null
  valor_desconto: ApiDecimal | null
  valor_frete: ApiDecimal | null
  valor_unitario: ApiDecimal | null
  valor_total: ApiDecimal | null
  rendimento_carcaca: ApiDecimal | null
  peso: ApiDecimal | null
}

/** `bi.suplementacao.get()`. */
export interface BiSuplementacao extends ApiRecord {
  data: string | null
  pasto: string | null
  dieta: string | null
  quantidade: ApiDecimal | null
  unidade: string | null
  percentual_materia_seca: ApiDecimal | null
}

/** `bi.producaoRacao.get()` — batida de produção de ração. */
export interface BiProducaoRacao extends ApiRecord {
  producao_id: number
  data: string | null
  batida: number | null
  vagao: number | null
  racao_id: number | null
  racao: string | null
  responsavel_id: number | null
  responsavel: string | null
  quantidade_produzida: ApiDecimal | null
  custo: ApiDecimal | null
  custo_producao: ApiDecimal | null
}

/** `bi.producaoRacao.getFormulacao()` — ingrediente de uma batida. */
export interface BiFormulacaoItem extends ApiRecord {
  ingrediente_id: number
  perc_ms_ingrediente: ApiDecimal | null
  perc_ms_racao: ApiDecimal | null
  perc_ms_formula: ApiDecimal | null
  perc_ms_producao: ApiDecimal | null
  perc_mo_formula: ApiDecimal | null
  perc_mo: ApiDecimal | null
  perc_ms_racao_prod: ApiDecimal | null
  quantidade: ApiDecimal | null
  custo_unitario: ApiDecimal | null
  custo_total: ApiDecimal | null
}

/** Material dentro de {@link BiMovMaterial}. */
export interface BiMovMaterialItem extends ApiRecord {
  material_id: number | null
  quantidade: ApiDecimal | null
  valor_unitario: ApiDecimal | null
}

/** `bi.movMateriais.get()` — movimentação de materiais (a chave estável é `movimentacao_material_id`). */
export interface BiMovMaterial extends ApiRecord {
  movimentacao_material_id: number
  /** Só as compras trazem documento. */
  documento: string | null
  data_movimentacao: string | null
  entidade_id: number | null
  tipo_movimentacao_id: number | null
  tipo_movimentacao: string | null
  tipo_entrada_saida_id: number | null
  tipo_entrada_saida: string | null
  valor_desconto: ApiDecimal | null
  valor_frete: ApiDecimal | null
  valor_imposto: ApiDecimal | null
  valor_imposto_recolhido: ApiDecimal | null
  valor_total: ApiDecimal | null
  data_ultima_alteracao: string | null
  materiais: BiMovMaterialItem[] | null
}

// ── Eventos de diagnóstico (node:diagnostics_channel) ─────────────────────────
// Mensagens dos canais 'mb-cliente:*'. Nenhuma leva token, senha, corpo nem query string.

/** `mb-cliente:request` — cada tentativa de cada requisição, ao terminar. */
export interface RequestDiagnostic {
  method: string
  /** Caminho sem a query string (ex.: `'/tratos/'`). */
  path: string
  page: number | undefined
  /** null quando não houve resposta. */
  status: number | null
  /** Só sem resposta: `'TimeoutError'`, `'AbortError'` ou o nome do erro de rede. */
  error: string | undefined
  attempt: number
  durationMs: number
}

/** `mb-cliente:retry` — antes da espera de uma nova tentativa (só GET, com `retry`). */
export interface RetryDiagnostic {
  method: string
  path: string
  page: number | undefined
  attempt: number
  nextAttempt: number
  delayMs: number
}

/** `mb-cliente:relogin` — ao fim de cada relogin. */
export interface ReloginDiagnostic {
  ok: boolean
  error: string | undefined
  /** Fazenda reselecionada (ou null). */
  propertyId: number | null
  durationMs: number
}

/** `mb-cliente:property-switch` — cada seleção de fazenda confirmada pelo servidor. */
export interface PropertySwitchDiagnostic {
  from: number | null
  to: number
  /** true na reseleção do relogin, que não conta como troca. */
  restore: boolean
  generation: number
}

/** `mb-cliente:empty-response` — resposta vazia de grid, antes do EmptyResponseError. */
export interface EmptyResponseDiagnostic {
  method: string
  path: string
  page: number
}

// ── Erros, helpers e constantes (declarados no módulo de cada subpath) ───────

export * from './src/errors.js'
export * as errors from './src/errors.js'
export * from './src/helpers/index.js'
import type { CollectResult } from './src/helpers/index.js'
export * as constants from './src/constants.js'

// ── API BI ────────────────────────────────────────────────────────────────────

export interface FazendasBi {
  get(options?: CallTimeout): Promise<BiResult>
}

export interface LocalidadesBi {
  get(options?: CallTimeout): Promise<BiResult>
}

export interface FornecedoresBi {
  get(options?: CallTimeout): Promise<BiResult>
}

export interface MateriaisBi {
  get(options?: CallTimeout): Promise<BiResult>
}

export interface DietaBi {
  get(options?: CallTimeout): Promise<BiResult>
}

/**
 * Endpoints "por fazenda": com `propertyId`, a fazenda é selecionada e
 * consultada na mesma seção exclusiva da instância (outra operação não troca a
 * seleção no meio). Sem `propertyId`, usa a fazenda já selecionada.
 * @throws {PropertyNotSelectedError} sem `propertyId` e sem fazenda selecionada.
 */
/** Opção comum dos métodos do BI e dos custos: prazo só desta chamada. */
export interface CallTimeout {
  /** Prazo só desta chamada (padrão: o da instância; nos custos, 300000). */
  timeoutMs?: number
}

export interface PropertyScope extends CallTimeout {
  propertyId?: number
}

export interface BiDateRange extends PropertyScope {
  /** YYYY-MM-DD */
  from: string
  /** YYYY-MM-DD */
  to: string
}

export interface BiBatchOptions extends PropertyScope {
  /** Registros por lote (padrão 1000). */
  batchSize?: number
}

export interface BiBatchResult {
  /** Quantos registros foram entregues ao onBatch. */
  count: number
}

/**
 * Recebe cada lote. Roda dentro da seção da fazenda (não troque de fazenda
 * nele) e é esperado antes do próximo lote; o timeoutMs cobre o tempo dele.
 */
export type BiBatchHandler<T> = (items: T[]) => unknown

export interface AnimaisBi {
  /** Animais de uma fazenda — ver {@link PropertyScope}. */
  get(options?: PropertyScope): Promise<BiResult<BiAnimal>>
  /** Os mesmos animais de get(), lidos aos poucos e entregues em lotes. */
  forEachBatch(
    options: BiBatchOptions | undefined,
    onBatch: BiBatchHandler<BiAnimal>
  ): Promise<BiBatchResult>
  /** Todas as fazendas, uma de cada vez; ao final, a selecionada é a última. */
  getAll(propertyIds?: number[]): Promise<AnimaisGetAllResult<BiAnimal>>
}

export interface MovEstoqueBi {
  /** Movimentações de uma fazenda — ver {@link PropertyScope}. */
  get(options?: PropertyScope): Promise<BiResult<BiMovEstoque>>
  /** As mesmas movimentações de get(), lidas aos poucos e entregues em lotes. */
  forEachBatch(
    options: BiBatchOptions | undefined,
    onBatch: BiBatchHandler<BiMovEstoque>
  ): Promise<BiBatchResult>
  /** Todas as fazendas, uma de cada vez; ao final, a selecionada é a última. */
  getAll(propertyIds?: number[]): Promise<BiResult<BiMovEstoque>>
}

export interface MovMateriaisBi {
  /** Janela de 1 a 31 dias corridos — ver {@link PropertyScope}. */
  get(options: BiDateRange): Promise<BiResult<BiMovMaterial>>
}

export interface SuplementacaoBi {
  /** Sem limite de janela — ver {@link PropertyScope}. */
  get(options: BiDateRange): Promise<BiResult<BiSuplementacao>>
}

export interface ProducaoRacaoBi {
  /** Batidas de produção de ração — ver {@link PropertyScope}. */
  get(options: BiDateRange): Promise<BiResult<BiProducaoRacao>>
  getFormulacao(producaoId: number, options?: CallTimeout): Promise<BiResult<BiFormulacaoItem>>
}

export interface BiApi {
  get fazendas(): FazendasBi
  get localidades(): LocalidadesBi
  get fornecedores(): FornecedoresBi
  get materiais(): MateriaisBi
  get dieta(): DietaBi
  get animais(): AnimaisBi
  get movEstoque(): MovEstoqueBi
  get movMateriais(): MovMateriaisBi
  get suplementacao(): SuplementacaoBi
  get producaoRacao(): ProducaoRacaoBi
}

// ── API ERP — Cadastros ───────────────────────────────────────────────────────

export interface CreateContatoBody {
  nome: string
  tipo_pessoa: 'PJ' | 'PF'
  categoria: number
  ativo: boolean
  cnpj?: string
  razao_social?: string
  inscricao_estadual?: string
  inscricao_municipal?: string
  cpf?: string
  sexo?: 'M' | 'F'
  data_nascimento?: string
  telefones?: Array<{ numero: string; descricao?: string }>
  emails?: Array<{ email: string; descricao?: string }>
  enderecos?: Array<{
    tipo: number
    cidade: number
    cep?: string
    logradouro?: string
    numero?: string
    bairro?: string
    principal: boolean
  }>
}

export interface CreateMaterialBody {
  nome: string
  grupo_material: number
  unidade_medida_compra: number
  unidade_medida_uso: number
  unidade_medida_venda_transf: number
  tipo_dose: 0
  peso_para_dose: 0
  codigo_erp: string
  ativo?: boolean
  abreviatura?: string
  subgrupo_material?: number
  fabricante?: number
  preco_custo_material?: number
  codigo_material?: string
  codigo_fabricante?: string
  via_aplicacao_tratamento?: number
}

export interface CadastrosErp {
  getContatos(params?: FetchPageOptions): Promise<ErpPageResult>
  createContato(body: CreateContatoBody): Promise<{ id: number }>
  updateContato(id: number, body: Partial<CreateContatoBody>): Promise<unknown>

  getGruposMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  createGrupoMaterial(body: {
    nome: string
    tipo?: 1 | 2 | 3 | 4 | 5 | 6
    ativo?: boolean
  }): Promise<unknown>

  getSubgruposMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  createSubgrupoMaterial(body: {
    nome: string
    grupo_material?: number
    ativo?: boolean
  }): Promise<unknown>

  getUnidadesMedidas(params?: FetchPageOptions): Promise<ErpPageResult>
  createUnidadeMedida(body: {
    nome: string
    tipo_unidade: 1 | 2 | 3 | 4
    abreviatura?: string
    multiplicador?: number
  }): Promise<unknown>

  getMateriais(params?: FetchPageOptions): Promise<ErpPageResult>
  createMaterial(body: CreateMaterialBody): Promise<unknown>
  updateMaterial(id: number, body: Partial<CreateMaterialBody>): Promise<unknown>

  getRacoes(params?: FetchPageOptions): Promise<ErpPageResult>
  getContas(params?: FetchPageOptions): Promise<ErpPageResult>
  getGruposContas(params?: FetchPageOptions): Promise<ErpPageResult>
  getFormasPagamento(params?: FetchPageOptions): Promise<ErpPageResult>
  getLotesAlimentares(params?: FetchPageOptions): Promise<ErpPageResult>
  getLotesFinalidade(params?: FetchPageOptions): Promise<ErpPageResult>
  getRacas(params?: FetchPageOptions): Promise<ErpPageResult>
  getPelagens(params?: FetchPageOptions): Promise<ErpPageResult>
  getPropriedades(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Pode retornar vazio sem lançar EmptyResponseError — comportamento esperado. */
  getCategorias(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Pode retornar vazio sem lançar EmptyResponseError — comportamento esperado. */
  getRebanhos(params?: FetchPageOptions): Promise<ErpPageResult>
  getCidades(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstados(params?: FetchPageOptions): Promise<ErpPageResult>
  getPaises(params?: FetchPageOptions): Promise<ErpPageResult>

  // Endpoints adicionais.
  /** Cadastro genérico de pessoas/empresas — mais amplo que getContatos(). */
  getEntidades(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Subconjunto de getEntidades() já filtrado a mão de obra. */
  getContatosMaoDeObra(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Localidades com dados operacionais de cocho/GMD — mais rico que bi.localidades.get(). */
  getLocalizacoes(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Mesmo modelo de getLocalizacoes(), filtrado a currais de confinamento. */
  getCurrais(params?: FetchPageOptions): Promise<ErpPageResult>
  getGruposCurral(params?: FetchPageOptions): Promise<ErpPageResult>
  getCategoriasGta(params?: FetchPageOptions): Promise<ErpPageResult>
  getSequenciasMicroregioes(params?: FetchPageOptions): Promise<ErpPageResult>
  getConfiguracoesLayout(params?: FetchPageOptions): Promise<ErpPageResult>
  getDispositivosMoveis(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Catálogo de cultivares/variedades agrícolas. */
  getCulturas(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Forma parecida com a de um material isolado — uso exato incerto. */
  getOperacoes(params?: FetchPageOptions): Promise<ErpPageResult>

  // Endpoints adicionais.
  getGrausDeSangue(params?: FetchPageOptions): Promise<ErpPageResult>
  getAvaliacoesMorfologicas(params?: FetchPageOptions): Promise<ErpPageResult>
  getCorposLuteos(params?: FetchPageOptions): Promise<ErpPageResult>
  getDetalhesSituacaoFemea(params?: FetchPageOptions): Promise<ErpPageResult>
  getConfiguracoesCategoria(params?: FetchPageOptions): Promise<ErpPageResult>
  getConfiguracoesCategoriaGta(params?: FetchPageOptions): Promise<ErpPageResult>
  getConfiguracaoPlanilhaGenetica(params?: FetchPageOptions): Promise<ErpPageResult>
  getConfiguracoesLeituraCocho(params?: FetchPageOptions): Promise<ErpPageResult>
  getLotesDeAvaliacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposPastagem(params?: FetchPageOptions): Promise<ErpPageResult>
  getDiasImprodutivos(params?: FetchPageOptions): Promise<ErpPageResult>
  getTecnicasCongelacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getPreparacoesSemenConfig(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstabelecimentosRuraisExternos(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstabelecimentosRuraisInternosExternos(params?: FetchPageOptions): Promise<ErpPageResult>
  getProprietarios(params?: FetchPageOptions): Promise<ErpPageResult>
  getProprietariosContato(params?: FetchPageOptions): Promise<ErpPageResult>
  getSetores(params?: FetchPageOptions): Promise<ErpPageResult>
  getCofinsSt(params?: FetchPageOptions): Promise<ErpPageResult>
  getIcmsOrigem(params?: FetchPageOptions): Promise<ErpPageResult>
  getIcmsSt(params?: FetchPageOptions): Promise<ErpPageResult>
  getPisSituacaoTributaria(params?: FetchPageOptions): Promise<ErpPageResult>
  getNaturezasOperacoes(params?: FetchPageOptions): Promise<ErpPageResult>
  getCondicoesVenda(params?: FetchPageOptions): Promise<ErpPageResult>
  getCategoriasDeContato(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposDeCategoriaDeContato(params?: FetchPageOptions): Promise<ErpPageResult>
  getCentrosDeCusto(params?: FetchPageOptions): Promise<ErpPageResult>
  getContasRateio(params?: FetchPageOptions): Promise<ErpPageResult>
  getSituacoesMovimentacaoMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposVendaDescarteDevolucao(params?: FetchPageOptions): Promise<ErpPageResult>
  getUnidadesCotacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposAdv(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Animais ─────────────────────────────────────────────────────────

export interface UpdateEntradaFinanceiroBody {
  data_aquisicao: string
  fornecedor?: number
  fornecedor_leilao?: number
  fornecedor_corretor?: number
  fornecedor_frete?: number
  fornecedor_outras_despesas?: number
  forma_pagamento?: number
  total_animais?: number
  valor_leilao?: number
  valor_corretor?: number
  valor_frete?: number
  valor_outros?: number
  valor_compra?: number
}

export interface AnimaisErp {
  findByOrdemServico(ordemServico: string): Promise<{ id: number; [key: string]: unknown }>
  updateEntradaFinanceiro(id: number, body: UpdateEntradaFinanceiroBody): Promise<unknown>
  getSaidas(params?: FetchPageOptions): Promise<ErpPageResult<Saida>>
  /** ATENÇÃO: campos financeiros (valor_total, valor_pagamento, media_arroba) retornam zerados. */
  getVendas(params?: FetchPageOptions): Promise<ErpPageResult>
  getMortes(params?: FetchPageOptions): Promise<ErpPageResult<Morte>>

  /** ATENÇÃO: from/to NÃO reduz o count no servidor — tratar o período inteiro como inviável. */
  getHistoricoMovimentacaoConfinamento(params?: FetchPageOptions): Promise<ErpPageResult>
  /** from/to filtra de verdade — viável para sincronização incremental por data. */
  getHistoricoMovimentacaoLocalidades(
    params?: FetchPageOptions
  ): Promise<ErpPageResult<HistoricoMovimentacaoLocalidade>>
  /**
   * Lotes de confinamento por fazenda, 10 por página, cada um com `animais[]` (páginas pesadas).
   * `from`/`to` filtram pela data de abertura do lote (`data_abertura`). Números com parse BR,
   * diferente de `getConfinamentoById`, que devolve o JSON cru.
   */
  getConfinamento(params?: FetchPageOptions): Promise<ErpPageResult<Confinamento>>
  /**
   * ✅ A busca por id de confinamento funciona (só a listagem tem o bug de
   * serializador). Retorna o lote completo (~121 campos) incluindo `animais[]`
   * com o ciclo por animal: data_entrada/data_saida, peso_entrada,
   * ultimo_peso, permanencia e o motivo de saída (venda_item_id,
   * descarte_id, saida_id, transferencia_*_id).
   *
   * ⚠️ Escopado pela propriedade da SESSÃO — id de lote de outra fazenda
   * responde 404; chame selectProperty() da fazenda dona antes. Lotes
   * fechados continuam acessíveis. Ids descobríveis pelo campo
   * `confinamento` dos itens de sobra de cocho.
   */
  getConfinamentoById(id: number): Promise<Confinamento>
  /** Eventos de contagem/inventário de rebanho. */
  getInventariosAnimais(params?: FetchPageOptions): Promise<ErpPageResult<InventarioAnimal>>
  /**
   * ⭐ PESAGEM REAL POR ANIMAL (endpoint adicional). Substitui na prática a pesagem do BI
   * (timeout permanente) e a inexistência de um endpoint "pesagemmedicao".
   *
   * ⚠️ selectProperty() NÃO restringe corretamente este endpoint: vêm
   * registros de outras propriedades do MESMO contrato. Cada registro traz
   * o próprio campo `propriedade`/`propriedade_texto` correto — atribua a
   * propriedade por esse campo, nunca pela fazenda selecionada na sessão.
   *
   * from/to e propriedade= como parâmetro NÃO filtram — sem incremental
   * por data, uma fazenda grande pode ter um volume muito grande de registros
   * (paginação pesada).
   */
  getMedicoesPesagem(params?: FetchPageOptions): Promise<ErpPageResult<MedicaoPesagem>>
  getAlteracoesSisbov(params?: FetchPageOptions): Promise<ErpPageResult>
  getReidentificacoesSisbov(params?: FetchPageOptions): Promise<ErpPageResult>
  getAnimaisDesmamados(params?: FetchPageOptions): Promise<ErpPageResult>
  getRecepcoesAnimais(params?: FetchPageOptions): Promise<ErpPageResult>
  getMotivosDescarteReprodutor(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposMorte(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Mesma contagem do cadastro de animais — provável apelido/view, não confirmado. */
  getMachos(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Sanitário ───────────────────────────────────────────────────────

export interface SanitarioErp {
  getVacinacoes(options?: FetchAllOptions<Vacinacao>): Promise<FetchAllResult>
  /** Mesmas opções de getVacinacoes(), como iterador assíncrono (`for await`). */
  iterVacinacoes(
    options?: Omit<FetchAllOptions<Vacinacao>, 'onPage'>
  ): AsyncGenerator<ErpPage<Vacinacao>>
  getTratamentos(options?: FetchAllOptions<Tratamento>): Promise<FetchAllResult>
  /** Mesmas opções de getTratamentos(), como iterador assíncrono (`for await`). */
  iterTratamentos(
    options?: Omit<FetchAllOptions<Tratamento>, 'onPage'>
  ): AsyncGenerator<ErpPage<Tratamento>>
  getExames(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Vazio em contas sem dados reprodutivos — passe `{ allowEmpty: true }` para não lançar. */
  getProtocolos(params?: FetchPageOptions): Promise<ErpPageResult>
  getOcorrencias(params?: FetchPageOptions): Promise<ErpPageResult>
  getSemens(params?: FetchPageOptions): Promise<ErpPageResult>
  getEmbrioes(params?: FetchPageOptions): Promise<ErpPageResult>
  getCoberturas(params?: FetchPageOptions): Promise<ErpPageResult>
  getPartos(params?: FetchPageOptions): Promise<ErpPageResult>

  // Endpoints adicionais.
  getDoencas(params?: FetchPageOptions): Promise<ErpPageResult>
  getDoencasTratamentos(params?: FetchPageOptions): Promise<ErpPageResult>
  getSubgruposMaterialTratamentos(params?: FetchPageOptions): Promise<ErpPageResult>
  getSubgruposMaterialZoossanitario(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposProtocolo(params?: FetchPageOptions): Promise<ErpPageResult>
  getTratamentosHormonios(params?: FetchPageOptions): Promise<ErpPageResult>
  getTratamentosVacinasVermifugos(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Estoque ─────────────────────────────────────────────────────────

export interface RelatorioGestaoNutricionalLoteParams extends CallTimeout {
  /** Fazenda; selecionada na seção exclusiva da fila antes do POST. */
  propertyId: number
  /** YYYY-MM-DD. Obrigatório no corpo da requisição, mas ignorado pelo servidor (sempre o último dia fechado). */
  date: string
  produtos?: number[]
  linhasConfinamento?: number[]
  lotesConfinamento?: number[]
  signal?: AbortSignal
}

/** Recálculo do relatório de Gestão Nutricional para uma data, numa linha de confinamento inteira. */
export interface ReprocessRelatorioGestaoNutricionalLinhaOptions {
  propertyId: number
  /** YYYY-MM-DD. Diferente da consulta, o recálculo respeita a data. */
  date: string
  /** A linha de confinamento. Nunca uma linha de pasto: o recálculo em pasto é proibido, e o cliente não tem como saber o tipo da linha. */
  linhaConfinamento: number
  /** Ids das linhas de confinamento da fazenda: quando passado, `linhaConfinamento` fora da lista lança ValidationError antes de qualquer chamada. */
  allowedLines?: number[]
  /** Prazo só desta chamada. Padrão 600000 (10 min). */
  timeoutMs?: number
  signal?: AbortSignal
}

/** Recálculo do relatório de Gestão Nutricional para uma data, num curral só. */
export interface ReprocessRelatorioGestaoNutricionalLoteOptions {
  propertyId: number
  /** YYYY-MM-DD. Diferente da consulta, o recálculo respeita a data. */
  date: string
  /** Um lote de confinamento. Lista não é aceita: para mais de um curral, use o recálculo por linha. */
  loteConfinamento: number
  /** A linha de confinamento do mesmo curral. Nunca uma linha de pasto: o recálculo em pasto é proibido, e o cliente não tem como saber o tipo da linha. */
  linhaConfinamento: number
  /** Ids das linhas de confinamento da fazenda: quando passado, `linhaConfinamento` fora da lista lança ValidationError antes de qualquer chamada. */
  allowedLines?: number[]
  /** Prazo só desta chamada. Padrão 600000 (10 min). */
  timeoutMs?: number
  signal?: AbortSignal
}

export interface RelatorioGestaoNutricionalLoteItem {
  localidade: string
  localidade_id: number
  confinamento_id: number | null
  qtd_cabecas: number
  sexos: string | null
  primeira_dt_entrada: string | null
  peso_entrada: number | null
  permanencia: number | null
  diarias_lote: number | null
  diarias_total: number | null
  dieta_atual: string | null
  dieta_id: number | null
  qtd_fornecimento_ultima_dieta: number | null
  transicao: string | null
  consumo_mo: number | null
  consumo_ms: number | null
  consumo_mo_medio: number | null
  consumo_ms_medio: number | null
  cab_mo: number | null
  cab_ms: number | null
  custo_medio: number | null
  custo_medio_d0: number | null
  rs_valor_mo: number | null
  rs_valor_mo_cab: number | null
  variacao_porc: number | null
  sobra_d0: number | null
  sobra_d1: number | null
  sobra_d2: number | null
  sobra_d3: number | null
  ims_pv0: number | null
  ims_pv1: number | null
  ims_pv5: number | null
  ims_pv_medio: number | null
  peso_projetado: number | null
  gpd_medio: number | null
  peso_previsto_abate: number | null
  data_relatorio: string | null
  ocorrencia: string | null
}

export interface RelatorioGestaoNutricionalLoteResult {
  localidades: RelatorioGestaoNutricionalLoteItem[]
  exibir_media?: boolean
  data_alteracao_base?: string | null
  filtro?: Record<string, unknown>
}

export interface CreateEntradaMaterialBody {
  propriedade: number
  data: string
  forma_pagamento: number
  contato: number
  responsavel: number
  documento?: string
  criterio_calculo?: 1 | 2
  valor_desconto?: number
  valor_frete?: number
  fornecedor_frete?: number
  valor_total?: number
  valor_pagamento?: number
  itens: Array<{
    produto: number
    quantidade: number
    valor_unitario: number
    observacao?: string
  }>
}

export interface EstoqueErp {
  getTratos(options?: FetchAllOptions<Trato>): Promise<FetchAllResult>
  /** Mesmas opções de getTratos(), como iterador assíncrono (`for await`). */
  iterTratos(options?: Omit<FetchAllOptions<Trato>, 'onPage'>): AsyncGenerator<ErpPage<Trato>>
  getEntradaMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  createEntradaMaterial(body: CreateEntradaMaterialBody): Promise<unknown>
  /**
   * Guias de Trânsito Animal. ATENÇÃO: filtro de data ignorado pelo
   * servidor — sempre retorna o período inteiro. Rastreabilidade de origem: campos
   * produtor/produtor_texto (produtor original, mesmo entidade_id de
   * bi.fornecedores/animais.fornecedor_id), fornecedor/fornecedor_texto
   * (contraparte desta movimentação — produtor OU comprador/frigorífico,
   * depende de tipo_saida), propriedade_fornecedor/_texto (só em
   * transferência interna, aponta pra uma das suas próprias fazendas).
   */
  getGtas(params?: FetchPageOptions): Promise<ErpPageResult<Gta>>
  /**
   * Sobra de ração no cocho. Sem filtro de data, CADA página recalcula do
   * zero (minutos por página, inviável).
   * Com from/to (janela curta): alguns minutos, cálculo escopado — viável como
   * erp.custos.*. Prazo padrão de 300 s (registro do endpoint).
   */
  getSobraCocho(params?: FetchPageOptions): Promise<ErpPageResult<SobraCocho>>
  /** @throws {EndpointUnavailableError} — a LISTAGEM retorna HTTP 500 em toda variação; use getMovimentacaoMaterialById(id). */
  getMovimentacaoMaterial(): never
  /**
   * ✅ A busca por id de movimentacaomaterial funciona (só a listagem tem o bug de
   * serializador — confirmado, mesmo padrão do confinamento).
   * Retorna o cabeçalho completo (~129 campos: data, documento, situacao,
   * tipo_movimentacao, valores, NFe/SEFAZ) incluindo o array `itens[]`.
   *
   * ⚠️ Escopado pela propriedade da SESSÃO — id de movimentação de outra
   * fazenda responde 404; chame selectProperty() da fazenda dona antes.
   * Ids descobríveis pelo campo `movimentacao_material` dos registros de
   * getMovimentacaoMaterialItens().
   */
  getMovimentacaoMaterialById(id: number): Promise<Record<string, unknown>>
  /** @throws {EndpointUnavailableError} — HTTP 500 na listagem E na busca por id (re-testado). Rótulo derivável de getMateriais().via_aplicacao_tratamento_texto. */
  getViaAplicacaoTratamento(): never

  /**
   * Itens de movimentacaomaterial — funciona mesmo com a listagem do "pai"
   * quebrada. ATENÇÃO: NENHUM filtro do servidor na listagem (filters:[];
   * data, FKs, ordering e até o keywords declarado são ignorados — mesmo
   * total sempre). Caminho incremental INDIRETO: auditoria
   * getAuditoria({from,to}) → registros modelo "basico.movimentacaomaterialitem"
   * → campo `identificador` → getMovimentacaoMaterialItemById(id), ou
   * agrupar pelo pai via getMovimentacaoMaterialById(id).itens[].
   */
  getMovimentacaoMaterialItens(params?: FetchPageOptions): Promise<ErpPageResult>
  /**
   * ✅ A busca por id do ITEM funciona (confirmado). Retorna o item
   * completo (~131 campos) incluindo a FK `movimentacao_material` para o
   * cabeçalho. ⚠️ `data` vem em formato BR ("DD/MM/YYYY") — corpo cru, sem
   * parse.
   */
  getMovimentacaoMaterialItemById(id: number): Promise<Record<string, unknown>>
  /**
   * Itens de getTratos(), mais granular. ✅ from/to FILTRA de verdade.
   * O filtro real do servidor é movimentacao_material__data_0/_1
   * (data_0/data_1 é ignorado) e o método traduz from/to para essa grafia
   * (uma janela de dias reduz o total em ordens de grandeza). Filtros extras via extraParams:
   * localidade=, produto=, movimentacao_material__responsavel=,
   * movimentacao_material__nr_trato=.
   */
  getTratosItens(params?: FetchPageOptions): Promise<ErpPageResult<TratoItem>>
  /** Consumo de ração por lote de animal. from/to filtra de verdade. */
  getAplicacaoConsumoLoteAnimal(
    params?: FetchPageOptions
  ): Promise<ErpPageResult<AplicacaoConsumoLoteAnimal>>

  // Endpoints adicionais.
  getTransferenciasPropriedade(
    params?: FetchPageOptions
  ): Promise<ErpPageResult<TransferenciaPropriedade>>
  getTransferenciasLoteAlimentar(params?: FetchPageOptions): Promise<ErpPageResult>
  getTransferenciasLoteFinalidade(params?: FetchPageOptions): Promise<ErpPageResult>
  getProgramasNutricionais(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Previsão diária de trato por curral (planejado) — complementa getTratos() (realizado). */
  getTratosDiariosPrevistos(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Plano de trato por curral/dieta. from/to filtra de verdade. */
  getDefinicaoDiariaTratos(params?: FetchPageOptions): Promise<ErpPageResult<DefinicaoDiariaTratos>>
  /** Batidas de produção de dieta/ração (custo, vagão, responsável) — visão ERP mais detalhada que bi.producaoRacao. */
  getProducaoDietas(params?: FetchPageOptions): Promise<ErpPageResult>
  /**
   * Relatório "Gestão Nutricional" por lote/curral — mesma tela/dados do relatório do MBWEB.
   * Endpoint adicional, não documentado pela API oficial. Devolve o resultado da última
   * busca feita na fazenda, pela tela ou por recálculo: `date` é exigido mas ignorado, os
   * filtros também, e o resultado pode ser de um dia antigo, de uma linha de pasto ou de
   * um curral só. `filtro` diz de que busca o resultado veio.
   */
  getRelatorioGestaoNutricionalLote(
    params: RelatorioGestaoNutricionalLoteParams
  ): Promise<RelatorioGestaoNutricionalLoteResult>
  /**
   * Recalcula o relatório para `date` numa linha de confinamento inteira (`reprocessar: true`).
   * ⚠️ Grava num cache compartilhado do MBWEB: o resultado substitui o cache inteiro da
   * fazenda e muda a tela de Gestão Nutricional de todos os usuários. Lento (minutos) e
   * instável: o servidor costuma cortar a consulta por volta de 300 s. TimeoutError/NetworkError
   * trazem `mayHaveSucceeded: true`. Não repita em massa.
   * Só para linhas de confinamento (em pasto é proibido); passe `allowedLines` para o cliente recusar as outras.
   * @throws {ValidationError} sem propertyId ou linha (inteiros positivos), com data inválida ou com a linha fora de `allowedLines`.
   */
  reprocessRelatorioGestaoNutricionalLinha(
    options: ReprocessRelatorioGestaoNutricionalLinhaOptions
  ): Promise<RelatorioGestaoNutricionalLoteResult>
  /**
   * Recalcula o relatório para `date` num curral só (`reprocessar: true`). Para mais de um
   * curral, use `reprocessRelatorioGestaoNutricionalLinha`: recalcular vários lotes em
   * sequência deixa só o último no cache.
   * ⚠️ Grava num cache compartilhado do MBWEB: o resultado substitui o cache inteiro da
   * fazenda e muda a tela de Gestão Nutricional de todos os usuários. Lento (1,5 a 5 min) e instável: o servidor
   * costuma cortar a consulta por volta de 300 s. TimeoutError/NetworkError trazem
   * `mayHaveSucceeded: true`. Não repita em massa.
   * Só para linhas de confinamento (em pasto é proibido); passe `allowedLines` para o cliente recusar as outras.
   * @throws {ValidationError} sem propertyId, lote ou linha (inteiros positivos), com data inválida ou com a linha fora de `allowedLines`.
   */
  reprocessRelatorioGestaoNutricionalLote(
    options: ReprocessRelatorioGestaoNutricionalLoteOptions
  ): Promise<RelatorioGestaoNutricionalLoteResult>

  // Endpoints adicionais.
  getPremisturas(params?: FetchPageOptions): Promise<ErpPageResult>
  getProdutoServicos(params?: FetchPageOptions): Promise<ErpPageResult>
  getAlteracoesPercentualMateriaSeca(params?: FetchPageOptions): Promise<ErpPageResult>
  getEntradaMaterialItens(params?: FetchPageOptions): Promise<ErpPageResult>
  getEntradasSaidasMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  getAplicacoesConsumo(params?: FetchPageOptions): Promise<ErpPageResult>
  getAplicacaoConsumoLoteAnimalItens(params?: FetchPageOptions): Promise<ErpPageResult>
  getAplicacaoConsumoLoteAnimalIntercorrencia(params?: FetchPageOptions): Promise<ErpPageResult>
  getSaidasTransferenciaPropriedades(params?: FetchPageOptions): Promise<ErpPageResult>
  getSaidasVendaPerda(params?: FetchPageOptions): Promise<ErpPageResult>
  getOutrasSaidas(params?: FetchPageOptions): Promise<ErpPageResult>
  getAtivos(params?: FetchPageOptions): Promise<ErpPageResult>
  getMaquinariosConfinamento(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposAtivos(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Custos ──────────────────────────────────────────────────────────

export interface CustosAtivosOptions extends CallTimeout {
  propertyId: number
  /** YYYY-MM-DD, nunca no futuro (use ontem): uma data futura estoura o prazo ou devolve HTTP 400. */
  referenceDate: string
  fromDate?: string
}

export interface CustosVendidosMortosOptions extends CallTimeout {
  propertyId: number
  from: string
  to: string
}

export interface SaldoBiologicoOptions extends CallTimeout {
  /** Omitir para retornar todas as propriedades da conta. */
  propertyId?: number
  /** Dia 01 do mês de referência — ex.: '2026-06-01' */
  referenceDate: string
}

export interface CustoIndiretoOptions extends CallTimeout {
  /** Omitir para ratear entre todos os animais da conta. */
  propertyId?: number
  /** Dia 01 do mês — ex.: '2026-06-01' (enviado como mes_referencia). */
  referenceMonth: string
  /** Valor a ratear (enviado como valor). */
  amount: number
}

export interface SaidasMaterialOptions extends CallTimeout {
  propertyId?: number
  /** YYYY-MM-DD (enviado como data). */
  date: string
  /** Use constants.TIPO_SAIDA_MATERIAL.* */
  tipoSaida: number
}

export interface CustosErp {
  getCustosAtivos(options: CustosAtivosOptions): Promise<Record<string, unknown>[]>
  getCustosVendidos(options: CustosVendidosMortosOptions): Promise<Record<string, unknown>[]>
  getCustosMortos(options: CustosVendidosMortosOptions): Promise<Record<string, unknown>[]>
  /** ATENÇÃO: valores retornam zerados até pré-configuração no painel MB. */
  getSaldoBiologico(options: SaldoBiologicoOptions): Promise<Record<string, unknown>>
  sendCustoIndireto(options: CustoIndiretoOptions): Promise<unknown>
  getSaidasMaterial(options: SaidasMaterialOptions): Promise<unknown>
}

// ── API ERP — Auditoria/Replicação (endpoints adicionais) ─────────────────────

export interface AuditoriaErp {
  /**
   * Trilha de auditoria completa: quem mudou o quê, quando, valor
   * antes/depois. Volume muito grande. from/to filtram de verdade — use
   * sempre uma janela curta, nunca o período inteiro.
   */
  getAuditoria(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Regras/alertas de validação do MBDT (desktop) — catálogo pequeno. */
  getRegrasDeReplicacao(params?: FetchPageOptions): Promise<ErpPageResult>
  /** @throws {EndpointUnavailableError} — a LISTAGEM retorna HTTP 500; use getEntidadeRegraDeReplicacaoById(id). */
  getEntidadeRegraDeReplicacao(): never
  /**
   * ✅ A busca por id funciona (confirmado). Catálogo dos tipos de
   * entidade do sistema de replicação MBDT ({ id, uid, descricao, ... }).
   * Ids sequenciais com buracos (404) — enumerável por inteiro.
   */
  getEntidadeRegraDeReplicacaoById(id: number): Promise<Record<string, unknown>>
  /** ⚠️ Resposta vazia na primeira tentativa — não confirmado se limite de requisições ou tabela pouco ativa. */
  getLogDeReplicacao(params?: FetchPageOptions): Promise<ErpPageResult>
  /** ⚠️ Mesma situação de getLogDeReplicacao. */
  getLogReplicacaoAnimaisNaoExcluidos(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Configuração da conta: parâmetros de GMD/abate, rastreabilidade SISBOV, integração ERP/pesagem externa etc. 1 registro por conta. */
  getConfiguracoesGerais(params?: FetchPageOptions): Promise<ErpPageResult>
  /** Usuários do sistema (contas de acesso, módulos liberados, propriedades vinculadas). */
  getUsuarios(params?: FetchPageOptions): Promise<ErpPageResult>

  // Histórico/logs de sincronização (desktop MBDT / apps móveis).
  getHistoricoAcoesApp(params?: FetchPageOptions): Promise<ErpPageResult>
  getHistoricoMovimentacaoLoteDeAvaliacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getHistoricoMovimentacaoProgramaNutricional(params?: FetchPageOptions): Promise<ErpPageResult>
  getControleSincronizacaoCurral(params?: FetchPageOptions): Promise<ErpPageResult>
  getControleSincronizacaoMbTratos(params?: FetchPageOptions): Promise<ErpPageResult>
  getCurralErrosExecucaoEvento(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstatisticasRotinaEstoqueAnimalDetalhe(params?: FetchPageOptions): Promise<ErpPageResult>
  /** @throws {EndpointUnavailableError} — a LISTAGEM retorna HTTP 500; use getHistoricoExecucaoViewPgUltimosItensFila(). */
  getHistoricoExecucaoViewPg(): never
  /**
   * ✅ Sub-rota ultimos-itens-fila/ funciona (confirmado). Retorna { dados: [...] } com as execuções recentes da fila de
   * views materializadas do servidor MB — última recalculada, início/fim,
   * status. GET {slug}/{id}/ também responde para um registro específico.
   */
  getHistoricoExecucaoViewPgUltimosItensFila(): Promise<{ dados: Record<string, unknown>[] }>
}

// ── API ERP — Financeiro (endpoints adicionais) ───────────────────────────────

/**
 * Rotas REST reais e confirmadas, que só trazem dados se a conta usa o
 * módulo financeiro do MB. Numa conta sem o módulo, a listagem vazia lança `EmptyResponseError`:
 * passe `{ allowEmpty: true }` se esse é o seu caso.
 */
export interface FinanceiroErp {
  /** ⚠️ Exceção: pode ter registros reais (cotação de moeda) — não usa allowEmpty. */
  getCotacoesDiarias(params?: FetchPageOptions): Promise<ErpPageResult>
  getBancos(params?: FetchPageOptions): Promise<ErpPageResult>
  getOrcamentos(params?: FetchPageOptions): Promise<ErpPageResult>
  getMovimentacoesFinanceiras(params?: FetchPageOptions): Promise<ErpPageResult>
  getMovimentacoesFinanceirasContas(params?: FetchPageOptions): Promise<ErpPageResult>
  getContasFinanceiras(params?: FetchPageOptions): Promise<ErpPageResult>

  // Mais financeiro.
  getBaixasMovimentacaoFinanceira(params?: FetchPageOptions): Promise<ErpPageResult>
  getCobrancasMovimentacaoFinanceira(params?: FetchPageOptions): Promise<ErpPageResult>
  getConciliacoesMovimentacaoFinanceira(params?: FetchPageOptions): Promise<ErpPageResult>
  getContasPagar(params?: FetchPageOptions): Promise<ErpPageResult>
  getContasReceber(params?: FetchPageOptions): Promise<ErpPageResult>
  getEmprestimos(params?: FetchPageOptions): Promise<ErpPageResult>
  getGruposRateioContaFinanceira(params?: FetchPageOptions): Promise<ErpPageResult>
  getMovimentacaoFinanceiraArquivos(params?: FetchPageOptions): Promise<ErpPageResult>
  getOpcoesPagamento(params?: FetchPageOptions): Promise<ErpPageResult>
  getOrcamentosContrato(params?: FetchPageOptions): Promise<ErpPageResult>
  getProjetosFinanceiros(params?: FetchPageOptions): Promise<ErpPageResult>
  getRetencoesMovimentacaoFinanceira(params?: FetchPageOptions): Promise<ErpPageResult>
  getTransferenciasBancarias(params?: FetchPageOptions): Promise<ErpPageResult>
  getRegrasPauta(params?: FetchPageOptions): Promise<ErpPageResult>
  getCustosMensaisAnimais(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Reprodução/Genética/Sêmen/Embrião (endpoints adicionais) ────────

/**
 * Rotas REST reais e confirmadas, que só trazem dados se a conta usa
 * IATF/embriões/sêmen/ciclo agrícola no MB. Numa conta sem o módulo, a listagem vazia
 * lança `EmptyResponseError`: passe `{ allowEmpty: true }` se esse é o seu caso.
 */
export interface ReproducaoErp {
  getCios(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstacoesMonta(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstacoesMontaIa(params?: FetchPageOptions): Promise<ErpPageResult>
  getAcasalamentos(params?: FetchPageOptions): Promise<ErpPageResult>
  getResultadosSexagem(params?: FetchPageOptions): Promise<ErpPageResult>
  getResultadosDiagnosticoGestacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getAvaliacoesOvarianas(params?: FetchPageOptions): Promise<ErpPageResult>
  getAspiracoesOvocitos(params?: FetchPageOptions): Promise<ErpPageResult>
  getSafrasAnimal(params?: FetchPageOptions): Promise<ErpPageResult>
  getAvaliacoesAtivo(params?: FetchPageOptions): Promise<ErpPageResult>
  getComprasSemen(params?: FetchPageOptions): Promise<ErpPageResult>
  getComprasSemenItens(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasSemen(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasSemenItens(params?: FetchPageOptions): Promise<ErpPageResult>
  getMovimentacoesSemen(params?: FetchPageOptions): Promise<ErpPageResult>
  getComprasEmbriao(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasEmbriaoGrupo(params?: FetchPageOptions): Promise<ErpPageResult>
  getTransferenciasLoteReprodutivo(params?: FetchPageOptions): Promise<ErpPageResult>
  getTransferenciasLoteGenetico(params?: FetchPageOptions): Promise<ErpPageResult>
  getComunicacoesAbczOnline(params?: FetchPageOptions): Promise<ErpPageResult>
  getProblemas(params?: FetchPageOptions): Promise<ErpPageResult>
  getAnosAgricolas(params?: FetchPageOptions): Promise<ErpPageResult>
  getCiclosProducao(params?: FetchPageOptions): Promise<ErpPageResult>
  getCiclosProducaoLocalidade(params?: FetchPageOptions): Promise<ErpPageResult>
  getCentrosDistribuicao(params?: FetchPageOptions): Promise<ErpPageResult>
  getSafras(params?: FetchPageOptions): Promise<ErpPageResult>
  getAtividadesAgricolas(params?: FetchPageOptions): Promise<ErpPageResult>
  getClassificacoes(params?: FetchPageOptions): Promise<ErpPageResult>
  getRegrasTributarias(params?: FetchPageOptions): Promise<ErpPageResult>
  getVariedades(params?: FetchPageOptions): Promise<ErpPageResult>

  // Mais reprodução/genética.
  getAcasalamentosCobertura(params?: FetchPageOptions): Promise<ErpPageResult>
  getAgrupadoresCoberturasAbcz(params?: FetchPageOptions): Promise<ErpPageResult>
  getAgrupadoresMortesAbcz(params?: FetchPageOptions): Promise<ErpPageResult>
  getAgrupadoresNascimentosAbcz(params?: FetchPageOptions): Promise<ErpPageResult>
  getAgrupadoresPesagensAbcz(params?: FetchPageOptions): Promise<ErpPageResult>
  getCdcFiv(params?: FetchPageOptions): Promise<ErpPageResult>
  getCoberturasDiagnosticoGestacao(params?: FetchPageOptions): Promise<ErpPageResult>
  getCoberturasTe(params?: FetchPageOptions): Promise<ErpPageResult>
  getCobrancasAspiracaoOvocitos(params?: FetchPageOptions): Promise<ErpPageResult>
  getCruzamentos(params?: FetchPageOptions): Promise<ErpPageResult>
  getDescartesReprodutor(params?: FetchPageOptions): Promise<ErpPageResult>
  getDetalhesSituacaoMacho(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstacoesMontaCampo(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstacoesMontaControlada(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstacoesMontaTe(params?: FetchPageOptions): Promise<ErpPageResult>
  getFemeas(params?: FetchPageOptions): Promise<ErpPageResult>
  getGruposEvento(params?: FetchPageOptions): Promise<ErpPageResult>
  getIdentificacoesAcasalamento(params?: FetchPageOptions): Promise<ErpPageResult>
  getLotesGeneticos(params?: FetchPageOptions): Promise<ErpPageResult>
  getLotesReprodutivos(params?: FetchPageOptions): Promise<ErpPageResult>
  getMbivfWebFemea(params?: FetchPageOptions): Promise<ErpPageResult>
  getMbivfWebFemeaReceptora(params?: FetchPageOptions): Promise<ErpPageResult>
  getMbivfWebSemen(params?: FetchPageOptions): Promise<ErpPageResult>
  getMedicoesGeneticas(params?: FetchPageOptions): Promise<ErpPageResult>
  getMedicoesMorfologicas(params?: FetchPageOptions): Promise<ErpPageResult>
  getMotivosCancelamento(params?: FetchPageOptions): Promise<ErpPageResult>
  getMotivosVisita(params?: FetchPageOptions): Promise<ErpPageResult>
  getOrigensSemen(params?: FetchPageOptions): Promise<ErpPageResult>
  getParametrosPrevisao(params?: FetchPageOptions): Promise<ErpPageResult>
  getProdutosFiv(params?: FetchPageOptions): Promise<ErpPageResult>
  getRaques(params?: FetchPageOptions): Promise<ErpPageResult>
  getResultadosDiagnosticoGestacaoModal(params?: FetchPageOptions): Promise<ErpPageResult>
  getScoresFezes(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposDescarteEmbriao(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposOcorrencia(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposProblema(params?: FetchPageOptions): Promise<ErpPageResult>
  getTiposProdutoFiv(params?: FetchPageOptions): Promise<ErpPageResult>
  getTourosMultiplos(params?: FetchPageOptions): Promise<ErpPageResult>
  getTratamentosAnimalDoenca(params?: FetchPageOptions): Promise<ErpPageResult>
  getVisitasRgnRgd(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Outros (equipamentos/contratos/agrícola avulso) ─────────────────

/**
 * Rotas REST reais e confirmadas, que só trazem dados se a conta usa o
 * módulo correspondente (equipamentos de curral cadastrados individualmente,
 * gestão de contratos comercial, vendas/agrícola avulsas). Numa conta sem o módulo,
 * a listagem vazia lança `EmptyResponseError`: passe `{ allowEmpty: true }`
 * se esse é o seu caso.
 */
export interface OutrosErp {
  getBebedouros(params?: FetchPageOptions): Promise<ErpPageResult>
  getBotijoes(params?: FetchPageOptions): Promise<ErpPageResult>
  getCanecas(params?: FetchPageOptions): Promise<ErpPageResult>
  getCochosCompartilhados(params?: FetchPageOptions): Promise<ErpPageResult>
  getLimpezasBebedouro(params?: FetchPageOptions): Promise<ErpPageResult>
  getManutencoesAtivoMaquinario(params?: FetchPageOptions): Promise<ErpPageResult>
  getArvoresDeProcesso(params?: FetchPageOptions): Promise<ErpPageResult>
  getRecursosEmTalhao(params?: FetchPageOptions): Promise<ErpPageResult>
  getContratoProgramaSequencias(params?: FetchPageOptions): Promise<ErpPageResult>
  getContratosVinculados(params?: FetchPageOptions): Promise<ErpPageResult>
  getEventosGestaoContratos(params?: FetchPageOptions): Promise<ErpPageResult>
  getEventosContato(params?: FetchPageOptions): Promise<ErpPageResult>
  getGestaoContratos(params?: FetchPageOptions): Promise<ErpPageResult>
  getMensagensGestaoContratos(params?: FetchPageOptions): Promise<ErpPageResult>
  getMensagensGestaoContratosItens(params?: FetchPageOptions): Promise<ErpPageResult>
  getParcerias(params?: FetchPageOptions): Promise<ErpPageResult>
  getEventoCavalgada2018(params?: FetchPageOptions): Promise<ErpPageResult>
  getProcessosProducao(params?: FetchPageOptions): Promise<ErpPageResult>
  getProducoes(params?: FetchPageOptions): Promise<ErpPageResult>
  getProducoesPasto(params?: FetchPageOptions): Promise<ErpPageResult>
  getProducoesPremistura(params?: FetchPageOptions): Promise<ErpPageResult>
  getProdutosCategoriaAnimais(params?: FetchPageOptions): Promise<ErpPageResult>
  getProgramasNutricionaisPasto(params?: FetchPageOptions): Promise<ErpPageResult>
  getProgramasNutricionaisPastoRaca(params?: FetchPageOptions): Promise<ErpPageResult>
  getSaidasTransferenciaCentroDistribuicao(params?: FetchPageOptions): Promise<ErpPageResult>
  getSituacoesContato(params?: FetchPageOptions): Promise<ErpPageResult>
  getUsosPessoalEpi(params?: FetchPageOptions): Promise<ErpPageResult>
  getImportacoesXmlNfe(params?: FetchPageOptions): Promise<ErpPageResult>
  getOrigensMovimentacaoMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  getMotivosPerdaMovimentacaoMaterial(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasAvulsas(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasComplementares(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasContrato(params?: FetchPageOptions): Promise<ErpPageResult>
  getVendasGenericas(params?: FetchPageOptions): Promise<ErpPageResult>
  getPedidosEntrada(params?: FetchPageOptions): Promise<ErpPageResult>
  getPedidosVendas(params?: FetchPageOptions): Promise<ErpPageResult>
  getPedidoVenda(params?: FetchPageOptions): Promise<ErpPageResult>
  getAgendamentosAtividade(params?: FetchPageOptions): Promise<ErpPageResult>
  getEstoqueRelatorioInsumosItens(params?: FetchPageOptions): Promise<ErpPageResult>
}

// ── API ERP — Agregada ────────────────────────────────────────────────────────

export interface ErpApi {
  get cadastros(): CadastrosErp
  get animais(): AnimaisErp
  get sanitario(): SanitarioErp
  get estoque(): EstoqueErp
  get custos(): CustosErp
  get auditoria(): AuditoriaErp
  get financeiro(): FinanceiroErp
  get reproducao(): ReproducaoErp
  get outros(): OutrosErp
  /**
   * Qualquer grid pelo slug (ex.: um endpoint sem método dedicado), com o parse BR, a fila de
   * fazenda e as guardas dos métodos dedicados.
   * @throws {ValidationError} slug inválido, opção desconhecida, `from`/`to` num grid que
   *   ignora data, `propertyId` num endpoint que não é por fazenda.
   */
  fetchPage<T = Record<string, unknown>>(
    slug: string,
    options?: FetchPageOptions
  ): Promise<ErpPageResult<T>>
  /** Iterador das páginas de um grid. */
  pages<T = Record<string, unknown>>(
    slug: string,
    options?: Omit<FetchAllOptions, 'onPage'>
  ): AsyncGenerator<ErpPage<T>>
  /** Todas as páginas juntas, em memória. */
  collect<T = Record<string, unknown>>(
    slug: string,
    options?: Omit<FetchAllOptions, 'onPage'>
  ): Promise<CollectResult<T>>
}

// ── Acesso cru (mb.raw) ───────────────────────────────────────────────────────

/** Valor aceito na query string de `mb.raw.get()`. `null`/`undefined` são omitidos. */
export type RawQueryValue = string | number | boolean | null | undefined

/**
 * Acesso de baixo nível para endpoints sem método dedicado (`mb.raw`).
 *
 * Delega ao mesmo cliente HTTP do resto do SDK: cabeçalho JWT, relogin automático em 401,
 * `timeoutMs`/`retry` da instância (novas tentativas só em GET) e a mesma classificação de erros
 * (`AuthError`, `ClientError`, `ServerError`, `RateLimitError`, `InvalidPageError`,
 * `TimeoutError` e, só em GET, `EmptyResponseError`).
 *
 * Sem espaçamento de chamadas, sem interceptador e sem parse de formato BR: o retorno é o **JSON cru** da API,
 * tipado como `T` (padrão `unknown`) só por conveniência — nada é validado em tempo de execução.
 */
export interface RawApi {
  /**
   * `GET {base}{path}?{params}`.
   * @param path relativo à base da API, começando com `/` (ex.: `'/producaopasto/'`).
   * @throws {ValidationError} se `path` não for string iniciada por `/`.
   */
  get<T = unknown>(
    path: string,
    params?: Record<string, RawQueryValue>,
    options?: RequestOptions
  ): Promise<T>

  /**
   * `POST {base}{path}` com `body` em JSON (padrão `{}`).
   * ⚠️ Escrita na API é responsabilidade de quem chama: um POST pode alterar
   * dados de produção visíveis a todos os usuários da conta.
   * Depois de `TimeoutError`/`NetworkError`, a escrita pode ter sido aplicada
   * (`mayHaveSucceeded`): repetir pode duplicar.
   * @throws {ValidationError} se `path` não for string iniciada por `/`.
   */
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
}

// ── MultBovinos — Ponto de entrada ────────────────────────────────────────────

export interface RetryOptions {
  /** Tentativas totais por requisição GET. 1 (padrão) = sem nova tentativa — comportamento original. */
  attempts?: number
  /** Base da espera exponencial entre tentativas, em ms. Padrão 500. */
  backoffMs?: number
}

export interface MultBovinosOptions {
  email: string
  password: string
  env?: 'production' | 'test'
  timeoutMs?: number
  /** Token JWT de sessão anterior — evita novo login (modo sem servidor). */
  token?: string
  /** Lista de fazendas de sessão anterior — restauração sem servidor, sem connect(). */
  properties?: Property[]
  /**
   * Nova tentativa com espera crescente para falhas de rede transitórias — só em GET (idempotente),
   * nunca em timeout deliberado (AbortError) nem em POST/PUT/PATCH/DELETE.
   * Sem esta opção, comportamento é idêntico ao original (1 tentativa, sem nova tentativa).
   */
  retry?: RetryOptions
  /**
   * Cancela toda requisição desta instância. O erro lançado é o `reason` do
   * signal (por padrão um `DOMException` "AbortError"), como no `fetch` nativo.
   */
  signal?: AbortSignal
  /**
   * Padrão true. Nos grids por fazenda cujo registro traz a fazenda (ver o registro de
   * endpoints), confere cada página com a fazenda selecionada e lança
   * `PropertyNotSelectedError` (`reason: 'changed_by_another_session'`) se vier outra:
   * sinal de que outra sessão com a mesma conta trocou a fazenda no servidor. Sem esse campo
   * no registro não há proteção — a única garantia é não rodar dois processos com a mesma conta.
   */
  verifyRecordProperty?: boolean
}

/** Opções por chamada aceitas pelos métodos de baixo nível. */
export interface RequestOptions {
  /** Cancela só esta chamada (soma-se ao `signal` da instância). */
  signal?: AbortSignal
  /** Prazo só desta chamada, no lugar do `timeoutMs` da instância. */
  timeoutMs?: number
}

export declare class MultBovinos {
  constructor(options: MultBovinosOptions)

  /** Autentica e retorna { token, properties }. Guarde para reidratar a próxima instância (ex.: Lambda). */
  connect(): Promise<ConnectResult>

  /** Reconecta sem perder a fazenda selecionada: novo login e reseleção, sem contar como troca
   * (paginações em andamento continuam). Use no lugar de `connect()` no meio de uma sessão. */
  relogin(): Promise<ConnectResult>

  /** Token atual para persistência externa (sem servidor). */
  getToken(): string | null

  /** Lista de fazendas disponíveis para persistência externa (sem servidor). */
  getProperties(): Property[]

  /**
   * Seleciona uma fazenda como contexto ativo no servidor.
   * Obrigatório antes dos grids ERP por sessão (ex.: erp.estoque.getTratos()) e dos
   * `get()` por fazenda do BI chamados sem `propertyId`.
   * Entra na mesma fila das operações por fazenda: não troca a seleção no meio de um
   * getAll()/forAllProperties()/erp.custos.* em andamento nesta instância.
   * A lista de fazendas disponíveis vem de connect() / getProperties().
   * @throws {PropertyNotSelectedError} se propertyId não estiver na lista de fazendas.
   */
  selectProperty(propertyId: number): Promise<void>

  /**
   * Itera as fazendas SEQUENCIALMENTE; cada uma (seleção + callback) roda numa seção
   * exclusiva da instância. Chamadas por fazenda feitas DENTRO do callback (ex.:
   * `bi.suplementacao.get({ from, to })`) usam a fazenda da vez, sem travar.
   * Útil para endpoints BI por propriedade sem getAll() próprio (ex: suplementacao).
   */
  forAllProperties(
    callback: (propertyId: number, property: Property) => Promise<Record<string, unknown>[]>,
    propertyIds?: number[]
  ): Promise<Array<Record<string, unknown> & { _propertyId: number }>>

  get bi(): BiApi
  get erp(): ErpApi
  /** Acesso cru (`get`/`post`) para endpoints sem método dedicado — ver {@link RawApi}. */
  get raw(): RawApi
}
