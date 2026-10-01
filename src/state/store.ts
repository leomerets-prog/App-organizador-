import { create } from 'zustand'
import type {
  Id,
  InkPoint,
  Item,
  ItemKind,
  Notebook,
  Page,
  PageImage,
  Flowchart,
  FlowChartEdge,
  FlowChartNode,
  FlowShape,
  Recording,
  Section,
  Stroke,
  ToolKind,
  Zone,
  ZoneKind,
} from '../domain/types'
import { buildZones, ZONE_ITEM_KIND } from '../domain/templates'
import { detectFields, planFieldSync } from '../items/detect'
import type { DetectedField } from '../items/detect'
import * as repo from '../db/repo'
import { newId } from '../lib/id'
import { boundsOf, unionBounds } from '../lib/geometry'
import {
  PAGE_WIDTH,
  PAGE_MIN_HEIGHT,
  PAGE_GROWTH,
  HIGHLIGHTER_WIDTH,
  ERASER_MIN,
  ERASER_MAX,
} from '../domain/constants'
import { zoneAtPoint, zoneRectInPage } from '../zones/hit'
import { SHEET } from '../zones/edit'
import type { ZoneRectFrac } from '../zones/edit'
import {
  prepareRecognizer,
  recognizeStrokes,
  recognizerPossible,
  resetRecognizer,
} from '../ocr/handwriting'
import type { TranscriptionStatus, WritingArea } from '../ocr/handwriting'
import { forgetImage, placeNewImage, readImageFile } from '../ink/images'
import { eraseAlongSegment } from '../ink/erase'
import type { Pt } from '../lib/geometry'
import { buildGraph, toFlowStrokes } from '../flow/graph'
import { applyTheme, loadPrefs, nextRate, savePrefs } from './prefs'
import type { Theme } from './prefs'

/**
 * Estado da aplicação e todas as ações que mudam dados.
 *
 * Regra da casa: o componente nunca fala com o banco. Ele chama uma ação daqui,
 * a ação atualiza a memória (pra tela responder na hora) e grava no banco em
 * seguida. É isso que mantém a escrita fluida mesmo com o disco lento.
 */

export interface AppState {
  // Navegação
  notebooks: Notebook[]
  sections: Section[]
  pages: Page[]
  activeNotebookId: Id | null
  activeSectionId: Id | null
  activePageId: Id | null

  // Conteúdo da página aberta
  strokes: Stroke[]
  zones: Zone[]
  items: Item[]
  recordings: Recording[]
  /** Fluxogramas montados a partir das zonas de fluxograma desta página. */
  flowcharts: Flowchart[]
  images: PageImage[]
  /** Imagem em ajuste (mover/redimensionar). */
  selectedImageId: Id | null

  // Ferramentas
  tool: ToolKind
  penColor: string
  penWidth: number
  showZones: boolean
  /** Identificar sozinho o que foi escrito dentro das zonas. */
  autoFields: boolean
  /** Mostrar a transcrição na própria folha, embaixo da letra. */
  showText: boolean
  /** Zona em edição, quando a ferramenta de zonas está ativa. */
  selectedZoneId: Id | null
  /** Como está a transcrição: disponível, baixando o modelo, pronta ou com erro. */
  transcription: TranscriptionStatus
  theme: Theme
  /** Aproximação da folha, guardada entre aberturas. */
  zoom: number
  /** Raio da borracha, em px de página. */
  eraserSize: number
  /** Velocidade de escuta do áudio, pra todas as gravações. */
  audioRate: number
  selection: Set<Id>

  // Gravação em andamento
  activeRecordingId: Id | null

  ready: boolean
  loadingPage: boolean

  // Ações
  init: () => Promise<void>
  selectNotebook: (id: Id) => Promise<void>
  selectSection: (id: Id) => Promise<void>
  selectPage: (id: Id) => Promise<void>

  createNotebook: (name: string, color: string) => Promise<void>
  createSection: (name: string, color: string) => Promise<void>
  createPage: (title: string, templateId: string) => Promise<void>
  renamePage: (id: Id, title: string) => Promise<void>
  renameSection: (id: Id, name: string) => Promise<void>
  renameNotebook: (id: Id, name: string) => Promise<void>
  removePage: (id: Id) => Promise<void>
  removeSection: (id: Id) => Promise<void>
  removeNotebook: (id: Id) => Promise<void>

  setTool: (tool: ToolKind) => void
  setPenColor: (color: string) => void
  setPenWidth: (width: number) => void
  toggleZones: () => void
  toggleAutoFields: () => void
  toggleShowText: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setZoom: (zoom: number) => void
  setEraserSize: (size: number) => void
  /** Passa pra próxima velocidade de escuta, dando a volta em 2x. */
  cycleAudioRate: () => void

  commitStroke: (points: InkPoint[], startedAt: number) => Promise<void>

  /** Começa uma borrachada. Uma por movimento contínuo da mão. */
  beginErase: () => void
  /** Uma passada, do ponto anterior ao atual. Devolve quantos traços mudaram. */
  eraseSweep: (from: Pt, to: Pt) => number
  /** Fim do movimento: grava e religa os itens. Devolve quantos sumiram. */
  endErase: () => Promise<number>
  /** Desfaz a última borrachada inteira. */
  undoErase: () => Promise<number>
  canUndoErase: () => boolean
  setSelection: (ids: Id[]) => void
  clearSelection: () => void

  // Zonas editáveis
  selectZone: (id: Id | null) => void
  addZone: (rect: ZoneRectFrac, kind: ZoneKind, label: string) => Promise<void>
  updateZone: (id: Id, patch: { rect?: ZoneRectFrac; label?: string; kind?: ZoneKind }) => Promise<void>
  /** Move uma divisa: várias faixas mudam de tamanho de uma vez. */
  updateZoneRects: (changes: { id: Id; rect: ZoneRectFrac }[]) => Promise<void>
  removeZone: (id: Id) => Promise<void>
  /** Reclassifica a tinta da página pelas zonas atuais. Roda ao fim de uma edição. */
  reclassifyStrokes: () => Promise<void>

  // Transcrição
  /** Texto escrito à mão pelo usuário; vale mais que a leitura automática. */
  setItemText: (id: Id, text: string) => Promise<void>
  /** A ficha do registro: prazo, prioridade, responsável, observação. */
  updateItemFields: (
    id: Id,
    patch: Partial<Pick<Item, 'dueAt' | 'priority' | 'assignee' | 'note'>>,
  ) => Promise<void>
  /** Manda ler de novo a letra deste campo. */
  retranscribeItem: (id: Id) => Promise<void>
  /** `forcar` refaz o preparo e inclui as linhas que já falharam. */
  transcribePage: (opts?: { forcar?: boolean }) => Promise<void>
  scheduleTranscription: () => void

  stampSelection: (kind: ItemKind) => Promise<void>
  toggleItemStatus: (id: Id) => Promise<void>
  setItemStatus: (id: Id, status: Item['status']) => Promise<void>
  setItemKind: (id: Id, kind: ItemKind) => Promise<void>
  setItemTitle: (id: Id, title: string) => Promise<void>
  removeItem: (id: Id) => Promise<void>

  /** Refaz a identificação dos campos da página aberta. */
  syncFields: () => Promise<void>
  /** Pede a identificação pro fim da escrita; não roda no meio da frase. */
  scheduleFieldSync: () => void

  addRecording: (rec: Recording, blob: Blob) => Promise<void>
  removeRecording: (id: Id) => Promise<void>
  setActiveRecording: (id: Id | null) => void
  /** Lê o desenho da zona de fluxograma e monta (ou remonta) o fluxograma. */
  buildFlowchart: (zoneId: Id) => Promise<void>
  /** Corrige o nome ou a forma de uma caixa; a correção sobrevive à remontagem. */
  updateFlowNode: (chartId: Id, nodeId: Id, patch: { label?: string; kind?: FlowShape }) => Promise<void>
  updateFlowEdge: (chartId: Id, edgeId: Id, patch: { label?: string }) => Promise<void>
  /** Como está a leitura do desenho; é o que a tela mostra enquanto roda. */
  flowStatus: { state: 'parado' | 'lendo' | 'erro'; message: string }
  /** Guarda onde a escuta parou, pra retomar dali na próxima vez. */
  setRecordingPosition: (id: Id, positionMs: number) => Promise<void>

  addImage: (file: File | Blob, visible: { x: number; y: number; w: number; h: number }) => Promise<void>
  updateImageRect: (id: Id, rect: PageImage['rect']) => Promise<void>
  removeImage: (id: Id) => Promise<void>
  selectImage: (id: Id | null) => void

  growPageIfNeeded: (bottomY: number) => Promise<void>
}

/**
 * Última borrachada, guardada só na memória.
 *
 * Apagar sem volta é o único caminho do app em que se perde trabalho de
 * verdade. Um passo de desfazer cobre justamente o engano que se percebe na
 * hora — e com a borracha de ponta ele precisa desfazer duas coisas: devolver
 * os traços inteiros e tirar os pedaços que sobraram do corte.
 */
let lastErase: {
  restore: Stroke[]
  removeIds: Id[]
  items: Item[]
} | null = null

/**
 * Borrachada em andamento.
 *
 * `originals` guarda os traços como estavam antes do primeiro corte, `lineage`
 * liga cada pedaço ao traço de origem mesmo depois de cortes sucessivos, e
 * `created` marca o que nasceu durante o movimento e ainda não foi gravado.
 */
let eraseSession: {
  originals: Map<Id, Stroke>
  lineage: Map<Id, Id>
  created: Set<Id>
} | null = null

/**
 * Religa os itens carimbados depois de um corte.
 *
 * Sem isto, apagar um pedaço da tinta de uma tarefa faria a tarefa inteira
 * desaparecer do painel — o item apontaria pra um traço que deixou de existir.
 * Aqui cada referência perdida é trocada pelos pedaços que sobraram dela.
 */
async function reconcileItems(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  lineage: Map<Id, Id>,
  removedRoots: Set<Id>,
): Promise<void> {
  if (removedRoots.size === 0) return

  const strokes = get().strokes
  const byRoot = new Map<Id, Id[]>()
  for (const stroke of strokes) {
    const root = lineage.get(stroke.id)
    if (!root) continue
    const list = byRoot.get(root) ?? []
    list.push(stroke.id)
    byRoot.set(root, list)
  }

  for (const item of get().items) {
    if (!item.strokeIds.some((id) => removedRoots.has(id))) continue

    const next = new Set<Id>()
    for (const id of item.strokeIds) {
      if (removedRoots.has(id)) for (const piece of byRoot.get(id) ?? []) next.add(piece)
      else next.add(id)
    }

    if (next.size === 0) {
      await get().removeItem(item.id)
      continue
    }

    const own = strokes.filter((s) => next.has(s.id))
    const updated: Item = {
      ...item,
      strokeIds: [...next],
      bounds: unionBounds(own.map((s) => s.bounds)),
      updatedAt: Date.now(),
    }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === item.id ? updated : i)) })
  }
}

/**
 * Espera entre o fim do traço e a identificação dos campos.
 *
 * Curta o bastante pra que o painel esteja certo quando o usuário for olhar,
 * longa o bastante pra não rodar entre uma palavra e a seguinte.
 */
const FIELD_SYNC_DELAY = 800

let fieldSyncTimer: ReturnType<typeof setTimeout> | null = null
let fieldSyncRunning = false
let fieldSyncAgain = false

/**
 * Espera antes de ler a letra. Maior que a da identificação: transcrever é
 * caro, e ninguém quer o reconhecedor rodando entre duas palavras.
 */
const TRANSCRIBE_DELAY = 1500

let transcribeTimer: ReturnType<typeof setTimeout> | null = null
let transcribing = false

/**
 * A área onde a linha foi escrita — POSIÇÃO e tamanho.
 *
 * O reconhecedor usa isto pra dar escala à letra, e compara os pontos com essa
 * área. Por isso a posição importa tanto quanto o tamanho: a linha escrita na
 * faixa de baixo da folha tem y na casa dos milhares, e descrever isso dentro
 * de uma área de duzentos e poucos de altura é dizer que a escrita caiu fora do
 * papel. O reconhecedor devolve vazio, sem erro nenhum. Quem desconta a posição
 * é `recognizeStrokes`, com os números que saem daqui.
 *
 * A zona se repete a cada folha padrão, então a faixa usada é a da folha em que
 * a linha realmente está — e não a da primeira.
 */
function writingArea(state: AppState, item: Item): WritingArea {
  const zone = item.zoneId ? state.zones.find((z) => z.id === item.zoneId) : undefined
  if (zone) {
    const rect = zoneRectInPage(zone, SHEET)
    const folha = Math.floor(((item.bounds.minY + item.bounds.maxY) / 2) / SHEET)
    return { x: rect.x, y: folha * SHEET + rect.y, width: rect.w, height: rect.h }
  }

  // Sem zona, a própria linha é a área — com uma folga, pra letra não encostar
  // na borda do que o reconhecedor entende como papel.
  const folga = 24
  return {
    x: item.bounds.minX - folga,
    y: item.bounds.minY - folga,
    width: Math.max(1, item.bounds.maxX - item.bounds.minX + folga * 2),
    height: Math.max(1, item.bounds.maxY - item.bounds.minY + folga * 2),
  }
}

/** Um campo identificado vira item novo, sempre em aberto. */
function itemFromField(pageId: Id, field: DetectedField, now: number): Item {
  return {
    id: newId(),
    pageId,
    kind: field.kind,
    status: 'aberto',
    source: 'auto',
    zoneId: field.zoneId,
    strokeIds: [...field.strokeIds],
    bounds: field.bounds,
    title: '',
    ocr: { status: 'pendente' },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * O item cresce junto com a linha, mas só na tinta e no tamanho: tipo, estado e
 * título são decisão do usuário e não se mexem aqui.
 *
 * A transcrição volta pra fila quando a linha muda — a letra nova precisa ser
 * lida. A exceção é o texto escrito à mão pelo usuário, que nunca é refeito.
 */
function applyField(item: Item, field: DetectedField, now: number): Item {
  return {
    ...item,
    zoneId: field.zoneId,
    strokeIds: [...field.strokeIds],
    bounds: field.bounds,
    ocr: item.ocr.status === 'manual' ? item.ocr : { status: 'pendente' },
    updatedAt: now,
  }
}

/**
 * A faixa mudou de significado: o que já estava escrito nela muda junto.
 *
 * Quem transforma a faixa "Tarefas" em "Dúvidas" está dizendo que aquilo tudo
 * eram dúvidas — deixar as linhas antigas como tarefa produziria uma faixa com
 * dois tipos misturados, sem nada na tela explicando por quê. A exceção é o
 * item cujo tipo o próprio usuário escolheu à mão: esse é palavra dele.
 */
async function retypeZoneItems(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  zoneId: Id,
  zoneKind: ZoneKind,
): Promise<void> {
  const kind = ZONE_ITEM_KIND[zoneKind]

  for (const item of get().items) {
    if (item.source !== 'auto' || item.zoneId !== zoneId) continue
    if (item.kindByUser || item.kind === kind) continue
    const updated: Item = { ...item, kind, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === item.id ? updated : i)) })
  }
}

/** Guarda do arranque: garante uma única execução por carregamento do app. */
let initOnce: Promise<void> | null = null

/**
 * Preferências lidas antes de a loja existir: assim a primeira pintura da tela
 * já sai no tema certo, sem piscar do escuro pro claro.
 */
const initialPrefs = loadPrefs()
applyTheme(initialPrefs.theme)

function persist(get: () => AppState): void {
  const s = get()
  savePrefs({
    theme: s.theme,
    penColor: s.penColor,
    penWidth: s.penWidth,
    showZones: s.showZones,
    autoFields: s.autoFields,
    showText: s.showText,
    zoom: s.zoom,
    eraserSize: s.eraserSize,
    audioRate: s.audioRate,
  })
}

export const useStore = create<AppState>((set, get) => ({
  notebooks: [],
  sections: [],
  pages: [],
  activeNotebookId: null,
  activeSectionId: null,
  activePageId: null,

  strokes: [],
  zones: [],
  items: [],
  recordings: [],
  flowcharts: [],
  flowStatus: { state: 'parado', message: '' },
  images: [],
  selectedImageId: null,

  tool: 'pen',
  penColor: initialPrefs.penColor,
  penWidth: initialPrefs.penWidth,
  showZones: initialPrefs.showZones,
  autoFields: initialPrefs.autoFields,
  showText: initialPrefs.showText,
  selectedZoneId: null,
  transcription: { state: recognizerPossible() ? 'pronto' : 'indisponivel', message: '' },
  theme: initialPrefs.theme,
  zoom: initialPrefs.zoom,
  eraserSize: initialPrefs.eraserSize,
  audioRate: initialPrefs.audioRate,
  selection: new Set(),

  activeRecordingId: null,

  ready: false,
  loadingPage: false,

  // ─── Arranque ──────────────────────────────────────────────────────────────

  /**
   * Arranque. Protegido contra chamada dupla: em desenvolvimento o React
   * monta o componente duas vezes, e duas execuções simultâneas encontrariam
   * o banco vazio e criariam o bloco inicial em duplicata.
   */
  init() {
    initOnce ??= (async () => {
      let notebooks = await repo.listNotebooks()
      if (notebooks.length === 0) {
        await seedFirstRun()
        notebooks = await repo.listNotebooks()
      }
      set({ notebooks, ready: true })
      if (notebooks[0]) await get().selectNotebook(notebooks[0].id)
    })()
    return initOnce
  },

  async selectNotebook(id) {
    const sections = await repo.listSections(id)
    set({ activeNotebookId: id, sections, activeSectionId: null, pages: [] })
    if (sections[0]) await get().selectSection(sections[0].id)
    else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [], flowcharts: [] })
  },

  async selectSection(id) {
    const pages = await repo.listPages(id)
    set({ activeSectionId: id, pages })
    if (pages[0]) await get().selectPage(pages[0].id)
    else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [], flowcharts: [] })
  },

  async selectPage(id) {
    set({
      loadingPage: true,
      activePageId: id,
      selection: new Set(),
      selectedImageId: null,
      selectedZoneId: null,
    })
    lastErase = null
    eraseSession = null
    const content = await repo.loadPageContent(id)
    // Se o usuário trocou de página enquanto isto carregava, descarta o resultado.
    if (get().activePageId !== id) return
    set({ ...content, loadingPage: false })
    // Folhas escritas antes desta versão (ou com a identificação desligada)
    // ganham seus campos ao serem abertas.
    get().scheduleFieldSync()
    // E a leitura da letra também é pedida na abertura: sem isto, linha
    // escrita antes de o modelo existir ficaria sem texto pra sempre, porque
    // a transcrição só era agendada quando a identificação mudava alguma coisa.
    get().scheduleTranscription()
  },

  // ─── Criação e remoção ─────────────────────────────────────────────────────

  async createNotebook(name, color) {
    const now = Date.now()
    const nb: Notebook = {
      id: newId(),
      name,
      color,
      createdAt: now,
      updatedAt: now,
      order: get().notebooks.length,
    }
    await repo.putNotebook(nb)
    set({ notebooks: [...get().notebooks, nb] })
    await get().selectNotebook(nb.id)
    await get().createSection('Seção 1', color)
  },

  async createSection(name, color) {
    const notebookId = get().activeNotebookId
    if (!notebookId) return
    const now = Date.now()
    const section: Section = {
      id: newId(),
      notebookId,
      name,
      color,
      createdAt: now,
      updatedAt: now,
      order: get().sections.length,
    }
    await repo.putSection(section)
    set({ sections: [...get().sections, section] })
    await get().selectSection(section.id)
    await get().createPage('Página sem título', 'reuniao')
  },

  async createPage(title, templateId) {
    const sectionId = get().activeSectionId
    if (!sectionId) return
    const now = Date.now()
    const page: Page = {
      id: newId(),
      sectionId,
      title,
      templateId,
      height: PAGE_MIN_HEIGHT,
      createdAt: now,
      updatedAt: now,
      order: get().pages.length,
    }
    const zones = buildZones(page.id, templateId)
    await repo.putPage(page)
    await repo.putZones(zones)
    set({ pages: [...get().pages, page] })
    await get().selectPage(page.id)
  },

  async renamePage(id, title) {
    const page = get().pages.find((p) => p.id === id)
    if (!page) return
    const updated = { ...page, title, updatedAt: Date.now() }
    await repo.putPage(updated)
    set({ pages: get().pages.map((p) => (p.id === id ? updated : p)) })
  },

  async renameSection(id, name) {
    const section = get().sections.find((s) => s.id === id)
    if (!section) return
    const updated = { ...section, name, updatedAt: Date.now() }
    await repo.putSection(updated)
    set({ sections: get().sections.map((s) => (s.id === id ? updated : s)) })
  },

  async renameNotebook(id, name) {
    const nb = get().notebooks.find((n) => n.id === id)
    if (!nb) return
    const updated = { ...nb, name, updatedAt: Date.now() }
    await repo.putNotebook(updated)
    set({ notebooks: get().notebooks.map((n) => (n.id === id ? updated : n)) })
  },

  async removePage(id) {
    await repo.deletePage(id)
    const pages = get().pages.filter((p) => p.id !== id)
    set({ pages })
    if (get().activePageId === id) {
      if (pages[0]) await get().selectPage(pages[0].id)
      else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [], flowcharts: [] })
    }
  },

  async removeSection(id) {
    await repo.deleteSection(id)
    const sections = get().sections.filter((s) => s.id !== id)
    set({ sections })
    if (get().activeSectionId === id) {
      if (sections[0]) await get().selectSection(sections[0].id)
      else set({ activeSectionId: null, pages: [], activePageId: null, strokes: [] })
    }
  },

  async removeNotebook(id) {
    await repo.deleteNotebook(id)
    const notebooks = get().notebooks.filter((n) => n.id !== id)
    set({ notebooks })
    if (get().activeNotebookId === id) {
      if (notebooks[0]) await get().selectNotebook(notebooks[0].id)
      else set({ activeNotebookId: null, sections: [], pages: [], activePageId: null })
    }
  },

  // ─── Ferramentas ───────────────────────────────────────────────────────────

  setTool: (tool) => set({ tool, selection: tool === 'lasso' ? get().selection : new Set() }),

  setPenColor(penColor) {
    set({ penColor })
    persist(get)
  },

  setPenWidth(penWidth) {
    set({ penWidth })
    persist(get)
  },

  toggleZones() {
    set({ showZones: !get().showZones })
    persist(get)
  },

  /**
   * Liga e desliga a identificação automática.
   *
   * Desligar não apaga o que já foi identificado: o que está no painel é
   * trabalho do usuário (ele concluiu, arquivou, trocou o tipo), e sumir com
   * isso por causa de um interruptor seria perda de trabalho de verdade.
   */
  toggleAutoFields() {
    const autoFields = !get().autoFields
    set({ autoFields })
    persist(get)
    if (autoFields) get().scheduleFieldSync()
  },

  toggleShowText() {
    set({ showText: !get().showText })
    persist(get)
  },

  setTheme(theme) {
    applyTheme(theme)
    set({ theme })
    persist(get)
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  /**
   * Guarda a aproximação escolhida. Chamada só ao fim do gesto, nunca durante:
   * a pinça muda o zoom a cada quadro e gravar isso tudo seria desperdício.
   */
  setZoom(zoom) {
    if (Math.abs(get().zoom - zoom) < 0.001) return
    set({ zoom })
    persist(get)
  },

  setEraserSize(size) {
    set({ eraserSize: Math.min(ERASER_MAX, Math.max(ERASER_MIN, size)) })
    persist(get)
  },

  cycleAudioRate() {
    set({ audioRate: nextRate(get().audioRate) })
    persist(get)
  },

  // ─── Tinta ─────────────────────────────────────────────────────────────────

  async commitStroke(points, startedAt) {
    const { activePageId, penColor, penWidth, tool, zones } = get()
    if (!activePageId || points.length === 0) return

    const bounds = boundsOf(points)
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

    const stroke: Stroke = {
      id: newId(),
      pageId: activePageId,
      points,
      color: penColor,
      width: tool === 'highlighter' ? HIGHLIGHTER_WIDTH : penWidth,
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      zoneId: zoneAtPoint(zones, center)?.id ?? null,
      startedAt,
      bounds,
    }

    set({ strokes: [...get().strokes, stroke] })
    await repo.putStroke(stroke)
    await get().growPageIfNeeded(bounds.maxY)
    get().scheduleFieldSync()
  },

  // ─── Borracha ──────────────────────────────────────────────────────────────

  beginErase() {
    eraseSession = { originals: new Map(), lineage: new Map(), created: new Set() }
  },

  /**
   * Uma passada da borracha. Só mexe na memória — a gravação acontece no fim
   * do movimento, porque um arrasto dispara dezenas de passadas e gravar cada
   * uma engasgaria a mão.
   */
  eraseSweep(from, to) {
    const session = eraseSession
    if (!session) return 0

    const replacements = eraseAlongSegment(
      get().strokes,
      from,
      to,
      get().eraserSize,
      newId,
    )
    if (replacements.length === 0) return 0

    const strokes = [...get().strokes]

    for (const { original, fragments } of replacements) {
      // A raiz da linhagem é o traço que existia antes desta borrachada. Ela
      // sobrevive a cortes sucessivos: um pedaço cortado de novo continua
      // apontando pro mesmo original, e é isso que permite religar os itens
      // carimbados no fim.
      const root = session.lineage.get(original.id) ?? original.id
      if (!session.originals.has(root) && !session.created.has(original.id)) {
        session.originals.set(root, original)
      }
      session.created.delete(original.id)

      const at = strokes.findIndex((s) => s.id === original.id)
      if (at >= 0) strokes.splice(at, 1, ...fragments)

      for (const fragment of fragments) {
        session.lineage.set(fragment.id, root)
        session.created.add(fragment.id)
      }
    }

    set({ strokes })
    return replacements.length
  },

  /** Fim do movimento: grava o resultado e reconcilia os itens carimbados. */
  async endErase() {
    const session = eraseSession
    eraseSession = null
    if (!session) return 0

    const current = get().strokes
    const currentIds = new Set(current.map((s) => s.id))

    const removedIds = [...session.originals.keys()].filter((id) => !currentIds.has(id))
    const addedStrokes = current.filter((s) => session.created.has(s.id))
    if (removedIds.length === 0 && addedStrokes.length === 0) return 0

    for (const stroke of addedStrokes) await repo.putStroke(stroke)
    await repo.deleteStrokes(removedIds)

    lastErase = {
      restore: removedIds.map((id) => session.originals.get(id)!).filter(Boolean),
      removeIds: addedStrokes.map((s) => s.id),
      // Os itens são guardados inteiros: desfazer volta a lista como estava,
      // em vez de tentar refazer a religação ao contrário.
      items: get().items,
    }

    await reconcileItems(get, set, session.lineage, new Set(removedIds))
    get().scheduleFieldSync()
    return removedIds.length
  },

  /**
   * Desfaz a última borrachada: devolve os traços inteiros e tira os pedaços
   * que a borracha havia criado. Um passo só, de propósito — cobre o engano
   * percebido na hora, que é o caso real, sem virar um histórico.
   */
  async undoErase() {
    const op = lastErase
    lastErase = null
    if (!op) return 0

    const pageId = get().activePageId
    const restore = op.restore.filter((s) => s.pageId === pageId)
    if (restore.length === 0 && op.removeIds.length === 0) return 0

    const dead = new Set(op.removeIds)
    await repo.deleteStrokes(op.removeIds)
    for (const stroke of restore) await repo.putStroke(stroke)

    set({
      strokes: [...get().strokes.filter((s) => !dead.has(s.id)), ...restore].sort(
        (a, b) => a.startedAt - b.startedAt,
      ),
    })

    // Itens voltam exatamente como estavam antes da borrachada.
    for (const item of op.items) await repo.putItem(item)
    const alive = new Set(op.items.map((i) => i.id))
    for (const item of get().items) {
      if (!alive.has(item.id)) await repo.deleteItem(item.id)
    }
    set({ items: op.items })

    get().scheduleFieldSync()
    return restore.length
  },

  canUndoErase: () => lastErase !== null,

  setSelection: (ids) => set({ selection: new Set(ids) }),
  clearSelection: () => set({ selection: new Set() }),

  // ─── Itens ─────────────────────────────────────────────────────────────────

  async stampSelection(kind) {
    const { selection, strokes, activePageId } = get()
    if (!activePageId || selection.size === 0) return

    const chosen = strokes.filter((s) => selection.has(s.id))
    if (chosen.length === 0) return

    const now = Date.now()
    const bounds = unionBounds(chosen.map((s) => s.bounds))
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

    const item: Item = {
      id: newId(),
      pageId: activePageId,
      kind,
      status: 'aberto',
      source: 'carimbo',
      zoneId: zoneAtPoint(get().zones, center)?.id ?? null,
      strokeIds: chosen.map((s) => s.id),
      bounds,
      title: '',
      ocr: { status: 'pendente' },
      createdAt: now,
      updatedAt: now,
    }
    await repo.putItem(item)
    set({ items: [...get().items, item], selection: new Set(), tool: 'pen' })
    // A tinta carimbada sai da identificação automática: sem isto a mesma
    // anotação apareceria duas vezes no painel.
    get().scheduleFieldSync()
  },

  async toggleItemStatus(id) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    await get().setItemStatus(id, item.status === 'concluido' ? 'aberto' : 'concluido')
  },

  async setItemStatus(id, status) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const updated: Item = { ...item, status, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
  },

  /**
   * Troca o tipo do item.
   *
   * A identificação nunca reescreve o tipo de um item que já existe — quando o
   * usuário diz que aquela linha é tarefa e não pendência, a palavra dele fica.
   */
  async setItemKind(id, kind) {
    const item = get().items.find((i) => i.id === id)
    if (!item || item.kind === kind) return
    const updated: Item = { ...item, kind, kindByUser: true, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
  },

  async setItemTitle(id, title) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const updated = { ...item, title, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
  },

  async removeItem(id) {
    await repo.deleteItem(id)
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  // ─── Identificação dos campos ──────────────────────────────────────────────

  /**
   * Pede a identificação pro fim da escrita.
   *
   * Espera a mão parar de propósito: identificar no meio da frase criaria um
   * item por palavra, que apareceria e sumiria do painel enquanto o usuário
   * ainda está escrevendo a linha.
   */
  scheduleFieldSync() {
    if (fieldSyncTimer !== null) clearTimeout(fieldSyncTimer)
    fieldSyncTimer = setTimeout(() => {
      fieldSyncTimer = null
      void get().syncFields()
    }, FIELD_SYNC_DELAY)
  },

  async syncFields() {
    const pageId = get().activePageId
    if (!pageId || !get().autoFields) return

    // Uma passada por vez. Duas ao mesmo tempo criariam o mesmo campo duas
    // vezes, porque a segunda não enxergaria o item que a primeira ainda não
    // terminou de gravar.
    if (fieldSyncRunning) {
      fieldSyncAgain = true
      return
    }
    fieldSyncRunning = true

    try {
      const { strokes, zones, items } = get()

      const stamped = new Set<Id>()
      for (const item of items) {
        if (item.source === 'carimbo') for (const id of item.strokeIds) stamped.add(id)
      }

      const fields = detectFields(strokes, zones, { ignoreStrokeIds: stamped })
      const plan = planFieldSync(
        fields,
        items.filter((i) => i.source === 'auto'),
      )
      if (plan.create.length === 0 && plan.update.length === 0 && plan.remove.length === 0) return

      const now = Date.now()
      const created = plan.create.map((field) => itemFromField(pageId, field, now))
      const updated = plan.update.map(({ item, field }) => applyField(item, field, now))

      for (const item of [...created, ...updated]) await repo.putItem(item)
      for (const id of plan.remove) await repo.deleteItem(id)

      // Trocou de página enquanto gravava: o que foi pro banco continua valendo,
      // mas a lista da tela agora é de outra folha e não pode receber isto.
      if (get().activePageId !== pageId) return

      // A lista é remontada a partir da versão mais recente do estado, e não da
      // que foi lida lá em cima: a mão pode ter escrito outra coisa no meio.
      const changed = new Map([...created, ...updated].map((i) => [i.id, i]))
      const dead = new Set(plan.remove)
      const kept = get()
        .items.filter((i) => !dead.has(i.id))
        .map((i) => changed.get(i.id) ?? i)
      const known = new Set(kept.map((i) => i.id))

      set({ items: [...kept, ...created.filter((i) => !known.has(i.id))] })
      get().scheduleTranscription()
    } finally {
      fieldSyncRunning = false
      if (fieldSyncAgain) {
        fieldSyncAgain = false
        get().scheduleFieldSync()
      }
    }
  },

  // ─── Zonas editáveis ───────────────────────────────────────────────────────

  selectZone: (selectedZoneId) => set({ selectedZoneId }),

  async addZone(rect, kind, label) {
    const pageId = get().activePageId
    if (!pageId) return
    const zone: Zone = { id: newId(), pageId, kind, label, rect: { ...rect } }
    await repo.putZones([zone])
    set({ zones: [...get().zones, zone], selectedZoneId: zone.id })
    await get().reclassifyStrokes()
  },

  async updateZone(id, patch) {
    const zone = get().zones.find((z) => z.id === id)
    if (!zone) return
    const updated: Zone = {
      ...zone,
      rect: patch.rect ? { ...patch.rect } : zone.rect,
      label: patch.label ?? zone.label,
      kind: patch.kind ?? zone.kind,
    }
    set({ zones: get().zones.map((z) => (z.id === id ? updated : z)) })
    await repo.putZones([updated])

    if (patch.kind && patch.kind !== zone.kind) {
      await retypeZoneItems(get, set, id, patch.kind)
    }
    await get().reclassifyStrokes()
  },

  /**
   * Grava várias faixas de uma vez.
   *
   * É o que sai de arrastar uma divisa: uma faixa cresce e a outra encolhe, e
   * as duas precisam chegar juntas ao banco — meia divisa gravada deixaria um
   * buraco ou uma sobreposição entre elas.
   */
  async updateZoneRects(changes) {
    if (changes.length === 0) return
    const byId = new Map(changes.map((c) => [c.id, c.rect]))
    const zones = get().zones.map((z) => {
      const rect = byId.get(z.id)
      return rect ? { ...z, rect: { ...rect } } : z
    })
    set({ zones })
    await repo.putZones(zones.filter((z) => byId.has(z.id)))
    await get().reclassifyStrokes()
  },

  async removeZone(id) {
    await repo.deleteZone(id)
    set({
      zones: get().zones.filter((z) => z.id !== id),
      selectedZoneId: get().selectedZoneId === id ? null : get().selectedZoneId,
    })
    await get().reclassifyStrokes()
  },

  /**
   * Reclassifica a tinta pelas zonas de agora.
   *
   * O traço guarda a zona em que caiu quando foi escrito. Se o usuário arrasta
   * a faixa "Tarefas" por cima de uma anotação antiga, o que ele quer é que
   * aquilo VIRE tarefa — a divisão da folha manda, e ela acabou de mudar. Sem
   * isto, a zona nova só valeria pro que fosse escrito depois dela.
   */
  async reclassifyStrokes() {
    const { strokes, zones } = get()
    const changed: Stroke[] = []

    const next = strokes.map((stroke) => {
      const center = {
        x: (stroke.bounds.minX + stroke.bounds.maxX) / 2,
        y: (stroke.bounds.minY + stroke.bounds.maxY) / 2,
      }
      const zoneId = zoneAtPoint(zones, center)?.id ?? null
      if (zoneId === stroke.zoneId) return stroke
      const updated = { ...stroke, zoneId }
      changed.push(updated)
      return updated
    })

    if (changed.length > 0) {
      set({ strokes: next })
      // Gravação depois da tela: arrastar a borda de uma zona não pode
      // engasgar esperando o disco.
      for (const stroke of changed) await repo.putStroke(stroke)
    }
    get().scheduleFieldSync()
  },

  // ─── Transcrição ───────────────────────────────────────────────────────────

  /**
   * Texto escrito à mão pelo usuário.
   *
   * Vira `manual`, e a leitura automática nunca mais mexe nele: quem corrigiu
   * uma transcrição errada não pode vê-la voltar ao errado na próxima palavra
   * que escrever na mesma linha.
   */
  async setItemText(id, text) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const limpo = text.trim()
    const updated: Item = {
      ...item,
      title: limpo,
      ocr: limpo ? { status: 'manual', text: limpo, at: Date.now() } : { status: 'pendente' },
      updatedAt: Date.now(),
    }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
  },

  /**
   * Preenche a ficha.
   *
   * Nada aqui toca a tinta nem o texto: prazo e prioridade são o que o usuário
   * acrescenta DEPOIS de escrever, na Central, pra poder se organizar sem
   * voltar à folha.
   */
  async updateItemFields(id, patch) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const updated: Item = { ...item, ...patch, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
  },

  async retranscribeItem(id) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const updated: Item = { ...item, ocr: { status: 'pendente' }, updatedAt: Date.now() }
    await repo.putItem(updated)
    set({ items: get().items.map((i) => (i.id === id ? updated : i)) })
    resetRecognizer()
    get().scheduleTranscription()
  },

  scheduleTranscription() {
    if (!recognizerPossible()) return
    if (transcribeTimer !== null) clearTimeout(transcribeTimer)
    transcribeTimer = setTimeout(() => {
      transcribeTimer = null
      void get().transcribePage()
    }, TRANSCRIBE_DELAY)
  },

  /**
   * Lê a letra dos campos que ainda não têm texto.
   *
   * Um de cada vez, e devagar de propósito: o reconhecedor divide o aparelho
   * com a caneta, e travar a escrita pra transcrever seria trocar o essencial
   * pelo acessório.
   */
  async transcribePage(opts) {
    const forcar = opts?.forcar === true

    if (!recognizerPossible()) {
      set({
        transcription: {
          state: 'indisponivel',
          message: 'A leitura automática só roda no aplicativo instalado (APK).',
        },
      })
      return
    }
    if (transcribing) return
    const pageId = get().activePageId
    if (!pageId) return

    transcribing = true
    try {
      // "Tentar de novo" tem que tentar de novo de verdade: sem internet na
      // primeira vez, o preparo falhou e ficaria falhado pra sempre.
      if (forcar) resetRecognizer()

      const status = await prepareRecognizer((partial) => set({ transcription: partial }))
      set({ transcription: status })
      if (status.state !== 'pronto') return

      /*
       * Não há o que ler sem campo identificado — e dizer só "nada novo pra
       * ler" nessa hora é enganar: o usuário escreveu a folha inteira e o app
       * responde que não tem nada. O motivo verdadeiro é um dos três abaixo, e
       * cada um tem uma saída diferente.
       */
      const daPagina = get().items.filter((i) => i.pageId === pageId)
      if (daPagina.length === 0) {
        set({
          transcription: {
            ...status,
            message: get().autoFields
              ? 'Nenhuma linha identificada nesta folha. A leitura acontece no que você escreve DENTRO das faixas (Pauta, Tarefas, Dúvidas, Pendências) — a faixa "Anotação" não vira item de propósito.'
              : 'A identificação de campos está desligada, então não há linhas pra ler.',
            acao: get().autoFields ? undefined : 'ligarCampos',
          },
        })
        return
      }

      // Uma cópia da fila: a lista vive muda enquanto se escreve. No pedido
      // manual entram também as linhas que já falharam — é o que o usuário
      // espera de um botão chamado "Transcrever agora".
      const fila = daPagina.filter(
        (i) =>
          i.strokeIds.length > 0 &&
          (i.ocr.status === 'pendente' || (forcar && i.ocr.status === 'falhou')),
      )

      if (fila.length === 0) {
        set({
          transcription: {
            ...status,
            message: forcar
              ? `As ${daPagina.length} linha(s) desta folha já estão transcritas. Ligue o "Texto" na barra pra vê-las embaixo da letra.`
              : '',
          },
        })
        return
      }

      let lidos = 0
      let feitos = 0
      // Os números da última tentativa que não deu texto. Sem eles, "não
      // consegui ler" é um beco: com eles dá pra saber se a letra chegou
      // pequena demais, grande demais ou fora da área.
      let ultimoDiagnostico = ''

      for (const item of fila) {
        if (get().activePageId !== pageId) return

        feitos++
        set({
          transcription: {
            state: 'lendo',
            message: `Lendo sua letra… (${feitos} de ${fila.length})`,
            language: status.language,
          },
        })

        const strokes = get().strokes.filter((s) => item.strokeIds.includes(s.id))
        if (strokes.length === 0) continue

        const area = writingArea(get(), item)
        let next: Item
        try {
          const { text, diagnostico } = await recognizeStrokes(strokes, area)
          if (text) lidos++
          else ultimoDiagnostico = diagnostico
          next = {
            ...item,
            title: text,
            ocr: text
              ? { status: 'pronto', text, at: Date.now() }
              : { status: 'falhou', reason: `Não reconheci nada nesta linha (${diagnostico}).` },
            updatedAt: Date.now(),
          }
        } catch (err) {
          // O erro do reconhecedor também vai pro aviso da tela: é a única via
          // que o usuário tem pra contar o que aconteceu no aparelho dele.
          const motivo = err instanceof Error ? err.message : 'Não consegui transcrever.'
          ultimoDiagnostico = motivo
          next = {
            ...item,
            ocr: { status: 'falhou', reason: motivo },
            updatedAt: Date.now(),
          }
        }

        // O item pode ter mudado (ou sumido) enquanto o reconhecedor trabalhava.
        const atual = get().items.find((i) => i.id === item.id)
        if (!atual || atual.ocr.status === 'manual') continue
        await repo.putItem(next)
        set({ items: get().items.map((i) => (i.id === item.id ? next : i)) })
      }

      // O fim tem que dizer o que aconteceu. Ficar em silêncio quando nada foi
      // reconhecido é o que fez o usuário escrever, esperar e não entender nada.
      set({
        transcription: {
          state: 'pronto',
          language: status.language,
          message:
            lidos > 0
              ? ''
              : `Não consegui ler nenhuma das ${fila.length} linha(s)${
                  status.language ? ` · modelo ${status.language}` : ''
                }${ultimoDiagnostico ? ` · ${ultimoDiagnostico}` : ''}. Segure o dedo sobre a linha pra escrever o texto à mão.`,
        },
      })
    } finally {
      transcribing = false
    }
  },

  // ─── Áudio ─────────────────────────────────────────────────────────────────

  async addRecording(rec, blob) {
    await repo.putRecording(rec, blob)
    set({ recordings: [...get().recordings, rec] })
  },

  async removeRecording(id) {
    await repo.deleteRecording(id)
    set({ recordings: get().recordings.filter((r) => r.id !== id) })
  },

  setActiveRecording: (activeRecordingId) => set({ activeRecordingId }),

  async setRecordingPosition(id, positionMs) {
    const rec = get().recordings.find((r) => r.id === id)
    if (!rec) return
    const atualizado = { ...rec, positionMs }
    set({ recordings: get().recordings.map((r) => (r.id === id ? atualizado : r)) })
    await repo.updateRecording(atualizado)
  },

  // ─── Fluxograma ────────────────────────────────────────────────────────────

  /**
   * Lê o desenho e monta o fluxograma.
   *
   * Duas coisas que esta função NÃO faz, de propósito:
   *
   * - **não apaga a tinta.** O desenho à mão continua na folha exatamente como
   *   estava; o fluxograma montado é outra coisa, que mora ao lado
   * - **não desfaz correção do usuário.** Nome que ele escreveu à mão no
   *   painel sobrevive à remontagem, pelo mesmo motivo que a transcrição
   *   corrigida nunca é sobrescrita: ver a própria correção sumir é o que faz
   *   alguém parar de confiar no recurso
   */
  async buildFlowchart(zoneId) {
    const pageId = get().activePageId
    const zone = get().zones.find((z) => z.id === zoneId)
    if (!pageId || !zone) return

    set({ flowStatus: { state: 'lendo', message: 'Lendo o desenho…' } })

    const daZona = get().strokes.filter((s) => {
      if (s.zoneId) return s.zoneId === zoneId
      const centro = {
        x: (s.bounds.minX + s.bounds.maxX) / 2,
        y: (s.bounds.minY + s.bounds.maxY) / 2,
      }
      return zoneAtPoint(get().zones, centro, SHEET)?.id === zoneId
    })

    const grafo = buildGraph(toFlowStrokes(daZona))

    if (grafo.nodes.length === 0) {
      set({
        flowStatus: {
          state: 'erro',
          message:
            'Não achei caixa nenhuma neste desenho. Faça as caixas FECHADAS (o traço voltando ao começo) e ligue uma na outra com setas que encostem nas duas.',
        },
      })
      return
    }

    const anterior = get().flowcharts.find((f) => f.zoneId === zoneId)
    const nomeAntigo = new Map((anterior?.nodes ?? []).map((n) => [n.id, n]))
    const rotuloAntigo = new Map((anterior?.edges ?? []).map((e) => [e.id, e.label]))

    const nodes: FlowChartNode[] = grafo.nodes.map((n) => {
      const velho = nomeAntigo.get(n.id)
      return {
        id: n.id,
        // Forma trocada à mão também fica: o leitor erra entre losango e
        // retângulo com mais frequência que erra o resto.
        kind: velho?.editado ? velho.kind : n.kind,
        label: velho?.editado ? velho.label : (velho?.label ?? ''),
        editado: velho?.editado,
        bounds: n.bounds,
      }
    })

    const edges: FlowChartEdge[] = grafo.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      label: rotuloAntigo.get(e.id) ?? '',
      direcao: e.direcao,
    }))

    // A letra das caixas, quando o aparelho sabe ler. Sem reconhecedor as
    // caixas saem sem nome e o usuário escreve no painel — mesmo caminho da
    // transcrição da folha, e o painel diz isso em vez de ficar calado.
    if (recognizerPossible()) {
      const status = await prepareRecognizer(() => {})
      if (status.state === 'pronto') {
        for (let i = 0; i < nodes.length; i++) {
          if (get().activePageId !== pageId) return
          const node = nodes[i]
          if (node.editado && node.label) continue
          const daCaixa = grafo.nodes.find((n) => n.id === node.id)?.labelStrokeIds ?? []
          if (daCaixa.length === 0) continue

          set({
            flowStatus: {
              state: 'lendo',
              message: `Lendo os nomes… (${i + 1} de ${nodes.length})`,
            },
          })
          const tinta = get().strokes.filter((s) => daCaixa.includes(s.id))
          if (tinta.length === 0) continue
          const folga = 20
          try {
            const { text } = await recognizeStrokes(tinta, {
              x: node.bounds.minX - folga,
              y: node.bounds.minY - folga,
              width: Math.max(1, node.bounds.maxX - node.bounds.minX + folga * 2),
              height: Math.max(1, node.bounds.maxY - node.bounds.minY + folga * 2),
            })
            if (text) node.label = text
          } catch {
            // Uma caixa sem nome não pode derrubar o fluxograma inteiro.
          }
        }
      }
    }

    const chart: Flowchart = {
      id: anterior?.id ?? newId(),
      pageId,
      zoneId,
      nodes,
      edges,
      soltos: grafo.soltos.length,
      updatedAt: Date.now(),
    }

    set({
      flowcharts: [...get().flowcharts.filter((f) => f.id !== chart.id), chart],
      flowStatus: { state: 'parado', message: '' },
    })
    await repo.putFlowchart(chart)
  },

  async updateFlowNode(chartId, nodeId, patch) {
    const chart = get().flowcharts.find((f) => f.id === chartId)
    if (!chart) return
    const atualizado: Flowchart = {
      ...chart,
      nodes: chart.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch, editado: true } : n,
      ),
      updatedAt: Date.now(),
    }
    set({ flowcharts: get().flowcharts.map((f) => (f.id === chartId ? atualizado : f)) })
    await repo.putFlowchart(atualizado)
  },

  async updateFlowEdge(chartId, edgeId, patch) {
    const chart = get().flowcharts.find((f) => f.id === chartId)
    if (!chart) return
    const atualizado: Flowchart = {
      ...chart,
      edges: chart.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      updatedAt: Date.now(),
    }
    set({ flowcharts: get().flowcharts.map((f) => (f.id === chartId ? atualizado : f)) })
    await repo.putFlowchart(atualizado)
  },

  // ─── Imagens ───────────────────────────────────────────────────────────────

  async addImage(file, visible) {
    const pageId = get().activePageId
    if (!pageId) return

    const { blob, width, height, mime } = await readImageFile(file)
    const rect = placeNewImage(PAGE_WIDTH, visible, width, height)

    const image: PageImage = {
      id: newId(),
      pageId,
      rect,
      mime,
      aspect: height / Math.max(1, width),
      createdAt: Date.now(),
    }

    await repo.putImage(image, blob)
    // Já entra selecionada, com a ferramenta de imagem: o passo seguinte é
    // sempre posicionar, e ninguém quer caçar como fazer isso.
    set({ images: [...get().images, image], selectedImageId: image.id, tool: 'image' })
    await get().growPageIfNeeded(rect.y + rect.h)
  },

  async updateImageRect(id, rect) {
    const image = get().images.find((i) => i.id === id)
    if (!image) return
    const updated = { ...image, rect }
    set({ images: get().images.map((i) => (i.id === id ? updated : i)) })
    await repo.putImage(updated)
    await get().growPageIfNeeded(rect.y + rect.h)
  },

  async removeImage(id) {
    await repo.deleteImage(id)
    forgetImage(id)
    set({
      images: get().images.filter((i) => i.id !== id),
      selectedImageId: get().selectedImageId === id ? null : get().selectedImageId,
    })
  },

  selectImage: (selectedImageId) => set({ selectedImageId }),

  // ─── Folha ─────────────────────────────────────────────────────────────────

  /** A folha cresce sozinha quando a escrita chega perto do fim. */
  async growPageIfNeeded(bottomY) {
    const { activePageId, pages } = get()
    const page = pages.find((p) => p.id === activePageId)
    if (!page) return
    if (bottomY < page.height - PAGE_GROWTH / 2) return

    const updated = { ...page, height: page.height + PAGE_GROWTH, updatedAt: Date.now() }
    await repo.putPage(updated)
    set({ pages: pages.map((p) => (p.id === page.id ? updated : p)) })
  },
}))

// ─── Primeira execução ───────────────────────────────────────────────────────

/** Cria o bloco inicial pra que o app nunca abra numa tela vazia sem saída. */
async function seedFirstRun(): Promise<void> {
  const now = Date.now()
  const notebook: Notebook = {
    id: newId(),
    name: 'Bloco de Anotações',
    color: '#3b82f6',
    createdAt: now,
    updatedAt: now,
    order: 0,
  }
  const section: Section = {
    id: newId(),
    notebookId: notebook.id,
    name: 'Notas Rápidas',
    color: '#3b82f6',
    createdAt: now,
    updatedAt: now,
    order: 0,
  }
  const page: Page = {
    id: newId(),
    sectionId: section.id,
    title: 'Primeira página',
    templateId: 'reuniao',
    height: PAGE_MIN_HEIGHT,
    createdAt: now,
    updatedAt: now,
    order: 0,
  }
  await repo.putNotebook(notebook)
  await repo.putSection(section)
  await repo.putPage(page)
  await repo.putZones(buildZones(page.id, page.templateId))
}

export { PAGE_WIDTH }
