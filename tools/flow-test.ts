import { classifyShape, countCorners, isClosedPath, polygonArea } from '../src/flow/shapes'
import { buildGraph } from '../src/flow/graph'
import type { FlowStroke } from '../src/flow/graph'
import { backEdges, layout, levelize } from '../src/flow/layout'

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
