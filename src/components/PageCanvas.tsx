import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { THEMES, render } from '../ink/renderer'
import type { Viewport } from '../ink/renderer'
import { PenTracker, StrokeBuilder, pressureFrom, strokesHitByPath, strokesInsideLasso } from '../ink/input'
import { analyzeScribble } from '../ink/scribble'
import { PAGE_WIDTH } from '../domain/constants'
import type { Pt } from '../lib/geometry'
import { ScribbleToast } from './ScribbleToast'

/**
 * A folha.
 *
 * Um canvas só, redesenhado por requestAnimationFrame quando algo muda. O
 * traço em andamento é desenhado direto do buffer de pontos, sem passar pelo
 * estado do React — é isso que segura a escrita fluida na velocidade da caneta.
 */

interface Gesture {
  kind: 'draw' | 'erase' | 'lasso' | 'pan'
  pointerId: number
  builder?: StrokeBuilder
  lasso?: Pt[]
  panStartY?: number
  panStartScroll?: number
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
  const selection = useStore((s) => s.selection)
  const theme = useStore((s) => s.theme)

  const commitStroke = useStore((s) => s.commitStroke)
  const eraseStrokes = useStore((s) => s.eraseStrokes)
  const setSelection = useStore((s) => s.setSelection)
  const toggleItemStatus = useStore((s) => s.toggleItemStatus)
  const setTool = useStore((s) => s.setTool)

  const page = pages.find((p) => p.id === activePageId) ?? null

  const [scrollY, setScrollY] = useState(0)
  const [gestureNotice, setGestureNotice] = useState(0)

  // Referências mutáveis: mudam a cada evento de ponteiro e não devem
  // provocar re-render do React.
  const gestureRef = useRef<Gesture | null>(null)
  const penTracker = useRef(new PenTracker())
  const pendingErase = useRef<Set<string>>(new Set())
  const dirty = useRef(true)
  const scrollRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0 })

  scrollRef.current = scrollY

  // Espelhos do estado pro laço de desenho, que roda fora do ciclo do React.
  const stateRef = useRef({ strokes, zones, items, tool, penColor, penWidth, showZones, selection, theme })
  stateRef.current = { strokes, zones, items, tool, penColor, penWidth, showZones, selection, theme }

  const markDirty = useCallback(() => {
    dirty.current = true
  }, [])

  useEffect(markDirty, [strokes, zones, items, showZones, selection, scrollY, theme, markDirty])

  // ─── Escala e tamanho ──────────────────────────────────────────────────────

  const scaleRef = useRef(1)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    sizeRef.current = { w: rect.width, h: rect.height }
    // A folha ocupa a largura toda: a escrita fica do mesmo tamanho relativo
    // em qualquer tablet.
    scaleRef.current = rect.width / PAGE_WIDTH
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

      const viewport: Viewport = {
        scrollY: scrollRef.current,
        pageWidth: PAGE_WIDTH,
        pageHeight: page.height,
        scale: scaleRef.current,
        viewWidth: sizeRef.current.w,
        viewHeight: sizeRef.current.h,
      }

      render(ctx, {
        strokes: st.strokes,
        zones: st.zones,
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
        pendingErase: pendingErase.current,
        selected: st.selection,
        showZones: st.showZones,
        theme: THEMES[st.theme],
      })

      dirty.current = false
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [page])

  // ─── Conversão de coordenadas ──────────────────────────────────────────────

  const toPage = useCallback((event: PointerEvent | React.PointerEvent): Pt => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / scaleRef.current,
      y: (event.clientY - rect.top) / scaleRef.current + scrollRef.current,
    }
  }, [])

  const maxScroll = page ? Math.max(0, page.height - sizeRef.current.h / scaleRef.current) : 0

  const clampScroll = useCallback(
    (value: number) => Math.max(0, Math.min(value, maxScroll)),
    [maxScroll],
  )

  // ─── Toque no carimbo de item (marcar tarefa como feita) ───────────────────

  const hitItemMarker = useCallback((pt: Pt): string | null => {
    for (const item of stateRef.current.items) {
      const cy = item.bounds.minY + (item.bounds.maxY - item.bounds.minY) / 2
      if (Math.hypot(pt.x - 18, pt.y - cy) <= 16) return item.id
    }
    return null
  }, [])

  // ─── Eventos de ponteiro ───────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!page) return
      const isPen = event.pointerType === 'pen'
      const isTouch = event.pointerType === 'touch'

      if (isPen) penTracker.current.notePen()

      // A mão apoiada não escreve nem rola enquanto a caneta está em uso.
      if (isTouch && penTracker.current.shouldRejectTouch()) return

      // Já existe um gesto em andamento: ignora o segundo ponteiro.
      if (gestureRef.current) return

      const pt = toPage(event)
      const st = stateRef.current

      // O dedo rola a folha; a caneta escreve. Separação clara e previsível.
      if (isTouch) {
        gestureRef.current = {
          kind: 'pan',
          pointerId: event.pointerId,
          panStartY: event.clientY,
          panStartScroll: scrollRef.current,
        }
        return
      }

      const marker = hitItemMarker(pt)
      if (marker) {
        void toggleItemStatus(marker)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)

      // Botão lateral da caneta apaga, quando existe.
      const eraseByButton = event.buttons === 32 || event.button === 5

      if (st.tool === 'eraser' || eraseByButton) {
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
    [page, toPage, hitItemMarker, toggleItemStatus],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      if (event.pointerType === 'pen') penTracker.current.notePen()

      if (gesture.kind === 'pan') {
        const dy = (gesture.panStartY! - event.clientY) / scaleRef.current
        setScrollY(clampScroll(gesture.panStartScroll! + dy))
        return
      }

      const pt = toPage(event)

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
        gesture.lasso!.push(pt)
        for (const id of strokesHitByPath(stateRef.current.strokes, [pt], 14)) {
          pendingErase.current.add(id)
        }
      } else if (gesture.kind === 'lasso') {
        gesture.lasso!.push(pt)
      }

      dirty.current = true
    },
    [toPage, clampScroll],
  )

  const finishGesture = useCallback(async () => {
    const gesture = gestureRef.current
    gestureRef.current = null
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

      await commitStroke(points, Date.now())
    } else if (gesture.kind === 'erase') {
      const ids = [...pendingErase.current]
      pendingErase.current.clear()
      if (ids.length > 0) await eraseStrokes(ids)
    } else if (gesture.kind === 'lasso' && gesture.lasso && gesture.lasso.length > 2) {
      setSelection(strokesInsideLasso(stateRef.current.strokes, gesture.lasso))
    }

    dirty.current = true
  }, [commitStroke, eraseStrokes, setSelection, setTool])

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      void finishGesture()
    },
    [finishGesture],
  )

  // ─── Rolagem por roda do mouse / trackpad ──────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setScrollY((prev) => clampScroll(prev + event.deltaY / scaleRef.current))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [clampScroll])

  // Volta ao topo ao trocar de página.
  useEffect(() => {
    setScrollY(0)
  }, [activePageId])

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
      <ScrollHint scrollY={scrollY} height={page.height} viewHeight={sizeRef.current.h / scaleRef.current} />
      <ScribbleToast trigger={gestureNotice} />
      {tool === 'eraser' && (
        <button className="eraser-banner" onClick={() => setTool('pen')}>
          <span className="eraser-banner-dot" />
          Borracha ligada — arraste pra apagar
          <strong>Voltar à caneta</strong>
        </button>
      )}
    </div>
  )
}

/** Barrinha lateral discreta mostrando onde você está na folha. */
function ScrollHint({
  scrollY,
  height,
  viewHeight,
}: {
  scrollY: number
  height: number
  viewHeight: number
}) {
  if (viewHeight >= height) return null
  const ratio = viewHeight / height
  const top = (scrollY / height) * 100
  return (
    <div className="scroll-hint">
      <div className="scroll-hint-thumb" style={{ top: `${top}%`, height: `${ratio * 100}%` }} />
    </div>
  )
}
