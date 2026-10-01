import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { THEMES, render } from '../ink/renderer'
import type { Viewport } from '../ink/renderer'
import { PenTracker, StrokeBuilder, pressureFrom, strokesInsideLasso } from '../ink/input'
import { analyzeScribble } from '../ink/scribble'
import { PAGE_WIDTH } from '../domain/constants'
import type { Pt } from '../lib/geometry'
import {
  INITIAL_VIEW,
  ZOOM_STEP,
  clampView,
  clampZoom,
  computeMetrics,
  formatZoom,
  midpoint,
  pinchDistance,
  resetZoom,
  screenToPage,
  stepZoom,
} from '../ink/viewport'
import type { Layout, ViewState } from '../ink/viewport'
import { ScribbleToast } from './ScribbleToast'
import { MIN_IMAGE_SIZE, onImageReady } from '../ink/images'
import { BOUNDARY_HANDLE_X, boundaryHandleRadius, imageHandleRadius } from '../ink/renderer'
import type { Item, PageImage, Zone, ZoneKind } from '../domain/types'
import {
  SHEET,
  boundaryAt,
  deltaToFrac,
  dragBoundary,
  dragZone,
  handleAt,
  pageToFrac,
  rectFromDrag,
  zoneAtFrac,
  zoneBoundaries,
} from '../zones/edit'
import type { ZoneBoundary, ZoneHandle, ZoneRectFrac } from '../zones/edit'
import { ZONE_COLORS } from '../domain/templates'

/**
 * A folha.
 *
 * Um canvas só, redesenhado por requestAnimationFrame quando algo muda. O
 * traço em andamento e o estado da janela (zoom e rolagem) vivem em refs, fora
 * do ciclo do React — é isso que segura a escrita e a pinça na velocidade da
 * mão, sem re-renderizar a árvore a cada quadro.
 */

/** A borracha corta na hora; nada fica "marcado pra apagar" esperando o fim. */
const EMPTY_SET: Set<string> = new Set()

/** Limites do que conta como toque, e do intervalo entre dois deles. */
const TAP_MAX_MS = 300
const TAP_MAX_MOVE = 10
const DOUBLE_TAP_MS = 450
const DOUBLE_TAP_MOVE = 70
/** Quanto tempo o dedo precisa ficar parado sobre a imagem pra abrir o ajuste. */
const LONG_PRESS_MS = 500

interface PressInfo {
  at: number
  screen: Pt
}

interface Gesture {
  kind:
    | 'draw'
    | 'erase'
    | 'lasso'
    | 'pan'
    | 'pinch'
    | 'moveImage'
    | 'resizeImage'
    | 'zone'
    | 'boundary'
  pointerId: number
  /** Imagem sendo movida ou redimensionada, e o estado dela ao começar. */
  imageId?: string
  imageStart?: PageImage['rect']
  grabPage?: Pt
  /** Zona sendo ajustada: qual, por onde, e como ela era ao começar. */
  zoneId?: string
  zoneHandle?: ZoneHandle
  zoneStart?: ZoneRectFrac
  /** Onde o arrasto começou, em fração da folha — usado pra criar zona nova. */
  grabFrac?: Pt
  /** Divisa entre faixas sendo puxada. */
  boundary?: ZoneBoundary
  builder?: StrokeBuilder
  lasso?: Pt[]
  /** Ponto da tela onde o arrasto começou, e a janela naquele instante. */
  fromScreen?: Pt
  fromView?: ViewState
  /** Distância inicial entre os dedos, na pinça. */
  fromDistance?: number
}

export function PageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const strokes = useStore((s) => s.strokes)
  const zones = useStore((s) => s.zones)
  const items = useStore((s) => s.items)
  const pages = useStore((s) => s.pages)
  const activePageId = useStore((s) => s.activePageId)
  const tool = useStore((s) => s.tool)
  const penColor = useStore((s) => s.penColor)
  const penWidth = useStore((s) => s.penWidth)
  const showZones = useStore((s) => s.showZones)
  const showText = useStore((s) => s.showText)
  const selectedZoneId = useStore((s) => s.selectedZoneId)
  const transcription = useStore((s) => s.transcription)
  const selection = useStore((s) => s.selection)
  const theme = useStore((s) => s.theme)
  const savedZoom = useStore((s) => s.zoom)
  const eraserSize = useStore((s) => s.eraserSize)
  const images = useStore((s) => s.images)
  const selectedImageId = useStore((s) => s.selectedImageId)

  const commitStroke = useStore((s) => s.commitStroke)
  const beginErase = useStore((s) => s.beginErase)
  const eraseSweep = useStore((s) => s.eraseSweep)
  const endErase = useStore((s) => s.endErase)
  const setSelection = useStore((s) => s.setSelection)
  const toggleItemStatus = useStore((s) => s.toggleItemStatus)
  const setTool = useStore((s) => s.setTool)
  const setZoom = useStore((s) => s.setZoom)
  const addImage = useStore((s) => s.addImage)
  const updateImageRect = useStore((s) => s.updateImageRect)
  const removeImage = useStore((s) => s.removeImage)
  const selectImage = useStore((s) => s.selectImage)
  const undoErase = useStore((s) => s.undoErase)
  const selectZone = useStore((s) => s.selectZone)
  const addZone = useStore((s) => s.addZone)
  const updateZone = useStore((s) => s.updateZone)
  const updateZoneRects = useStore((s) => s.updateZoneRects)
  const removeZone = useStore((s) => s.removeZone)
  const setItemText = useStore((s) => s.setItemText)
  const retranscribeItem = useStore((s) => s.retranscribeItem)
  const transcribePage = useStore((s) => s.transcribePage)
  const toggleAutoFields = useStore((s) => s.toggleAutoFields)

  const page = pages.find((p) => p.id === activePageId) ?? null

  const [gestureNotice, setGestureNotice] = useState(0)
  const [zoomLabel, setZoomLabel] = useState(() => formatZoom(savedZoom))
  const [erasedCount, setErasedCount] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)
  const [toolNotice, setToolNotice] = useState(0)
  // Confirmação dentro da própria barra: a janela do sistema pode não aparecer
  // dentro do app empacotado, e ali ela fica fora do alcance do polegar.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmZoneDelete, setConfirmZoneDelete] = useState(false)
  /** Campo cujo texto está sendo escrito ou corrigido à mão. */
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Estado quente, fora do React ──────────────────────────────────────────

  const viewRef = useRef<ViewState>({ ...INITIAL_VIEW, zoom: savedZoom })
  const layoutRef = useRef<Layout>({
    fitScale: 1,
    pageWidth: PAGE_WIDTH,
    pageHeight: page?.height ?? 1754,
    viewWidth: 0,
    viewHeight: 0,
  })
  const gestureRef = useRef<Gesture | null>(null)
  const touchesRef = useRef(new Map<number, Pt>())
  const penTracker = useRef(new PenTracker())
  const pinchingRef = useRef(false)
  const dirty = useRef(true)
  /** Onde desenhar a bolinha da borracha; null quando ela não está em uso. */
  const eraserCursorRef = useRef<Pt | null>(null)
  /** Último toque curto, pra reconhecer o toque duplo que volta pra caneta. */
  const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null)
  /** Início do toque atual, pra saber se foi toque ou arrasto. */
  const pressRef = useRef<PressInfo | null>(null)
  /** Temporizador do toque longo sobre imagem ou campo escrito. */
  const longPressRef = useRef<number | undefined>(undefined)
  /**
   * Zona em arrasto, só na memória.
   *
   * Gravar a cada quadro do arrasto escreveria no banco dezenas de vezes por
   * segundo; a gravação acontece uma vez, ao soltar.
   */
  const liveZonesRef = useRef<Map<string, ZoneRectFrac> | null>(null)
  /** Retângulo da zona sendo desenhada à mão. */
  const zoneDraftRef = useRef<ZoneRectFrac | null>(null)

  const stateRef = useRef({
    strokes, zones, items, tool, penColor, penWidth, showZones, selection, theme,
    images, selectedImageId, eraserSize, showText, selectedZoneId,
  })
  stateRef.current = {
    strokes, zones, items, tool, penColor, penWidth, showZones, selection, theme,
    images, selectedImageId, eraserSize, showText, selectedZoneId,
  }

  layoutRef.current.pageHeight = page?.height ?? layoutRef.current.pageHeight

  const markDirty = useCallback(() => {
    dirty.current = true
  }, [])

  useEffect(markDirty, [
    strokes, zones, items, showZones, showText, selection, theme, images,
    selectedImageId, selectedZoneId, tool, markDirty,
  ])

  // Imagem terminou de decodificar: repinta pra ela aparecer no lugar do vazio.
  useEffect(() => onImageReady(markDirty), [markDirty])

  // Trocar de imagem cancela uma exclusão que estava pendente de confirmação.
  useEffect(() => setConfirmDelete(false), [selectedImageId])

  /** Muda a janela e agenda o redesenho. Todo caminho de zoom/rolagem passa aqui. */
  const applyView = useCallback((next: ViewState) => {
    viewRef.current = clampView(next, layoutRef.current)
    dirty.current = true
  }, [])

  // ─── Tamanho e escala ──────────────────────────────────────────────────────

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()

    // Medida inválida: mantém o que já estava e espera a próxima medição. Ao
    // girar o tablet a área chega a medir zero por um instante, e aceitar esse
    // valor zeraria a escala do desenho.
    if (!(rect.width > 0) || !(rect.height > 0)) return

    const dpr = window.devicePixelRatio || 1
    // Teto do buffer: acima disso o navegador recusa ou estoura a memória.
    const maxPixels = 8192
    const pxW = Math.min(maxPixels, Math.round(rect.width * dpr))
    const pxH = Math.min(maxPixels, Math.round(rect.height * dpr))

    // Reatribuir width/height reconstrói o buffer inteiro; só quando muda.
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW
      canvas.height = pxH
    }
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    layoutRef.current = {
      ...layoutRef.current,
      viewWidth: rect.width,
      viewHeight: rect.height,
      // Zoom 1 significa "folha inteira na largura da tela", em qualquer tablet.
      fitScale: rect.width / PAGE_WIDTH,
    }
    viewRef.current = clampView(viewRef.current, layoutRef.current)
    dirty.current = true
  }, [])

  const observerRef = useRef<ResizeObserver | null>(null)

  /**
   * O canvas só entra na árvore depois que a página carrega, então o observador
   * de tamanho é ligado por ref de retorno — não por efeito. Ligá-lo num efeito
   * de montagem pegava o container ainda inexistente e o canvas ficava no
   * tamanho padrão de 300×150, esticado pelo CSS.
   */
  const attachContainer = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      containerRef.current = node
      if (!node) return
      const observer = new ResizeObserver(resize)
      observer.observe(node)
      observerRef.current = observer
      resize()
    },
    [resize],
  )

  // ─── Laço de desenho ───────────────────────────────────────────────────────

  useEffect(() => {
    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (!dirty.current) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx || !page) return

      const gesture = gestureRef.current
      const st = stateRef.current
      const layout = layoutRef.current
      const m = computeMetrics(viewRef.current, layout)

      const viewport: Viewport = {
        scrollX: m.scrollX,
        scrollY: m.scrollY,
        pageWidth: layout.pageWidth,
        pageHeight: layout.pageHeight,
        scale: m.scale,
        offsetX: m.offsetX,
        viewWidth: layout.viewWidth,
        viewHeight: layout.viewHeight,
      }

      // As zonas em arrasto aparecem no lugar novo antes de serem gravadas.
      const live = liveZonesRef.current
      const zones = live
        ? st.zones.map((z) => {
            const rect = live.get(z.id)
            return rect ? { ...z, rect } : z
          })
        : st.zones

      render(ctx, {
        strokes: st.strokes,
        zones,
        items: st.items,
        viewport,
        liveStroke:
          gesture?.kind === 'draw' && gesture.builder
            ? {
                points: gesture.builder.points,
                style: {
                  color: st.penColor,
                  width: st.penWidth,
                  tool: st.tool === 'highlighter' ? 'highlighter' : 'pen',
                },
              }
            : null,
        lassoPath: gesture?.kind === 'lasso' ? (gesture.lasso ?? null) : null,
        pendingErase: EMPTY_SET,
        selected: st.selection,
        images: st.images,
        selectedImageId: st.selectedImageId,
        showZones: st.showZones,
        showText: st.showText,
        zoneEditing:
          st.tool === 'zone'
            ? { selectedZoneId: st.selectedZoneId, draft: zoneDraftRef.current }
            : null,
        theme: THEMES[st.theme],
        zoomBadge: pinchingRef.current ? formatZoom(viewRef.current.zoom) : null,
        eraserCursor:
          st.tool === 'eraser' && eraserCursorRef.current
            ? { ...eraserCursorRef.current, radius: st.eraserSize }
            : null,
      })

      dirty.current = false
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [page])

  // ─── Coordenadas ───────────────────────────────────────────────────────────

  /** Posição do evento em px de tela, relativa ao canvas. */
  const toScreen = useCallback((event: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }, [])

  /** Posição do evento em coordenadas da folha, já considerando zoom e rolagem. */
  const toPage = useCallback(
    (event: { clientX: number; clientY: number }): Pt => {
      const s = toScreen(event)
      return screenToPage(s.x, s.y, computeMetrics(viewRef.current, layoutRef.current))
    },
    [toScreen],
  )

  // ─── Controles de zoom ─────────────────────────────────────────────────────

  const commitZoom = useCallback(() => {
    setZoomLabel(formatZoom(viewRef.current.zoom))
    setZoom(viewRef.current.zoom)
  }, [setZoom])

  const zoomIn = useCallback(() => {
    applyView(stepZoom(viewRef.current, layoutRef.current, ZOOM_STEP))
    commitZoom()
  }, [applyView, commitZoom])

  const zoomOut = useCallback(() => {
    applyView(stepZoom(viewRef.current, layoutRef.current, 1 / ZOOM_STEP))
    commitZoom()
  }, [applyView, commitZoom])

  const zoomReset = useCallback(() => {
    applyView(resetZoom(viewRef.current, layoutRef.current))
    commitZoom()
  }, [applyView, commitZoom])

  // ─── Imagens ───────────────────────────────────────────────────────────────

  /** Imagem sob o ponto; a de cima ganha, já que são desenhadas em ordem. */
  const imageAt = useCallback((pt: Pt): PageImage | null => {
    const list = stateRef.current.images
    for (let i = list.length - 1; i >= 0; i--) {
      const { x, y, w, h } = list[i].rect
      if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) return list[i]
    }
    return null
  }, [])

  /** O toque caiu no botão de excluir da imagem selecionada? */
  const onDeleteBadge = useCallback((pt: Pt): PageImage | null => {
    const id = stateRef.current.selectedImageId
    if (!id) return null
    const image = stateRef.current.images.find((i) => i.id === id)
    if (!image) return null
    const { x, y, w } = image.rect
    const scale = computeMetrics(viewRef.current, layoutRef.current).scale
    return Math.hypot(pt.x - (x + w), pt.y - y) <= imageHandleRadius(scale) ? image : null
  }, [])

  /** O toque caiu na alça de redimensionar da imagem selecionada? */
  const onResizeHandle = useCallback((pt: Pt): PageImage | null => {
    const id = stateRef.current.selectedImageId
    if (!id) return null
    const image = stateRef.current.images.find((i) => i.id === id)
    if (!image) return null
    const { x, y, w, h } = image.rect
    const scale = computeMetrics(viewRef.current, layoutRef.current).scale
    const reach = imageHandleRadius(scale)
    return Math.hypot(pt.x - (x + w), pt.y - (y + h)) <= reach ? image : null
  }, [])

  /**
   * Campo escrito sob o ponto.
   *
   * A faixa vai um pouco além da tinta e inclui a linha de texto embaixo: é
   * nela que se toca pra corrigir a transcrição, e ela é fina.
   */
  const itemAt = useCallback((pt: Pt): Item | null => {
    for (const item of stateRef.current.items) {
      if (item.status === 'arquivado') continue
      const b = item.bounds
      if (pt.x < b.minX - 12 || pt.x > b.maxX + 12) continue
      if (pt.y < b.minY - 10 || pt.y > b.maxY + 34) continue
      return item
    }
    return null
  }, [])

  /**
   * Segurar o dedo sobre uma imagem abre o ajuste dela.
   *
   * Sem isto, mexer numa imagem já colada dependia de descobrir que existe a
   * ferramenta Imagem e ativá-la antes — não havia pista nenhuma na folha de
   * que a imagem era tocável, e apagar uma virava um beco sem saída.
   *
   * O gesto é do DEDO, não da caneta: o dedo nunca escreve, então segurá-lo
   * não tem como atrapalhar um traço em andamento.
   */
  const armLongPress = useCallback(
    (pt: Pt) => {
      clearTimeout(longPressRef.current)
      const image = imageAt(pt)
      // Imagem ganha do campo escrito: ela está por baixo da tinta, e quem
      // segura o dedo sobre uma foto quer mexer na foto.
      const item = image ? null : itemAt(pt)
      if (!image && !item) return

      longPressRef.current = window.setTimeout(() => {
        // O arrasto cancela: quem moveu o dedo queria rolar a folha.
        if (gestureRef.current?.kind !== 'pan') return
        gestureRef.current = null
        pressRef.current = null
        if (image) {
          selectImage(image.id)
          setTool('image')
          setToolNotice(-Date.now())
        } else if (item) {
          setEditingItemId(item.id)
        }
        dirty.current = true
      }, LONG_PRESS_MS)
    },
    [imageAt, itemAt, selectImage, setTool],
  )

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressRef.current)
  }, [])

  useEffect(() => cancelLongPress, [cancelLongPress])

  /** Retângulo da folha visível agora — onde a imagem nova deve entrar. */
  const visibleRect = useCallback(() => {
    const m = computeMetrics(viewRef.current, layoutRef.current)
    return {
      x: m.scrollX,
      y: m.scrollY,
      w: layoutRef.current.viewWidth / m.scale,
      h: layoutRef.current.viewHeight / m.scale,
    }
  }, [])

  const insertImage = useCallback(
    async (file: File | Blob) => {
      setImageError(null)
      try {
        await addImage(file, visibleRect())
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Não consegui abrir essa imagem.')
      }
    },
    [addImage, visibleRect],
  )

  // Colar imagem da área de transferência.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      for (const item of event.clipboardData?.items ?? []) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void insertImage(file)
          }
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [insertImage])

  // ─── Carimbo de item ───────────────────────────────────────────────────────

  const hitItemMarker = useCallback((pt: Pt): string | null => {
    for (const item of stateRef.current.items) {
      // Arquivado não é desenhado; tocar no lugar onde ele estava não pode
      // acender um carimbo invisível.
      if (item.status === 'arquivado') continue
      const cy = item.bounds.minY + (item.bounds.maxY - item.bounds.minY) / 2
      // A tolerância acompanha o zoom: ampliado, o alvo não precisa crescer junto.
      const reach = 16 / Math.max(0.5, viewRef.current.zoom)
      if (Math.hypot(pt.x - 18, pt.y - cy) <= reach) return item.id
    }
    return null
  }, [])

  // ─── Zonas editáveis ───────────────────────────────────────────────────────

  /**
   * Começa a mexer numa zona.
   *
   * Três casos, nesta ordem: alça da zona já escolhida (redimensionar), miolo
   * de alguma zona (mover) e área livre (desenhar uma zona nova). A alça da
   * escolhida vem primeiro porque ela fica POR CIMA da borda da vizinha — sem
   * essa precedência, encostar na divisa entre duas faixas moveria a errada.
   */
  const beginZoneGesture = useCallback(
    (pt: Pt, pointerId: number) => {
      const st = stateRef.current
      const scale = computeMetrics(viewRef.current, layoutRef.current).scale
      const frac = pageToFrac(pt)
      // Tolerância fixa em px de TELA: o alvo do dedo não encolhe com o zoom.
      const tol = { x: 16 / scale / PAGE_WIDTH, y: 16 / scale / SHEET }

      const chosen = st.zones.find((z) => z.id === st.selectedZoneId) ?? null
      let target: Zone | null = null
      let handle: ZoneHandle | null = null

      if (chosen) {
        handle = handleAt(chosen.rect, frac, tol)
        if (handle) target = chosen
      }
      if (!target) {
        const zone = zoneAtFrac(st.zones, frac)
        if (zone) {
          target = zone
          handle = handleAt(zone.rect, frac, tol) ?? 'move'
        }
      }

      if (target && handle) {
        selectZone(target.id)
        liveZonesRef.current = new Map([[target.id, { ...target.rect }]])
        gestureRef.current = {
          kind: 'zone',
          pointerId,
          zoneId: target.id,
          zoneHandle: handle,
          zoneStart: { ...target.rect },
          grabPage: pt,
        }
      } else {
        selectZone(null)
        zoneDraftRef.current = null
        gestureRef.current = { kind: 'zone', pointerId, grabPage: pt, grabFrac: frac }
      }
      dirty.current = true
    },
    [selectZone],
  )

  /**
   * Cria uma faixa no meio do que está à vista.
   *
   * O arrasto em espaço vazio só serve quando SOBRA espaço vazio — e os
   * modelos de folha cobrem a página inteira, então sem este botão criar uma
   * faixa nova era impossível sem antes encolher outra. O usuário arrasta ela
   * pro lugar depois; o que importa é que ela exista e esteja visível.
   */
  const addZoneHere = useCallback(() => {
    const m = computeMetrics(viewRef.current, layoutRef.current)
    const middleY = m.scrollY + layoutRef.current.viewHeight / m.scale / 2
    const frac = pageToFrac({ x: 0, y: middleY })
    const h = 0.12
    void addZone(
      { x: 0.06, y: Math.min(1 - h, Math.max(0, frac.y - h / 2)), w: 0.5, h },
      'anotacao',
      'Nova faixa',
    )
  }, [addZone])

  /**
   * A alça de divisa sob o ponto.
   *
   * Vale em QUALQUER ferramenta, sem trocar de modo: é pra quando a faixa ficou
   * pequena no meio da escrita e o que se quer é abrir espaço e continuar. O
   * alvo é a bolinha ⇕ desenhada na margem direita, e só ela — em qualquer
   * outro lugar o dedo continua rolando a folha e a caneta continua escrevendo.
   */
  const hitBoundary = useCallback((pt: Pt): ZoneBoundary | null => {
    const st = stateRef.current
    if (!st.showZones && st.tool !== 'zone') return null

    const scale = computeMetrics(viewRef.current, layoutRef.current).scale
    const reach = boundaryHandleRadius(scale)
    if (Math.abs(pt.x - (PAGE_WIDTH - BOUNDARY_HANDLE_X)) > reach) return null

    const frac = pageToFrac(pt)
    return boundaryAt(zoneBoundaries(st.zones), frac.y, reach / SHEET)
  }, [])

  // ─── Pinça ─────────────────────────────────────────────────────────────────

  const beginPinch = useCallback(() => {
    const [a, b] = [...touchesRef.current.values()]
    if (!a || !b) return
    pinchingRef.current = true
    gestureRef.current = {
      kind: 'pinch',
      pointerId: -1,
      fromDistance: pinchDistance(a, b),
      fromView: { ...viewRef.current },
      fromScreen: midpoint(a, b),
    }
    dirty.current = true
  }, [])

  const updatePinch = useCallback(() => {
    const gesture = gestureRef.current
    if (gesture?.kind !== 'pinch' || !gesture.fromDistance || !gesture.fromView) return
    const [a, b] = [...touchesRef.current.values()]
    if (!a || !b) return

    const distance = pinchDistance(a, b)
    if (distance < 1) return

    const nextZoom = clampZoom(gesture.fromView.zoom * (distance / gesture.fromDistance))
    const center = midpoint(a, b)

    // Âncora: o ponto da folha que estava entre os dedos quando a pinça começou
    // continua entre os dedos agora. É isso que faz o gesto não escorregar.
    const from = computeMetrics(gesture.fromView, layoutRef.current)
    const anchorPage = screenToPage(gesture.fromScreen!.x, gesture.fromScreen!.y, from)

    const zoomed: ViewState = { ...viewRef.current, zoom: nextZoom }
    const after = computeMetrics(zoomed, layoutRef.current)

    applyView({
      zoom: nextZoom,
      scrollX: anchorPage.x - (center.x - after.offsetX) / after.scale,
      scrollY: anchorPage.y - center.y / after.scale,
    })
  }, [applyView])

  // ─── Eventos de ponteiro ───────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!page) return
      const isPen = event.pointerType === 'pen'
      const isTouch = event.pointerType === 'touch'

      if (isPen) penTracker.current.notePen()

      if (isTouch) {
        touchesRef.current.set(event.pointerId, toScreen(event))

        // Dois dedos: pinça, mesmo que um arrasto já tivesse começado.
        if (touchesRef.current.size === 2) {
          beginPinch()
          return
        }
        // A mão apoiada não rola a folha enquanto a caneta está em uso.
        if (penTracker.current.shouldRejectTouch()) return
        if (gestureRef.current) return

        pressRef.current = { at: Date.now(), screen: toScreen(event) }

        // Com a ferramenta de zonas, o dedo ajusta a folha em vez de rolá-la.
        if (stateRef.current.tool === 'zone') {
          beginZoneGesture(toPage(event), event.pointerId)
          return
        }

        // A alça ⇕ da divisa funciona com o dedo em qualquer ferramenta.
        const divisaToque = hitBoundary(toPage(event))
        if (divisaToque) {
          liveZonesRef.current = null
          gestureRef.current = {
            kind: 'boundary',
            pointerId: event.pointerId,
            boundary: divisaToque,
            grabPage: toPage(event),
          }
          dirty.current = true
          return
        }

        gestureRef.current = {
          kind: 'pan',
          pointerId: event.pointerId,
          fromScreen: toScreen(event),
          fromView: { ...viewRef.current },
        }
        armLongPress(toPage(event))
        return
      }

      if (gestureRef.current) return

      const pt = toPage(event)
      const st = stateRef.current

      if (st.tool === 'zone') {
        event.currentTarget.setPointerCapture(event.pointerId)
        beginZoneGesture(pt, event.pointerId)
        return
      }

      // Ferramenta de imagem: escolher, mover e redimensionar. A caneta só
      // mexe em imagem aqui — nas outras ferramentas ela escreve por cima.
      if (st.tool === 'image') {
        event.currentTarget.setPointerCapture(event.pointerId)

        if (onDeleteBadge(pt)) {
          setConfirmDelete(true)
          dirty.current = true
          return
        }

        const handle = onResizeHandle(pt)
        if (handle) {
          gestureRef.current = {
            kind: 'resizeImage',
            pointerId: event.pointerId,
            imageId: handle.id,
            imageStart: { ...handle.rect },
            grabPage: pt,
          }
          return
        }
        const hit = imageAt(pt)
        selectImage(hit?.id ?? null)
        if (hit) {
          gestureRef.current = {
            kind: 'moveImage',
            pointerId: event.pointerId,
            imageId: hit.id,
            imageStart: { ...hit.rect },
            grabPage: pt,
          }
        }
        dirty.current = true
        return
      }

      // Antes do carimbo e antes da escrita: a alça é um alvo pequeno e
      // explícito, e quem encostou nela queria mexer na faixa.
      const divisa = hitBoundary(pt)
      if (divisa) {
        event.currentTarget.setPointerCapture(event.pointerId)
        liveZonesRef.current = null
        gestureRef.current = {
          kind: 'boundary',
          pointerId: event.pointerId,
          boundary: divisa,
          grabPage: pt,
        }
        dirty.current = true
        return
      }

      const marker = hitItemMarker(pt)
      if (marker) {
        void toggleItemStatus(marker)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      pressRef.current = { at: Date.now(), screen: toScreen(event) }

      // Botão lateral da caneta apaga, quando existe.
      const eraseByButton = event.buttons === 32 || event.button === 5

      if (st.tool === 'eraser' || eraseByButton) {
        eraserCursorRef.current = pt
        beginErase()
        gestureRef.current = { kind: 'erase', pointerId: event.pointerId, lasso: [pt] }
      } else if (st.tool === 'lasso') {
        gestureRef.current = { kind: 'lasso', pointerId: event.pointerId, lasso: [pt] }
      } else {
        const builder = new StrokeBuilder()
        builder.add(pt.x, pt.y, pressureFrom(event.nativeEvent))
        gestureRef.current = { kind: 'draw', pointerId: event.pointerId, builder }
      }
      dirty.current = true
    },
    [
      page,
      toPage,
      toScreen,
      hitBoundary,
      beginZoneGesture,
      hitItemMarker,
      toggleItemStatus,
      beginPinch,
      beginErase,
      imageAt,
      onResizeHandle,
      onDeleteBadge,
      selectImage,
    ],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'pen') penTracker.current.notePen()

      if (event.pointerType === 'touch') {
        if (!touchesRef.current.has(event.pointerId)) return
        touchesRef.current.set(event.pointerId, toScreen(event))

        // Dedo que anda quer rolar a folha, não abrir a imagem.
        const press = pressRef.current
        if (press) {
          const now = toScreen(event)
          if (Math.hypot(now.x - press.screen.x, now.y - press.screen.y) > TAP_MAX_MOVE) {
            cancelLongPress()
          }
        }

        if (gestureRef.current?.kind === 'pinch') {
          updatePinch()
          return
        }
      }

      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return

      if (gesture.kind === 'pan') {
        // Com zoom, o arrasto passa a valer nos dois eixos.
        const now = toScreen(event)
        const m = computeMetrics(gesture.fromView!, layoutRef.current)
        applyView({
          zoom: gesture.fromView!.zoom,
          scrollX: gesture.fromView!.scrollX + (gesture.fromScreen!.x - now.x) / m.scale,
          scrollY: gesture.fromView!.scrollY + (gesture.fromScreen!.y - now.y) / m.scale,
        })
        return
      }

      const pt = toPage(event)

      if (gesture.kind === 'boundary' && gesture.boundary && gesture.grabPage) {
        const d = deltaToFrac(0, pt.y - gesture.grabPage.y)
        const changes = dragBoundary(stateRef.current.zones, gesture.boundary, d.dy)
        liveZonesRef.current = changes.size > 0 ? changes : null
        dirty.current = true
        return
      }

      if (gesture.kind === 'zone' && gesture.grabPage) {
        // O deslocamento é medido em px de página e só depois vira fração: a
        // fração dá a volta ao passar de uma folha pra outra, e a diferença
        // entre 0,99 e 0,01 jogaria a zona pro topo no meio do arrasto.
        const d = deltaToFrac(pt.x - gesture.grabPage.x, pt.y - gesture.grabPage.y)

        if (gesture.zoneId && gesture.zoneHandle && gesture.zoneStart) {
          liveZonesRef.current = new Map([
            [gesture.zoneId, dragZone(gesture.zoneStart, gesture.zoneHandle, d.dx, d.dy)],
          ])
        } else if (gesture.grabFrac) {
          zoneDraftRef.current = rectFromDrag(gesture.grabFrac, {
            x: gesture.grabFrac.x + d.dx,
            y: gesture.grabFrac.y + d.dy,
          })
        }
        dirty.current = true
        return
      }

      if (gesture.kind === 'moveImage' && gesture.imageStart && gesture.grabPage) {
        void updateImageRect(gesture.imageId!, {
          ...gesture.imageStart,
          x: gesture.imageStart.x + (pt.x - gesture.grabPage.x),
          y: gesture.imageStart.y + (pt.y - gesture.grabPage.y),
        })
        dirty.current = true
        return
      }

      if (gesture.kind === 'resizeImage' && gesture.imageStart && gesture.grabPage) {
        // A proporção é preservada: o arrasto define a largura e a altura segue.
        const start = gesture.imageStart
        const aspect = start.h / Math.max(1, start.w)
        const w = Math.max(MIN_IMAGE_SIZE, start.w + (pt.x - gesture.grabPage.x))
        void updateImageRect(gesture.imageId!, { ...start, w, h: w * aspect })
        dirty.current = true
        return
      }

      if (gesture.kind === 'draw' && gesture.builder) {
        // getCoalescedEvents devolve os pontos que o navegador agrupou entre
        // dois quadros — é o que preserva o formato do traço em movimento rápido.
        const events = event.nativeEvent.getCoalescedEvents?.() ?? []
        if (events.length > 1) {
          for (const raw of events) {
            const p = toPage(raw)
            gesture.builder.add(p.x, p.y, pressureFrom(raw))
          }
        } else {
          gesture.builder.add(pt.x, pt.y, pressureFrom(event.nativeEvent))
        }
      } else if (gesture.kind === 'erase') {
        // Corta do ponto anterior até este. Trabalhar por segmento — e não por
        // ponto solto — é o que evita buracos quando a mão anda rápido e os
        // eventos chegam espaçados.
        const anterior = gesture.lasso![gesture.lasso!.length - 1] ?? pt
        gesture.lasso!.push(pt)
        eraserCursorRef.current = pt

        const events = event.nativeEvent.getCoalescedEvents?.() ?? []
        if (events.length > 1) {
          let de = anterior
          for (const raw of events) {
            const ate = toPage(raw)
            eraseSweep(de, ate)
            de = ate
          }
        } else {
          eraseSweep(anterior, pt)
        }
      } else if (gesture.kind === 'lasso') {
        gesture.lasso!.push(pt)
      }

      dirty.current = true
    },
    [toPage, toScreen, applyView, updatePinch, updateImageRect, cancelLongPress, eraseSweep],
  )

  /**
   * Foi um toque ou um arrasto?
   *
   * Distinguir os dois é o que permite o toque duplo voltar pra caneta sem
   * apagar nada: com a borracha ligada, um toque parado não apaga — só um
   * arrasto apaga. Também evita a dedada acidental que comeria uma palavra.
   */
  const wasTap = useCallback((press: PressInfo | null, upScreen: Pt | null): boolean => {
    if (!press || !upScreen) return false
    return (
      Date.now() - press.at < TAP_MAX_MS &&
      Math.hypot(upScreen.x - press.screen.x, upScreen.y - press.screen.y) < TAP_MAX_MOVE
    )
  }, [])

  /** Dois toques seguidos, perto um do outro. */
  const wasDoubleTap = useCallback((upScreen: Pt): boolean => {
    const last = lastTapRef.current
    const now = Date.now()
    const near =
      !!last &&
      now - last.at < DOUBLE_TAP_MS &&
      Math.hypot(upScreen.x - last.x, upScreen.y - last.y) < DOUBLE_TAP_MOVE

    lastTapRef.current = near ? null : { at: now, x: upScreen.x, y: upScreen.y }
    return near
  }, [])

  const finishGesture = useCallback(async (upScreen: Pt | null) => {
    const gesture = gestureRef.current
    // O registro do toque é lido depois, na decisão de toque-vs-arrasto; por
    // isso é guardado antes de ser limpo.
    const press = pressRef.current
    gestureRef.current = null
    pressRef.current = null
    if (!gesture) return

    if (gesture.kind === 'draw' && gesture.builder && gesture.builder.length > 0) {
      const points = gesture.builder.points

      // AQUI mora o gesto que substitui a borracha que a caneta não tem.
      //
      // O rabisco LIGA A BORRACHA — não apaga nada por conta própria. Quem
      // escolhe o que apagar é a mão, arrastando depois. Assim o gesto nunca
      // destrói o que estava embaixo dele, e reconhecer errado custa só um
      // toque pra voltar à caneta.
      if (analyzeScribble(points).isScribble) {
        setGestureNotice((n) => n + 1)
        setTool('eraser')
        dirty.current = true
        return
      }

      // O instante do INÍCIO do traço, não o do fim: é ele que liga a tinta ao
      // momento em que foi escrita — e é com ele que o reconhecedor de letra
      // remonta a ordem dos pontos entre traços.
      await commitStroke(points, gesture.builder.startedAt)
    } else if (gesture.kind === 'erase') {
      eraserCursorRef.current = null

      // Toque parado com a borracha não apaga: ele existe pro toque duplo.
      if (upScreen && wasTap(press, upScreen)) {
        await endErase()
        if (wasDoubleTap(upScreen)) {
          setTool('pen')
          setToolNotice(Date.now())
        }
        dirty.current = true
        return
      }

      const apagados = await endErase()
      if (apagados > 0) setErasedCount(apagados)
    } else if (gesture.kind === 'lasso' && gesture.lasso && gesture.lasso.length > 2) {
      setSelection(strokesInsideLasso(stateRef.current.strokes, gesture.lasso))
    } else if (gesture.kind === 'boundary') {
      const live = liveZonesRef.current
      liveZonesRef.current = null
      if (live && live.size > 0) {
        await updateZoneRects([...live].map(([id, rect]) => ({ id, rect })))
      }
    } else if (gesture.kind === 'zone') {
      const live = liveZonesRef.current
      const draft = zoneDraftRef.current
      liveZonesRef.current = null
      zoneDraftRef.current = null
      const rect = gesture.zoneId ? live?.get(gesture.zoneId) : undefined

      if (rect && gesture.zoneId && gesture.zoneStart) {
        // Toque sem arrasto só escolhe a zona; gravar aqui refaria a
        // classificação da tinta inteira à toa.
        if (!sameRect(rect, gesture.zoneStart)) {
          await updateZone(gesture.zoneId, { rect })
        }
      } else if (draft) {
        // Nasce sem significado: o que ela quer dizer é a próxima escolha do
        // usuário, na barra — e chutar por ele encheria o painel de surpresa.
        await addZone(draft, 'anotacao', 'Nova zona')
      }
    }

    dirty.current = true
  }, [
    commitStroke, endErase, setSelection, setTool, wasTap, wasDoubleTap,
    updateZone, updateZoneRects, addZone,
  ])

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'touch') {
        touchesRef.current.delete(event.pointerId)
        cancelLongPress()

        // Toque duplo com o dedo, enquanto a borracha está ligada, volta pra
        // caneta — sem precisar ir até a barra lateral.
        if (
          gestureRef.current?.kind === 'pan' &&
          gestureRef.current.pointerId === event.pointerId &&
          stateRef.current.tool === 'eraser'
        ) {
          const up = toScreen(event)
          if (wasTap(pressRef.current, up) && wasDoubleTap(up)) {
            gestureRef.current = null
            pressRef.current = null
            setTool('pen')
            setToolNotice(Date.now())
            dirty.current = true
            return
          }
        }

        if (gestureRef.current?.kind === 'pinch') {
          // Só encerra a pinça quando o segundo dedo sai; com um dedo ainda na
          // tela, sair direto pro arrasto daria um solavanco na folha.
          if (touchesRef.current.size < 2) {
            gestureRef.current = null
            pinchingRef.current = false
            commitZoom()
            dirty.current = true
          }
          return
        }
      }

      if (gestureRef.current?.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      void finishGesture(toScreen(event))
    },
    [finishGesture, commitZoom, toScreen, wasTap, wasDoubleTap, setTool, cancelLongPress],
  )

  // ─── Roda do mouse: rolar, e com Ctrl, aproximar ───────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const m = computeMetrics(viewRef.current, layoutRef.current)

      if (event.ctrlKey) {
        const rect = canvas.getBoundingClientRect()
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        const factor = Math.exp(-event.deltaY / 300)
        const before = viewRef.current
        const pagePoint = screenToPage(anchor.x, anchor.y, m)
        const zoom = clampZoom(before.zoom * factor)
        const after = computeMetrics({ ...before, zoom }, layoutRef.current)
        applyView({
          zoom,
          scrollX: pagePoint.x - (anchor.x - after.offsetX) / after.scale,
          scrollY: pagePoint.y - anchor.y / after.scale,
        })
        setZoomLabel(formatZoom(viewRef.current.zoom))
        return
      }

      applyView({
        ...viewRef.current,
        scrollX: viewRef.current.scrollX + event.deltaX / m.scale,
        scrollY: viewRef.current.scrollY + event.deltaY / m.scale,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [applyView])

  // Volta ao topo ao trocar de página, mantendo o zoom escolhido.
  useEffect(() => {
    applyView({ ...viewRef.current, scrollX: 0, scrollY: 0 })
  }, [activePageId, applyView])

  const editingItem = editingItemId ? (items.find((i) => i.id === editingItemId) ?? null) : null

  if (!page) {
    return (
      <div className="canvas-empty">
        <p>Nenhuma página aberta.</p>
        <p className="muted">Crie uma página pra começar a escrever.</p>
      </div>
    )
  }

  return (
    <div className="canvas-wrap" ref={attachContainer}>
      <canvas
        ref={canvasRef}
        className={`canvas tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="zoom-control">
        <button onClick={zoomOut} aria-label="Afastar">
          −
        </button>
        <button className="zoom-value" onClick={zoomReset} aria-label="Voltar ao tamanho da folha">
          {zoomLabel}
        </button>
        <button onClick={zoomIn} aria-label="Aproximar">
          +
        </button>
      </div>

      <ScribbleToast trigger={gestureNotice} />

      {/* Escolher arquivo: no Android abre a galeria, onde ficam os prints. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void insertImage(file)
          // Zera pra que escolher o MESMO arquivo de novo volte a disparar.
          e.target.value = ''
        }}
      />

      {tool === 'image' && (
        <div className="image-bar">
          <button className="image-add" onClick={() => fileInputRef.current?.click()}>
            + Adicionar imagem
          </button>
          {selectedImageId ? (
            confirmDelete ? (
              <>
                <span className="image-hint">Excluir esta imagem?</span>
                <button
                  className="image-delete"
                  onClick={() => {
                    void removeImage(selectedImageId)
                    setConfirmDelete(false)
                  }}
                >
                  Sim, excluir
                </button>
                <button className="image-done" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="image-hint">
                  arraste pra mover · alça roxa redimensiona · ✕ exclui
                </span>
                <button className="image-delete" onClick={() => setConfirmDelete(true)}>
                  Excluir
                </button>
              </>
            )
          ) : (
            <span className="image-hint">
              toque numa imagem pra ajustar — ou segure o dedo nela em qualquer ferramenta
            </span>
          )}
          <button
            className="image-done"
            onClick={() => {
              selectImage(null)
              setConfirmDelete(false)
              setTool('pen')
            }}
          >
            Pronto
          </button>
        </div>
      )}

      {tool === 'zone' && (
        <ZoneBar
          zone={zones.find((z) => z.id === selectedZoneId) ?? null}
          confirming={confirmZoneDelete}
          onAdd={addZoneHere}
          onRename={(label) => {
            if (selectedZoneId) void updateZone(selectedZoneId, { label })
          }}
          onKind={(kind) => {
            if (selectedZoneId) void updateZone(selectedZoneId, { kind })
          }}
          onAskDelete={() => setConfirmZoneDelete(true)}
          onCancelDelete={() => setConfirmZoneDelete(false)}
          onDelete={() => {
            if (selectedZoneId) void removeZone(selectedZoneId)
            setConfirmZoneDelete(false)
          }}
          onDone={() => {
            selectZone(null)
            setConfirmZoneDelete(false)
            setTool('pen')
          }}
        />
      )}

      {editingItem && (
        <TextEditor
          key={editingItem.id}
          item={editingItem}
          aviso={transcription.state === 'pronto' ? '' : transcription.message}
          onSave={(text) => {
            void setItemText(editingItem.id, text)
            setEditingItemId(null)
          }}
          onRetranscribe={
            transcription.state === 'indisponivel'
              ? undefined
              : () => void retranscribeItem(editingItem.id)
          }
          onClose={() => setEditingItemId(null)}
        />
      )}

      {imageError && (
        <div className="image-error" role="alert" onClick={() => setImageError(null)}>
          {imageError}
        </div>
      )}

      {erasedCount > 0 && (
        <UndoBar
          count={erasedCount}
          onUndo={async () => {
            await undoErase()
            setErasedCount(0)
          }}
          onDone={() => setErasedCount(0)}
        />
      )}

      {tool === 'eraser' && (
        <button className="eraser-banner" onClick={() => setTool('pen')}>
          <span className="eraser-banner-dot" />
          Borracha ligada — arraste pra apagar
          <strong>2 toques voltam à caneta</strong>
        </button>
      )}

      {/* Estado da leitura da letra, na folha.
          O recurso falhava calado — escrever e não ver nada, sem nenhuma pista
          de que faltava baixar o modelo. Enquanto houver o que dizer, isto fica
          à vista; quando tudo está certo, some sozinho. */}
      {transcription.message && (
        <button
          className={`ocr-banner ${transcription.state === 'erro' ? 'erro' : ''}`}
          onClick={() => {
            // O conserto vem junto do aviso: se o que falta é o interruptor dos
            // campos, o mesmo toque liga e já manda ler.
            if (transcription.acao === 'ligarCampos') toggleAutoFields()
            void transcribePage({ forcar: true })
          }}
        >
          <span className="ocr-banner-dot" />
          {transcription.message}
          {transcription.acao === 'ligarCampos' ? (
            <strong>ligar Campos</strong>
          ) : (
            transcription.state !== 'lendo' &&
            transcription.state !== 'baixando' && <strong>tentar de novo</strong>
          )}
        </button>
      )}

      {toolNotice !== 0 && (
        <ToolNotice
          trigger={toolNotice}
          texto={toolNotice > 0 ? 'De volta à caneta' : 'Imagem selecionada — use a barra abaixo'}
          onDone={() => setToolNotice(0)}
        />
      )}
    </div>
  )
}

function sameRect(a: ZoneRectFrac, b: ZoneRectFrac): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** O que cada tipo de zona significa, na hora de escolher. */
const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  anotacao: 'Anotação (não vira item)',
  pautas: 'Pauta',
  topicos: 'Tópicos',
  tarefas: 'Tarefas',
  duvidas: 'Dúvidas',
  pendencias: 'Pendências',
  documentos: 'Documentos',
  fluxograma: 'Fluxograma',
  livre: 'Livre (não vira item)',
}

/**
 * Barra da ferramenta de zonas.
 *
 * Mora embaixo, junto do polegar, pelo mesmo motivo da barra de imagem: a
 * janela do sistema pode não aparecer dentro do app empacotado, e o alto da
 * tela fica longe da mão que segura o tablet.
 */
function ZoneBar({
  zone,
  confirming,
  onAdd,
  onRename,
  onKind,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onDone,
}: {
  zone: Zone | null
  confirming: boolean
  onAdd: () => void
  onRename: (label: string) => void
  onKind: (kind: ZoneKind) => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onDone: () => void
}) {
  return (
    <div className="image-bar zone-bar">
      {!confirming && (
        <button className="image-add" onClick={onAdd}>
          + Nova faixa
        </button>
      )}
      {zone ? (
        confirming ? (
          <>
            <span className="image-hint">Excluir a faixa "{zone.label || 'sem nome'}"?</span>
            <button className="image-delete" onClick={onDelete}>
              Sim, excluir
            </button>
            <button className="image-done" onClick={onCancelDelete}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <ZoneNameField key={zone.id} value={zone.label} onSave={onRename} />
            <select
              className="zone-kind"
              value={zone.kind}
              onChange={(e) => onKind(e.target.value as ZoneKind)}
              style={{ color: ZONE_COLORS[zone.kind] }}
              aria-label="O que esta faixa significa"
            >
              {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {ZONE_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
            <span className="image-hint">arraste a faixa ou os cantos</span>
            <button className="image-delete" onClick={onAskDelete}>
              Excluir
            </button>
          </>
        )
      ) : (
        <span className="image-hint">toque numa faixa pra ajustar e mover</span>
      )}
      <button className="image-done" onClick={onDone}>
        Pronto
      </button>
    </div>
  )
}

/** Nome da faixa. Guardado num rascunho local pra não gravar a cada letra. */
function ZoneNameField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      className="zone-name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) onSave(draft.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      placeholder="Nome da faixa"
      aria-label="Nome da faixa"
    />
  )
}

/**
 * Editor do texto de um campo, aberto segurando o dedo sobre a linha escrita.
 *
 * É o conserto da transcrição errada e a saída pra quando não há transcrição
 * nenhuma (no navegador, e enquanto o modelo de escrita não foi baixado): o
 * texto escrito aqui é do usuário e nunca mais é sobrescrito pela leitura
 * automática.
 */
function TextEditor({
  item,
  aviso,
  onSave,
  onRetranscribe,
  onClose,
}: {
  item: Item
  aviso: string
  onSave: (text: string) => void
  onRetranscribe?: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(item.title)

  const estado =
    item.ocr.status === 'manual'
      ? 'texto escrito por você'
      : item.ocr.status === 'pronto'
        ? 'lido da sua letra'
        : item.ocr.status === 'falhou'
          ? item.ocr.reason
          : 'ainda não transcrito'

  return (
    <div className="text-editor" role="dialog" aria-label="Texto deste campo">
      <textarea
        className="text-editor-field"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSave(draft)
          }
        }}
        placeholder="O que está escrito aqui"
        rows={2}
      />
      <div className="text-editor-row">
        <span className="text-editor-state">{aviso || estado}</span>
        {onRetranscribe && (
          <button
            className="image-done"
            onClick={() => {
              onRetranscribe()
              onClose()
            }}
          >
            Ler de novo
          </button>
        )}
        <button className="image-done" onClick={onClose}>
          Fechar
        </button>
        <button className="image-add" onClick={() => onSave(draft)}>
          Salvar
        </button>
      </div>
    </div>
  )
}

/** Confirmação curta de que um gesto trocou de ferramenta. */
function ToolNotice({
  trigger,
  texto,
  onDone,
}: {
  trigger: number
  texto: string
  onDone: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1600)
    return () => clearTimeout(timer)
  }, [trigger, onDone])

  return (
    <div className="scribble-toast" role="status">
      <span className="scribble-toast-icon">{trigger > 0 ? '✎' : '🖼'}</span>
      {texto}
    </div>
  )
}

/**
 * Aviso do que foi apagado, com volta.
 *
 * Apagar é o único caminho do app onde se perde trabalho sem recuperação. O
 * aviso some sozinho, mas enquanto está na tela cobre o engano percebido na
 * hora — que é quando quase todo engano é percebido.
 */
function UndoBar({
  count,
  onUndo,
  onDone,
}: {
  count: number
  onUndo: () => void
  onDone: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, 5000)
    return () => clearTimeout(timer)
  }, [count, onDone])

  return (
    <div className="undo-bar" role="status">
      {/* Sem contagem de traços: a borracha corta pedaços, e dizer "1 traço
          apagado" depois de tirar um naco do meio de uma palavra confunde. */}
      Trecho apagado
      <button onClick={onUndo}>Desfazer</button>
    </div>
  )
}
