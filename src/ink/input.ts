import type { InkPoint, Stroke } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { boundsOf, boundsOverlap, padBounds, pathsIntersect, pointInPolygon } from '../lib/geometry'
import { SCRIBBLE } from './scribble'

/**
 * Regras de entrada da caneta, separadas do componente React.
 *
 * Rejeição de palma: no tablet, a mão apoiada na tela gera eventos `touch` ao
 * mesmo tempo que a caneta escreve. A regra é simples e funciona: assim que
 * um evento de caneta aparece, todo toque de dedo passa a ser ignorado pra
 * desenho por um tempo. O dedo continua servindo pra rolar a folha.
 */

/** Por quanto tempo depois do último evento de caneta o dedo é ignorado. */
export const PALM_REJECT_MS = 900

export class PenTracker {
  private lastPenAt = 0

  notePen(): void {
    this.lastPenAt = Date.now()
  }

  /** O dedo deve ser ignorado agora? */
  shouldRejectTouch(): boolean {
    return Date.now() - this.lastPenAt < PALM_REJECT_MS
  }

  reset(): void {
    this.lastPenAt = 0
  }
}

/** Pressão utilizável a partir do evento; dedo e mouse não reportam pressão real. */
export function pressureFrom(event: PointerEvent): number {
  if (event.pointerType === 'pen') {
    // Alguns drivers mandam 0 no primeiro evento; 0.5 evita o traço nascer invisível.
    return event.pressure > 0 ? event.pressure : 0.5
  }
  return 0.5
}

/** Distância mínima entre pontos capturados — corta ruído sem perder o traço. */
const MIN_POINT_DISTANCE = 0.7

export class StrokeBuilder {
  readonly points: InkPoint[] = []
  readonly startedAt: number

  constructor(startedAt = Date.now()) {
    this.startedAt = startedAt
  }

  add(x: number, y: number, pressure: number): boolean {
    const t = Date.now() - this.startedAt
    const last = this.points[this.points.length - 1]
    if (last && Math.hypot(x - last.x, y - last.y) < MIN_POINT_DISTANCE) {
      return false
    }
    this.points.push({ x, y, p: pressure, t })
    return true
  }

  get length(): number {
    return this.points.length
  }
}

/**
 * Quais traços o rabisco passou por cima.
 * A caixa envolvente filtra a maioria antes do teste caro de interseção.
 */
export function strokesHitByPath(
  strokes: readonly Stroke[],
  path: readonly Pt[],
  radius: number = SCRIBBLE.hitRadius,
): string[] {
  if (path.length === 0) return []
  const pathBounds = padBounds(boundsOf(path), radius)

  const hits: string[] = []
  for (const stroke of strokes) {
    if (!boundsOverlap(pathBounds, padBounds(stroke.bounds, radius))) continue
    if (pathsIntersect(path, stroke.points, radius)) hits.push(stroke.id)
  }
  return hits
}

/**
 * Quais traços o laço cercou.
 * Basta a maior parte dos pontos do traço estar dentro — exigir o traço inteiro
 * faz o usuário ter que cercar com precisão cirúrgica, o que irrita.
 */
export function strokesInsideLasso(
  strokes: readonly Stroke[],
  polygon: readonly Pt[],
  minRatio = 0.6,
): string[] {
  if (polygon.length < 3) return []
  const polyBounds = boundsOf(polygon)

  const hits: string[] = []
  for (const stroke of strokes) {
    if (!boundsOverlap(polyBounds, stroke.bounds)) continue
    let inside = 0
    for (const pt of stroke.points) {
      if (pointInPolygon(pt, polygon)) inside++
    }
    if (inside / stroke.points.length >= minRatio) hits.push(stroke.id)
  }
  return hits
}

/** Traço sob o ponto da borracha direta. */
export function strokesUnderPoint(
  strokes: readonly Stroke[],
  point: Pt,
  radius: number,
): string[] {
  return strokesHitByPath(strokes, [point], radius)
}
