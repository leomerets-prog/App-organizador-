import { useEffect, useRef } from 'react'
import { getDb } from '../db/database'
import type { Bounds, Stroke } from '../domain/types'
import { strokeToPath } from '../ink/stroke'

/**
 * Recorte da letra do usuário.
 *
 * É isto que faz o painel ser reconhecível sem transcrição: você bate o olho e
 * já sabe qual anotação é, porque é a sua própria letra.
 */
export function InkThumbnail({ itemId, bounds }: { itemId: string; bounds: Bounds }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false

    const draw = async () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const db = await getDb()
      const item = await db.get('items', itemId)
      if (!item || cancelled) return

      const strokes = (
        await Promise.all(item.strokeIds.map((id) => db.get('strokes', id)))
      ).filter((s): s is Stroke => !!s)
      if (cancelled || strokes.length === 0) return

      const w = Math.max(1, bounds.maxX - bounds.minX)
      const h = Math.max(1, bounds.maxY - bounds.minY)
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)

      // Encaixa o recorte na miniatura sem distorcer.
      const scale = Math.min(rect.width / w, rect.height / h, 1.4)
      const offsetX = (rect.width - w * scale) / 2
      const offsetY = (rect.height - h * scale) / 2

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)
      ctx.translate(-bounds.minX, -bounds.minY)

      for (const stroke of strokes) {
        const d = strokeToPath(stroke.points, {
          color: stroke.color,
          width: stroke.width,
          tool: stroke.tool,
        })
        if (!d) continue
        ctx.fillStyle = stroke.color
        ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1
        ctx.fill(new Path2D(d))
      }
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [itemId, bounds])

  return <canvas className="ink-thumb" ref={canvasRef} />
}
