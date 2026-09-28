import type { Id, Item, ItemKind } from '../domain/types'

/**
 * A Central: o que aparece na tela que reúne tudo que foi escrito.
 *
 * A folha é onde se escreve; a Central é onde se trabalha o que foi escrito —
 * ver o que está em aberto, procurar uma dúvida antiga, marcar uma ação como
 * feita. Por isso ela é uma tela de verdade, com busca e filtro, e não uma
 * lista solta: é o lugar pra onde o trabalho vai depois de virar texto.
 *
 * Módulo puro: filtro, busca e contagem, sem React nem banco. Verificado em
 * `tools/central-test.ts`.
 */

/** Onde o item foi escrito, com os nomes já resolvidos. */
export interface Origin {
  notebookId: Id
  notebook: string
  section: string
  page: string
}

/** Cada seção da Central. `geral` é a visão de cima; o resto é uma lista. */
export type CentralView = ItemKind | 'geral' | 'arquivados'

export interface CentralFilter {
  view: CentralView
  /** Busca no texto transcrito e no caminho onde a anotação mora. */
  query: string
  notebookId: Id | 'todos'
  /** Página aberta, quando o escopo é "só esta página". */
  pageId: Id | null
  scope: 'tudo' | 'pagina'
  showDone: boolean
}

export const DEFAULT_FILTER: CentralFilter = {
  view: 'geral',
  query: '',
  notebookId: 'todos',
  pageId: null,
  scope: 'tudo',
  showDone: false,
}

/**
 * Texto comparável: sem acento e sem caixa.
 *
 * Quem procura "duvida" tem que achar "dúvida" — ninguém digita acento no
 * teclado do tablet com pressa, e a transcrição às vezes erra o acento.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** O item casa com a busca, pelo texto dele ou pelo caminho onde mora? */
export function matchesQuery(item: Item, origin: Origin | undefined, query: string): boolean {
  const alvo = normalize(query)
  if (!alvo) return true
  const campos = [item.title, origin?.page, origin?.section, origin?.notebook]
  return campos.some((campo) => campo && normalize(campo).includes(alvo))
}

/** O que a Central mostra agora, do mais novo pro mais velho. */
export function selectItems(
  items: readonly Item[],
  origins: ReadonlyMap<Id, Origin>,
  filter: CentralFilter,
): Item[] {
  const out = items.filter((item) => {
    // Arquivado é o "não era item": só aparece na aba dele, nunca junto do resto.
    if (filter.view === 'arquivados') {
      if (item.status !== 'arquivado') return false
    } else {
      if (item.status === 'arquivado') return false
      if (!filter.showDone && item.status === 'concluido') return false
      if (filter.view !== 'geral' && item.kind !== filter.view) return false
    }

    if (filter.scope === 'pagina' && item.pageId !== filter.pageId) return false

    const origin = origins.get(item.pageId)
    if (filter.notebookId !== 'todos' && origin?.notebookId !== filter.notebookId) return false

    return matchesQuery(item, origin, filter.query)
  })

  return out.sort((a, b) => b.createdAt - a.createdAt)
}

export interface CentralSummary {
  /** Em aberto: nem concluído nem arquivado. */
  open: number
  done: number
  byKind: Record<ItemKind, number>
  byNotebook: { id: Id; name: string; open: number }[]
  /** Quantos ainda estão sem texto — é o que falta transcrever ou escrever. */
  semTexto: number
}

const KINDS: ItemKind[] = [
  'tarefa',
  'pauta',
  'pendencia',
  'duvida',
  'topico',
  'documento',
  'importante',
]

/**
 * O resumo de cima da Central.
 *
 * Conta só o que está vivo (nem concluído, nem arquivado): a pergunta que a
 * tela responde de relance é "o que falta", não "o que já passou".
 */
export function summarize(
  items: readonly Item[],
  origins: ReadonlyMap<Id, Origin>,
): CentralSummary {
  const byKind = {} as Record<ItemKind, number>
  for (const kind of KINDS) byKind[kind] = 0

  const porCaderno = new Map<Id, { id: Id; name: string; open: number }>()
  let open = 0
  let done = 0
  let semTexto = 0

  for (const item of items) {
    if (item.status === 'arquivado') continue
    if (item.status === 'concluido') {
      done++
      continue
    }

    open++
    byKind[item.kind]++
    if (!item.title) semTexto++

    const origin = origins.get(item.pageId)
    if (!origin) continue
    const linha = porCaderno.get(origin.notebookId) ?? {
      id: origin.notebookId,
      name: origin.notebook,
      open: 0,
    }
    linha.open++
    porCaderno.set(origin.notebookId, linha)
  }

  return {
    open,
    done,
    byKind,
    byNotebook: [...porCaderno.values()].sort((a, b) => b.open - a.open),
    semTexto,
  }
}
