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
  /** Aproximação preferida da folha. 1 = folha inteira na largura da tela. */
  zoom: number
  /** Raio da borracha, em px de página. */
  eraserSize: number
}

const KEY = 'organizador.prefs.v1'

const DEFAULTS: Prefs = {
  theme: 'dark',
  penColor: INK_COLOR,
  penWidth: PEN_WIDTH_DEFAULT,
  showZones: true,
  autoFields: true,
  zoom: ZOOM_FIT,
  eraserSize: ERASER_DEFAULT,
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
      zoom: typeof saved.zoom === 'number' ? clampZoom(saved.zoom) : DEFAULTS.zoom,
      eraserSize:
        typeof saved.eraserSize === 'number'
          ? Math.min(ERASER_MAX, Math.max(ERASER_MIN, saved.eraserSize))
          : DEFAULTS.eraserSize,
    }
  } catch {
    // Navegador com armazenamento bloqueado: segue nos padrões.
    return { ...DEFAULTS, theme: systemTheme() }
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Não poder guardar preferência não pode impedir de usar o app.
  }
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
