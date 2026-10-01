import type { Bounds, Id, Stroke } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { boundsContain, boundsOf, dist, padBounds, pointToSegment } from '../lib/geometry'
import { classifyShape, isClosedPath } from './shapes'
import type { ShapeKind } from './shapes'

/**
 * De traços soltos a um fluxograma.
 *
 * Esta é a parte que lê o desenho. Entra a tinta que o usuário fez dentro da
 * zona de fluxograma; sai um grafo: caixas, o que liga cada uma, e que letra
 * pertence a quem.
 *
 * ## A ordem das perguntas
 *
 * 1. **Caixas primeiro.** Todo traço fechado vira uma caixa. É o único passo
 *    que não depende de nada, e tudo depois se apoia nele
 * 2. **Setas.** Traço aberto cujas duas pontas encostam em caixas DIFERENTES
 * 3. **Pontas de seta.** Traço pequeno largado perto do fim de uma seta é a
 *    cabeça dela — e é ela que diz PRA ONDE a seta aponta
 * 4. **Letra.** O que sobrou: dentro de uma caixa é o nome dela, perto de uma
 *    seta é o rótulo dela ("sim", "não"), e solto é só anotação
 *
 * ## O que este módulo NÃO decide
 *
 * O texto. Aqui só se diz *quais traços* formam o nome de cada caixa; quem lê
 * a letra é o reconhecedor do Android (`ocr/handwriting.ts`). No navegador as
 * caixas saem sem nome e o usuário escreve no painel — mesmo caminho da
 * transcrição da folha.
 *
 * Módulo puro: não conhece React nem banco. Verificado em `tools/flow-test.ts`.
 */

// ─── Medidas da leitura (px de página) ───────────────────────────────────────

/** Folga pra considerar que a ponta da seta "encostou" na caixa. */
const SNAP = 34

/** Traço menor que isto, perto do fim de uma seta, é ponta de seta. */
const ARROWHEAD_SIZE = 46

/** Quão perto a ponta de seta precisa estar do fim da seta. */
const ARROWHEAD_NEAR = 30

/** Distância máxima entre a letra e a seta pra ela ser rótulo daquela seta. */
const EDGE_LABEL_NEAR = 60

export interface FlowNode {
  id: Id
  kind: ShapeKind
  /** Onde a caixa foi desenhada, na folha. */
  bounds: Bounds
  /** O traço que desenha a caixa. */
  shapeStrokeId: Id
  /** Os traços da letra de dentro — o nome da caixa, antes de ser lido. */
  labelStrokeIds: Id[]
}

export interface FlowEdge {
  id: Id
  from: Id
  to: Id
  strokeId: Id
  labelStrokeIds: Id[]
  /**
   * A direção veio da ponta de seta desenhada, ou da ordem em que a mão fez o
   * traço? Interessa porque só a primeira é certeza — e o painel avisa.
   */
  direcao: 'ponta' | 'ordem'
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Traços que não entraram em nada; o painel diz quantos foram. */
  soltos: Id[]
}

/** Só o necessário de um traço, pra este módulo não depender do resto. */
export interface FlowStroke {
  id: Id
  points: readonly Pt[]
}

export function toFlowStrokes(strokes: readonly Stroke[]): FlowStroke[] {
  return strokes.map((s) => ({ id: s.id, points: s.points }))
}

/**
 * Lê o desenho e devolve o fluxograma.
 *
 * `dentro` limita o que é considerado: só a tinta da zona de fluxograma entra,
 * senão a anotação do lado viraria caixa.
 */
export function buildGraph(strokes: readonly FlowStroke[]): FlowGraph {
  const usados = new Set<Id>()

  // 1. Caixas.
  const nodes: FlowNode[] = []
  for (const s of strokes) {
    const forma = classifyShape(s.points)
    if (!forma) continue
    nodes.push({
      id: s.id,
      kind: forma.kind,
      bounds: forma.bounds,
      shapeStrokeId: s.id,
      labelStrokeIds: [],
    })
    usados.add(s.id)
  }

  // Caixa dentro de caixa é quase sempre a letra lida como forma (um "O"
  // grande, um balão). A de dentro vira letra da de fora.
  const aninhadas = new Set<Id>()
  for (const dentro of nodes) {
    for (const fora of nodes) {
      if (dentro === fora) continue
      if (boundsContain(fora.bounds, dentro.bounds)) {
        aninhadas.add(dentro.id)
        fora.labelStrokeIds.push(dentro.shapeStrokeId)
        break
      }
    }
  }
  const caixas = nodes.filter((n) => !aninhadas.has(n.id))

  const abertos = strokes.filter((s) => !usados.has(s.id) && !isClosedPath(s.points))

  // 2. Setas: traço aberto com as duas pontas em caixas diferentes.
  const edges: FlowEdge[] = []
  const ligacoes = new Set<Id>()
  for (const s of abertos) {
    if (s.points.length < 2) continue
    const origem = caixaEm(caixas, s.points[0])
    const destino = caixaEm(caixas, s.points[s.points.length - 1])
    if (!origem || !destino || origem.id === destino.id) continue
    edges.push({
      id: s.id,
      from: origem.id,
      to: destino.id,
      strokeId: s.id,
      labelStrokeIds: [],
      direcao: 'ordem',
    })
    ligacoes.add(s.id)
    usados.add(s.id)
  }

  const sobrando = strokes.filter((s) => !usados.has(s.id))

  // 3. Pontas de seta — e é delas que vem a direção de verdade.
  const pontas = new Set<Id>()
  for (const s of sobrando) {
    const b = boundsOf(s.points)
    const tamanho = Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
    if (tamanho > ARROWHEAD_SIZE) continue
    const centro = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }

    for (const e of edges) {
      const traco = strokes.find((t) => t.id === e.strokeId)
      if (!traco) continue
      const comeco = traco.points[0]
      const fim = traco.points[traco.points.length - 1]
      const dComeco = dist(centro, comeco)
      const dFim = dist(centro, fim)
      if (Math.min(dComeco, dFim) > ARROWHEAD_NEAR) continue

      // A cabeça está no começo do traço? Então a seta foi desenhada de trás
      // pra frente, e quem manda é a cabeça.
      if (dComeco < dFim) {
        const troca = e.from
        e.from = e.to
        e.to = troca
      }
      e.direcao = 'ponta'
      pontas.add(s.id)
      usados.add(s.id)
      break
    }
  }

  // 4. Letra.
  const soltos: Id[] = []
  for (const s of strokes) {
    if (usados.has(s.id) || aninhadas.has(s.id) || pontas.has(s.id)) continue
    const b = boundsOf(s.points)
    const centro = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }

    const caixa = caixaContendo(caixas, centro)
    if (caixa) {
      caixa.labelStrokeIds.push(s.id)
      continue
    }

    const seta = setaMaisPerto(edges, strokes, centro)
    if (seta) {
      seta.labelStrokeIds.push(s.id)
      continue
    }

    soltos.push(s.id)
  }

  // Caixa sem ligação nenhuma e sem letra é quase sempre um engano de leitura.
  const ligada = new Set<Id>()
  for (const e of edges) {
    ligada.add(e.from)
    ligada.add(e.to)
  }
  const finais = caixas.filter((n) => ligada.has(n.id) || n.labelStrokeIds.length > 0)
  for (const fora of caixas) {
    if (!finais.includes(fora)) soltos.push(fora.shapeStrokeId)
  }

  const vivos = new Set(finais.map((n) => n.id))
  return {
    nodes: finais,
    edges: edges.filter((e) => vivos.has(e.from) && vivos.has(e.to)),
    soltos,
  }
}

/** A caixa em que este ponto encosta (dentro, ou a menos de `SNAP` da borda). */
function caixaEm(caixas: readonly FlowNode[], p: Pt): FlowNode | null {
  let melhor: FlowNode | null = null
  let menor = Infinity
  for (const c of caixas) {
    if (!boundsContain(padBounds(c.bounds, SNAP), { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })) {
      continue
    }
    const cx = (c.bounds.minX + c.bounds.maxX) / 2
    const cy = (c.bounds.minY + c.bounds.maxY) / 2
    const d = Math.hypot(p.x - cx, p.y - cy)
    if (d < menor) {
      menor = d
      melhor = c
    }
  }
  return melhor
}

/** A caixa que contém este ponto — a MENOR delas, se houver mais de uma. */
function caixaContendo(caixas: readonly FlowNode[], p: Pt): FlowNode | null {
  let melhor: FlowNode | null = null
  let menorArea = Infinity
  for (const c of caixas) {
    if (p.x < c.bounds.minX || p.x > c.bounds.maxX) continue
    if (p.y < c.bounds.minY || p.y > c.bounds.maxY) continue
    const area = (c.bounds.maxX - c.bounds.minX) * (c.bounds.maxY - c.bounds.minY)
    if (area < menorArea) {
      menorArea = area
      melhor = c
    }
  }
  return melhor
}

/** A seta mais próxima deste ponto, se estiver perto o bastante pra ser rótulo. */
function setaMaisPerto(
  edges: readonly FlowEdge[],
  strokes: readonly FlowStroke[],
  p: Pt,
): FlowEdge | null {
  let melhor: FlowEdge | null = null
  let menor = EDGE_LABEL_NEAR
  for (const e of edges) {
    const traco = strokes.find((t) => t.id === e.strokeId)
    if (!traco) continue
    for (let i = 1; i < traco.points.length; i++) {
      const d = pointToSegment(p, traco.points[i - 1], traco.points[i])
      if (d < menor) {
        menor = d
        melhor = e
      }
    }
  }
  return melhor
}
