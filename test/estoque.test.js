// Testes do relatório de Gestão Nutricional (erp.estoque): consulta e
// recálculo, ambos na seção exclusiva da fazenda -- ver comentários em
// src/erp/estoque.js.
import { describe, it, expect, vi } from 'vitest'
import { ErpGrid } from '../src/erp/grid.js'
import { EstoqueErp } from '../src/erp/estoque.js'
import { ValidationError } from '../src/errors.js'

const PATH = '/producaopasto/relatorio-gestao-nutricional-lote/?format=json'

function setup(response = { dados: { localidades: [{ data_relatorio: '2026-07-20' }] } }) {
  const client = { post: vi.fn().mockResolvedValue(response) }
  const log = []
  const auth = {
    withProperty: vi.fn(async (_client, propertyId, fn) => {
      log.push(`select:${propertyId}`)
      const r = await fn()
      log.push('fim')
      return r
    }),
  }
  const estoque = new EstoqueErp(new ErpGrid(client), client, auth)
  return { client, auth, estoque, log }
}

describe('EstoqueErp.getRelatorioGestaoNutricionalLote', () => {
  it('seleciona a fazenda, monta o corpo e devolve o conteúdo de "dados"', async () => {
    const localidades = [{ localidade: 'CURRAL 1', peso_projetado: 452.32 }]
    const { client, auth, estoque, log } = setup({ dados: { localidades, exibir_media: false } })

    const result = await estoque.getRelatorioGestaoNutricionalLote({
      propertyId: 1,
      date: '2026-07-22',
    })

    expect(client.post).toHaveBeenCalledWith(
      PATH,
      {
        propriedade: 1,
        data: '2026-07-22',
        produtos: [],
        linhas_confinamento: [],
        lotes_confinamento: [],
      },
      {}
    )
    expect(auth.withProperty).toHaveBeenCalledWith(client, 1, expect.any(Function), {
      signal: undefined,
    })
    expect(log).toEqual(['select:1', 'fim'])
    expect(result).toEqual({ localidades, exibir_media: false })
  })

  it('mapeia linhasConfinamento/lotesConfinamento/produtos e repassa timeoutMs/signal', async () => {
    const { client, estoque } = setup({ dados: { localidades: [] } })
    const signal = new AbortController().signal

    await estoque.getRelatorioGestaoNutricionalLote({
      propertyId: 1,
      date: '2026-07-22',
      produtos: [10, 20],
      linhasConfinamento: [1],
      lotesConfinamento: [2, 3],
      timeoutMs: 5000,
      signal,
    })

    expect(client.post).toHaveBeenCalledWith(
      PATH,
      {
        propriedade: 1,
        data: '2026-07-22',
        produtos: [10, 20],
        linhas_confinamento: [1],
        lotes_confinamento: [2, 3],
      },
      { timeoutMs: 5000, signal }
    )
  })

  it('sem "dados" na resposta, devolve o objeto bruto (defensivo)', async () => {
    const { estoque } = setup({ localidades: [] })
    await expect(
      estoque.getRelatorioGestaoNutricionalLote({ propertyId: 1, date: '2026-07-22' })
    ).resolves.toEqual({ localidades: [] })
  })

  it.each([
    ['sem propertyId', { date: '2026-07-22' }, 'propertyId'],
    ['sem date', { propertyId: 1 }, 'date'],
    ['date em formato BR', { propertyId: 1, date: '22/07/2026' }, 'date'],
    ['timeoutMs inválido', { propertyId: 1, date: '2026-07-22', timeoutMs: -1 }, 'timeoutMs'],
  ])('%s → ValidationError antes de qualquer chamada', async (_caso, args, field) => {
    const { client, auth, estoque } = setup()
    const err = await estoque.getRelatorioGestaoNutricionalLote(args).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.field).toBe(field)
    expect(auth.withProperty).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })

  it('sem nenhum argumento → ValidationError', async () => {
    const { estoque } = setup()
    await expect(estoque.getRelatorioGestaoNutricionalLote()).rejects.toThrow(ValidationError)
  })
})

describe('EstoqueErp.reprocessRelatorioGestaoNutricionalLinha', () => {
  const base = { propertyId: 7, date: '2026-07-20', linhaConfinamento: 11 }

  it('manda a linha inteira, com a lista de lotes vazia e a meia-noite de Brasília', async () => {
    const { client, auth, estoque, log } = setup()
    const result = await estoque.reprocessRelatorioGestaoNutricionalLinha(base)

    expect(client.post).toHaveBeenCalledWith(
      PATH,
      {
        data: '2026-07-20T03:00:00.000Z',
        dietas: [],
        produtos: [],
        propriedade: 7,
        reprocessar: true,
        produtos_texto: [],
        lotes_confinamento: [],
        linhas_confinamento: [11],
        exibir_media_acumulada: false,
        lotes_confinamento_texto: [],
        linhas_confinamento_texto: [],
      },
      { timeoutMs: 600_000 }
    )
    expect(auth.withProperty).toHaveBeenCalledWith(client, 7, expect.any(Function), {
      signal: undefined,
    })
    expect(log).toEqual(['select:7', 'fim'])
    expect(result).toEqual({ localidades: [{ data_relatorio: '2026-07-20' }] })
  })

  it('repassa timeoutMs e signal da chamada', async () => {
    const { client, estoque } = setup()
    const signal = new AbortController().signal
    await estoque.reprocessRelatorioGestaoNutricionalLinha({ ...base, timeoutMs: 1000, signal })
    expect(client.post).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      timeoutMs: 1000,
      signal,
    })
  })

  it('linha dentro de allowedLines segue, e allowedLines não vai no corpo', async () => {
    const { client, estoque } = setup()
    await estoque.reprocessRelatorioGestaoNutricionalLinha({ ...base, allowedLines: [10, 11] })
    const body = client.post.mock.calls[0][1]
    expect(body.linhas_confinamento).toEqual([11])
    expect(body).not.toHaveProperty('allowedLines')
  })

  it.each([
    ['sem argumentos', undefined, 'propertyId'],
    ['sem propertyId', { ...base, propertyId: undefined }, 'propertyId'],
    ['sem linha', { ...base, linhaConfinamento: undefined }, 'linhaConfinamento'],
    ['linha em lista', { ...base, linhaConfinamento: [11] }, 'linhaConfinamento'],
    ['data inexistente', { ...base, date: '2026-02-31' }, 'date'],
    ['timeoutMs inválido', { ...base, timeoutMs: 0 }, 'timeoutMs'],
    ['linha fora de allowedLines', { ...base, allowedLines: [12] }, 'linhaConfinamento'],
    ['allowedLines vazia', { ...base, allowedLines: [] }, 'allowedLines'],
  ])('%s → ValidationError antes de qualquer chamada', async (_caso, options, field) => {
    const { client, auth, estoque } = setup()
    const err = await estoque.reprocessRelatorioGestaoNutricionalLinha(options).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.field).toBe(field)
    expect(auth.withProperty).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })
})

describe('EstoqueErp.reprocessRelatorioGestaoNutricionalLote', () => {
  const base = { propertyId: 7, date: '2026-07-20', loteConfinamento: 67, linhaConfinamento: 11 }

  it('manda o corpo da tela com reprocessar: true, um curral e a meia-noite de Brasília', async () => {
    const { client, auth, estoque, log } = setup()
    const result = await estoque.reprocessRelatorioGestaoNutricionalLote(base)

    expect(client.post).toHaveBeenCalledWith(
      PATH,
      {
        data: '2026-07-20T03:00:00.000Z',
        dietas: [],
        produtos: [],
        propriedade: 7,
        reprocessar: true,
        produtos_texto: [],
        lotes_confinamento: [67],
        linhas_confinamento: [11],
        exibir_media_acumulada: false,
        lotes_confinamento_texto: [],
        linhas_confinamento_texto: [],
      },
      { timeoutMs: 600_000 }
    )
    expect(auth.withProperty).toHaveBeenCalledWith(client, 7, expect.any(Function), {
      signal: undefined,
    })
    expect(log).toEqual(['select:7', 'fim']) // o POST roda dentro da seção da fazenda
    expect(result).toEqual({ localidades: [{ data_relatorio: '2026-07-20' }] })
  })

  it('repassa timeoutMs e signal da chamada', async () => {
    const { client, estoque } = setup()
    const signal = new AbortController().signal
    await estoque.reprocessRelatorioGestaoNutricionalLote({ ...base, timeoutMs: 1000, signal })
    expect(client.post).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      timeoutMs: 1000,
      signal,
    })
  })

  it('linha dentro de allowedLines segue, e allowedLines não vai no corpo', async () => {
    const { client, estoque } = setup()
    await estoque.reprocessRelatorioGestaoNutricionalLote({ ...base, allowedLines: [10, 11] })
    const body = client.post.mock.calls[0][1]
    expect(body.linhas_confinamento).toEqual([11])
    expect(body).not.toHaveProperty('allowedLines')
  })

  it('resposta sem "dados" volta como veio', async () => {
    const { estoque } = setup(null)
    await expect(estoque.reprocessRelatorioGestaoNutricionalLote(base)).resolves.toBeNull()
  })

  it.each([
    ['sem propertyId', { propertyId: undefined }, 'propertyId'],
    ['sem lote', { loteConfinamento: undefined }, 'loteConfinamento'],
    ['lote em lista', { loteConfinamento: [67] }, 'loteConfinamento'],
    ['sem linha', { linhaConfinamento: undefined }, 'linhaConfinamento'],
    ['linha zero', { linhaConfinamento: 0 }, 'linhaConfinamento'],
    ['data inexistente', { date: '2026-02-31' }, 'date'],
    ['data em formato BR', { date: '20/07/2026' }, 'date'],
    ['timeoutMs inválido', { timeoutMs: 0 }, 'timeoutMs'],
    ['linha fora de allowedLines', { allowedLines: [12, 13] }, 'linhaConfinamento'],
    ['allowedLines vazia', { allowedLines: [] }, 'allowedLines'],
    ['allowedLines que não é lista', { allowedLines: 11 }, 'allowedLines'],
    ['allowedLines com id inválido', { allowedLines: [11, 0] }, 'allowedLines'],
  ])('%s → ValidationError antes de qualquer chamada', async (_caso, change, field) => {
    const { client, auth, estoque } = setup()
    const err = await estoque
      .reprocessRelatorioGestaoNutricionalLote({ ...base, ...change })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.field).toBe(field)
    expect(auth.withProperty).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })

  it('sem argumentos → ValidationError', async () => {
    const { estoque } = setup()
    await expect(estoque.reprocessRelatorioGestaoNutricionalLote()).rejects.toBeInstanceOf(
      ValidationError
    )
  })
})
