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

/**
 * Cor padrão da caneta. Não é uma cor fixa: é um símbolo que o desenho resolve
 * conforme o tema — escuro no papel claro, claro no papel escuro. Sem isso, a
 * anotação feita no tema escuro sumiria ao trocar pro claro.
 */
export const INK_COLOR = 'ink'

/**
 * Cor branca usada como padrão antes de existir o tema claro.
 * Anotações antigas ficam com ela gravada; o desenho a trata como INK_COLOR
 * pra que não sumam no papel branco.
 */
export const LEGACY_INK_COLOR = '#f4f4f5'

/** Cores da caneta na barra de ferramentas. */
export const PEN_COLORS = [
  INK_COLOR,
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
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

/**
 * Faixa da espessura da caneta, em px de página.
 *
 * O mínimo é bem fino de propósito: a espessura vira traço de verdade depois
 * de multiplicada pela escala da tela, e num tablet grande a folha aparece
 * ampliada — o que era fino no papel engrossa na tela.
 */
export const PEN_WIDTH_MIN = 0.3
export const PEN_WIDTH_MAX = 14
export const PEN_WIDTH_DEFAULT = 2.4

/** Espessuras de atalho, pra não precisar mirar na barra toda hora. */
export const PEN_WIDTH_PRESETS = [0.6, 1.2, 2.4, 5, 9] as const

/** O marca-texto é sempre grosso; a barra da caneta não vale pra ele. */
export const HIGHLIGHTER_WIDTH = 22

/**
 * Raio da borracha, em px de página.
 *
 * Como é medido em página e não em tela, ampliar a folha não muda o que a
 * borracha alcança em relação à escrita — ela apaga a mesma quantidade de
 * tinta em qualquer aproximação.
 */
export const ERASER_MIN = 6
export const ERASER_MAX = 90
export const ERASER_DEFAULT = 18
export const ERASER_PRESETS = [8, 18, 36, 60] as const
