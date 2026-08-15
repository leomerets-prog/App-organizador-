import { getImageBlob } from '../db/repo'
import type { Id, PageImage } from '../domain/types'

/**
 * Imagens prontas pra desenhar.
 *
 * O canvas precisa de um HTMLImageElement decodificado, e decodificar é caro e
 * assíncrono. Este cache guarda o resultado por imagem e avisa quando uma
 * termina de carregar, pra que o laço de desenho possa repintar — sem que ele
 * precise saber que existe banco de dados por baixo.
 */

interface Entry {
  element: HTMLImageElement | null
  url: string | null
  state: 'carregando' | 'pronta' | 'falhou'
}

const cache = new Map<Id, Entry>()
const listeners = new Set<() => void>()

/** Avisa quando qualquer imagem termina de carregar. */
export function onImageReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Devolve a imagem pronta, ou null enquanto carrega.
 * Chamar isto no laço de desenho é seguro: só a primeira chamada busca.
 */
export function getImageElement(id: Id): HTMLImageElement | null {
  const entry = cache.get(id)
  if (entry) return entry.state === 'pronta' ? entry.element : null

  cache.set(id, { element: null, url: null, state: 'carregando' })
  void load(id)
  return null
}

async function load(id: Id): Promise<void> {
  try {
    const blob = await getImageBlob(id)
    if (!blob) {
      cache.set(id, { element: null, url: null, state: 'falhou' })
      return
    }

    const url = URL.createObjectURL(blob)
    const element = new Image()
    element.src = url
    await element.decode()

    cache.set(id, { element, url, state: 'pronta' })
    notify()
  } catch {
    cache.set(id, { element: null, url: null, state: 'falhou' })
  }
}

/** Libera a imagem da memória — usado quando ela é excluída da folha. */
export function forgetImage(id: Id): void {
  const entry = cache.get(id)
  if (entry?.url) URL.revokeObjectURL(entry.url)
  cache.delete(id)
}

/**
 * Lê um arquivo escolhido pelo usuário e descobre suas dimensões.
 * Recusa o que não for imagem antes de gravar qualquer coisa no banco.
 */
export async function readImageFile(
  file: File | Blob,
): Promise<{ blob: Blob; width: number; height: number; mime: string }> {
  const mime = file.type || 'image/png'
  if (!mime.startsWith('image/')) {
    throw new Error('Esse arquivo não é uma imagem.')
  }

  const url = URL.createObjectURL(file)
  try {
    const element = new Image()
    element.src = url
    await element.decode()
    return { blob: file, width: element.naturalWidth, height: element.naturalHeight, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Quanto da largura da folha uma imagem nova ocupa ao ser colada. */
export const INSERTED_IMAGE_WIDTH_RATIO = 0.55

/** Tamanho mínimo ao redimensionar, pra imagem não sumir num arrasto errado. */
export const MIN_IMAGE_SIZE = 40

/**
 * Onde e com que tamanho entra uma imagem recém-colada: centrada no que está
 * visível, larga o suficiente pra enxergar e com a proporção original.
 */
export function placeNewImage(
  pageWidth: number,
  visible: { x: number; y: number; w: number; h: number },
  naturalWidth: number,
  naturalHeight: number,
): PageImage['rect'] {
  const aspect = naturalHeight / Math.max(1, naturalWidth)
  const w = Math.min(pageWidth * INSERTED_IMAGE_WIDTH_RATIO, visible.w * 0.9)
  const h = w * aspect
  return {
    x: visible.x + (visible.w - w) / 2,
    y: visible.y + Math.max(20, (visible.h - h) / 2),
    w,
    h,
  }
}
