/**
 * Medidas da folha, em "px de página" — uma unidade lógica independente da tela.
 * A folha tem largura fixa e cresce pra baixo; a escala de exibição se ajusta
 * ao tablet, então a mesma anotação fica igual em qualquer tamanho de tela.
 */

export const PAGE_WIDTH = 1240

/** Altura inicial: pouco mais que uma tela de tablet em pé. */
export const PAGE_MIN_HEIGHT = 1754

/** Quanto a folha ganha de altura quando a escrita chega perto do fim. */
export const PAGE_GROWTH = 900

/** Cores da caneta na barra de ferramentas. */
export const PEN_COLORS = [
  '#f4f4f5',
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#c084fc',
] as const

/** Cores disponíveis pras lombadas de blocos e seções. */
export const NOTEBOOK_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#ef4444',
] as const

export const PEN_WIDTHS = [1.8, 3.2, 5.5, 9] as const
