import type { InkPoint } from '../domain/types'
import { boundsOf, dist, pathLength, segmentsIntersect, simplify } from '../lib/geometry'

/**
 * Detecção de rabisco-para-apagar.
 *
 * A caneta do usuário não tem botão de borracha. Em vez de trocar de ferramenta,
 * ele rabisca por cima do que quer apagar — três voltas, ou um vaivém — e o
 * traço do rabisco vira o comando de apagar em vez de virar tinta.
 *
 * O QUE SEPARA UM RABISCO DA ESCRITA
 *
 * Uma coisa só, e ela é decisiva: **escrever avança, rabiscar volta**. A escrita
 * caminha pela linha e quase nunca retrocede; o rabisco vai e volta por cima do
 * mesmo lugar. É o que `countAxisReversals` mede.
 *
 * POR QUE NÃO SE USA AUTO-CRUZAMENTO
 *
 * Contar quantas vezes o traço cruza a si mesmo parece o sinal óbvio, e é uma
 * armadilha: letra cursiva fecha um laço em quase toda letra — g, ç, o, e, l —
 * e cada laço é um cruzamento. Uma palavra cursiva de seis letras produz cinco
 * ou mais cruzamentos, o mesmo que três voltas rabiscadas. Isso ligava a
 * borracha no meio da escrita do usuário.
 *
 * A densidade também não separa: a mesma cursiva com laços dá densidade 3,2,
 * MAIOR que a de rabiscos legítimos. Ela continua aqui só como filtro barato
 * pra descartar traço retilíneo antes das contas caras — nunca como prova.
 *
 * Os números medidos, que sustentam a escolha:
 *
 *   escrita  (cursiva, cursiva com laços, assinatura, linha)  inversões: 0 a 1
 *   rabisco  (3/4/5 voltas, vaivém de 6 e 8 passadas)         inversões: 5 a 9
 *
 * A separação é larga e não depende de calibrar nada fino. O auto-cruzamento
 * segue calculado apenas para diagnóstico no teste.
 */

export const SCRIBBLE = {
  /**
   * O único gatilho: quantas vezes o traço vai e volta ao longo do próprio eixo.
   * Em 5, escrita cursiva (0 a 1) fica bem longe do limiar e duas voltas
   * fechadas (3) ainda contam como escrita.
   */
  minAxisReversals: 5,
  /**
   * Filtro barato, não prova. Só evita rodar as contas caras num traço
   * retilíneo. Não serve pra separar rabisco de cursiva — ver o cabeçalho.
   */
  minDensity: 2.2,
  /** Abaixo deste comprimento (px de página) é toque ou pingo, nunca rabisco. */
  minPathLength: 60,
  /** Um rabisco é compacto. Acima disso é um traço longo de escrita. */
  maxDiagonal: 900,
  /** Tolerância da simplificação antes das análises caras. */
  simplifyTolerance: 2.5,
  /** Teto de pontos analisados, pra manter o custo previsível. */
  maxAnalyzedPoints: 160,
  /** Raio (px de página) em volta do rabisco que ainda conta como "rabiscado por cima". */
  hitRadius: 8,
} as const

export interface ScribbleAnalysis {
  isScribble: boolean
  selfIntersections: number
  axisReversals: number
  density: number
  length: number
  diagonal: number
}

/**
 * O traço recém-terminado é um rabisco de apagar?
 * Roda no fim do traço (pointerup), não durante — o desenho não engasga e a
 * decisão sai com o traço inteiro na mão.
 */
export function analyzeScribble(points: readonly InkPoint[]): ScribbleAnalysis {
  const fail = (extra: Partial<ScribbleAnalysis> = {}): ScribbleAnalysis => ({
    isScribble: false,
    selfIntersections: 0,
    axisReversals: 0,
    density: 0,
    length: 0,
    diagonal: 0,
    ...extra,
  })

  if (points.length < 8) return fail()

  const length = pathLength(points)
  if (length < SCRIBBLE.minPathLength) return fail({ length })

  const b = boundsOf(points)
  const diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
  if (diagonal < 1) return fail({ length, diagonal })
  if (diagonal > SCRIBBLE.maxDiagonal) return fail({ length, diagonal })

  const density = length / diagonal
  if (density < SCRIBBLE.minDensity) return fail({ length, diagonal, density })

  const sample = downsample(simplify(points, SCRIBBLE.simplifyTolerance), SCRIBBLE.maxAnalyzedPoints)
  const axisReversals = countAxisReversals(sample)

  // Cruzamentos entram só no relatório: são enganosos como prova (ver cabeçalho).
  const selfIntersections = countSelfIntersections(sample)

  return {
    isScribble: axisReversals >= SCRIBBLE.minAxisReversals,
    selfIntersections,
    axisReversals,
    density,
    length,
    diagonal,
  }
}

/**
 * Quantas vezes o traço cruza a si mesmo.
 * Segmentos vizinhos são ignorados — eles se encostam pela ponta por construção.
 */
function countSelfIntersections(pts: readonly InkPoint[]): number {
  let count = 0
  for (let i = 1; i < pts.length; i++) {
    for (let j = i + 2; j < pts.length; j++) {
      if (segmentsIntersect(pts[i - 1], pts[i], pts[j - 1], pts[j])) count++
    }
  }
  return count
}

/**
 * Quantas vezes o traço vai e volta ao longo do seu eixo principal.
 *
 * Comparar o ângulo entre segmentos vizinhos não serve: no rabisco em vaivém a
 * virada de 180° vem acompanhada de um degrau lateral, que a parte em duas
 * curvas de 90° e some da contagem.
 *
 * O que funciona é olhar o traço de cima: acha-se a direção em que ele mais se
 * espalha e projeta-se tudo nela. Escrever avança nessa direção quase sempre
 * pra frente; rabiscar é ir e voltar por ela várias vezes. Contam-se as
 * inversões, exigindo que cada uma tenha amplitude relevante — assim tremor de
 * mão não vira inversão.
 */
function countAxisReversals(pts: readonly InkPoint[]): number {
  const n = pts.length
  if (n < 4) return 0

  // Centro do traço.
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p.x
    my += p.y
  }
  mx /= n
  my /= n

  // Matriz de covariância — descreve como o traço se espalha.
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of pts) {
    const dx = p.x - mx
    const dy = p.y - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  sxx /= n
  sxy /= n
  syy /= n

  // Autovetor do maior autovalor: a direção de maior espalhamento.
  const trace = sxx + syy
  const det = sxx * syy - sxy * sxy
  const lambda = trace / 2 + Math.sqrt(Math.max(0, (trace * trace) / 4 - det))

  let ax = sxy
  let ay = lambda - sxx
  const axisLen = Math.hypot(ax, ay)
  if (axisLen < 1e-6) {
    ax = 1
    ay = 0
  } else {
    ax /= axisLen
    ay /= axisLen
  }

  // Projeção de cada ponto no eixo.
  const proj = pts.map((p) => (p.x - mx) * ax + (p.y - my) * ay)
  let min = Infinity
  let max = -Infinity
  for (const v of proj) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range < 1) return 0

  // Uma inversão só conta se a volta tiver esta amplitude.
  const prominence = range * 0.25

  let count = 0
  let direction: 0 | 1 | -1 = 0
  let anchor = proj[0]

  for (let i = 1; i < proj.length; i++) {
    const v = proj[i]
    if (direction === 0) {
      if (Math.abs(v - anchor) >= prominence) {
        direction = v > anchor ? 1 : -1
        anchor = v
      }
    } else if (direction === 1) {
      if (v > anchor) anchor = v
      else if (anchor - v >= prominence) {
        count++
        direction = -1
        anchor = v
      }
    } else {
      if (v < anchor) anchor = v
      else if (v - anchor >= prominence) {
        count++
        direction = 1
        anchor = v
      }
    }
  }
  return count
}

/** Mantém no máximo `max` pontos, preservando primeiro e último. */
function downsample(pts: readonly InkPoint[], max: number): InkPoint[] {
  if (pts.length <= max) return [...pts]
  const step = pts.length / max
  const out: InkPoint[] = []
  for (let i = 0; i < max - 1; i++) out.push(pts[Math.floor(i * step)])
  out.push(pts[pts.length - 1])
  return out
}

/**
 * O traço fez um X por cima de algo? (gesto alternativo, ainda não ligado à UI —
 * fica aqui porque é a mesma família de análise.)
 */
export function isCrossOut(points: readonly InkPoint[]): boolean {
  if (points.length < 6) return false
  const simplified = simplify(points, 6)
  if (simplified.length > 6) return false
  return countSelfIntersections(simplified) === 1 && pathLength(points) > SCRIBBLE.minPathLength
}

/** Utilitário exposto pra testes e ajuste fino dos limiares. */
export function describeAnalysis(a: ScribbleAnalysis): string {
  return [
    `rabisco=${a.isScribble}`,
    `cruzamentos=${a.selfIntersections}`,
    `inversoes=${a.axisReversals}`,
    `densidade=${a.density.toFixed(2)}`,
    `comprimento=${Math.round(a.length)}`,
    `diagonal=${Math.round(a.diagonal)}`,
  ].join(' ')
}

/** Distância mínima entre dois pontos consecutivos pra registrar movimento. */
export function movedEnough(a: InkPoint, b: InkPoint, min: number): boolean {
  return dist(a, b) >= min
}
