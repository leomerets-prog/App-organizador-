import { classifyShape, countCorners, isClosedPath, polygonArea } from '../src/flow/shapes'
import { buildGraph } from '../src/flow/graph'
import type { FlowStroke } from '../src/flow/graph'
import { backEdges, layout, levelize } from '../src/flow/layout'
import { mergeFlowchart } from '../src/flow/merge'
import {
  MAX_PASSOS,
  SEM_HISTORIA,
  mudou as mudouFlow,
  push as pushUndo,
  redo as redoFlow,
  rotulo as rotuloFlow,
  undo as undoFlow,
} from '../src/flow/undo'
import type { Flowchart } from '../src/domain/types'

/**
 * Do rabisco ao fluxograma.
 *
 * Os desenhos daqui são feitos com tremor de propósito (`mao()`): uma caixa
 * perfeita de quatro pontos não prova nada sobre o que sai de uma caneta na
 * mão de alguém, e era justamente nas medidas de forma que o risco estava.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

// ─── Desenhos de teste ───────────────────────────────────────────────────────

let semente = 7
/** Tremor repetível: o mesmo desenho a cada execução, mas nunca perfeito. */
function tremor(amplitude: number): number {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return ((semente / 2147483648) * 2 - 1) * amplitude
}

function mao(pontos: { x: number; y: number }[], amplitude = 1.6) {
  return pontos.map((p) => ({ x: p.x + tremor(amplitude), y: p.y + tremor(amplitude) }))
}

/** Interpola uma volta fechada por uma lista de cantos. */
function percorrer(cantos: { x: number; y: number }[], porLado = 14) {
  const saida: { x: number; y: number }[] = []
  for (let i = 0; i < cantos.length; i++) {
    const a = cantos[i]
    const b = cantos[(i + 1) % cantos.length]
    for (let t = 0; t < porLado; t++) {
      saida.push({ x: a.x + ((b.x - a.x) * t) / porLado, y: a.y + ((b.y - a.y) * t) / porLado })
    }
  }
  saida.push({ ...cantos[0] })
  return mao(saida)
}

function retangulo(x: number, y: number, w: number, h: number) {
  return percorrer([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ])
}

function losango(x: number, y: number, w: number, h: number) {
  return percorrer([
    { x: x + w / 2, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w / 2, y: y + h },
    { x, y: y + h / 2 },
  ])
}

function elipse(x: number, y: number, w: number, h: number) {
  const pontos: { x: number; y: number }[] = []
  for (let i = 0; i <= 56; i++) {
    const a = (i / 56) * Math.PI * 2
    pontos.push({ x: x + w / 2 + (Math.cos(a) * w) / 2, y: y + h / 2 + (Math.sin(a) * h) / 2 })
  }
  return mao(pontos)
}

function reta(x1: number, y1: number, x2: number, y2: number, passos = 14) {
  const pontos: { x: number; y: number }[] = []
  for (let i = 0; i <= passos; i++) {
    pontos.push({ x: x1 + ((x2 - x1) * i) / passos, y: y1 + ((y2 - y1) * i) / passos })
  }
  return mao(pontos, 1)
}

/** Uma palavra rabiscada dentro de um retângulo: ziguezague baixo e largo. */
function palavra(x: number, y: number, largura = 90) {
  const pontos: { x: number; y: number }[] = []
  for (let i = 0; i <= 20; i++) {
    pontos.push({ x: x + (largura * i) / 20, y: y + (i % 2 ? -6 : 6) })
  }
  return mao(pontos, 0.8)
}

let n = 0
const traco = (points: { x: number; y: number }[]): FlowStroke => ({ id: `t${++n}`, points })

// ─── Casos ───────────────────────────────────────────────────────────────────

const casos: Caso[] = [
  // ── Formas ────────────────────────────────────────────────────────────────
  {
    nome: 'retângulo de mão é ação',
    rodar() {
      const f = classifyShape(retangulo(100, 100, 220, 110))
      if (!f) return 'não reconheceu forma nenhuma'
      return f.kind === 'acao' ? null : `saiu ${f.kind} (fill ${f.fill.toFixed(2)}, ${f.corners} cantos)`
    },
  },
  {
    nome: 'losango de mão é decisão',
    rodar() {
      const f = classifyShape(losango(100, 100, 220, 150))
      if (!f) return 'não reconheceu forma nenhuma'
      return f.kind === 'decisao' ? null : `saiu ${f.kind} (fill ${f.fill.toFixed(2)})`
    },
  },
  {
    nome: 'elipse de mão é início/fim',
    rodar() {
      const f = classifyShape(elipse(100, 100, 220, 110))
      if (!f) return 'não reconheceu forma nenhuma'
      return f.kind === 'terminal' ? null : `saiu ${f.kind} (${f.corners} cantos)`
    },
  },
  {
    // O que separa redondo de retângulo não é área nenhuma — é o canto vivo.
    nome: 'o canto é o que separa o retângulo do redondo',
    rodar() {
      const r = countCorners(retangulo(0, 0, 200, 120), true)
      const e = countCorners(elipse(0, 0, 200, 120), true)
      if (r < 3 || r > 6) return `retângulo deu ${r} cantos`
      if (e > 1) return `elipse deu ${e} cantos`
      return null
    },
  },
  {
    nome: 'quadrado pequeno ainda é caixa',
    rodar() {
      const f = classifyShape(retangulo(10, 10, 60, 45))
      return f?.kind === 'acao' ? null : `saiu ${f?.kind ?? 'nada'}`
    },
  },
  {
    nome: 'risco solto não vira caixa',
    rodar() {
      return classifyShape(reta(0, 0, 200, 4)) === null ? null : 'um risco virou caixa'
    },
  },
  {
    nome: 'sublinhado comprido e fino não vira caixa',
    rodar() {
      const vaiEVolta = [...reta(0, 0, 300, 0), ...reta(300, 3, 0, 3)]
      return classifyShape(vaiEVolta) === null ? null : 'um sublinhado virou caixa'
    },
  },
  {
    nome: 'pingo não vira caixa',
    rodar() {
      return classifyShape(elipse(10, 10, 9, 9)) === null ? null : 'um pingo virou caixa'
    },
  },
  {
    nome: 'traço que não fecha não é caixa',
    rodar() {
      const c = retangulo(0, 0, 200, 120).slice(0, 34)
      if (isClosedPath(c)) return 'um "C" foi lido como fechado'
      return classifyShape(c) === null ? null : 'um "C" virou caixa'
    },
  },
  {
    nome: 'a área do polígono é a área mesmo',
    rodar() {
      const a = polygonArea([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ])
      return Math.abs(a - 5000) < 1 ? null : `esperava 5000, veio ${a}`
    },
  },

  // ── Grafo ─────────────────────────────────────────────────────────────────
  {
    nome: 'duas caixas e uma seta viram duas caixas e uma seta',
    rodar() {
      const a = traco(retangulo(100, 100, 200, 90))
      const b = traco(retangulo(100, 300, 200, 90))
      const s = traco(reta(200, 192, 200, 298))
      const g = buildGraph([a, b, s])
      if (g.nodes.length !== 2) return `${g.nodes.length} caixa(s)`
      if (g.edges.length !== 1) return `${g.edges.length} seta(s)`
      if (g.edges[0].from !== a.id || g.edges[0].to !== b.id) return 'a seta saiu invertida'
      return null
    },
  },
  {
    // A ordem da mão é o único palpite quando não há cabeça desenhada — e por
    // isso a cabeça, quando existe, tem que ganhar dela.
    nome: 'a ponta de seta manda na direção, mesmo desenhada de trás pra frente',
    rodar() {
      const a = traco(retangulo(100, 100, 200, 90))
      const b = traco(retangulo(100, 300, 200, 90))
      // Desenhada de baixo pra cima, com a cabeça lá embaixo (apontando pra b).
      const s = traco(reta(200, 298, 200, 192))
      const cabeca = traco([
        ...reta(192, 290, 200, 300, 4),
        ...reta(200, 300, 208, 290, 4),
      ])
      const g = buildGraph([a, b, s, cabeca])
      if (g.edges.length !== 1) return `${g.edges.length} seta(s)`
      if (g.edges[0].direcao !== 'ponta') return 'não achou a ponta de seta'
      if (g.edges[0].from !== a.id || g.edges[0].to !== b.id) return 'a direção saiu errada'
      return null
    },
  },
  {
    nome: 'a letra de dentro vira o nome da caixa',
    rodar() {
      const a = traco(retangulo(100, 100, 220, 90))
      const b = traco(retangulo(100, 300, 220, 90))
      const texto = traco(palavra(140, 145))
      const s = traco(reta(210, 192, 210, 298))
      const g = buildGraph([a, b, texto, s])
      const caixa = g.nodes.find((x) => x.id === a.id)
      if (!caixa) return 'a caixa sumiu'
      return caixa.labelStrokeIds.includes(texto.id) ? null : 'a letra não ficou com a caixa'
    },
  },
  {
    nome: 'o "sim" ao lado da seta vira rótulo da seta',
    rodar() {
      const a = traco(retangulo(100, 100, 200, 90))
      const b = traco(retangulo(100, 320, 200, 90))
      const s = traco(reta(200, 192, 200, 318))
      const sim = traco(palavra(215, 250, 36))
      const g = buildGraph([a, b, s, sim])
      if (g.edges.length !== 1) return `${g.edges.length} seta(s)`
      return g.edges[0].labelStrokeIds.includes(sim.id) ? null : 'o rótulo não grudou na seta'
    },
  },
  {
    nome: 'caixa desenhada dentro de outra é letra, não caixa',
    rodar() {
      const fora = traco(retangulo(100, 100, 300, 160))
      const dentro = traco(elipse(170, 150, 50, 50))
      const outra = traco(retangulo(100, 350, 300, 100))
      const s = traco(reta(250, 262, 250, 348))
      const g = buildGraph([fora, dentro, outra, s])
      if (g.nodes.length !== 2) return `${g.nodes.length} caixa(s), esperava 2`
      const caixa = g.nodes.find((x) => x.id === fora.id)
      return caixa?.labelStrokeIds.includes(dentro.id) ? null : 'o "O" de dentro virou caixa'
    },
  },
  {
    nome: 'caixa sem seta e sem letra não entra no fluxograma',
    rodar() {
      const a = traco(retangulo(100, 100, 200, 90))
      const b = traco(retangulo(100, 300, 200, 90))
      const s = traco(reta(200, 192, 200, 298))
      const perdida = traco(retangulo(700, 700, 120, 80))
      const g = buildGraph([a, b, s, perdida])
      if (g.nodes.length !== 2) return `${g.nodes.length} caixa(s)`
      return g.soltos.includes(perdida.id) ? null : 'a caixa solta não foi reportada'
    },
  },
  {
    nome: 'seta que não encosta em nada não vira ligação',
    rodar() {
      const a = traco(retangulo(100, 100, 200, 90))
      const b = traco(retangulo(100, 300, 200, 90))
      const s = traco(reta(200, 192, 200, 298))
      const solta = traco(reta(600, 600, 700, 700))
      const g = buildGraph([a, b, s, solta])
      return g.edges.length === 1 ? null : `${g.edges.length} seta(s)`
    },
  },

  // ── Arranjo ───────────────────────────────────────────────────────────────
  {
    nome: 'cada caixa fica abaixo de TODAS que a alimentam',
    rodar() {
      // a → b → d, e a → c → d: d tem que cair no nível 2, não no 1.
      const g = {
        nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: i * 10, minY: 0, maxX: i * 10 + 5, maxY: 5 },
        })),
        edges: [
          { id: '1', from: 'a', to: 'b' },
          { id: '2', from: 'a', to: 'c' },
          { id: '3', from: 'b', to: 'd' },
          { id: '4', from: 'c', to: 'd' },
        ],
      }
      const n = levelize(g)
      if (n.get('a') !== 0) return `a no nível ${n.get('a')}`
      if (n.get('b') !== 1 || n.get('c') !== 1) return 'b e c deveriam estar no nível 1'
      if (n.get('d') !== 2) return `d no nível ${n.get('d')}, esperava 2`
      return null
    },
  },
  {
    nome: 'o retorno do processo é marcado, e não trava o arranjo',
    rodar() {
      const g = {
        nodes: ['a', 'b', 'c'].map((id, i) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: i * 10, minY: 0, maxX: i * 10 + 5, maxY: 5 },
        })),
        edges: [
          { id: '1', from: 'a', to: 'b' },
          { id: '2', from: 'b', to: 'c' },
          { id: '3', from: 'c', to: 'b' }, // "deu errado, refaz"
        ],
      }
      const volta = backEdges(g)
      if (!volta.has('3')) return 'a seta de retorno não foi marcada'
      if (volta.has('1') || volta.has('2')) return 'marcou de retorno o que vai pra frente'
      const n = levelize(g)
      if (n.get('a') !== 0 || n.get('b') !== 1 || n.get('c') !== 2) {
        return `níveis: a=${n.get('a')} b=${n.get('b')} c=${n.get('c')}`
      }
      return null
    },
  },
  {
    nome: 'a ordem da esquerda pra direita é a do desenho',
    rodar() {
      const g = {
        nodes: [
          { id: 'raiz', kind: 'decisao' as const, bounds: { minX: 100, minY: 0, maxX: 200, maxY: 50 } },
          // "não" foi desenhado à DIREITA, "sim" à esquerda.
          { id: 'nao', kind: 'acao' as const, bounds: { minX: 300, minY: 100, maxX: 400, maxY: 150 } },
          { id: 'sim', kind: 'acao' as const, bounds: { minX: 20, minY: 100, maxX: 120, maxY: 150 } },
        ],
        edges: [
          { id: '1', from: 'raiz', to: 'nao' },
          { id: '2', from: 'raiz', to: 'sim' },
        ],
      }
      const l = layout(g)
      const sim = l.nodes.find((x) => x.id === 'sim')!
      const nao = l.nodes.find((x) => x.id === 'nao')!
      return sim.x < nao.x ? null : 'o lado do sim e do não trocou'
    },
  },
  {
    nome: 'as caixas ficam em níveis, sem se sobrepor',
    rodar() {
      const g = {
        nodes: ['a', 'b', 'c'].map((id, i) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: 0, minY: i * 100, maxX: 50, maxY: i * 100 + 50 },
        })),
        edges: [
          { id: '1', from: 'a', to: 'b' },
          { id: '2', from: 'b', to: 'c' },
        ],
      }
      const l = layout(g)
      const [a, b, c] = ['a', 'b', 'c'].map((id) => l.nodes.find((x) => x.id === id)!)
      if (!(a.y + a.h < b.y)) return 'a e b se encostam'
      if (!(b.y + b.h < c.y)) return 'b e c se encostam'
      if (l.height < c.y + c.h) return 'o desenho sai pra fora da altura calculada'
      return null
    },
  },
  {
    nome: 'a seta reta desce da caixa de cima pra de baixo',
    rodar() {
      const g = {
        nodes: ['a', 'b'].map((id, i) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: 0, minY: i * 100, maxX: 50, maxY: i * 100 + 50 },
        })),
        edges: [{ id: '1', from: 'a', to: 'b' }],
      }
      const l = layout(g)
      const a = l.nodes.find((x) => x.id === 'a')!
      const seta = l.edges[0]
      if (seta.points.length < 2) return 'a seta saiu sem caminho'
      if (Math.abs(seta.points[0].y - (a.y + a.h)) > 1) return 'a seta não sai do pé da caixa'
      if (seta.points[0].y >= seta.points[seta.points.length - 1].y) return 'a seta não desce'
      return null
    },
  },
  {
    nome: 'a seta de retorno contorna por fora, sem cortar as caixas',
    rodar() {
      const g = {
        nodes: ['a', 'b'].map((id, i) => ({
          id,
          kind: 'acao' as const,
          bounds: { minX: 0, minY: i * 100, maxX: 50, maxY: i * 100 + 50 },
        })),
        edges: [
          { id: '1', from: 'a', to: 'b' },
          { id: '2', from: 'b', to: 'a' },
        ],
      }
      const l = layout(g)
      const volta = l.edges.find((e) => e.id === '2')!
      if (!volta.retorno) return 'não foi marcada como retorno'
      const caixas = l.nodes
      const corredor = volta.points[1].x
      const cortando = caixas.some((c) => corredor > c.x && corredor < c.x + c.w)
      return cortando ? 'o corredor do retorno passa por cima de uma caixa' : null
    },
  },
  {
    nome: 'desenho vazio não quebra o arranjo',
    rodar() {
      const l = layout({ nodes: [], edges: [] })
      if (l.nodes.length || l.edges.length) return 'apareceu coisa do nada'
      if (!(l.width > 0) || !(l.height > 0)) return 'tamanho inválido'
      return null
    },
  },
]

// ── O desenho de verdade ──────────────────────────────────────────────────

/**
 * O fluxograma que o usuário mandou, reconstruído da foto.
 *
 * Catorze caixas em cadeia, com a letra dentro, ligadas por ticks curtos, mais
 * o título escrito à mão e duas notas na margem. As medidas saíram da captura
 * de tela dele, convertidas pra px de página.
 *
 * Está aqui porque a primeira tentativa dele falhou e a leitura NÃO era a
 * culpada: o desenho passa dos 1754px de uma folha, e a versão antiga lia só a
 * tinta da zona de fluxograma — a divisão em zonas se repete a cada folha, e
 * as caixas de baixo caíam na faixa do topo da folha seguinte. Este caso
 * guarda os dois lados: a geometria dá conta de um desenho de gente, e um
 * fluxograma de verdade passa de uma folha.
 */
function desenhoDoUsuario(emPedacos = false): { strokes: FlowStroke[]; caixas: number } {
  const CAIXAS: [number, number, number, number][] = [
    [474, 395, 346, 119],
    [514, 596, 246, 134],
    [507, 797, 238, 97],
    [504, 954, 241, 47],
    [519, 1036, 204, 67],
    [504, 1155, 185, 67],
    [489, 1260, 312, 104],
    [492, 1409, 271, 82],
    [495, 1551, 262, 74],
    [495, 1670, 258, 90],
    [495, 1831, 224, 85],
    [492, 1961, 194, 82],
    [474, 2095, 205, 90],
    [465, 2207, 173, 59],
  ]

  const lista: FlowStroke[] = []
  for (const [x, y, w, h] of CAIXAS) {
    if (emPedacos) {
      // Como quase todo mundo desenha: dois "L" encaixados, com as pontas
      // perto mas sem se tocar.
      for (const lado of ladosEmL(x, y, w, h)) lista.push(traco(lado))
    } else {
      // A caixa fecha PERTO do começo, não exatamente — ninguém fecha exato.
      const volta = retangulo(x, y, w, h)
      volta[volta.length - 1] = { x: x + tremor(6), y: y + tremor(6) }
      lista.push(traco(volta))
    }
    lista.push(traco(palavra(x + 18, y + h * 0.4, Math.min(w - 36, 120))))
    if (h > 70) lista.push(traco(palavra(x + 18, y + h * 0.72, Math.min(w - 36, 100))))
  }
  for (let i = 0; i < CAIXAS.length - 1; i++) {
    const [x1, y1, w1, h1] = CAIXAS[i]
    const [x2, y2, w2] = CAIXAS[i + 1]
    lista.push(traco(reta(x1 + w1 / 2, y1 + h1, x2 + w2 / 2, y2)))
  }
  // O que não é fluxograma: o título e as notas da margem.
  lista.push(traco(palavra(390, 300, 240)))
  lista.push(traco(palavra(240, 420, 50)))
  lista.push(traco(reta(310, 420, 345, 425)))

  return { strokes: lista, caixas: CAIXAS.length }
}

/** Um retângulo feito em dois "L", com as pontas perto mas separadas. */
function ladosEmL(x: number, y: number, w: number, h: number) {
  const folga = 9
  const a = mao([
    { x: x + folga, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h - folga },
  ].flatMap((p, i, arr) => (i === arr.length - 1 ? [p] : interpolarReta(p, arr[i + 1]))))
  const b = mao([
    { x: x + w - folga, y: y + h },
    { x: x, y: y + h },
    { x: x, y: y + folga },
  ].flatMap((p, i, arr) => (i === arr.length - 1 ? [p] : interpolarReta(p, arr[i + 1]))))
  return [a, b]
}

function interpolarReta(a: { x: number; y: number }, b: { x: number; y: number }) {
  const pts: { x: number; y: number }[] = []
  for (let t = 0; t < 12; t++) {
    pts.push({ x: a.x + ((b.x - a.x) * t) / 12, y: a.y + ((b.y - a.y) * t) / 12 })
  }
  return pts
}

casos.push(
  {
    /*
     * A vista "Como eu li" mostrou: as ligações encontradas estavam todas
     * certas, mas quatro não eram encontradas — sempre as mais CURTAS, entre
     * caixas quase encostadas. Cada uma partia a corrente num pedaço novo, e
     * cada pedaço virava uma raiz a mais no desenho montado.
     */
    nome: 'o tiquinho entre duas caixas quase encostadas é uma seta',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 70))
      const b = traco(retangulo(100, 200, 300, 70)) // vão de 30px
      // O tiquinho que liga as duas: dezesseis píxeis, porque o vão tem trinta.
      const tique = traco(reta(250, 178, 250, 194))
      const g = buildGraph([a, b, tique])

      if (g.edges.length !== 1) return `${g.edges.length} setas, esperava 1`
      if (g.edges[0].from !== a.id || g.edges[0].to !== b.id) return 'ligou errado'
      return null
    },
  },
  {
    nome: 'mas um rabisco solto no meio do vão não é seta',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 70))
      const b = traco(retangulo(100, 400, 300, 70)) // vão de 230px
      // Um risquinho perdido no meio do caminho, longe de ligar as duas.
      const perdido = traco(reta(250, 250, 250, 266))
      const g = buildGraph([a, b, perdido])
      return g.edges.length === 0 ? null : `${g.edges.length} seta(s) do nada`
    },
  },
  {
    nome: 'e a seta que atravessa um vão grande continua valendo',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 70))
      const b = traco(retangulo(100, 400, 300, 70))
      const seta = traco(reta(250, 172, 250, 398))
      const g = buildGraph([a, b, seta])
      return g.edges.length === 1 ? null : `${g.edges.length} setas`
    },
  },
  {
    /*
     * O defeito mais caro de todos: de 13 setas, 11 "acharam ponta" num
     * desenho que quase não tinha ponta nenhuma. O que estava sendo pego era a
     * LETRA da caixa vizinha — pequena e perto da ponta do traço. E ponta
     * errada INVERTE a seta: meia dúzia de inversões vira a corrente numa
     * árvore de cinco raízes.
     */
    nome: 'letra perto da ponta do traço não inverte a seta',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 90))
      const b = traco(retangulo(100, 240, 300, 90))
      const seta = traco(reta(250, 192, 250, 238))
      /*
       * UMA letra da primeira linha da caixa de baixo, logo abaixo de onde a
       * seta chega. Pequena (uns 28px) e a menos de 30px da ponta — que é
       * exatamente o perfil que o leitor tomava por ponta de seta.
       */
      const letra = traco([
        ...reta(245, 250, 258, 250, 4),
        ...reta(258, 250, 251, 268, 4),
        ...reta(251, 268, 263, 268, 4),
      ])
      const g = buildGraph([a, b, seta, letra])

      if (g.edges.length !== 1) return `${g.edges.length} setas`
      if (g.edges[0].direcao === 'ponta') return 'a letra foi tomada por ponta de seta'
      if (g.edges[0].from !== a.id || g.edges[0].to !== b.id) return 'a seta saiu invertida'
      return null
    },
  },
  {
    nome: 'ponta de seta de verdade continua mandando na direção',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 90))
      const b = traco(retangulo(100, 240, 300, 90))
      // Desenhada de baixo pra cima, com o bico lá embaixo, no vão.
      const seta = traco(reta(250, 238, 250, 192))
      const bico = traco([...reta(240, 228, 250, 240, 4), ...reta(250, 240, 260, 228, 4)])
      const g = buildGraph([a, b, seta, bico])

      if (g.edges.length !== 1) return `${g.edges.length} setas`
      if (g.edges[0].direcao !== 'ponta') return 'não achou a ponta de verdade'
      if (g.edges[0].from !== a.id || g.edges[0].to !== b.id) return 'a direção saiu errada'
      return null
    },
  },
  {
    /*
     * O defeito que transformou a corrente do usuário numa árvore de cinco
     * raízes: caixas a 35px uma da outra, e a letra escrita rente à borda de
     * baixo tinha as duas pontas "em caixas diferentes". Treze setas saíram,
     * mas ligando o que ninguém ligou.
     */
    nome: 'letra rente à borda não vira seta entre caixas vizinhas',
    rodar() {
      const a = traco(retangulo(100, 100, 300, 90))
      const b = traco(retangulo(100, 225, 300, 90)) // 35px abaixo
      // Uma palavra escrita bem no pé da caixa de cima.
      const letra = traco(palavra(130, 180, 180))
      const seta = traco(reta(250, 192, 250, 223))
      const g = buildGraph([a, b, letra, seta])

      if (g.edges.length !== 1) {
        return `${g.edges.length} setas, esperava 1 (a letra virou seta)`
      }
      if (g.edges[0].strokeId !== seta.id) return 'a seta encontrada não é a seta'
      const caixaA = g.nodes.find((n) => n.id === a.id)
      return caixaA?.labelStrokeIds.includes(letra.id) ? null : 'a letra não ficou com a caixa'
    },
  },
  {
    nome: 'uma corrente de caixas sai como corrente, não como árvore',
    rodar() {
      const { strokes } = desenhoDoUsuario()
      const g = buildGraph(strokes)
      // Numa corrente só a primeira caixa não recebe seta.
      const recebe = new Set(g.edges.map((e) => e.to))
      const raizes = g.nodes.filter((n) => !recebe.has(n.id))
      if (raizes.length !== 1) return `${raizes.length} caixas sem seta chegando, esperava 1`
      const saem = new Set(g.edges.map((e) => e.from))
      const folhas = g.nodes.filter((n) => !saem.has(n.id))
      return folhas.length === 1 ? null : `${folhas.length} caixas sem seta saindo, esperava 1`
    },
  },
  {
    // ESTE é o caso que faltava. Quase ninguém desenha um retângulo sem
    // levantar a caneta, e um lado solto não é caixa nenhuma.
    nome: 'caixa desenhada em dois traços ainda é uma caixa',
    rodar() {
      const lados = ladosEmL(100, 100, 240, 110)
      if (classifyShape(lados[0]) || classifyShape(lados[1])) {
        return 'um "L" sozinho virou caixa'
      }
      const g = buildGraph([traco(lados[0]), traco(lados[1])])
      if (g.diagnostico.juntados !== 1) {
        return `juntou ${g.diagnostico.juntados} caixa(s) (fechados sozinhos: ${g.diagnostico.fechados})`
      }
      return null
    },
  },
  {
    nome: 'o desenho do usuário sai inteiro mesmo feito em dois traços por caixa',
    rodar() {
      const { strokes, caixas } = desenhoDoUsuario(true)
      const g = buildGraph(strokes)
      if (g.nodes.length !== caixas) {
        return `${g.nodes.length} caixas, esperava ${caixas} (juntadas: ${g.diagnostico.juntados})`
      }
      if (g.edges.length !== caixas - 1) return `${g.edges.length} setas, esperava ${caixas - 1}`
      return null
    },
  },
  {
    nome: 'juntar não faz palavras virarem caixa',
    rodar() {
      // Quatro palavras soltas, próximas, como num parágrafo.
      const texto = [
        traco(palavra(100, 100, 90)),
        traco(palavra(100, 130, 80)),
        traco(palavra(100, 160, 95)),
        traco(palavra(100, 190, 70)),
      ]
      const g = buildGraph(texto)
      return g.nodes.length === 0 ? null : `${g.nodes.length} palavra(s) viraram caixa`
    },
  },
  {
    nome: 'o diagnóstico conta o que a leitura viu',
    rodar() {
      const { strokes } = desenhoDoUsuario()
      const d = buildGraph(strokes).diagnostico
      if (d.tracos !== strokes.length) return `contou ${d.tracos} de ${strokes.length} traços`
      if (d.formas !== 14) return `${d.formas} formas`
      if (d.setas !== 13) return `${d.setas} setas`
      if (d.letra < 14) return `${d.letra} traços de letra`
      return null
    },
  },
  {
    nome: 'o desenho de verdade do usuário sai inteiro',
    rodar() {
      const { strokes, caixas } = desenhoDoUsuario()
      const g = buildGraph(strokes)
      if (g.nodes.length !== caixas) return `${g.nodes.length} caixas, esperava ${caixas}`
      if (g.edges.length !== caixas - 1) return `${g.edges.length} setas, esperava ${caixas - 1}`
      return null
    },
  },
  {
    nome: 'nele, toda caixa fica com a letra de dentro',
    rodar() {
      const { strokes } = desenhoDoUsuario()
      const g = buildGraph(strokes)
      const mudas = g.nodes.filter((n) => n.labelStrokeIds.length === 0)
      return mudas.length === 0 ? null : `${mudas.length} caixa(s) sem letra`
    },
  },
  {
    // É isto que a versão antiga não fazia: ela lia só a zona, e a zona se
    // repete a cada folha.
    nome: 'ele passa de uma folha, e isso não atrapalha a leitura',
    rodar() {
      const { strokes } = desenhoDoUsuario()
      const g = buildGraph(strokes)
      const fundo = Math.max(
        ...g.nodes.map((n) => n.bounds.maxY),
      )
      if (fundo <= 1754) return `o desenho de teste nem passa de uma folha (${Math.round(fundo)}px)`
      const abaixo = g.nodes.filter((n) => n.bounds.minY > 1754)
      return abaixo.length >= 2 ? null : 'nenhuma caixa caiu na segunda folha'
    },
  },
  {
    nome: 'o título e as notas da margem ficam de fora, e são contados',
    rodar() {
      const { strokes } = desenhoDoUsuario()
      const g = buildGraph(strokes)
      return g.soltos.length === 3 ? null : `${g.soltos.length} soltos, esperava 3`
    },
  },
)

// ── Remontar sem perder o que foi editado ─────────────────────────────────

/** Um fluxograma como o painel deixa depois de o usuário mexer nele. */
function editado(): Flowchart {
  return {
    id: 'ch',
    pageId: 'pg',
    soltos: 0,
    updatedAt: 1,
    nodes: [
      {
        id: 'a',
        kind: 'decisao',
        label: 'Nome que eu corrigi',
        editado: true,
        cor: 'verde',
        pos: { x: 500, y: 40 },
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      },
      {
        id: 'minha',
        kind: 'acao',
        label: 'Caixa que eu criei',
        criadaAMao: true,
        editado: true,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      },
    ],
    edges: [
      { id: 'minhaLigacao', from: 'a', to: 'minha', label: 'sim', direcao: 'mao', criadaAMao: true },
    ],
  }
}

/** O que a leitura devolveria de uma folha onde só existe a caixa "a". */
function leituraDe(ids: string[]): ReturnType<typeof buildGraph> {
  return {
    nodes: ids.map((id) => ({
      id,
      kind: 'acao' as const,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      shapeStrokeIds: [id],
      labelStrokeIds: [],
    })),
    edges: [],
    soltos: [],
    diagnostico: { tracos: 0, fechados: 0, juntados: 0, formas: 0, setas: 0, letra: 0, soltos: 0 },
  }
}

casos.push(
  {
    nome: 'remontar não apaga a caixa que o usuário criou no painel',
    rodar() {
      const r = mergeFlowchart(editado(), leituraDe(['a']))
      return r.nodes.some((n) => n.id === 'minha') ? null : 'a caixa criada à mão sumiu'
    },
  },
  {
    nome: 'remontar não apaga a ligação que ele fez à mão',
    rodar() {
      const r = mergeFlowchart(editado(), leituraDe(['a']))
      const minha = r.edges.find((e) => e.id === 'minhaLigacao')
      if (!minha) return 'a ligação feita à mão sumiu'
      return minha.label === 'sim' ? null : 'o nome da ligação se perdeu'
    },
  },
  {
    nome: 'remontar guarda nome, forma, posição e cor que ele escolheu',
    rodar() {
      const r = mergeFlowchart(editado(), leituraDe(['a']))
      const a = r.nodes.find((n) => n.id === 'a')
      if (!a) return 'a caixa sumiu'
      if (a.label !== 'Nome que eu corrigi') return 'o nome voltou ao da leitura'
      if (a.kind !== 'decisao') return 'a forma voltou à da leitura'
      if (a.pos?.x !== 500) return 'a posição arrastada se perdeu'
      if (a.cor !== 'verde') return 'a cor escolhida se perdeu'
      return null
    },
  },
  {
    // O outro lado da moeda: o que a tinta diz continua mandando no que o
    // usuário NÃO tocou, senão o fluxograma congela e para de acompanhar a folha.
    nome: 'mas a caixa que sumiu do desenho sai do fluxograma',
    rodar() {
      const antes = editado()
      const r = mergeFlowchart(antes, leituraDe([]))
      if (r.nodes.some((n) => n.id === 'a')) return 'a caixa apagada do desenho ficou'
      // E a ligação dela, que perdeu uma ponta, vai junto.
      return r.edges.length === 0 ? null : 'sobrou ligação sem as duas pontas'
    },
  },
  {
    nome: 'e a caixa nova no desenho entra',
    rodar() {
      const r = mergeFlowchart(editado(), leituraDe(['a', 'nova']))
      return r.nodes.some((n) => n.id === 'nova') ? null : 'a caixa nova não entrou'
    },
  },
  {
    nome: 'direção invertida à mão vence a leitura na remontagem',
    rodar() {
      const antes: Flowchart = {
        ...editado(),
        edges: [{ id: 'e1', from: 'b', to: 'a', label: '', direcao: 'mao' }],
      }
      const grafo = leituraDe(['a', 'b'])
      grafo.edges = [
        { id: 'e1', from: 'a', to: 'b', strokeId: 'e1', labelStrokeIds: [], direcao: 'ordem' },
      ]
      const r = mergeFlowchart(antes, grafo)
      const e = r.edges.find((x) => x.id === 'e1')
      return e?.from === 'b' && e?.to === 'a' ? null : 'a inversão feita à mão foi desfeita'
    },
  },
)

// ── Voltar e avançar no painel ────────────────────────────────────────────

/** O mesmo fluxograma com uma caixa movida pra outro lugar. */
function movido(base: Flowchart, x: number): Flowchart {
  return {
    ...base,
    updatedAt: base.updatedAt + 1,
    nodes: base.nodes.map((n) => (n.id === 'a' ? { ...n, pos: { x, y: 40 } } : n)),
  }
}

casos.push(
  {
    nome: 'voltar devolve o fluxograma como estava antes do passo',
    rodar() {
      const antes = editado()
      const depois = movido(antes, 900)
      const pilha = pushUndo(SEM_HISTORIA, antes)
      const passo = undoFlow(pilha, depois)
      if (!passo) return 'não havia o que voltar'
      return passo.chart.nodes.find((n) => n.id === 'a')?.pos?.x === 500
        ? null
        : 'a caixa não voltou pro lugar de antes'
    },
  },
  {
    nome: 'e avançar refaz o que o voltar desfez',
    rodar() {
      const antes = editado()
      const depois = movido(antes, 900)
      const voltou = undoFlow(pushUndo(SEM_HISTORIA, antes), depois)
      if (!voltou) return 'não havia o que voltar'
      const refez = redoFlow(voltou.history, voltou.chart)
      if (!refez) return 'não havia o que avançar'
      return refez.chart.nodes.find((n) => n.id === 'a')?.pos?.x === 900
        ? null
        : 'o avançar não trouxe de volta a posição nova'
    },
  },
  {
    /*
     * A armadilha que fez esta pilha existir do jeito que está: tocar em "azul"
     * numa caixa que já era azul não pode gastar um passo. Se gastasse, o ↶
     * seguinte piscaria sem mexer na tela, e quem olha conclui que o desfazer
     * não funciona — justamente quando ele mais importa.
     */
    nome: 'edição que não muda nada não vira passo',
    rodar() {
      const a = editado()
      const igual: Flowchart = { ...a, updatedAt: a.updatedAt + 50 }
      if (mudouFlow(a, igual)) return 'só o relógio mudou e contou como mudança'
      // E o contrário: mudança de verdade tem que contar.
      return mudouFlow(a, movido(a, 900)) ? null : 'mover a caixa não contou como mudança'
    },
  },
  {
    // Trocar de página troca de fluxograma: aplicar aqui a fotografia de outro
    // desenho substituiria o que está aberto por algo que nunca esteve nele.
    nome: 'a pilha de outro fluxograma não vale pra este',
    rodar() {
      const outro: Flowchart = { ...editado(), id: 'outro' }
      const pilha = pushUndo(SEM_HISTORIA, outro)
      return undoFlow(pilha, editado()) === null ? null : 'voltou usando a pilha do outro desenho'
    },
  },
  {
    nome: 'a pilha para de crescer no limite',
    rodar() {
      let pilha = SEM_HISTORIA
      for (let i = 0; i < MAX_PASSOS + 15; i++) pilha = pushUndo(pilha, movido(editado(), i))
      if (pilha.feitos.length !== MAX_PASSOS) return `guardou ${pilha.feitos.length} passos`
      // O que cai é o mais ANTIGO: o passo de agora precisa estar lá.
      const topo = pilha.feitos[pilha.feitos.length - 1]
      return topo.nodes.find((n) => n.id === 'a')?.pos?.x === MAX_PASSOS + 14
        ? null
        : 'o passo mais recente se perdeu'
    },
  },
  {
    nome: 'fazer algo depois de voltar apaga o avançar',
    rodar() {
      const antes = editado()
      const voltou = undoFlow(pushUndo(SEM_HISTORIA, antes), movido(antes, 900))
      if (!voltou) return 'não havia o que voltar'
      if (voltou.history.desfeitos.length !== 1) return 'o avançar não ficou guardado'
      const depois = pushUndo(voltou.history, voltou.chart)
      return depois.desfeitos.length === 0 ? null : 'o avançar sobreviveu a um passo novo'
    },
  },
  {
    nome: 'o passo se nomeia sozinho pela comparação',
    rodar() {
      const a = editado()
      if (rotuloFlow(a, movido(a, 900)) !== 'caixa movida') return 'mover não virou "caixa movida"'
      const semPos: Flowchart = { ...a, nodes: a.nodes.map(({ pos: _f, ...r }) => r) }
      if (rotuloFlow(a, semPos) !== 'arrumar') return 'arrumar não foi reconhecido'
      const comCor: Flowchart = {
        ...a,
        nodes: a.nodes.map((n) => (n.id === 'a' ? { ...n, cor: 'roxo' as const } : n)),
      }
      if (rotuloFlow(a, comCor) !== 'cor') return 'trocar a cor não virou "cor"'
      const semSeta: Flowchart = { ...a, edges: [] }
      return rotuloFlow(a, semSeta) === 'ligação tirada' ? null : 'tirar a seta não foi reconhecido'
    },
  },
)

console.log('\n  Fluxograma — do rabisco ao desenho estruturado\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(56)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log(falhas ? `\n  ${falhas} caso(s) fora do esperado\n` : '\n  todos os casos passaram\n')
process.exit(falhas ? 1 : 0)
