import { getDb } from './database'
import type {
  Id,
  Item,
  Notebook,
  Page,
  PageImage,
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
  const kill = async (store: 'strokes' | 'zones' | 'items' | 'recordings' | 'images') => {
    const keys = await db.getAllKeysFromIndex(store, 'byPage', id)
    await Promise.all(keys.map((k) => db.delete(store, k)))
  }
  const recordings = await db.getAllFromIndex('recordings', 'byPage', id)
  await Promise.all(recordings.map((r) => db.delete('recordingBlobs', r.id)))
  const images = await db.getAllFromIndex('images', 'byPage', id)
  await Promise.all(images.map((i) => db.delete('imageBlobs', i.id)))
  await Promise.all([
    kill('strokes'),
    kill('zones'),
    kill('items'),
    kill('recordings'),
    kill('images'),
  ])
  await db.delete('pages', id)
}

// ─── Conteúdo da página ──────────────────────────────────────────────────────

export interface PageContent {
  strokes: Stroke[]
  zones: Zone[]
  items: Item[]
  recordings: Recording[]
  images: PageImage[]
}

export async function loadPageContent(pageId: Id): Promise<PageContent> {
  const db = await getDb()
  const [strokes, zones, items, recordings, images] = await Promise.all([
    db.getAllFromIndex('strokes', 'byPage', pageId),
    db.getAllFromIndex('zones', 'byPage', pageId),
    db.getAllFromIndex('items', 'byPage', pageId),
    db.getAllFromIndex('recordings', 'byPage', pageId),
    db.getAllFromIndex('images', 'byPage', pageId),
  ])
  strokes.sort((a, b) => a.startedAt - b.startedAt)
  images.sort((a, b) => a.createdAt - b.createdAt)
  return { strokes, zones, items: items.map(normalizeItem), recordings, images }
}

/**
 * Itens gravados antes da identificação automática não têm origem nem zona.
 * São todos carimbo — foi a única forma que existiu de criar item até aqui —,
 * e dizer isso na leitura evita que a identificação os tome por seus e os
 * apague na primeira passada.
 */
function normalizeItem(item: Item): Item {
  if (item.source) return item
  return { ...item, source: 'carimbo', zoneId: item.zoneId ?? null }
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
  return (await db.getAll('items')).map(normalizeItem)
}

/**
 * Todas as páginas, de todos os blocos.
 *
 * O painel mostra item de caderno que não está aberto; sem isto a origem sairia
 * como "outra página", que não ajuda ninguém a achar a anotação.
 */
export async function listAllPages(): Promise<Page[]> {
  const db = await getDb()
  return db.getAll('pages')
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

// ─── Imagens ─────────────────────────────────────────────────────────────────

export async function putImage(image: PageImage, blob?: Blob): Promise<void> {
  const db = await getDb()
  await db.put('images', image)
  // O binário só é gravado na criação; mover e redimensionar não o tocam.
  if (blob) await db.put('imageBlobs', { id: image.id, blob })
}

export async function getImageBlob(id: Id): Promise<Blob | undefined> {
  const db = await getDb()
  return (await db.get('imageBlobs', id))?.blob
}

export async function deleteImage(id: Id): Promise<void> {
  const db = await getDb()
  await db.delete('images', id)
  await db.delete('imageBlobs', id)
}
