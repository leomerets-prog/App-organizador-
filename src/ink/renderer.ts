import type { Item, PageImage, Stroke, Zone } from '../domain/types'
import { ZONE_COLORS } from '../domain/templates'
import { visibleSheets, zoneBoundaries } from '../zones/edit'
import type { ZoneRectFrac } from '../zones/edit'
import { highlighterPaint, pathForStroke, strokeToPath } from './stroke'
import { INK_COLOR, LEGACY_INK_COLOR } from '../domain/constants'
import type { StrokeStyle } from './stroke'
import type { Pt } from '../lib/geometry'
import { getImageElement } from './images'

/**
 * Desenho da folha no canvas.
 *
 * O renderer não sabe nada de React nem de banco: recebe o estado da página e
 * pinta. Isso mantém o laço de desenho barato e testável isoladamente.
 */

export interface Viewport {
  /** Canto visível da folha, em px de página. */
  scrollX: number
  scrollY: number
  /** Largura da folha em px de página (a folha tem largura fixa lógica). */
  pageWidth: number
  /** Altura da folha em px de página. */
  pageHeight: number
  /** Escala de página → tela, já com o zoom aplicado. */
  scale: number
  /** Centralização em px de tela, quando a folha fica menor que a tela. */
  offsetX: number
  /** Tamanho da área visível em px de tela. */
  viewWidth: number
  viewHeight: number
}

export interface RenderInput {
  strokes: Stroke[]
  zones: Zone[]
  items: Item[]
  images: PageImage[]
  /** Imagem em ajuste, que ganha alças de mover e redimensionar. */
  selectedImageId: string | null
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
  /** Mostrar a transcrição na folha, embaixo da letra. */
  showText: boolean
  /** Edição de zonas em curso: zona escolhida e retângulo sendo desenhado. */
  zoneEditing: { selectedZoneId: string | null; draft: ZoneRectFrac | null } | null
  theme: Theme
  /** Rótulo do zoom durante a pinça; nulo quando não há pinça em curso. */
  zoomBadge: string | null
  /** Onde a borracha está e qual o alcance dela, em coordenadas de página. */
  eraserCursor: { x: number; y: number; radius: number } | null
  /** Altura de uma repetição da divisão em zonas, nesta página. */
  sheetHeight: number
}

export interface Theme {
  paper: string
  rule: string
  zoneLabel: string
  ink: string
  /**
   * A emenda entre duas folhas.
   *
   * Cor própria, e não o pautado com transparência: o pautado é feito pra
   * sumir atrás da escrita, e a emenda precisa do contrário — ser vista de
   * relance com a folha reduzida. Com o tom do pautado ela ficava invisível,
   * que é o defeito que ela veio consertar.
   */
  emenda: string
}

export const DARK_THEME: Theme = {
  paper: '#16161a',
  rule: '#232329',
  zoneLabel: '#71717a',
  ink: '#f4f4f5',
  emenda: '#2b2b33',
}

export const LIGHT_THEME: Theme = {
  paper: '#fbfaf7',
  rule: '#e8e4da',
  zoneLabel: '#a1a1aa',
  ink: '#1c1c20',
  emenda: '#d9d3c6',
}

export const THEMES = { dark: DARK_THEME, light: LIGHT_THEME }

/** O papel deste tema é escuro? Decide a mistura do marca-texto. */
function paperIsDark(theme: Theme): boolean {
  return theme.paper === DARK_THEME.paper
}

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

/**
 * A altura da emenda entre duas folhas, em píxeis de página.
 *
 * Larga o bastante pra ser vista de relance com a folha reduzida, e estreita o
 * bastante pra não engolir uma linha de escrita: o pautado anda de 38 em 38.
 */
const FAIXA_EMENDA = 20

/**
 * Teto de pautas desenhadas numa passada, pelo mesmo motivo do teto de folhas
 * em `zones/edit.ts`: com escala degenerada, `bottom` vira milhões.
 */
const MAX_RULES = 400

export function render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { viewport: vp, theme } = input
  const dpr = window.devicePixelRatio || 1

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Fundo
  ctx.fillStyle = theme.paper
  ctx.fillRect(0, 0, vp.viewWidth, vp.viewHeight)

  // A partir daqui trabalhamos em coordenadas de página.
  ctx.translate(vp.offsetX, 0)
  ctx.scale(vp.scale, vp.scale)
  ctx.translate(-vp.scrollX, -vp.scrollY)

  const top = vp.scrollY
  const bottom = vp.scrollY + vp.viewHeight / vp.scale

  drawRules(ctx, vp, theme, top, bottom)
  drawSheetBreaks(ctx, vp, theme, top, bottom, input.sheetHeight)
  if (input.showZones || input.zoneEditing) {
    drawZones(ctx, input.zones, vp, top, bottom, input.zoneEditing, input.sheetHeight)
    drawBoundaryHandles(ctx, input.zones, vp, top, bottom, input.sheetHeight)
  }
  // Imagens ficam sob a tinta: é o que permite anotar por cima de um print.
  drawImages(ctx, input, vp)
  drawStrokes(ctx, input, top, bottom)
  if (input.liveStroke) drawLiveStroke(ctx, input.liveStroke, theme)
  drawItemMarkers(ctx, input.items, vp)
  if (input.showText) drawItemText(ctx, input.items, vp, theme)
  if (input.lassoPath) drawLasso(ctx, input.lassoPath)
  if (input.eraserCursor) drawEraserCursor(ctx, input.eraserCursor, vp, theme)

  ctx.restore()

  // Sobreposições em coordenadas de tela, fora da transformação da folha.
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawScrollHint(ctx, vp, theme)
  if (input.zoomBadge) drawZoomBadge(ctx, vp, theme, input.zoomBadge)
  ctx.restore()
}

/**
 * Indicador de posição na folha.
 *
 * Fica no canvas, e não no HTML, porque durante a pinça a rolagem muda a cada
 * quadro: mantê-lo no HTML obrigaria o React a re-renderizar junto do gesto.
 */
function drawScrollHint(ctx: CanvasRenderingContext2D, vp: Viewport, theme: Theme): void {
  const visibleH = vp.viewHeight / vp.scale
  if (visibleH >= vp.pageHeight) return

  const trackTop = 6
  const trackH = vp.viewHeight - 12
  const thumbH = Math.max(28, (visibleH / vp.pageHeight) * trackH)
  const maxScrollY = Math.max(1, vp.pageHeight - visibleH)
  const thumbY = trackTop + (vp.scrollY / maxScrollY) * (trackH - thumbH)

  ctx.save()
  ctx.fillStyle = theme.ink
  ctx.globalAlpha = 0.18
  roundRect(ctx, vp.viewWidth - 6, thumbY, 3, thumbH, 1.5)
  ctx.fill()
  ctx.restore()
}

/** Porcentagem do zoom, mostrada só enquanto os dedos estão na tela. */
function drawZoomBadge(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  theme: Theme,
  label: string,
): void {
  ctx.save()
  ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif'
  const w = ctx.measureText(label).width + 26
  const h = 34
  const x = (vp.viewWidth - w) / 2
  const y = 16

  ctx.globalAlpha = 0.9
  ctx.fillStyle = theme.paper
  roundRect(ctx, x, y, w, h, 17)
  ctx.fill()
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = theme.ink
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.fillStyle = theme.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, vp.viewWidth / 2, y + h / 2 + 0.5)
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawRules(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  theme: Theme,
  top: number,
  bottom: number,
): void {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return

  ctx.strokeStyle = theme.rule
  ctx.lineWidth = 1
  ctx.beginPath()
  const first = Math.floor(top / RULE_SPACING) * RULE_SPACING
  // O teto vale pelo mesmo motivo das folhas: com escala degenerada, `bottom`
  // vira milhões e este laço sozinho desenharia centenas de milhares de linhas.
  const limit = Math.min(bottom, first + MAX_RULES * RULE_SPACING)
  for (let y = first; y <= limit; y += RULE_SPACING) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(vp.pageWidth, y + 0.5)
  }
  ctx.stroke()
}

/**
 * Onde uma folha acaba e a outra começa.
 *
 * A divisão em zonas se REPETE a cada folha, e até aqui nada marcava a emenda:
 * "Pendências" terminava e "Pauta" recomeçava logo abaixo, sem nada no meio. O
 * relato foi *"o espaçamento das páginas está sem acabamento"* — e estava
 * mesmo: a folha virava uma tira infinita onde os nomes das zonas reapareciam
 * sem explicação.
 *
 * ## O que esta faixa é, e o que ela NÃO é
 *
 * Ela é só pintura. O espaço de desenho continua CONTÍNUO — tinta escrita em
 * cima da emenda continua valendo, e a classificação por zona (`zones/hit.ts`,
 * que usa o resto da divisão pela folha) não muda em nada. Abrir um vão de
 * verdade mexeria em todas as coordenadas já gravadas, o que é o jeito mais
 * fácil de perder o caderno de alguém.
 *
 * Fica desenhada ANTES da tinta, de propósito: é papel, e papel não cobre o
 * que foi escrito.
 */
function drawSheetBreaks(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  theme: Theme,
  top: number,
  bottom: number,
  alto: number,
): void {
  if (!Number.isFinite(alto) || alto <= 0) return
  const { first, last } = visibleSheets(top, bottom, alto)

  ctx.save()
  for (let sheet = Math.max(1, first); sheet <= last + 1; sheet++) {
    const y = sheet * alto
    if (y < top - FAIXA_EMENDA || y > bottom + FAIXA_EMENDA) continue

    // A faixa: é a sombra entre duas folhas, e tem que se ver de relance.
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.emenda
    ctx.fillRect(0, y - FAIXA_EMENDA / 2, vp.pageWidth, FAIXA_EMENDA)

    // E um traço firme nas duas bordas, pra emenda ter começo e fim.
    ctx.strokeStyle = theme.emenda
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y - FAIXA_EMENDA / 2 + 0.5)
    ctx.lineTo(vp.pageWidth, y - FAIXA_EMENDA / 2 + 0.5)
    ctx.moveTo(0, y + FAIXA_EMENDA / 2 - 0.5)
    ctx.lineTo(vp.pageWidth, y + FAIXA_EMENDA / 2 - 0.5)
    ctx.stroke()

    // O número da folha, pra saber em qual se está sem contar as emendas.
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.zoneLabel
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(`FOLHA ${sheet + 1}`, vp.pageWidth - 14, y)
    ctx.textAlign = 'left'
  }
  ctx.restore()
}

/**
 * As zonas, repetidas a cada folha padrão.
 *
 * A divisão se repete conforme a página cresce pra baixo — e precisa ser
 * desenhada assim, porque é assim que a escrita é classificada (`zones/hit.ts`
 * usa o resto da divisão pela folha). Enquanto isto esticava as faixas pela
 * altura inteira da página, o que estava desenhado como "Tarefas" na segunda
 * tela de folha não era a zona de tarefas de verdade.
 */
function drawZones(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  vp: Viewport,
  top: number,
  bottom: number,
  editing: RenderInput['zoneEditing'],
  alto: number,
): void {
  const { first: firstSheet, last: lastSheet } = visibleSheets(top, bottom, alto)

  for (let sheet = firstSheet; sheet <= lastSheet; sheet++) {
    const baseY = sheet * alto
    for (const zone of zones) {
      if (zone.kind === 'livre' && !zone.label && !editing) continue

      const x = zone.rect.x * vp.pageWidth
      const y = baseY + zone.rect.y * alto
      const w = zone.rect.w * vp.pageWidth
      const h = zone.rect.h * alto
      const color = ZONE_COLORS[zone.kind]
      const chosen = editing?.selectedZoneId === zone.id

      ctx.save()
      ctx.strokeStyle = color
      ctx.globalAlpha = chosen ? 0.95 : 0.28
      ctx.lineWidth = chosen ? 2.5 : 1.5
      ctx.setLineDash(chosen ? [] : [6, 6])
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      ctx.setLineDash([])

      if (chosen) {
        ctx.globalAlpha = 0.1
        ctx.fillStyle = color
        ctx.fillRect(x, y, w, h)
        ctx.globalAlpha = 1
        drawZoneHandles(ctx, x, y, w, h, color, vp.scale)
      }

      if (zone.label) {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = color
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(zone.label.toUpperCase(), x + 10, y + 8)
      }
      ctx.restore()
    }
  }

  // Retângulo da zona que está sendo criada à mão, no lugar onde o dedo está.
  if (editing?.draft) {
    const d = editing.draft
    const sheet = Math.floor(top / alto)
    ctx.save()
    ctx.strokeStyle = ZONE_COLORS.anotacao
    ctx.setLineDash([8, 6])
    ctx.lineWidth = 2
    ctx.strokeRect(
      d.x * vp.pageWidth,
      sheet * alto + d.y * alto,
      d.w * vp.pageWidth,
      d.h * alto,
    )
    ctx.restore()
  }
}

/**
 * Distância da alça de divisa até a borda direita da folha, em px de página.
 *
 * Fica na direita porque o carimbo do item mora na margem esquerda — duas
 * coisas arrastáveis no mesmo lugar seria um alvo disputado.
 */
export const BOUNDARY_HANDLE_X = 26

/** Alcance do toque na alça de divisa, em px de página. */
export function boundaryHandleRadius(scale: number): number {
  return 20 / Math.max(0.1, scale)
}

/**
 * Alças de crescer faixa, na divisa entre duas delas.
 *
 * Existem pra quando a faixa fica pequena no meio do trabalho: puxar a divisa
 * dá espaço à de cima tirando da de baixo, sem trocar de ferramenta e sem
 * parar de escrever.
 */
function drawBoundaryHandles(
  ctx: CanvasRenderingContext2D,
  zones: Zone[],
  vp: Viewport,
  top: number,
  bottom: number,
  alto: number,
): void {
  const boundaries = zoneBoundaries(zones)
  if (boundaries.length === 0) return

  const x = vp.pageWidth - BOUNDARY_HANDLE_X
  const r = 13 / Math.max(0.1, vp.scale)
  const { first: firstSheet, last: lastSheet } = visibleSheets(top, bottom, alto)

  ctx.save()
  for (let sheet = firstSheet; sheet <= lastSheet; sheet++) {
    for (const boundary of boundaries) {
      const y = sheet * alto + boundary.y * alto
      if (y < top || y > bottom) continue

      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = ZONE_COLORS.anotacao
      ctx.fill()

      ctx.globalAlpha = 0.95
      ctx.fillStyle = '#ffffff'
      ctx.font = `${Math.round(15 / Math.max(0.1, vp.scale))}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⇕', x, y)
    }
  }
  ctx.restore()
}

/** Alças de canto da zona escolhida. Tamanho fixo na TELA: dedo não tem zoom. */
function drawZoneHandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  scale: number,
): void {
  const r = 9 / Math.max(0.1, scale)
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]
  ctx.fillStyle = color
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5 / Math.max(0.1, scale)
  for (const [cx, cy] of corners) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
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
      const paint = highlighterPaint(paperIsDark(input.theme))
      ctx.globalAlpha = paint.alpha
      ctx.globalCompositeOperation = paint.operation
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
    const paint = highlighterPaint(paperIsDark(theme))
    ctx.globalAlpha = paint.alpha
    ctx.globalCompositeOperation = paint.operation
  }
  ctx.fillStyle = resolveInk(live.style.color, theme)
  ctx.fill(new Path2D(d))
  ctx.restore()
}

/**
 * A bolinha da borracha, como no OneNote.
 *
 * Sem ela a borracha é cega: não dá pra saber o que vai ser alcançado antes de
 * encostar. O círculo é desenhado exatamente com o raio usado pra decidir o que
 * apagar, então o que se vê é o que some.
 */
function drawEraserCursor(
  ctx: CanvasRenderingContext2D,
  cursor: NonNullable<RenderInput['eraserCursor']>,
  vp: Viewport,
  theme: Theme,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cursor.x, cursor.y, cursor.radius, 0, Math.PI * 2)

  ctx.fillStyle = '#ef4444'
  ctx.globalAlpha = 0.12
  ctx.fill()

  // Borda dupla: clara por fora, escura por dentro, pra o anel ser visível
  // tanto sobre a folha vazia quanto sobre um traço grosso ou uma imagem.
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 3 / vp.scale
  ctx.strokeStyle = theme.paper
  ctx.stroke()

  ctx.lineWidth = 1.5 / vp.scale
  ctx.strokeStyle = '#ef4444'
  ctx.stroke()
  ctx.restore()
}

/** Espessura das alças, em px de tela, convertida pra px de página. */
const HANDLE_SCREEN_SIZE = 22

function drawImages(ctx: CanvasRenderingContext2D, input: RenderInput, vp: Viewport): void {
  for (const image of input.images) {
    const { x, y, w, h } = image.rect
    const element = getImageElement(image.id)

    if (element) {
      ctx.drawImage(element, x, y, w, h)
    } else {
      // Marca o lugar enquanto a imagem decodifica, pra folha não "pular".
      ctx.save()
      ctx.fillStyle = input.theme.rule
      ctx.globalAlpha = 0.5
      ctx.fillRect(x, y, w, h)
      ctx.restore()
    }

    if (image.id === input.selectedImageId) {
      drawImageHandles(ctx, image, vp)
    }
  }
}

/**
 * Moldura e alça de tamanho da imagem em ajuste.
 *
 * As alças são desenhadas com tamanho fixo em px de TELA: ampliada, a imagem
 * cresce mas o alvo do dedo continua do mesmo tamanho.
 */
function drawImageHandles(
  ctx: CanvasRenderingContext2D,
  image: PageImage,
  vp: Viewport,
): void {
  const { x, y, w, h } = image.rect
  const handle = HANDLE_SCREEN_SIZE / vp.scale

  ctx.save()
  ctx.strokeStyle = '#7c5cff'
  ctx.lineWidth = 2 / vp.scale
  ctx.setLineDash([8 / vp.scale, 6 / vp.scale])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])

  // Alça de redimensionar, no canto inferior direito.
  ctx.fillStyle = '#7c5cff'
  ctx.beginPath()
  ctx.arc(x + w, y + h, handle / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2 / vp.scale
  const arrow = handle / 5
  ctx.beginPath()
  ctx.moveTo(x + w - arrow, y + h - arrow)
  ctx.lineTo(x + w + arrow, y + h + arrow)
  ctx.stroke()

  // Botão de excluir, no canto superior direito. Fica na própria imagem pra
  // que apagar seja um toque, e não uma caçada pela barra de ferramentas.
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(x + w, y, handle / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.2 / vp.scale
  ctx.lineCap = 'round'
  const cross = handle / 6
  ctx.beginPath()
  ctx.moveTo(x + w - cross, y - cross)
  ctx.lineTo(x + w + cross, y + cross)
  ctx.moveTo(x + w + cross, y - cross)
  ctx.lineTo(x + w - cross, y + cross)
  ctx.stroke()
  ctx.restore()
}

/** Onde fica a alça de redimensionar, em coordenadas de página. */
export function imageHandleRadius(scale: number): number {
  return HANDLE_SCREEN_SIZE / scale
}

const ITEM_GLYPH: Record<Item['kind'], string> = {
  tarefa: '✓',
  pauta: '☰',
  duvida: '?',
  topico: '▸',
  documento: '¶',
  pendencia: '⚑',
  importante: '★',
  nota: '·',
}

const ITEM_COLOR: Record<Item['kind'], string> = {
  tarefa: '#22c55e',
  pauta: '#0ea5e9',
  duvida: '#f59e0b',
  topico: '#8b5cf6',
  documento: '#06b6d4',
  pendencia: '#ef4444',
  importante: '#eab308',
  nota: '#8a8a96',
}

/** Carimbo do item na margem esquerda, alinhado com a tinta que ele marca. */
function drawItemMarkers(ctx: CanvasRenderingContext2D, items: Item[], vp: Viewport): void {
  for (const item of items) {
    // Arquivado é o "isto não era item": some da folha e do painel.
    if (item.status === 'arquivado') continue
    // Nota não ganha carimbo: o corpo da folha é onde se escreve solto, e uma
    // marca por linha ali viraria uma parede de marcas na margem.
    if (item.kind === 'nota') continue
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
    // Anel tracejado: foi o app que identificou este campo, não o usuário que
    // carimbou. A diferença fica visível na folha sem precisar tocar em nada.
    if (item.source === 'auto') ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])

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

/**
 * A transcrição, embaixo da própria letra.
 *
 * É aqui que o texto FICA — na folha, ao lado do que o usuário escreveu, e não
 * numa tela à parte. O painel continua existindo como resumo, mas a anotação
 * transcrita mora no lugar onde ela foi feita.
 *
 * Fica pequena e apagada de propósito: a letra do usuário é o conteúdo, o texto
 * é a legenda dela.
 */
function drawItemText(
  ctx: CanvasRenderingContext2D,
  items: Item[],
  vp: Viewport,
  theme: Theme,
): void {
  const top = vp.scrollY
  const bottom = vp.scrollY + vp.viewHeight / vp.scale
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return

  ctx.save()
  ctx.textBaseline = 'top'
  ctx.fillStyle = theme.zoneLabel

  for (const item of items) {
    if (item.status === 'arquivado' || !item.title) continue
    if (item.bounds.maxY < top || item.bounds.minY > bottom) continue

    const height = item.bounds.maxY - item.bounds.minY
    const size = Math.min(22, Math.max(13, height * 0.5))
    ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`

    const room = vp.pageWidth - item.bounds.minX - 12
    ctx.fillText(fitText(ctx, item.title, room), item.bounds.minX, item.bounds.maxY + 4)
  }

  ctx.restore()
}

/** Corta o texto com reticências quando ele não cabe na largura disponível. */
function fitText(ctx: CanvasRenderingContext2D, text: string, room: number): string {
  if (room <= 0) return ''
  if (ctx.measureText(text).width <= room) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > room) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
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
