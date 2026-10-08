/**
 * Verificação da Central.
 *
 * Roda com: npm run test:central
 *
 * O que importa: a Central é o lugar pra onde o trabalho vai depois de virar
 * texto. Se ela mostrar o que não devia (arquivado no meio das ações, item de
 * outro caderno num filtro de caderno) ou esconder o que devia aparecer, o
 * usuário perde a confiança e volta a folhear página por página — que é
 * exatamente o que ela existe pra evitar.
 */

import type { Item, ItemKind } from '../src/domain/types'
import {
  DEFAULT_FILTER,
  dueBucket,
  fimDoDia,
  groupByDue,
  inicioDoDia,
  normalize,
  selectItems,
  sortItems,
  summarize,
} from '../src/items/central'
import type { Origin } from '../src/items/central'

const origens = new Map<string, Origin>([
  ['p1', { notebookId: 'obra', notebook: 'Obra Central', section: 'Visitas', page: 'Segunda' }],
  ['p2', { notebookId: 'casa', notebook: 'Casa', section: 'Reformas', page: 'Cozinha' }],
])

let contador = 0
function item(extra: Partial<Item> = {}): Item {
  contador++
  return {
    id: `i${contador}`,
    pageId: 'p1',
    kind: 'tarefa',
    status: 'aberto',
    source: 'auto',
    zoneId: 'z1',
    strokeIds: ['a'],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    title: '',
    ocr: { status: 'pendente' },
    createdAt: contador,
    updatedAt: contador,
    ...extra,
  }
}

const casos: { nome: string; rodar: () => string | null }[] = [
  {
    nome: 'a visão geral mostra tudo que está vivo',
    rodar() {
      const itens = [item(), item({ kind: 'duvida' }), item({ status: 'arquivado' })]
      const vistos = selectItems(itens, origens, DEFAULT_FILTER)
      return vistos.length === 2 ? null : `esperava 2, veio ${vistos.length}`
    },
  },
  {
    nome: 'a aba de um tipo só mostra aquele tipo',
    rodar() {
      const itens = [item(), item({ kind: 'duvida' }), item({ kind: 'duvida' })]
      const vistos = selectItems(itens, origens, { ...DEFAULT_FILTER, view: 'duvida' })
      if (vistos.length !== 2) return `esperava 2 dúvidas, veio ${vistos.length}`
      return vistos.every((i) => i.kind === 'duvida') ? null : 'veio item de outro tipo junto'
    },
  },
  {
    nome: 'concluído só aparece quando é pedido',
    rodar() {
      const itens = [item(), item({ status: 'concluido' })]
      const escondido = selectItems(itens, origens, DEFAULT_FILTER)
      const mostrado = selectItems(itens, origens, { ...DEFAULT_FILTER, showDone: true })
      if (escondido.length !== 1) return 'o concluído vazou pra lista padrão'
      if (mostrado.length !== 2) return 'o concluído não apareceu quando foi pedido'
      return null
    },
  },
  {
    nome: 'arquivado não vaza pra nenhuma outra aba',
    rodar() {
      const itens = [item({ status: 'arquivado' }), item({ status: 'arquivado', kind: 'duvida' })]
      for (const view of ['geral', 'tarefa', 'duvida'] as const) {
        const vistos = selectItems(itens, origens, { ...DEFAULT_FILTER, view, showDone: true })
        if (vistos.length !== 0) return `arquivado apareceu na aba ${view}`
      }
      const arquivados = selectItems(itens, origens, { ...DEFAULT_FILTER, view: 'arquivados' })
      return arquivados.length === 2 ? null : 'a aba de arquivados não mostrou os dois'
    },
  },
  {
    nome: 'busca acha sem acento e sem caixa',
    rodar() {
      const itens = [item({ title: 'Conferir a DÚVIDA do piso' }), item({ title: 'Comprar cimento' })]
      const vistos = selectItems(itens, origens, { ...DEFAULT_FILTER, query: 'duvida' })
      if (vistos.length !== 1) return `esperava 1, veio ${vistos.length}`
      return vistos[0].title.includes('DÚVIDA') ? null : 'achou o item errado'
    },
  },
  {
    nome: 'busca acha pelo caminho onde a anotação mora',
    rodar() {
      const itens = [item({ pageId: 'p1' }), item({ pageId: 'p2' })]
      const vistos = selectItems(itens, origens, { ...DEFAULT_FILTER, query: 'cozinha' })
      if (vistos.length !== 1) return `esperava 1, veio ${vistos.length}`
      return vistos[0].pageId === 'p2' ? null : 'achou a página errada'
    },
  },
  {
    nome: 'filtro de caderno respeita a origem',
    rodar() {
      const itens = [item({ pageId: 'p1' }), item({ pageId: 'p2' }), item({ pageId: 'p2' })]
      const vistos = selectItems(itens, origens, { ...DEFAULT_FILTER, notebookId: 'casa' })
      return vistos.length === 2 ? null : `esperava 2 da Casa, veio ${vistos.length}`
    },
  },
  {
    nome: 'escopo "esta página" ignora o resto',
    rodar() {
      const itens = [item({ pageId: 'p1' }), item({ pageId: 'p2' })]
      const vistos = selectItems(itens, origens, {
        ...DEFAULT_FILTER,
        scope: 'pagina',
        pageId: 'p2',
      })
      if (vistos.length !== 1) return `esperava 1, veio ${vistos.length}`
      return vistos[0].pageId === 'p2' ? null : 'trouxe a página errada'
    },
  },
  {
    nome: 'o mais novo aparece primeiro',
    rodar() {
      const velho = item({ createdAt: 10, title: 'velho' })
      const novo = item({ createdAt: 99, title: 'novo' })
      const vistos = selectItems([velho, novo], origens, DEFAULT_FILTER)
      return vistos[0].title === 'novo' ? null : 'a ordem saiu invertida'
    },
  },
  {
    nome: 'o resumo conta o que falta, não o que passou',
    rodar() {
      const itens = [
        item({ kind: 'tarefa', title: 'com texto' }),
        item({ kind: 'tarefa' }),
        item({ kind: 'duvida', pageId: 'p2' }),
        item({ status: 'concluido' }),
        item({ status: 'arquivado' }),
      ]
      const r = summarize(itens, origens)
      if (r.open !== 3) return `em aberto ${r.open}, esperava 3`
      if (r.done !== 1) return `concluídos ${r.done}, esperava 1`
      if (r.byKind.tarefa !== 2) return `tarefas ${r.byKind.tarefa}, esperava 2`
      if (r.byKind.duvida !== 1) return `dúvidas ${r.byKind.duvida}, esperava 1`
      if (r.semTexto !== 2) return `sem texto ${r.semTexto}, esperava 2`
      if (r.byNotebook[0].id !== 'obra') return 'o caderno com mais coisa não veio primeiro'
      return null
    },
  },
  {
    nome: 'texto comparável some com acento e caixa',
    rodar() {
      return normalize('Ação ÚNICA') === 'acao unica' ? null : `veio "${normalize('Ação ÚNICA')}"`
    },
  },
]

// ─── Ficha: prazo e prioridade ──────────────────────────────────────────────

const HOJE = new Date('2026-09-30T10:00:00').getTime()
const DIA = 24 * 60 * 60 * 1000

casos.push(
  {
    nome: 'anotação não conta como coisa em aberto',
    rodar() {
      const r = summarize([item({ kind: 'nota' }), item({ kind: 'tarefa' })], origens, HOJE)
      if (r.open !== 1) return `em aberto ${r.open}, esperava 1`
      if (r.notas !== 1) return `anotações ${r.notas}, esperava 1`
      return null
    },
  },
  {
    nome: 'prazo vencido e prazo de hoje entram no "correndo"',
    rodar() {
      const r = summarize(
        [
          item({ dueAt: inicioDoDia(HOJE) - DIA }),
          item({ dueAt: inicioDoDia(HOJE) }),
          item({ dueAt: inicioDoDia(HOJE) + 3 * DIA }),
          item({}),
        ],
        origens,
        HOJE,
      )
      return r.correndo === 2 ? null : `correndo ${r.correndo}, esperava 2`
    },
  },
  {
    nome: 'ordem por prazo põe o mais apertado primeiro, e sem prazo por último',
    rodar() {
      const sem = item({ title: 'sem prazo' })
      const longe = item({ title: 'longe', dueAt: inicioDoDia(HOJE) + 9 * DIA })
      const perto = item({ title: 'perto', dueAt: inicioDoDia(HOJE) + DIA })
      const ordem = sortItems([sem, longe, perto], 'prazo').map((i) => i.title)
      const esperado = ['perto', 'longe', 'sem prazo']
      return ordem.join('|') === esperado.join('|') ? null : `veio ${ordem.join(' > ')}`
    },
  },
  {
    nome: 'ordem por prioridade respeita alta, média, baixa e depois sem',
    rodar() {
      const itens = [
        item({ title: 'sem' }),
        item({ title: 'baixa', priority: 'baixa' }),
        item({ title: 'alta', priority: 'alta' }),
        item({ title: 'media', priority: 'media' }),
      ]
      const ordem = sortItems(itens, 'prioridade').map((i) => i.title)
      const esperado = ['alta', 'media', 'baixa', 'sem']
      return ordem.join('|') === esperado.join('|') ? null : `veio ${ordem.join(' > ')}`
    },
  },
  {
    nome: 'empate de prazo cai na prioridade, e depois no mais recente',
    rodar() {
      const prazo = inicioDoDia(HOJE) + DIA
      const a = item({ title: 'a', dueAt: prazo, priority: 'baixa', createdAt: 100 })
      const b = item({ title: 'b', dueAt: prazo, priority: 'alta', createdAt: 1 })
      const c = item({ title: 'c', dueAt: prazo, priority: 'baixa', createdAt: 200 })
      const ordem = sortItems([a, b, c], 'prazo').map((i) => i.title)
      return ordem.join('|') === 'b|c|a' ? null : `veio ${ordem.join(' > ')}`
    },
  },
  {
    nome: 'cada prazo cai na sua faixa',
    rodar() {
      const casos: [number | null, string][] = [
        [inicioDoDia(HOJE) - DIA, 'atrasado'],
        [inicioDoDia(HOJE), 'hoje'],
        [inicioDoDia(HOJE) + DIA, 'amanha'],
        [inicioDoDia(HOJE) + 4 * DIA, 'semana'],
        [inicioDoDia(HOJE) + 30 * DIA, 'depois'],
        [null, 'semPrazo'],
      ]
      for (const [prazo, esperado] of casos) {
        const veio = dueBucket(item({ dueAt: prazo }), HOJE)
        if (veio !== esperado) return `prazo ${prazo} caiu em ${veio}, esperava ${esperado}`
      }
      return null
    },
  },
  {
    nome: 'o último instante de hoje ainda é hoje, e o de amanhã ainda é amanhã',
    rodar() {
      const fimHoje = fimDoDia(HOJE)
      const casos: [number, string][] = [
        [fimHoje, 'hoje'],
        [fimHoje + 1, 'amanha'],
        [fimHoje + DIA, 'amanha'],
        [fimHoje + DIA + 1, 'semana'],
        [fimHoje + 7 * DIA, 'semana'],
        [fimHoje + 7 * DIA + 1, 'depois'],
      ]
      for (const [prazo, esperado] of casos) {
        const veio = dueBucket(item({ dueAt: prazo }), HOJE)
        if (veio !== esperado) return `fim de hoje ${prazo - fimHoje >= 0 ? '+' : ''}${prazo - fimHoje} ms caiu em ${veio}, esperava ${esperado}`
      }
      return null
    },
  },
  {
    nome: 'as faixas saem na ordem de quem olha, sem faixa vazia',
    rodar() {
      const grupos = groupByDue(
        [
          item({ dueAt: inicioDoDia(HOJE) + 30 * DIA }),
          item({ dueAt: inicioDoDia(HOJE) - DIA }),
          item({}),
        ],
        HOJE,
      )
      const ordem = grupos.map((g) => g.bucket).join('|')
      return ordem === 'atrasado|depois|semPrazo' ? null : `veio ${ordem}`
    },
  },
)

console.log('\n  Central — o destino do que foi escrito\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(48)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log('')
if (falhas > 0) {
  console.error(`  ${falhas} caso(s) fora do esperado\n`)
  process.exit(1)
}
console.log('  todos os casos passaram\n')
