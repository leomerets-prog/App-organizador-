import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  Id,
  Item,
  Notebook,
  Page,
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
}

const DB_NAME = 'organizador'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OrganizadorDB>> | null = null

export function getDb(): Promise<IDBPDatabase<OrganizadorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OrganizadorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
      },
    })
  }
  return dbPromise
}

export type { OrganizadorDB }
