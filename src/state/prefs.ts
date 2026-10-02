import { ERASER_DEFAULT, ERASER_MAX, ERASER_MIN, INK_COLOR, PEN_WIDTH_DEFAULT } from '../domain/constants'
import { ZOOM_FIT, clampZoom } from '../ink/viewport'

/**
 * Preferências da ferramenta e do tema.
 *
 * Ficam no localStorage, não no banco: são leves, precisam estar disponíveis
 * antes da primeira pintura da tela (senão o app pisca no tema errado ao abrir)
 * e não fazem parte do conteúdo das anotações.
 */

export type Theme = 'dark' | 'light'

export interface Prefs {
  theme: Theme
  penColor: string
  penWidth: number
  showZones: boolean
  /** Identificar sozinho o que foi escrito dentro das zonas. */
  autoFields: boolean
  /** Mostrar a transcrição na folha, embaixo da letra. */
  showText: boolean
  /** Aproximação preferida da folha. 1 = folha inteira na largura da tela. */
  zoom: number
  /** Raio da borracha, em px de página. */
  eraserSize: number
  /** Velocidade de escuta do áudio. Fica entre as preferências porque é um
      jeito de ouvir, não um dado da gravação: vale pra todas. */
  audioRate: number
  /**
   * Onde o usuário estava da última vez.
   *
   * Sem isto o app sempre abria no primeiro caderno, na primeira aba e na
   * primeira folha — e quem tem o trabalho na folha vinte reencontra o começo
   * de tudo a cada vez. O relato foi "não consigo retomar o projeto de onde eu
   * estava".
   *
   * Fica nas preferências, e não no banco, porque é do APARELHO e não do
   * caderno: é a resposta pra "onde eu parei aqui", não um dado do conteúdo.
   * Os três ids juntos porque a folha sozinha não diz em que aba ela está.
   */
  ultimoLugar?: { notebookId: string; sectionId: string; pageId: string }
}

const KEY = 'organizador.prefs.v1'

const DEFAULTS: Prefs = {
  theme: 'dark',
  penColor: INK_COLOR,
  penWidth: PEN_WIDTH_DEFAULT,
  showZones: true,
  autoFields: true,
  showText: true,
  zoom: ZOOM_FIT,
  eraserSize: ERASER_DEFAULT,
  audioRate: 1,
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS, theme: systemTheme() }
    const saved = JSON.parse(raw) as Partial<Prefs>
    return {
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : systemTheme(),
      penColor: typeof saved.penColor === 'string' ? saved.penColor : DEFAULTS.penColor,
      penWidth: typeof saved.penWidth === 'number' ? saved.penWidth : DEFAULTS.penWidth,
      showZones: typeof saved.showZones === 'boolean' ? saved.showZones : DEFAULTS.showZones,
      autoFields: typeof saved.autoFields === 'boolean' ? saved.autoFields : DEFAULTS.autoFields,
      showText: typeof saved.showText === 'boolean' ? saved.showText : DEFAULTS.showText,
      zoom: typeof saved.zoom === 'number' ? clampZoom(saved.zoom) : DEFAULTS.zoom,
      eraserSize:
        typeof saved.eraserSize === 'number'
          ? Math.min(ERASER_MAX, Math.max(ERASER_MIN, saved.eraserSize))
          : DEFAULTS.eraserSize,
      audioRate: nearestRate(saved.audioRate),
      ultimoLugar: lugarValido(saved.ultimoLugar),
    }
  } catch {
    // Navegador com armazenamento bloqueado: segue nos padrões.
    return { ...DEFAULTS, theme: systemTheme() }
  }
}

/** Só aceita o lugar inteiro: dois ids de três não levam a lugar nenhum. */
function lugarValido(v: Prefs['ultimoLugar']): Prefs['ultimoLugar'] {
  if (!v || typeof v !== 'object') return undefined
  const { notebookId, sectionId, pageId } = v
  const ok = (x: unknown) => typeof x === 'string' && x.length > 0
  return ok(notebookId) && ok(sectionId) && ok(pageId) ? { notebookId, sectionId, pageId } : undefined
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Não poder guardar preferência não pode impedir de usar o app.
  }
}

/**
 * Velocidades de escuta, na ordem em que o botão passa por elas.
 *
 * Param em 2x de propósito: acima disso a fala vira ruído, e o botão existe pra
 * ouvir mais rápido, não pra pular. Nada de 0,5x — ninguém pediu "mais devagar",
 * e cada parada a mais é um toque a mais pra voltar ao normal.
 */
export const AUDIO_RATES = [1, 1.25, 1.5, 1.75, 2] as const

/** A próxima velocidade, dando a volta no fim. */
export function nextRate(atual: number): number {
  const i = AUDIO_RATES.indexOf(nearestRate(atual) as (typeof AUDIO_RATES)[number])
  return AUDIO_RATES[(i + 1) % AUDIO_RATES.length]
}

/**
 * A velocidade guardada, encaixada na lista.
 *
 * Preferência vem do localStorage, que qualquer coisa pode ter mexido — e
 * `playbackRate` com lixo dentro não é erro visível: é áudio que não toca.
 */
export function nearestRate(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 1
  let melhor: number = AUDIO_RATES[0]
  for (const r of AUDIO_RATES) {
    if (Math.abs(r - valor) < Math.abs(melhor - valor)) melhor = r
  }
  return melhor
}

/** Como a velocidade aparece no botão: "1x", "1,5x" — vírgula, não ponto. */
export function formatRate(valor: number): string {
  return `${String(valor).replace('.', ',')}x`
}

/** Segue o tema do Android na primeira abertura. */
function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Aplica o tema no documento. A barra do sistema Android segue a cor do
 * `theme-color`, então o app instalado fica coerente até fora da tela.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#faf9f6' : '#0a0a0c')
}
