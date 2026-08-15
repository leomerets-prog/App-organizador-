import type { Item, Stroke, Zone } from '../domain/types'
import { ZONE_COLORS } from '../domain/templates'
import { HIGHLIGHTER_ALPHA, pathForStroke, strokeToPath } from './stroke'
import { INK_COLOR, LEGACY_INK_COLOR } from '../domain/constants'
import type { StrokeStyle } from './stroke'
import type { Pt } from '../lib/geometry'

/**
 * Desenho da folha no canvas.
 *
 * O renderer não sabe nada de React nem de banco: recebe o estado da página e
 * pinta. Isso mantém o laço de desenho barato e testável isoladamente.
 */

export interface Viewport {
  /** Deslocamento vertical da folha, em px de página. */
  scrollY: number
  /** Largura da folha em px de página (a folha tem largura fixa lógica). */
  pageWidth: number
  /** Altura da folha em px de página. */
  pageHeight: number
  /** Escala de página → tela. */
  scale: number
  /** Tamanho da área visível em px de tela. */
  viewWidth: number
  viewHeight: number
}

export interface RenderInput {
  strokes: Stroke[]
  zones: Zone[]
  items: Item[]
  viewport: Viewport
  /** Traço em andamento, ainda não salvo. */
  liveStroke: { points: Stroke['points']; style: StrokeStyle } | null
  /** Caminho do laço em andamento. */
  lassoPath: Pt[] | null
  /** Traços marcados pra apagar (realce vermelho antes de sumir). */
  pendingErase: Set<string>
  /** Traços atualmente selecionados pelo laço. */
  selected: Set<string>
  showZones: boolean
  theme: Theme
}

export interface Theme {
  paper: string
  rule: string
  zoneLabel: string
  ink: string
}

export const DARK_THEME: Theme = {
  paper: '#16161a',
  rule: '#232329',
  zoneLabel: '#71717a',
  ink: '#f4f4f5',
}

export const LIGHT_THEME: Theme = {
  paper: '#fbfaf7',
  rule: '#e8e4da',
  zoneLabel: '#a1a1aa',
  ink: '#1c1c20',
}

export const THEMES = { dark: DARK_THEME, light: LIGHT_THEME }

/**
 * Cor com que o traço é realmente pintado.
 *
 * A cor padrão da caneta é guardada como símbolo, não como valor: assim a
 * anotação escrita no tema escuro continua legível no tema claro, em vez de
 * virar tinta branca em papel branco. Cores escolhidas de propósito (azul,
 * vermelho...) são respeitadas como estão, porque funcionam nos dois papéis.
 */
export function resolveInk(color: string, theme: Theme): string {
  return color === INK_COLOR || color === LEGACY_INK_COLOR ? theme.ink : color
}

const RULE_SPACING = 38

export function render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { viewport: vp, theme } = input
  const dpr = window.devicePixelRatio || 1

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Fundo
  ctx.fillStyle = theme.paper
  ctx.fillRect(0, 0, vp.viewWidth, vp.viewHeight)

  // A partir daqui trabalhamos em coordenadas de página.
  ctx.scale(vp.scale, vp.scale)
  ctx.translate(0, -vp.scrollY)

  const top = vp.scrollY
  const bottom = vp.scrollY + vp.viewHeight / vp.scale

  drawRules(ctx, vp, theme, top, bottom)
  if (input.showZones) drawZones(ctx, input.zones, vp, theme)
  drawStrokes(ctx, input, top, bottom)
  if (input.liveStroke) drawLiveStroke(ctx, input.liveStroke, theme)
  drawItemMarkers(ctx, input.items, vp)
  if (input.lassoPath) drawLasso(ctx, input.lassoPath)

  ctx.restore()
}

function drawRules(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  theme: Theme,
  top: number,
  bottom: number,
): void {
  ctx.strokeStyle = theme.rule
  ctx.lineWidth = 1
  ctx.beginPath()
  const first = Math.floor(top / RULE_SPACING) * RULE_SPACING
  for (let y = first; y <= bottom; y += RULE_SPACING) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(vp.pageWidth, y + 0.5)
  }
  ctx.stroke()
}

function drawZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  vp: Viewport,
  theme: Theme,
): void {
  for (const zone of zones) {
    if (zone.kind === 'livre' && !zone.label) continue
    const x = zone.rect.x * vp.pageWidth
    const y = zone.rect.y * vp.pageHeight
    const w = zone.rect.w * vp.pageWidth
    const h = zone.rect.h * vp.pageHeight
    const color = ZONE_COLORS[zone.kind]

    ctx.save()
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.28
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    ctx.setLineDash([])

    if (zone.label) {
      ctx.globalAlpha = 0.9
      ctx.fillStyle = color
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.label.toUpperCase(), x + 10, y + 8)
    }
    ctx.restore()
  }
  void theme
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  top: number,
  bottom: number,
): void {
  for (const stroke of input.strokes) {
    // Descarta o que está fora da janela visível antes de qualquer trabalho caro.
    if (stroke.bounds.maxY < top || stroke.bounds.minY > bottom) continue

    ctx.save()
    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = HIGHLIGHTER_ALPHA
      ctx.globalCompositeOperation = 'multiply'
    }
    const ink = resolveInk(stroke.color, input.theme)
    if (input.pendingErase.has(stroke.id)) {
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#ef4444'
    } else if (input.selected.has(stroke.id)) {
      ctx.fillStyle = ink
      ctx.shadowColor = '#3b82f6'
      ctx.shadowBlur = 12
    } else {
      ctx.fillStyle = ink
    }
    ctx.fill(pathForStroke(stroke))
    ctx.restore()
  }
}

function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  live: NonNullable<RenderInput['liveStroke']>,
  theme: Theme,
): void {
  const d = strokeToPath(live.points, live.style)
  if (!d) return
  ctx.save()
  if (live.style.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fillStyle = resolveInk(live.style.color, theme)
  ctx.fill(new Path2D(d))
  ctx.restore()
}

const ITEM_GLYPH: Record<Item['kind'], string> = {
  tarefa: '✓',
  duvida: '?',
  topico: '▸',
  documento: '¶',
  pendencia: '⚑',
  importante: '★',
}

const ITEM_COLOR: Record<Item['kind'], string> = {
  tarefa: '#22c55e',
  duvida: '#f59e0b',
  topico: '#8b5cf6',
  documento: '#06b6d4',
  pendencia: '#ef4444',
  importante: '#eab308',
}

/** Carimbo do item na margem esquerda, alinhado com a tinta que ele marca. */
function drawItemMarkers(ctx: CanvasRenderingContext2D, items: Item[], vp: Viewport): void {
  for (const item of items) {
    const y = item.bounds.minY + (item.bounds.maxY - item.bounds.minY) / 2
    const x = 18
    const color = ITEM_COLOR[item.kind]
    const done = item.status === 'concluido'

    ctx.save()
    ctx.globalAlpha = done ? 0.4 : 1
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = done ? 0.15 : 0.18
    ctx.fill()
    ctx.globalAlpha = done ? 0.4 : 1
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = color
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ITEM_GLYPH[item.kind], x, y + 0.5)

    // Tarefa concluída ganha um risco por cima da tinta.
    if (done) {
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(item.bounds.minX - 4, y)
      ctx.lineTo(item.bounds.maxX + 4, y)
      ctx.stroke()
    }
    ctx.restore()
  }
  void vp
}

function drawLasso(ctx: CanvasRenderingContext2D, path: Pt[]): void {
  if (path.length < 2) return
  ctx.save()
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 5])
  ctx.beginPath()
  ctx.moveTo(path[0].x, path[0].y)
  for (const pt of path.slice(1)) ctx.lineTo(pt.x, pt.y)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = 'rgba(59,130,246,0.08)'
  ctx.fill()
  ctx.restore()
}

export { ITEM_GLYPH, ITEM_COLOR }
