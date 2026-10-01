import type { Bounds, Id, Stroke } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { boundsContain, boundsOf, dist, padBounds, pathLength, pointToSegment } from '../lib/geometry'
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

/**
 * Quão perto duas pontas precisam estar pra serem o mesmo canto.
 *
 * Quase ninguém desenha um retângulo sem levantar a caneta: o normal é dois
 * "L" encaixados, ou quatro lados soltos. Cada lado vira um traço ABERTO, e
 * nenhum deles sozinho é caixa nenhuma — foi o que fez o desenho de verdade
 * do usuário não devolver uma caixa sequer.
 */
const JOIN_GAP = 30

/** Traço mais curto que isto não entra na junção: é letra, não lado de caixa. */
const JOIN_MIN_LENGTH = 34

/** Quantos traços no máximo formam uma caixa. Quatro lados, com folga. */
const MAX_JOIN_PARTS = 6

export interface FlowNode {
  id: Id
  kind: ShapeKind
  /** Onde a caixa foi desenhada, na folha. */
  bounds: Bounds
  /** Os traços que desenham a caixa — um só, ou os lados feitos em separado. */
  shapeStrokeIds: Id[]
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
  /**
   * O que a leitura viu, passo a passo.
   *
   * Existe porque "não achei caixa nenhuma" é um beco: não dá pra saber se o
   * problema foi a caixa não fechar, a seta não encostar ou a tinta nem ter
   * chegado. Com estes números, uma foto da tela basta pra saber onde parou.
   */
  diagnostico: {
    tracos: number
    /** Traços que já fechavam sozinhos. */
    fechados: number
    /** Caixas montadas juntando lados soltos. */
    juntados: number
    formas: number
    setas: number
    letra: number
    soltos: number
  }
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

  // 1. Caixas feitas de um traço só.
  const nodes: FlowNode[] = []
  for (const s of strokes) {
    const forma = classifyShape(s.points)
    if (!forma) continue
    nodes.push({
      id: s.id,
      kind: forma.kind,
      bounds: forma.bounds,
      shapeStrokeIds: [s.id],
      labelStrokeIds: [],
    })
    usados.add(s.id)
  }
  const fechadosSozinhos = nodes.length

  // 1b. Caixas feitas de VÁRIOS traços — dois "L", quatro lados soltos.
  for (const cadeia of chainOpenStrokes(strokes.filter((s) => !usados.has(s.id)))) {
    const forma = classifyShape(cadeia.points)
    if (!forma) continue
    nodes.push({
      id: cadeia.ids[0],
      kind: forma.kind,
      bounds: forma.bounds,
      shapeStrokeIds: cadeia.ids,
      labelStrokeIds: [],
    })
    for (const id of cadeia.ids) usados.add(id)
  }
  const juntados = nodes.length - fechadosSozinhos

  // Caixa dentro de caixa é quase sempre a letra lida como forma (um "O"
  // grande, um balão). A de dentro vira letra da de fora.
  const aninhadas = new Set<Id>()
  for (const dentro of nodes) {
    for (const fora of nodes) {
      if (dentro === fora) continue
      if (boundsContain(fora.bounds, dentro.bounds)) {
        aninhadas.add(dentro.id)
        for (const id of dentro.shapeStrokeIds) fora.labelStrokeIds.push(id)
        break
      }
    }
  }
  const caixas = nodes.filter((n) => !aninhadas.has(n.id))

  const dentroDeCaixa = new Set<Id>()
  for (const n of caixas) for (const id of n.shapeStrokeIds) dentroDeCaixa.add(id)
  const abertos = strokes.filter(
    (s) => !usados.has(s.id) && !dentroDeCaixa.has(s.id) && !isClosedPath(s.points),
  )

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
    if (!finais.includes(fora)) soltos.push(...fora.shapeStrokeIds)
  }

  const vivos = new Set(finais.map((n) => n.id))
  const setas = edges.filter((e) => vivos.has(e.from) && vivos.has(e.to))
  const letra = finais.reduce((t, n) => t + n.labelStrokeIds.length, 0)

  return {
    nodes: finais,
    edges: setas,
    soltos,
    diagnostico: {
      tracos: strokes.length,
      fechados: fechadosSozinhos,
      juntados,
      formas: finais.length,
      setas: setas.length,
      letra,
      soltos: soltos.length,
    },
  }
}

/**
 * Junta traços abertos que, encostados ponta a ponta, fecham uma figura.
 *
 * **Quase ninguém desenha um retângulo sem levantar a caneta.** O normal é
 * dois "L" encaixados, ou os quatro lados soltos. Cada lado vira um traço
 * aberto, e nenhum deles sozinho é caixa nenhuma — por isso um fluxograma
 * inteiro podia não devolver uma única caixa.
 *
 * A junção é gulosa e por ponta: pega um traço, procura outro cuja ponta
 * encoste na dele (invertendo se for preciso), e continua até não achar mais.
 * Só entram traços COMPRIDOS: letra é curta, e deixá-la entrar faria palavras
 * virarem caixas.
 */
export function chainOpenStrokes(
  strokes: readonly FlowStroke[],
): { ids: Id[]; points: Pt[] }[] {
  const candidatos = strokes.filter(
    (s) => s.points.length >= 2 && pathLength(s.points) >= JOIN_MIN_LENGTH,
  )
  const sobrando = new Map(candidatos.map((s) => [s.id, s]))
  const cadeias: { ids: Id[]; points: Pt[] }[] = []

  const fecha = (pontos: Pt[]) =>
    pontos.length > 2 && dist(pontos[0], pontos[pontos.length - 1]) <= JOIN_GAP

  for (const inicial of candidatos) {
    if (!sobrando.has(inicial.id)) continue

    const ids = [inicial.id]
    let pontos = [...inicial.points]
    const pegos = new Set<Id>([inicial.id])
    let virou = false

    // Um retângulo tem quatro lados; mais que isso é a junção se perdendo.
    while (ids.length < MAX_JOIN_PARTS && !fecha(pontos)) {
      const ponta = pontos[pontos.length - 1]

      // O MENOR vão ganha: o lado seguinte da caixa encosta de perto, e a
      // letra de dentro, que às vezes também está perto, encosta de longe.
      let melhor: { id: Id; trecho: readonly Pt[]; vao: number } | null = null
      for (const [id, outro] of sobrando) {
        if (pegos.has(id)) continue
        const inicio = outro.points[0]
        const fim = outro.points[outro.points.length - 1]
        const dInicio = dist(ponta, inicio)
        const dFim = dist(ponta, fim)
        const vao = Math.min(dInicio, dFim)
        if (vao > JOIN_GAP) continue
        if (melhor && vao >= melhor.vao) continue
        melhor = { id, trecho: dInicio <= dFim ? outro.points : [...outro.points].reverse(), vao }
      }

      if (melhor) {
        pontos = [...pontos, ...melhor.trecho]
        ids.push(melhor.id)
        pegos.add(melhor.id)
        continue
      }

      // Nada desta ponta: vira a cadeia e tenta pela outra, uma vez só.
      if (virou) break
      virou = true
      pontos.reverse()
    }

    /*
     * Só vale se FECHOU. Cadeia aberta é devolvida inteira, sem consumir
     * traço nenhum — senão uma tentativa frustrada comeria os lados de uma
     * caixa que daria certo logo adiante.
     */
    if (ids.length >= 2 && fecha(pontos)) {
      for (const id of ids) sobrando.delete(id)
      cadeias.push({ ids, points: pontos })
    }
  }

  return cadeias
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
