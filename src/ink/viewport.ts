import type { Pt } from '../lib/geometry'

/**
 * Matemática da janela de visualização: zoom, rolagem e a conversão entre
 * o que está na tela e o que está na folha.
 *
 * Fica isolada aqui de propósito. Zoom toca em tudo — onde a caneta encosta,
 * o que aparece, até onde dá pra rolar — e espalhar essas contas pelos
 * componentes é receita pra tinta sair no lugar errado quando ampliado.
 */

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 5
export const ZOOM_FIT = 1

/** Passos dos botões de mais/menos. */
export const ZOOM_STEP = 1.25

export interface ViewState {
  /** 1 = folha ocupando a largura da tela. Acima disso, escrita mais de perto. */
  zoom: number
  /** Canto visível da folha, em px de página. */
  scrollX: number
  scrollY: number
}

export interface Layout {
  /** Escala em que a folha inteira cabe na largura da tela. */
  fitScale: number
  pageWidth: number
  pageHeight: number
  viewWidth: number
  viewHeight: number
}

export interface ViewMetrics {
  /** Escala final de página → tela. */
  scale: number
  scrollX: number
  scrollY: number
  /** Deslocamento em px de tela pra centralizar quando a folha fica menor que a tela. */
  offsetX: number
  maxScrollX: number
  maxScrollY: number
}

export const INITIAL_VIEW: ViewState = { zoom: ZOOM_FIT, scrollX: 0, scrollY: 0 }

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_FIT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/**
 * Resolve o estado da janela em medidas concretas, já com a rolagem presa
 * dentro dos limites da folha.
 */
export function computeMetrics(view: ViewState, layout: Layout): ViewMetrics {
  const scale = layout.fitScale * clampZoom(view.zoom)

  // Quanto da folha, em px de página, cabe na tela.
  const visibleW = layout.viewWidth / scale
  const visibleH = layout.viewHeight / scale

  const maxScrollX = Math.max(0, layout.pageWidth - visibleW)
  const maxScrollY = Math.max(0, layout.pageHeight - visibleH)

  // Afastado a ponto da folha ficar menor que a tela: centraliza em vez de
  // deixar a folha grudada na esquerda.
  const contentW = layout.pageWidth * scale
  const offsetX = contentW < layout.viewWidth ? (layout.viewWidth - contentW) / 2 : 0

  return {
    scale,
    scrollX: clamp(view.scrollX, 0, maxScrollX),
    scrollY: clamp(view.scrollY, 0, maxScrollY),
    offsetX,
    maxScrollX,
    maxScrollY,
  }
}

/** Deixa o estado da janela dentro dos limites, sem alterar o zoom. */
export function clampView(view: ViewState, layout: Layout): ViewState {
  const m = computeMetrics(view, layout)
  return { zoom: clampZoom(view.zoom), scrollX: m.scrollX, scrollY: m.scrollY }
}

/** Ponto da folha que está sob um ponto da tela. */
export function screenToPage(
  screenX: number,
  screenY: number,
  metrics: ViewMetrics,
): Pt {
  return {
    x: (screenX - metrics.offsetX) / metrics.scale + metrics.scrollX,
    y: screenY / metrics.scale + metrics.scrollY,
  }
}

/**
 * Muda o zoom mantendo fixo o ponto da folha que está sob `anchor`.
 *
 * É isso que faz a pinça parecer natural: o que está entre os dedos não
 * escorrega da mão enquanto se aproxima ou afasta.
 */
export function zoomAtPoint(
  view: ViewState,
  layout: Layout,
  anchor: { x: number; y: number },
  nextZoom: number,
): ViewState {
  const before = computeMetrics(view, layout)
  const pagePoint = screenToPage(anchor.x, anchor.y, before)

  const zoomed: ViewState = { ...view, zoom: clampZoom(nextZoom) }
  const after = computeMetrics(zoomed, layout)

  return clampView(
    {
      zoom: zoomed.zoom,
      scrollX: pagePoint.x - (anchor.x - after.offsetX) / after.scale,
      scrollY: pagePoint.y - anchor.y / after.scale,
    },
    layout,
  )
}

/** Aproxima ou afasta pelo centro da tela — o que os botões fazem. */
export function stepZoom(view: ViewState, layout: Layout, factor: number): ViewState {
  return zoomAtPoint(
    view,
    layout,
    { x: layout.viewWidth / 2, y: layout.viewHeight / 2 },
    view.zoom * factor,
  )
}

/** Volta pra folha inteira na largura da tela, mantendo a altura onde está. */
export function resetZoom(view: ViewState, layout: Layout): ViewState {
  return clampView({ zoom: ZOOM_FIT, scrollX: 0, scrollY: view.scrollY }, layout)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Distância entre dois dedos, pra medir o movimento da pinça. */
export function pinchDistance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}
