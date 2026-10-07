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

/**
 * MARGEM ACIMA DO COMEÇO DA FOLHA, em px de página.
 *
 * Sem ela a primeira zona nasce colada em y=0: o tracejado de cima fica
 * partido ao meio pela borda da tela e o rótulo aparece sem nada acima, como
 * se a folha começasse no meio. Palavras dele: *"a delimitação das folhas ali
 * tá cortando por cima"*.
 *
 * É SÓ VISTA. Nenhuma coordenada guardada muda — a folha continua começando em
 * y=0, a tinta continua onde está e `zones/hit.ts` continua classificando pelo
 * resto da divisão. O que muda é até onde a janela pode subir, que é a mesma
 * decisão que fez a emenda entre folhas ser pintura e nunca espaço: abrir um
 * vão de verdade é o jeito mais fácil de perder o caderno de alguém.
 */
export const MARGEM_TOPO = 24

export const INITIAL_VIEW: ViewState = { zoom: ZOOM_FIT, scrollX: 0, scrollY: -MARGEM_TOPO }

/** Piso da escala. Nunca zero: zero produz matriz degenerada no canvas. */
const MIN_SCALE = 1e-4

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_FIT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/**
 * Resolve o estado da janela em medidas concretas, já com a rolagem presa
 * dentro dos limites da folha.
 */
export function computeMetrics(view: ViewState, layout: Layout): ViewMetrics {
  /*
   * Escala precisa ser positiva e finita, sempre.
   *
   * Durante o giro do tablet, ou quando a barra lateral aparece e some, a área
   * da folha pode medir zero por um instante. Com escala 0 as divisões daqui
   * viram NaN, e o canvas recebe uma matriz degenerada — o que não dá erro em
   * JavaScript, mas derruba o processo de desenho do navegador. Um piso barato
   * aqui vale mais que qualquer tratamento depois.
   */
  const rawScale = layout.fitScale * clampZoom(view.zoom)
  const scale = Number.isFinite(rawScale) && rawScale > MIN_SCALE ? rawScale : MIN_SCALE

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
    scrollY: clamp(view.scrollY, -MARGEM_TOPO, maxScrollY),
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

/** Prende o valor na faixa. NaN cai no mínimo em vez de contaminar tudo adiante. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
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
