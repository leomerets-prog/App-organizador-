import { create } from 'zustand'
import type {
  Id,
  InkPoint,
  Item,
  ItemKind,
  Notebook,
  Page,
  PageImage,
  Recording,
  Section,
  Stroke,
  ToolKind,
  Zone,
} from '../domain/types'
import { buildZones } from '../domain/templates'
import * as repo from '../db/repo'
import { newId } from '../lib/id'
import { boundsOf, unionBounds } from '../lib/geometry'
import { PAGE_WIDTH, PAGE_MIN_HEIGHT, PAGE_GROWTH, HIGHLIGHTER_WIDTH } from '../domain/constants'
import { zoneAtPoint } from '../zones/hit'
import { forgetImage, placeNewImage, readImageFile } from '../ink/images'
import { applyTheme, loadPrefs, savePrefs } from './prefs'
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
  images: PageImage[]
  /** Imagem em ajuste (mover/redimensionar). */
  selectedImageId: Id | null

  // Ferramentas
  tool: ToolKind
  penColor: string
  penWidth: number
  showZones: boolean
  theme: Theme
  /** Aproximação da folha, guardada entre aberturas. */
  zoom: number
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
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setZoom: (zoom: number) => void

  commitStroke: (points: InkPoint[], startedAt: number) => Promise<void>
  eraseStrokes: (ids: Id[]) => Promise<void>
  /** Devolve os traços da última borrachada. Null quando não há o que desfazer. */
  undoErase: () => Promise<number>
  canUndoErase: () => boolean
  setSelection: (ids: Id[]) => void
  clearSelection: () => void

  stampSelection: (kind: ItemKind) => Promise<void>
  toggleItemStatus: (id: Id) => Promise<void>
  setItemTitle: (id: Id, title: string) => Promise<void>
  removeItem: (id: Id) => Promise<void>

  addRecording: (rec: Recording, blob: Blob) => Promise<void>
  removeRecording: (id: Id) => Promise<void>
  setActiveRecording: (id: Id | null) => void

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
 * verdade — ainda mais com um gesto que pode ser reconhecido errado. Um passo
 * de desfazer cobre justamente o engano que se percebe na hora.
 */
let lastErased: Stroke[] = []

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
    zoom: s.zoom,
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
  images: [],
  selectedImageId: null,

  tool: 'pen',
  penColor: initialPrefs.penColor,
  penWidth: initialPrefs.penWidth,
  showZones: initialPrefs.showZones,
  theme: initialPrefs.theme,
  zoom: initialPrefs.zoom,
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
    else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [] })
  },

  async selectSection(id) {
    const pages = await repo.listPages(id)
    set({ activeSectionId: id, pages })
    if (pages[0]) await get().selectPage(pages[0].id)
    else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [] })
  },

  async selectPage(id) {
    set({ loadingPage: true, activePageId: id, selection: new Set(), selectedImageId: null })
    lastErased = []
    const content = await repo.loadPageContent(id)
    // Se o usuário trocou de página enquanto isto carregava, descarta o resultado.
    if (get().activePageId !== id) return
    set({ ...content, loadingPage: false })
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
      else set({ activePageId: null, strokes: [], zones: [], items: [], recordings: [], images: [] })
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
  },

  async eraseStrokes(ids) {
    if (ids.length === 0) return
    const dead = new Set(ids)
    lastErased = get().strokes.filter((s) => dead.has(s.id))
    set({ strokes: get().strokes.filter((s) => !dead.has(s.id)) })
    await repo.deleteStrokes(ids)

    // Item que perdeu toda a tinta perde o sentido de existir.
    for (const item of get().items) {
      const remaining = item.strokeIds.filter((sid) => !dead.has(sid))
      if (remaining.length === item.strokeIds.length) continue
      if (remaining.length === 0) {
        await get().removeItem(item.id)
      } else {
        const strokes = get().strokes.filter((s) => remaining.includes(s.id))
        const updated = {
          ...item,
          strokeIds: remaining,
          bounds: unionBounds(strokes.map((s) => s.bounds)),
          updatedAt: Date.now(),
        }
        await repo.putItem(updated)
        set({ items: get().items.map((i) => (i.id === item.id ? updated : i)) })
      }
    }
  },

  /**
   * Devolve os traços da última borrachada. Um passo só, de propósito: cobre o
   * engano percebido na hora, que é o caso real, sem virar um histórico.
   */
  async undoErase() {
    const restore = lastErased
    lastErased = []
    if (restore.length === 0) return 0

    const pageId = get().activePageId
    const valid = restore.filter((s) => s.pageId === pageId)
    if (valid.length === 0) return 0

    for (const stroke of valid) await repo.putStroke(stroke)
    set({
      strokes: [...get().strokes, ...valid].sort((a, b) => a.startedAt - b.startedAt),
    })
    return valid.length
  },

  canUndoErase: () => lastErased.length > 0,

  setSelection: (ids) => set({ selection: new Set(ids) }),
  clearSelection: () => set({ selection: new Set() }),

  // ─── Itens ─────────────────────────────────────────────────────────────────

  async stampSelection(kind) {
    const { selection, strokes, activePageId } = get()
    if (!activePageId || selection.size === 0) return

    const chosen = strokes.filter((s) => selection.has(s.id))
    if (chosen.length === 0) return

    const now = Date.now()
    const item: Item = {
      id: newId(),
      pageId: activePageId,
      kind,
      status: 'aberto',
      strokeIds: chosen.map((s) => s.id),
      bounds: unionBounds(chosen.map((s) => s.bounds)),
      title: '',
      ocr: { status: 'pendente' },
      createdAt: now,
      updatedAt: now,
    }
    await repo.putItem(item)
    set({ items: [...get().items, item], selection: new Set(), tool: 'pen' })
  },

  async toggleItemStatus(id) {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const status = item.status === 'concluido' ? 'aberto' : 'concluido'
    const updated = { ...item, status: status as Item['status'], updatedAt: Date.now() }
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
