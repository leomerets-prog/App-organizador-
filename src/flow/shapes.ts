import type { Bounds } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { boundsOf, dist, pathLength } from '../lib/geometry'

/**
 * O que cada traço do fluxograma é.
 *
 * Um fluxograma à mão tem só três coisas dentro: **caixas**, **setas** e
 * **letra**. Tudo começa por saber qual delas é cada traço — e isso é
 * geometria, não adivinhação:
 *
 * - um traço que **volta ao próprio começo** é uma caixa
 * - um traço aberto que **sai de uma caixa e chega noutra** é uma seta
 * - o resto é letra, e vai pro reconhecedor virar o nome da caixa
 *
 * A forma da caixa diz o que ela é, pela convenção que todo mundo já usa:
 * retângulo é ação, losango é decisão, redondo é início/fim.
 *
 * Módulo puro: só pontos e contas. Verificado em `tools/flow-test.ts`.
 */

/** As três formas do fluxograma, na convenção de sempre. */
export type ShapeKind = 'acao' | 'decisao' | 'terminal'

export interface ShapeFit {
  kind: ShapeKind
  bounds: Bounds
  /** Quanto da caixa envolvente o desenho preenche: retângulo ~1, losango ~0,5. */
  fill: number
  /** Quantos cantos vivos o traço tem. Redondo não tem nenhum. */
  corners: number
}

// ─── Medidas da leitura (px de página) ───────────────────────────────────────

/** Abaixo disto é pingo, não desenho. */
const MIN_SHAPE_SIZE = 28

/** Fechou? A folga é proporcional ao tamanho: caixa grande fecha pior. */
const CLOSE_GAP = 0.22

/** Comprido e fino demais pra ser caixa — é risco, seta ou sublinhado. */
const MAX_ASPECT = 7

/** Abaixo disto o desenho é magro demais pra ser retângulo: é losango. */
const DIAMOND_FILL = 0.68

/** Giro (em graus) que já conta como canto vivo. */
const CORNER_TURN = 52

/** Quantos pontos a mais de um canto são ignorados — um canto, não cinco. */
const CORNER_SPREAD = 3

/** Pontos usados pra reamostrar qualquer traço antes de medir. */
const SAMPLES = 64

/**
 * O traço volta ao próprio começo?
 *
 * A folga é proporcional ao tamanho do desenho, não fixa: ninguém fecha uma
 * caixa de 400px com a mesma precisão de uma de 40px, e um limite fixo ou
 * recusaria as grandes ou aceitaria qualquer risco pequeno.
 */
export function isClosedPath(points: readonly Pt[]): boolean {
  if (points.length < 8) return false
  const b = boundsOf(points)
  const diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
  if (diagonal < MIN_SHAPE_SIZE) return false
  const volta = dist(points[0], points[points.length - 1])
  // O traço também precisa dar a volta: um rabisco curto de ida e volta
  // "fecha" sem cercar nada.
  if (pathLength(points) < diagonal * 1.6) return false
  return volta <= Math.max(10, diagonal * CLOSE_GAP)
}

/** Área do polígono que o traço desenha (fórmula do laço). */
export function polygonArea(points: readonly Pt[]): number {
  if (points.length < 3) return 0
  let soma = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    soma += a.x * b.y - b.x * a.y
  }
  return Math.abs(soma) / 2
}

/** Reamostra o traço em pontos igualmente espaçados — tira a pressa da mão. */
export function resample(points: readonly Pt[], quantos = SAMPLES): Pt[] {
  if (points.length < 2) return [...points]
  const total = pathLength(points)
  if (total <= 0) return [...points]

  const passo = total / (quantos - 1)
  const saida: Pt[] = [points[0]]
  let sobra = 0

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    let trecho = dist(a, b)
    if (trecho <= 0) continue
    let andado = 0
    while (sobra + trecho - andado >= passo && saida.length < quantos) {
      andado += passo - sobra
      sobra = 0
      const t = andado / trecho
      saida.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    sobra += trecho - andado
  }
  while (saida.length < quantos) saida.push(points[points.length - 1])
  return saida
}

/**
 * Quantos cantos vivos o traço tem.
 *
 * É o que separa retângulo de redondo, e nenhuma medida de área consegue
 * fazer isso: um círculo preenche 78% da caixa envolvente, um retângulo de
 * canto arredondado preenche uns 90% — perto demais pra decidir. Já o giro é
 * categórico: no círculo ele é o mesmo em toda volta, no retângulo está todo
 * concentrado em quatro pontos.
 */
export function countCorners(points: readonly Pt[], fechado: boolean): number {
  const p = resample(points)
  const n = p.length
  const k = 4
  const giros: number[] = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    const antes = fechado ? p[(i - k + n) % n] : p[Math.max(0, i - k)]
    const depois = fechado ? p[(i + k) % n] : p[Math.min(n - 1, i + k)]
    if (!fechado && (i < k || i > n - 1 - k)) continue
    const a = { x: p[i].x - antes.x, y: p[i].y - antes.y }
    const b = { x: depois.x - p[i].x, y: depois.y - p[i].y }
    const ma = Math.hypot(a.x, a.y)
    const mb = Math.hypot(b.x, b.y)
    if (ma < 1e-6 || mb < 1e-6) continue
    const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (ma * mb)))
    giros[i] = (Math.acos(cos) * 180) / Math.PI
  }

  // Só o pico de cada aglomerado conta: um canto desenhado à mão espalha o
  // giro por vários pontos, e contar todos daria doze cantos num retângulo.
  let cantos = 0
  for (let i = 0; i < n; i++) {
    if (giros[i] < CORNER_TURN) continue
    let maior = true
    for (let d = -CORNER_SPREAD; d <= CORNER_SPREAD; d++) {
      if (d === 0) continue
      const j = fechado ? (i + d + n) % n : i + d
      if (j < 0 || j >= n) continue
      if (giros[j] > giros[i] || (giros[j] === giros[i] && j < i)) maior = false
    }
    if (maior) cantos++
  }
  return cantos
}

/**
 * Que forma este traço desenha — ou nada, se não desenha forma nenhuma.
 *
 * A ordem das perguntas importa: primeiro "é magro demais pra ser caixa?",
 * depois "preenche pouco?" (losango), e só então "tem canto?" (retângulo) ou
 * "não tem" (redondo). Começar pelos cantos faria um losango virar retângulo,
 * porque os dois têm quatro.
 */
export function classifyShape(points: readonly Pt[]): ShapeFit | null {
  if (!isClosedPath(points)) return null

  const bounds = boundsOf(points)
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  if (w < MIN_SHAPE_SIZE / 2 || h < MIN_SHAPE_SIZE / 2) return null

  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h))
  if (aspect > MAX_ASPECT) return null

  const fill = polygonArea(points) / Math.max(1, w * h)
  if (fill < 0.25) return null // nem área tem: é rabisco, não caixa

  const corners = countCorners(points, true)
  const kind: ShapeKind =
    fill < DIAMOND_FILL ? 'decisao' : corners >= 3 && corners <= 6 ? 'acao' : 'terminal'

  return { kind, bounds, fill, corners }
}
