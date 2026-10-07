import { getDb } from './database'
import type {
  Flowchart,
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
  const kill = async (
    store: 'strokes' | 'zones' | 'items' | 'recordings' | 'images' | 'flowcharts',
  ) => {
    const keys = await db.getAllKeysFromIndex(store, 'byPage', id)
    await Promise.all(keys.map((k) => db.delete(store, k)))
  }
  const recordings = await db.getAllFromIndex('recordings', 'byPage', id)
  await Promise.all(recordings.map((r) => db.delete('recordingBlobs', r.id)))
  await Promise.all(recordings.map((r) => db.delete('recordingBlobs', faixaDosPedacos(r.id))))
  const images = await db.getAllFromIndex('images', 'byPage', id)
  await Promise.all(images.map((i) => db.delete('imageBlobs', i.id)))
  await Promise.all([
    kill('strokes'),
    kill('zones'),
    kill('items'),
    kill('recordings'),
    kill('images'),
    kill('flowcharts'),
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
  flowcharts: Flowchart[]
}

export async function loadPageContent(pageId: Id): Promise<PageContent> {
  const db = await getDb()
  const [strokes, zones, items, recordings, images, flowcharts] = await Promise.all([
    db.getAllFromIndex('strokes', 'byPage', pageId),
    db.getAllFromIndex('zones', 'byPage', pageId),
    db.getAllFromIndex('items', 'byPage', pageId),
    db.getAllFromIndex('recordings', 'byPage', pageId),
    db.getAllFromIndex('images', 'byPage', pageId),
    db.getAllFromIndex('flowcharts', 'byPage', pageId),
  ])
  strokes.sort((a, b) => a.startedAt - b.startedAt)
  images.sort((a, b) => a.createdAt - b.createdAt)
  return {
    strokes,
    zones,
    items: items.map(normalizeItem),
    // A gravação em andamento só aparece depois do "Parar" (ou recuperada na
    // próxima abertura): antes disso ela não tem arquivo pra tocar.
    recordings: recordings.filter((r) => !r.emAndamento),
    images,
    flowcharts,
  }
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

/** Um item qualquer, de qualquer folha — a Central edita itens de todas. */
export async function getItem(id: Id): Promise<Item | undefined> {
  const db = await getDb()
  const item = await db.get('items', id)
  return item ? normalizeItem(item) : undefined
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

/** Todas as seções, de todos os blocos — a Central mostra o caminho inteiro. */
export async function listAllSections(): Promise<Section[]> {
  const db = await getDb()
  return db.getAll('sections')
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

/**
 * Gravação e áudio numa transação SÓ.
 *
 * Eram duas, metadados primeiro: com o armazenamento cheio, o registro
 * entrava, o áudio não, e depois de reabrir aparecia uma gravação que não
 * tocava — "Não achei o arquivo" — com o áudio já perdido. Numa transação, ou
 * entram os dois, ou nenhum.
 */
export async function putRecording(rec: Recording, blob: Blob): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['recordings', 'recordingBlobs'], 'readwrite')
  await Promise.all([
    tx.objectStore('recordingBlobs').put({ id: rec.id, blob }),
    tx.objectStore('recordings').put(rec),
    tx.done,
  ])
}

// ─── Gravação em andamento ───────────────────────────────────────────────────

/*
 * UMA REUNIÃO NÃO PODE MORAR SÓ NA MEMÓRIA.
 *
 * O gravador entrega um pedaço por segundo, e todos ficavam num vetor na
 * memória até o "Parar". Se o Android fechasse o app aos 60 minutos — e ele
 * fecha app em segundo plano —, a reunião inteira sumia. Achado da revisão da
 * casa, reproduzido: 6 s gravando, zero registros no banco.
 *
 * Agora cada pedaço vai pro banco assim que chega, como um registro à parte no
 * mesmo depósito dos áudios, com a chave `<id>#<ordem>`. No "Parar" eles viram
 * o arquivo de sempre. Se o "Parar" nunca vier, a próxima abertura do app
 * remonta o arquivo com os pedaços (`recuperarGravacoes`). Nenhum depósito
 * novo, nenhuma versão nova do banco: o pedaço é só mais um registro.
 */

/** A chave de um pedaço. A ordem com zeros à esquerda mantém a ordem certa. */
export function chaveDoPedaco(recId: Id, ordem: number): string {
  return `${recId}#${String(ordem).padStart(7, '0')}`
}

function faixaDosPedacos(recId: Id): IDBKeyRange {
  return IDBKeyRange.bound(`${recId}#`, `${recId}#\uffff`)
}

/** O registro da gravação, criado no começo e marcado como em andamento. */
export async function putRecordingDraft(rec: Recording): Promise<void> {
  const db = await getDb()
  await db.put('recordings', { ...rec, emAndamento: true })
}

export async function putRecordingChunk(recId: Id, ordem: number, blob: Blob): Promise<void> {
  const db = await getDb()
  await db.put('recordingBlobs', { id: chaveDoPedaco(recId, ordem), blob })
}

export async function getRecording(id: Id): Promise<Recording | undefined> {
  const db = await getDb()
  return db.get('recordings', id)
}

/**
 * Fecha a gravação: o arquivo inteiro entra, os pedaços saem, e o registro
 * deixa de estar em andamento — tudo numa transação. Se falhar, nada muda: o
 * registro e os pedaços continuam lá, e a próxima abertura recupera.
 */
export async function finishRecording(rec: Recording, blob: Blob): Promise<void> {
  const db = await getDb()
  const pronto: Recording = { ...rec }
  delete pronto.emAndamento
  const tx = db.transaction(['recordings', 'recordingBlobs'], 'readwrite')
  const blobs = tx.objectStore('recordingBlobs')
  await Promise.all([
    blobs.put({ id: rec.id, blob }),
    blobs.delete(faixaDosPedacos(rec.id)),
    tx.objectStore('recordings').put(pronto),
    tx.done,
  ])
}

/**
 * Remonta as gravações que ficaram em andamento — o app fechou antes do
 * "Parar". Roda na abertura, antes de qualquer folha carregar.
 *
 * Gravação sem pedaço nenhum (fechou no primeiro segundo) só tem o registro, e
 * o registro sai: uma gravação que não toca nada não é recuperação.
 */
export async function recuperarGravacoes(): Promise<Recording[]> {
  const db = await getDb()
  const todas = await db.getAll('recordings')
  const recuperadas: Recording[] = []
  for (const rec of todas) {
    if (!rec.emAndamento) continue
    const pedacos = await db.getAll('recordingBlobs', faixaDosPedacos(rec.id))
    if (pedacos.length === 0) {
      await db.delete('recordings', rec.id)
      continue
    }
    const blob = new Blob(
      pedacos.map((p) => p.blob),
      { type: rec.mimeType || 'audio/webm' },
    )
    /*
     * A duração: um pedaço por segundo é o que o gravador entrega, e é a
     * melhor medida que sobrou. O relógio do registro não serve — ele parou
     * quando o app morreu, e "agora" pode ser no dia seguinte.
     */
    const durationMs = Math.max(rec.durationMs || 0, pedacos.length * 1000)
    const pronto: Recording = { ...rec, durationMs, recuperada: true }
    await finishRecording(pronto, blob)
    const recuperada: Recording = { ...pronto }
    delete recuperada.emAndamento
    recuperadas.push(recuperada)
  }
  return recuperadas
}

export async function updateRecording(rec: Recording): Promise<void> {
  const db = await getDb()
  await db.put('recordings', rec)
}

// ─── Fluxogramas ─────────────────────────────────────────────────────────────

export async function putFlowchart(chart: Flowchart): Promise<void> {
  const db = await getDb()
  await db.put('flowcharts', chart)
}

export async function deleteFlowchart(id: Id): Promise<void> {
  const db = await getDb()
  await db.delete('flowcharts', id)
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
  await db.delete('recordingBlobs', faixaDosPedacos(id))
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
