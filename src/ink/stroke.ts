import getStroke from 'perfect-freehand'
import type { InkPoint, Stroke } from '../domain/types'

/**
 * Converte os pontos crus da caneta no contorno preenchido do traço.
 * A pressão modula a espessura — é o que faz a escrita parecer caneta e não linha.
 */

export interface StrokeStyle {
  color: string
  width: number
  tool: 'pen' | 'highlighter'
}

const PEN_OPTIONS = {
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.42,
  easing: (t: number) => Math.sin((t * Math.PI) / 2),
  simulatePressure: false,
}

const HIGHLIGHTER_OPTIONS = {
  thinning: 0,
  smoothing: 0.6,
  streamline: 0.5,
  easing: (t: number) => t,
  simulatePressure: false,
}

/**
 * Caminho do contorno do traço, pronto pra `ctx.fill(new Path2D(d))`.
 * `pressureFallback` cobre dedo e mouse, que reportam pressão 0 ou 0.5 fixa.
 */
export function strokeToPath(
  points: readonly InkPoint[],
  style: StrokeStyle,
  pressureFallback = 0.5,
): string {
  if (points.length === 0) return ''

  const input = points.map((pt) => [pt.x, pt.y, pt.p > 0 ? pt.p : pressureFallback] as const)
  const base = style.tool === 'highlighter' ? HIGHLIGHTER_OPTIONS : PEN_OPTIONS

  const outline = getStroke(input as unknown as number[][], {
    ...base,
    size: style.width,
    last: true,
  })

  return outlineToSvgPath(outline)
}

function outlineToSvgPath(outline: number[][]): string {
  if (outline.length === 0) return ''
  if (outline.length === 1) {
    const [x, y] = outline[0]
    return `M ${x} ${y} Z`
  }

  // Curva quadrática pelos pontos médios: contorno liso sem custo de suavização real.
  const d: string[] = [`M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)}`]
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % outline.length]
    d.push(
      `Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`,
    )
  }
  d.push('Z')
  return d.join(' ')
}

/** Cache do Path2D por traço — recalcular a cada quadro derruba o desempenho. */
const pathCache = new WeakMap<Stroke, Path2D>()

export function pathForStroke(stroke: Stroke): Path2D {
  const cached = pathCache.get(stroke)
  if (cached) return cached
  const path = new Path2D(
    strokeToPath(stroke.points, {
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
    }),
  )
  pathCache.set(stroke, path)
  return path
}

export function invalidateStrokePath(stroke: Stroke): void {
  pathCache.delete(stroke)
}

/** Opacidade do marca-texto: precisa deixar ler o que está por baixo. */
export const HIGHLIGHTER_ALPHA = 0.32
