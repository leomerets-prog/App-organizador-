import type { Id, Zone } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { PAGE_WIDTH, PAGE_MIN_HEIGHT } from '../domain/constants'

/**
 * Edição das zonas na folha: mover, redimensionar e criar à mão.
 *
 * Tudo aqui trabalha em **fração da folha** (0..1), que é como a zona é
 * guardada — assim a mesma divisão vale em qualquer tela e em qualquer zoom.
 * A conversão de px de página pra fração acontece nas duas funções de ponte do
 * fim do arquivo, num lugar só.
 *
 * O desenho das zonas se repete a cada folha padrão conforme a página cresce
 * pra baixo (ver `SHEET`). Editar da segunda folha em diante muda a mesma zona:
 * é a divisão da folha que está sendo alterada, não uma cópia dela.
 *
 * Módulo puro: sem React, sem banco. Verificado em `tools/zones-test.ts`.
 */

/**
 * Altura PADRÃO de uma folha — a medida em que a divisão em zonas se repete.
 *
 * É só o ponto de partida: cada página guarda a sua (`Page.sheetHeight`), e
 * esticar uma faixa pra baixo estica a folha junto. Antes isto era uma
 * constante, e era ela que travava a faixa no fim da folha.
 */
export const SHEET = PAGE_MIN_HEIGHT

/**
 * Até onde a folha pode esticar.
 *
 * Não é medo de número grande: é que cada folha a mais é uma repetição a mais
 * pra desenhar e pra classificar. Seis folhas de altura já é uma faixa de mais
 * de dez mil px — muito além de qualquer desenho de uma sentada.
 */
export const SHEET_MAX = PAGE_MIN_HEIGHT * 6

export interface ZoneRectFrac {
  x: number
  y: number
  w: number
  h: number
}

export type ZoneHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Tamanho mínimo de uma zona.
 *
 * Zona menor que isto não caberia nem um rótulo nem uma linha de escrita —
 * seria um alvo impossível de acertar de novo pra corrigir.
 */
export const MIN_ZONE_W = 0.06
export const MIN_ZONE_H = 0.025

/** Alça sob o ponto. Canto ganha de borda, e borda ganha do miolo. */
export function handleAt(
  rect: ZoneRectFrac,
  p: Pt,
  tol: { x: number; y: number },
): ZoneHandle | null {
  const right = rect.x + rect.w
  const bottom = rect.y + rect.h

  const nearLeft = Math.abs(p.x - rect.x) <= tol.x
  const nearRight = Math.abs(p.x - right) <= tol.x
  const nearTop = Math.abs(p.y - rect.y) <= tol.y
  const nearBottom = Math.abs(p.y - bottom) <= tol.y

  const insideX = p.x >= rect.x - tol.x && p.x <= right + tol.x
  const insideY = p.y >= rect.y - tol.y && p.y <= bottom + tol.y
  if (!insideX || !insideY) return null

  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearLeft) return 'sw'
  if (nearBottom && nearRight) return 'se'
  if (nearTop) return 'n'
  if (nearBottom) return 's'
  if (nearLeft) return 'w'
  if (nearRight) return 'e'

  const inside = p.x > rect.x && p.x < right && p.y > rect.y && p.y < bottom
  return inside ? 'move' : null
}

/**
 * O retângulo depois do arrasto.
 *
 * Mover nunca muda o tamanho: a zona empurrada contra a borda da folha para,
 * em vez de encolher. Redimensionar respeita o tamanho mínimo e não deixa a
 * borda passar do outro lado (o que inverteria a zona do avesso).
 */
export function dragZone(
  start: ZoneRectFrac,
  handle: ZoneHandle,
  dx: number,
  dy: number,
  /** Até onde a borda de baixo pode ir. Acima de 1 significa esticar a folha. */
  limiteBaixo = 1,
): ZoneRectFrac {
  if (handle === 'move') {
    return {
      w: start.w,
      h: start.h,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    }
  }

  let { x, y, w, h } = start
  const right = x + w
  const bottom = y + h

  if (handle.includes('w')) {
    const nextX = clamp(x + dx, 0, right - MIN_ZONE_W)
    w = right - nextX
    x = nextX
  }
  if (handle.includes('e')) {
    w = clamp(right + dx, x + MIN_ZONE_W, 1) - x
  }
  if (handle.includes('n')) {
    const nextY = clamp(y + dy, 0, bottom - MIN_ZONE_H)
    h = bottom - nextY
    y = nextY
  }
  if (handle.includes('s')) {
    // O teto aqui é 1 por padrão, mas `limiteBaixo` solta a trava: puxar a
    // alça de baixo além do fim da folha é o gesto que ESTICA a folha.
    h = clamp(bottom + dy, y + MIN_ZONE_H, limiteBaixo) - y
  }

  return { x, y, w, h }
}

/**
 * Estica uma faixa pra baixo, esticando a FOLHA junto.
 *
 * Era aqui que o usuário batia na parede: a faixa é guardada em fração de uma
 * folha, a divisão se repete a cada folha, e por isso nenhuma faixa podia
 * passar do fim dela. "Não consegui estender muito pra baixo" era exatamente
 * esse teto.
 *
 * A saída não é deixar a faixa vazar da folha — isso quebraria a repetição, e
 * a escrita passaria a cair numa faixa diferente da desenhada (ver HANDOFF,
 * armadilha 9). A saída é a folha crescer:
 *
 * - a faixa puxada fica com a altura nova
 * - **as de baixo descem junto**, com a mesma altura de antes, em vez de serem
 *   cobertas — faixa sobreposta faz a mesma linha pertencer a duas
 * - as que estão AO LADO (começam acima do fim da puxada) não se mexem
 * - a folha fica mais alta na mesma medida, e todas as frações são recalculadas
 *
 * Tudo em px absolutos no meio do caminho, de propósito: fração de uma folha
 * que está mudando de tamanho é a receita pra todo mundo escorregar junto.
 */
export function extendDown(
  zones: readonly Zone[],
  zoneId: Id,
  sheet: number,
  /** Onde o dedo soltou, em fração da folha ATUAL. Pode passar de 1. */
  novoFundo: number,
): { sheet: number; rects: Map<Id, ZoneRectFrac> } | null {
  const alvo = zones.find((z) => z.id === zoneId)
  if (!alvo) return null
  const alto = sheet > 0 && Number.isFinite(sheet) ? sheet : SHEET
  if (!Number.isFinite(novoFundo)) return null

  const fundoAntigo = (alvo.rect.y + alvo.rect.h) * alto
  const fundoNovo = Math.min(novoFundo * alto, SHEET_MAX)
  const cresce = fundoNovo - fundoAntigo
  // Encolher não estica folha nenhuma: é o redimensionamento de sempre.
  if (cresce <= 0.5) return null

  const novaFolha = Math.min(SHEET_MAX, alto + cresce)
  const passo = novaFolha - alto
  if (passo <= 0.5) return null

  const rects = new Map<Id, ZoneRectFrac>()
  for (const zone of zones) {
    const topo = zone.rect.y * alto
    const altura = zone.rect.h * alto

    let topoNovo = topo
    let alturaNova = altura
    if (zone.id === zoneId) {
      alturaNova = altura + passo
    } else if (topo >= fundoAntigo - 0.5) {
      topoNovo = topo + passo
    }

    rects.set(zone.id, {
      x: zone.rect.x,
      w: zone.rect.w,
      y: clamp(topoNovo / novaFolha, 0, 1),
      h: clamp(alturaNova / novaFolha, MIN_ZONE_H, 1),
    })
  }

  return { sheet: novaFolha, rects }
}

/** Retângulo desenhado à mão. Devolve nulo quando ficou pequeno demais pra valer. */
export function rectFromDrag(a: Pt, b: Pt): ZoneRectFrac | null {
  const x = clamp(Math.min(a.x, b.x), 0, 1)
  const y = clamp(Math.min(a.y, b.y), 0, 1)
  const w = clamp(Math.abs(a.x - b.x), 0, 1 - x)
  const h = clamp(Math.abs(a.y - b.y), 0, 1 - y)
  if (w < MIN_ZONE_W || h < MIN_ZONE_H) return null
  return { x, y, w, h }
}

/**
 * A zona sob o ponto, em fração. A menor ganha — é a mesma regra da escrita
 * (`zones/hit.ts`), pra que editar e escrever nunca discordem sobre onde se
 * está pisando.
 */
export function zoneAtFrac(zones: readonly Zone[], p: Pt): Zone | null {
  let best: Zone | null = null
  let bestArea = Infinity
  for (const zone of zones) {
    const r = zone.rect
    if (p.x < r.x || p.x > r.x + r.w) continue
    if (p.y < r.y || p.y > r.y + r.h) continue
    const area = r.w * r.h
    if (area < bestArea) {
      best = zone
      bestArea = area
    }
  }
  return best
}

/**
 * Teto de folhas desenhadas numa passada.
 *
 * A escala de exibição tem um piso minúsculo, de propósito: é ele que impede a
 * matriz degenerada que derrubava o navegador quando a área da folha media zero
 * (girar o tablet, abrir e fechar o ☰ — ver HANDOFF). Só que com escala mínima
 * a "altura visível" em px de página vira milhões, e um laço que anda de folha
 * em folha passaria a rodar dezenas de milhares de vezes POR QUADRO: o desenho
 * engasga, o Android acha que o app travou e fecha o app.
 *
 * Nenhuma tela mostra mais que um punhado de folhas ao mesmo tempo, então o
 * teto não tira nada de ninguém.
 */
export const MAX_SHEETS = 12

/** Faixa de folhas visível, protegida contra medida degenerada. */
export function visibleSheets(
  top: number,
  bottom: number,
  sheet = SHEET,
): { first: number; last: number } {
  const alto = sheet > 0 && Number.isFinite(sheet) ? sheet : SHEET
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) {
    const only = Number.isFinite(top) ? Math.floor(top / alto) : 0
    return { first: only, last: only }
  }
  const first = Math.floor(top / alto)
  const last = Math.min(Math.floor(bottom / alto), first + MAX_SHEETS)
  return { first, last }
}

// ─── Divisas entre faixas ────────────────────────────────────────────────────

/** Duas alturas mais próximas que isto são a mesma divisa. */
const BOUNDARY_EPS = 0.004

export interface ZoneBoundary {
  /** Altura da divisa, em fração da folha. */
  y: number
  /** Faixas que terminam nela (crescem pra baixo quando a divisa desce). */
  above: Id[]
  /** Faixas que começam nela (encolhem quando a divisa desce). */
  below: Id[]
}

/**
 * As divisas horizontais entre as faixas.
 *
 * É por aqui que a faixa cresce sem trocar de ferramenta: a divisa entre
 * "Dúvidas" e a faixa de baixo é uma só linha, e arrastá-la dá espaço a uma
 * tirando da outra. Crescer sem tirar de ninguém faria as faixas se
 * sobreporem, e aí a mesma linha escrita pertenceria a duas.
 */
export function zoneBoundaries(zones: readonly Zone[]): ZoneBoundary[] {
  const found: ZoneBoundary[] = []

  const place = (y: number): ZoneBoundary => {
    const near = found.find((b) => Math.abs(b.y - y) <= BOUNDARY_EPS)
    if (near) return near
    const fresh: ZoneBoundary = { y, above: [], below: [] }
    found.push(fresh)
    return fresh
  }

  for (const zone of zones) {
    const top = zone.rect.y
    const bottom = zone.rect.y + zone.rect.h
    // O topo e o fim da folha não são divisas: não há o que crescer além deles.
    if (top > BOUNDARY_EPS) place(top).below.push(zone.id)
    if (bottom < 1 - BOUNDARY_EPS) place(bottom).above.push(zone.id)
  }

  return found.sort((a, b) => a.y - b.y)
}

/**
 * Move uma divisa, crescendo umas faixas e encolhendo outras.
 *
 * O deslocamento é aparado pelo vizinho mais apertado: a divisa para quando a
 * primeira faixa envolvida chegaria ao tamanho mínimo. Assim nenhuma faixa
 * some no meio do arrasto — e o que estava escrito nela continua dentro dela.
 */
export function dragBoundary(
  zones: readonly Zone[],
  boundary: ZoneBoundary,
  dy: number,
): Map<Id, ZoneRectFrac> {
  const byId = new Map(zones.map((z) => [z.id, z]))

  let low = -Infinity
  let high = Infinity

  for (const id of boundary.above) {
    const r = byId.get(id)?.rect
    if (!r) continue
    low = Math.max(low, MIN_ZONE_H - r.h)
    high = Math.min(high, 1 - (r.y + r.h))
  }
  for (const id of boundary.below) {
    const r = byId.get(id)?.rect
    if (!r) continue
    low = Math.max(low, -r.y)
    high = Math.min(high, r.h - MIN_ZONE_H)
  }

  const step = clamp(dy, Number.isFinite(low) ? low : dy, Number.isFinite(high) ? high : dy)
  const out = new Map<Id, ZoneRectFrac>()
  if (step === 0) return out

  for (const id of boundary.above) {
    const r = byId.get(id)?.rect
    if (r) out.set(id, { ...r, h: r.h + step })
  }
  for (const id of boundary.below) {
    const r = byId.get(id)?.rect
    if (r) out.set(id, { ...r, y: r.y + step, h: r.h - step })
  }
  return out
}

/** A divisa sob o ponto, se houver alguma dentro da tolerância. */
export function boundaryAt(
  boundaries: readonly ZoneBoundary[],
  y: number,
  tolerance: number,
): ZoneBoundary | null {
  let best: ZoneBoundary | null = null
  let bestGap = Infinity
  for (const boundary of boundaries) {
    const gap = Math.abs(boundary.y - y)
    if (gap <= tolerance && gap < bestGap) {
      best = boundary
      bestGap = gap
    }
  }
  return best
}

// ─── Ponte entre px de página e fração ───────────────────────────────────────

/**
 * Ponto da folha em fração da divisão.
 *
 * O resto da divisão pela folha padrão é o que faz a segunda tela de folha
 * mostrar a mesma divisão da primeira — e é o mesmo cálculo que classifica a
 * escrita em `zones/hit.ts`.
 */
export function pageToFrac(p: Pt, sheet = SHEET): Pt {
  const alto = sheet > 0 && Number.isFinite(sheet) ? sheet : SHEET
  return {
    x: p.x / PAGE_WIDTH,
    // Na margem acima da folha (y < 0) o ponto fica no topo da primeira
    // folha — não no fim dela, que é onde o resto da divisão o jogava.
    y: p.y < 0 ? 0 : (p.y % alto) / alto,
  }
}

/** Distância em px de página convertida em fração (sem o resto da divisão). */
export function deltaToFrac(dx: number, dy: number, sheet = SHEET): { dx: number; dy: number } {
  const alto = sheet > 0 && Number.isFinite(sheet) ? sheet : SHEET
  return { dx: dx / PAGE_WIDTH, dy: dy / alto }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
