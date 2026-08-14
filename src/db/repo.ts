import { getDb } from './database'
import type {
  Id,
  Item,
  Notebook,
  Page,
  Recording,
  Section,
  Stroke,
  Zone,
} from '../domain/types'

/**
 * Acesso ao banco. Cada função faz uma coisa e devolve dados prontos —
 * nenhuma regra de negócio mora aqui.
 */

// ─── Blocos de anotações ─────────────────────────────────────────────────────

export async function listNotebooks(): Promise<Notebook[]> {
  const db = await getDb()
  const all = await db.getAll('notebooks')
  return all.sort((a, b) => a.order - b.order)
}

export async function putNotebook(nb: Notebook): Promise<void> {
  const db = await getDb()
  await db.put('notebooks', nb)
}

export async function deleteNotebook(id: Id): Promise<void> {
  const db = await getDb()
  for (const section of await db.getAllFromIndex('sections', 'byNotebook', id)) {
    await deleteSection(section.id)
  }
  await db.delete('notebooks', id)
}

// ─── Seções ──────────────────────────────────────────────────────────────────

export async function listSections(notebookId: Id): Promise<Section[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('sections', 'byNotebook', notebookId)
  return all.sort((a, b) => a.order - b.order)
}

export async function putSection(section: Section): Promise<void> {
  const db = await getDb()
  await db.put('sections', section)
}

export async function deleteSection(id: Id): Promise<void> {
  const db = await getDb()
  for (const page of await db.getAllFromIndex('pages', 'bySection', id)) {
    await deletePage(page.id)
  }
  await db.delete('sections', id)
}

// ─── Páginas ─────────────────────────────────────────────────────────────────

export async function listPages(sectionId: Id): Promise<Page[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('pages', 'bySection', sectionId)
  return all.sort((a, b) => a.order - b.order)
}

export async function getPage(id: Id): Promise<Page | undefined> {
  const db = await getDb()
  return db.get('pages', id)
}

export async function putPage(page: Page): Promise<void> {
  const db = await getDb()
  await db.put('pages', page)
}

export async function deletePage(id: Id): Promise<void> {
  const db = await getDb()
  const kill = async (store: 'strokes' | 'zones' | 'items' | 'recordings') => {
    const keys = await db.getAllKeysFromIndex(store, 'byPage', id)
    await Promise.all(keys.map((k) => db.delete(store, k)))
  }
  const recordings = await db.getAllFromIndex('recordings', 'byPage', id)
  await Promise.all(recordings.map((r) => db.delete('recordingBlobs', r.id)))
  await Promise.all([kill('strokes'), kill('zones'), kill('items'), kill('recordings')])
  await db.delete('pages', id)
}

// ─── Conteúdo da página ──────────────────────────────────────────────────────

export interface PageContent {
  strokes: Stroke[]
  zones: Zone[]
  items: Item[]
  recordings: Recording[]
}

export async function loadPageContent(pageId: Id): Promise<PageContent> {
  const db = await getDb()
  const [strokes, zones, items, recordings] = await Promise.all([
    db.getAllFromIndex('strokes', 'byPage', pageId),
    db.getAllFromIndex('zones', 'byPage', pageId),
    db.getAllFromIndex('items', 'byPage', pageId),
    db.getAllFromIndex('recordings', 'byPage', pageId),
  ])
  strokes.sort((a, b) => a.startedAt - b.startedAt)
  return { strokes, zones, items, recordings }
}

export async function putStroke(stroke: Stroke): Promise<void> {
  const db = await getDb()
  await db.put('strokes', stroke)
}

export async function deleteStrokes(ids: Id[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('strokes', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function putZones(zones: Zone[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('zones', 'readwrite')
  await Promise.all(zones.map((z) => tx.store.put(z)))
  await tx.done
}

export async function deleteZone(id: Id): Promise<void> {
  const db = await getDb()
  await db.delete('zones', id)
}

export async function putItem(item: Item): Promise<void> {
  const db = await getDb()
  await db.put('items', item)
}

export async function deleteItem(id: Id): Promise<void> {
  const db = await getDb()
  await db.delete('items', id)
}

/** Todos os itens de todos os cadernos — a base da tela estratificada. */
export async function listAllItems(): Promise<Item[]> {
  const db = await getDb()
  return db.getAll('items')
}

// ─── Gravações ───────────────────────────────────────────────────────────────

export async function putRecording(rec: Recording, blob: Blob): Promise<void> {
  const db = await getDb()
  await db.put('recordings', rec)
  await db.put('recordingBlobs', { id: rec.id, blob })
}

export async function updateRecording(rec: Recording): Promise<void> {
  const db = await getDb()
  await db.put('recordings', rec)
}

export async function getRecordingBlob(id: Id): Promise<Blob | undefined> {
  const db = await getDb()
  const row = await db.get('recordingBlobs', id)
  return row?.blob
}

export async function deleteRecording(id: Id): Promise<void> {
  const db = await getDb()
  await db.delete('recordings', id)
  await db.delete('recordingBlobs', id)
}
