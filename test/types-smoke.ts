// Verificação rápida de tipos: nunca é executada (só `tsc --noEmit`). Existe para detectar
// automaticamente divergências entre index.d.ts e o uso real do SDK — o
// mesmo tipo de bug que já apareceu manualmente (getSobraCocho tinha
// assinatura `(): never` desatualizada depois que o endpoint deixou de ser ❌).
import {
  MultBovinos,
  errors,
  constants,
  safeImport,
  paginate,
  getWeeklyWindows,
  getMonthlyWindows,
  lastDayOfMonth,
  firstDayOfMonth,
} from '../index.js'
import type { ApiDecimal, RequestDiagnostic, Trato } from '../index.js'

async function smoke() {
  const mb = new MultBovinos({
    email: 'x@x.com',
    password: 'x',
    env: 'production',
    timeoutMs: 1000,
    token: 't',
    properties: [],
    retry: { attempts: 3, backoffMs: 200 },
  })

  const { properties } = await mb.connect()
  await mb.selectProperty(properties[0]?.id ?? 1)
  mb.getToken()
  mb.getProperties()
  await mb.forAllProperties(async (_id, _prop) => [{ a: 1 }], [1, 2])

  // ── raw ─────────────────────────────────────────────────────────────
  const rawUnknown: unknown = await mb.raw.get('/x/', { page: 1, ativo: true, q: null })
  void rawUnknown
  await mb.raw.get('/x/')
  const rawTyped = await mb.raw.post<{ dados: { localidades: unknown[] } }>(
    '/producaopasto/relatorio-gestao-nutricional-lote/',
    { propriedade: 1, data: '2026-07-20T03:00:00.000Z' }
  )
  rawTyped.dados.localidades.length
  await mb.raw.post('/x/')

  // ── BI ──────────────────────────────────────────────────────────────
  await mb.bi.fazendas.get()
  const allAnimals = await mb.bi.animais.getAll()
  await mb.bi.movMateriais.get({ from: '2026-01-01', to: '2026-01-31' })
  await mb.bi.producaoRacao.get({ from: '2026-01-01', to: '2026-01-02' })
  await mb.bi.producaoRacao.getFormulacao(1)
  const movs = await mb.bi.movEstoque.get()

  // ── ERP cadastros ───────────────────────────────────────────────────
  const contato = await mb.erp.cadastros.createContato({
    nome: 'x',
    tipo_pessoa: 'PJ',
    categoria: 1,
    ativo: true,
  })
  await mb.erp.cadastros.updateContato(contato.id, { ativo: false })
  await mb.erp.cadastros.getMateriais({ page: 1 })

  // ── ERP animais ─────────────────────────────────────────────────────
  const entry = await mb.erp.animais.findByOrdemServico('OS-1')
  await mb.erp.animais.updateEntradaFinanceiro(entry.id, { data_aquisicao: '2026-01-01' })
  const lot = await mb.erp.animais.getConfinamentoById(101)
  lot.animais

  // ── ERP estoque — getSobraCocho é o método que já teve bug de tipo ────
  const sobra = await mb.erp.estoque.getSobraCocho({ from: '2026-01-01', to: '2026-01-07' })
  sobra.items
  await mb.erp.estoque.getTratos({ from: '2026-01-01', to: '2026-01-07' })
  const nutritionReport = await mb.erp.estoque.getRelatorioGestaoNutricionalLote({
    propertyId: 1,
    date: '2026-01-01',
  })
  nutritionReport.localidades
  const recalculated = await mb.erp.estoque.reprocessRelatorioGestaoNutricionalLote({
    propertyId: 1,
    date: '2026-01-01',
    loteConfinamento: 2,
    linhaConfinamento: 3,
    timeoutMs: 300_000,
  })
  recalculated.localidades
  const recalculatedLine = await mb.erp.estoque.reprocessRelatorioGestaoNutricionalLinha({
    propertyId: 1,
    date: '2026-01-01',
    linhaConfinamento: 3,
    allowedLines: [3],
  })
  recalculatedLine.filtro
  await mb.raw.post('/x/', {}, { timeoutMs: 1000 })
  try {
    mb.erp.estoque.getMovimentacaoMaterial()
  } catch (e) {
    if (e instanceof errors.EndpointUnavailableError) e.reason
  }

  // ── ERP custos ──────────────────────────────────────────────────────
  await mb.erp.custos.getCustosAtivos({ propertyId: 1, referenceDate: '2026-01-31' })
  await mb.erp.custos.getSaldoBiologico({ referenceDate: '2026-01-01' })
  await mb.erp.custos.getSaidasMaterial({
    date: '2026-01-01',
    tipoSaida: constants.TIPO_SAIDA_MATERIAL.VENDA,
  })

  // ── ERP auditoria / financeiro / reproducao / outros ───────────────
  await mb.erp.auditoria.getAuditoria({ from: '2026-01-01', to: '2026-01-02' })
  await mb.erp.financeiro.getBancos()
  await mb.erp.reproducao.getCios()
  await mb.erp.outros.getBebedouros()

  // ── Helpers ─────────────────────────────────────────────────────────
  getWeeklyWindows('2026-01-01', '2026-01-31')
  getMonthlyWindows('2026-01-01', '2026-06-30')
  lastDayOfMonth('2026-01')
  firstDayOfMonth('2026-01')

  await safeImport({
    fetch: async () => [{ id: 1 }],
    replace: async (items) => {
      void items.length
    },
  })

  // Paginação: iteradores de domínio, paginate() genérico e resultado completo
  for await (const { items, page } of mb.erp.sanitario.iterVacinacoes({ from: '2026-10-01' })) {
    void items.length
    void page
  }
  for await (const p of paginate((params) => mb.erp.cadastros.getMateriais(params), {
    maxPages: 2,
  })) {
    void p.nextPage
  }
  const fa = await mb.erp.estoque.getTratos({ from: '2026-10-01', to: '2026-10-07' })
  if (!fa.complete && fa.nextPage !== null) void fa.possiblyRateLimited

  // Registros tipados: campos declarados têm tipo; os outros ficam acessíveis como unknown.
  await mb.erp.estoque.getTratos({
    from: '2026-10-01',
    onPage: (items) => {
      const first: Trato | undefined = items[0]
      void first?.data_trato
    },
  })
  const leituras = await mb.erp.estoque.getSobraCocho({ from: '2026-10-01', to: '2026-10-01' })
  for (const leitura of leituras.items) {
    for (const item of leitura.sobra_cocho_itens ?? []) {
      const lote: number | null = item.confinamento
      void lote
    }
  }
  const extra: unknown = leituras.items[0]?.campo_nao_declarado
  void extra
  // @ts-expect-error id é number: não é atribuível a string
  const wrongId: string = leituras.items[0].id
  void wrongId
  const lote = await mb.erp.animais.getConfinamentoById(1)
  const pesoEntrada: ApiDecimal | null | undefined = lote.animais?.[0]?.peso_entrada
  void pesoEntrada
  const animais = await mb.bi.animais.get({ propertyId: 1 })
  const ident: string | null | undefined = animais.items[0]?.identificacao_usual
  void ident
  for await (const p of mb.erp.sanitario.iterTratamentos({ from: '2026-10-01' })) {
    const doenca: string | null | undefined = p.items[0]?.doenca
    void doenca
  }
  const mov = await mb.bi.movMateriais.get({ from: '2026-10-01', to: '2026-10-07' })
  void mov.items[0]?.materiais?.[0]?.material_id

  const request: RequestDiagnostic = {
    method: 'GET',
    path: '/tratos/',
    page: 1,
    status: null,
    error: 'TimeoutError',
    attempt: 1,
    durationMs: 90_000,
  }
  void request

  constants.BASE_URL.production
}

void smoke
