import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  Id,
  ImageBlob,
  Item,
  Notebook,
  Page,
  PageImage,
  Flowchart,
  Recording,
  RecordingBlob,
  Section,
  Stroke,
  Zone,
} from '../domain/types'

/**
 * Persistência local (IndexedDB). Tudo fica no tablet: o app abre e funciona
 * sem internet, e nada se perde se o navegador fechar no meio da anotação.
 *
 * O áudio fica numa store separada da store de metadados de gravação, pra que
 * listar as gravações de uma página não carregue megabytes de blob junto.
 */

interface OrganizadorDB extends DBSchema {
  notebooks: { key: Id; value: Notebook }
  sections: { key: Id; value: Section; indexes: { byNotebook: Id } }
  pages: { key: Id; value: Page; indexes: { bySection: Id } }
  strokes: { key: Id; value: Stroke; indexes: { byPage: Id } }
  zones: { key: Id; value: Zone; indexes: { byPage: Id } }
  items: { key: Id; value: Item; indexes: { byPage: Id; byKind: Item['kind'] } }
  recordings: { key: Id; value: Recording; indexes: { byPage: Id } }
  recordingBlobs: { key: Id; value: RecordingBlob }
  images: { key: Id; value: PageImage; indexes: { byPage: Id } }
  imageBlobs: { key: Id; value: ImageBlob }
  flowcharts: { key: Id; value: Flowchart; indexes: { byPage: Id; byZone: Id } }
}

const DB_NAME = 'organizador'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<OrganizadorDB>> | null = null

export function getDb(): Promise<IDBPDatabase<OrganizadorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OrganizadorDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Cada versão acrescenta o que falta, sem tocar no que já existe:
        // é isso que preserva as anotações de quem já vinha usando o app.
        if (oldVersion < 1) {
        db.createObjectStore('notebooks', { keyPath: 'id' })

        const sections = db.createObjectStore('sections', { keyPath: 'id' })
        sections.createIndex('byNotebook', 'notebookId')

        const pages = db.createObjectStore('pages', { keyPath: 'id' })
        pages.createIndex('bySection', 'sectionId')

        const strokes = db.createObjectStore('strokes', { keyPath: 'id' })
        strokes.createIndex('byPage', 'pageId')

        const zones = db.createObjectStore('zones', { keyPath: 'id' })
        zones.createIndex('byPage', 'pageId')

        const items = db.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('byPage', 'pageId')
        items.createIndex('byKind', 'kind')

        const recordings = db.createObjectStore('recordings', { keyPath: 'id' })
        recordings.createIndex('byPage', 'pageId')

        db.createObjectStore('recordingBlobs', { keyPath: 'id' })
        }

        if (oldVersion < 2) {
          const images = db.createObjectStore('images', { keyPath: 'id' })
          images.createIndex('byPage', 'pageId')
          db.createObjectStore('imageBlobs', { keyPath: 'id' })
        }

        // Store NOVA, e só isso: nenhuma store antiga é aberta, lida ou
        // reescrita aqui. É o que faz a atualização não poder perder nada do
        // que já estava no aparelho.
        if (oldVersion < 3) {
          const flowcharts = db.createObjectStore('flowcharts', { keyPath: 'id' })
          flowcharts.createIndex('byPage', 'pageId')
          flowcharts.createIndex('byZone', 'zoneId')
        }
      },
    })
  }
  return dbPromise
}

export type { OrganizadorDB }
