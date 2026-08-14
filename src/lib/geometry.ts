import type { Bounds, InkPoint } from '../domain/types'

export interface Pt {
  x: number
  y: number
}

export const EMPTY_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

export function boundsOf(points: readonly Pt[]): Bounds {
  if (points.length === 0) return { ...EMPTY_BOUNDS }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.x > maxX) maxX = pt.x
    if (pt.y > maxY) maxY = pt.y
  }
  return { minX, minY, maxX, maxY }
}

export function padBounds(b: Bounds, pad: number): Bounds {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  )
}

export function unionBounds(list: readonly Bounds[]): Bounds {
  if (list.length === 0) return { ...EMPTY_BOUNDS }
  const out = { ...list[0] }
  for (const b of list) {
    out.minX = Math.min(out.minX, b.minX)
    out.minY = Math.min(out.minY, b.minY)
    out.maxX = Math.max(out.maxX, b.maxX)
    out.maxY = Math.max(out.maxY, b.maxY)
  }
  return out
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Comprimento total do caminho. */
export function pathLength(points: readonly Pt[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

/**
 * Os dois segmentos AB e CD se cruzam? Usa orientação por produto vetorial.
 * Retorna false para segmentos apenas encostados nas pontas (colineares),
 * que não interessam pra contagem de laços.
 */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Distância de um ponto ao segmento AB. */
export function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const lenSq = vx * vx + vy * vy
  if (lenSq === 0) return dist(p, a)
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

/** Algum ponto do caminho passa a menos de `radius` do ponto `p`? */
export function pathNearPoint(points: readonly Pt[], p: Pt, radius: number): boolean {
  if (points.length === 1) return dist(points[0], p) <= radius
  for (let i = 1; i < points.length; i++) {
    if (pointToSegment(p, points[i - 1], points[i]) <= radius) return true
  }
  return false
}

/** Os dois caminhos se cruzam ou chegam a menos de `tolerance` um do outro? */
export function pathsIntersect(a: readonly Pt[], b: readonly Pt[], tolerance = 0): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsIntersect(a[i - 1], a[i], b[j - 1], b[j])) return true
      if (tolerance > 0 && pointToSegment(a[i], b[j - 1], b[j]) <= tolerance) return true
    }
  }
  // Traços de um ponto só (um toque) não têm segmento; compara por proximidade.
  if (tolerance > 0) {
    if (a.length === 1) return pathNearPoint(b, a[0], tolerance)
    if (b.length === 1) return pathNearPoint(a, b[0], tolerance)
  }
  return false
}

/** O ponto está dentro do polígono? Ray casting. */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y) {
      const xAt = ((poly[j].x - poly[i].x) * (p.y - yi)) / (yj - yi) + poly[i].x
      if (p.x < xAt) inside = !inside
    }
  }
  return inside
}

/**
 * Reduz a densidade de pontos mantendo o formato (Ramer–Douglas–Peucker).
 * Usado antes das análises caras — a caneta gera pontos demais pra elas.
 */
export function simplify(points: readonly InkPoint[], tolerance: number): InkPoint[] {
  if (points.length <= 2) return [...points]
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  rdp(points, 0, points.length - 1, tolerance, keep)
  return points.filter((_, i) => keep[i])
}

function rdp(pts: readonly InkPoint[], first: number, last: number, tol: number, keep: boolean[]) {
  if (last <= first + 1) return
  let maxDist = -1
  let index = first
  for (let i = first + 1; i < last; i++) {
    const d = pointToSegment(pts[i], pts[first], pts[last])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist > tol) {
    keep[index] = true
    rdp(pts, first, index, tol, keep)
    rdp(pts, index, last, tol, keep)
  }
}
