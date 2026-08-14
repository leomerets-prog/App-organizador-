import type { Zone } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { PAGE_WIDTH } from '../domain/constants'

/**
 * Em que zona um ponto da folha caiu.
 *
 * As zonas são guardadas em fração da folha (0..1) pra escalar em qualquer tela,
 * então a conversão pra px de página acontece aqui, num lugar só.
 */

export interface ZoneRect {
  x: number
  y: number
  w: number
  h: number
}

export function zoneRectInPage(zone: Zone, pageHeight: number): ZoneRect {
  return {
    x: zone.rect.x * PAGE_WIDTH,
    y: zone.rect.y * pageHeight,
    w: zone.rect.w * PAGE_WIDTH,
    h: zone.rect.h * pageHeight,
  }
}

/**
 * A zona que contém o ponto. Quando zonas se sobrepõem, ganha a menor —
 * a mais específica é a que o usuário quis acertar.
 *
 * `pageHeight` é opcional porque as zonas se repetem a cada tela de folha:
 * na prática usamos a altura de uma "folha" padrão pra que a divisão continue
 * valendo conforme a página cresce pra baixo.
 */
export function zoneAtPoint(zones: Zone[], point: Pt, pageHeight = 1754): Zone | null {
  let best: Zone | null = null
  let bestArea = Infinity

  // A folha rola infinitamente, mas o desenho de zonas se repete a cada folha.
  const localY = ((point.y % pageHeight) + pageHeight) % pageHeight

  for (const zone of zones) {
    const r = zoneRectInPage(zone, pageHeight)
    if (point.x < r.x || point.x > r.x + r.w) continue
    if (localY < r.y || localY > r.y + r.h) continue
    const area = r.w * r.h
    if (area < bestArea) {
      best = zone
      bestArea = area
    }
  }
  return best
}
