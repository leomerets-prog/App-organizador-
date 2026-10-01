import type { Id, Item, Stroke } from '../domain/types'

/**
 * Voltar e avançar.
 *
 * Pedido em uma frase: *"rabisquei no meio da tela, o botão de voltar tira o
 * rabisco"*. Até aqui só existia um desfazer de borracha, que aparecia por
 * cinco segundos e sumia — cobria o engano percebido na hora e mais nada.
 *
 * ## Como um passo é guardado
 *
 * Cada passo guarda **os dois lados**: o que a folha tinha antes e o que
 * passou a ter. Voltar aplica um lado, avançar aplica o outro — e por isso não
 * existe "operação inversa" pra calcular, que é onde esse tipo de código
 * costuma errar e devolver a folha num estado que nunca existiu.
 *
 * Um traço novo: antes `{ remove: [id] }`, depois `{ restore: [traço] }`.
 * Uma borrachada: antes devolve os inteiros e tira os pedaços; depois faz o
 * contrário. O mesmo formato serve pros dois.
 *
 * Módulo puro: sem React, sem banco. Verificado em `tools/history-test.ts`.
 */

/** Um lado de um passo: o que precisa voltar e o que precisa sair. */
export interface StrokePatch {
  restore: Stroke[]
  remove: Id[]
  /**
   * A lista de itens INTEIRA, quando o passo mexeu nela.
   *
   * Só a borracha precisa disso: ela corta traços em pedaços e os itens são
   * religados por linhagem, uma conta que não se faz ao contrário. Guardar a
   * lista como estava é mais barato e mais confiável que tentar desfazer a
   * religação passo a passo. Pro traço desenhado não é preciso — tirar o traço
   * e mandar identificar de novo devolve a lista sozinha.
   */
  items?: Item[]
}

export interface HistoryStep {
  pageId: Id
  /** Como o passo é chamado na tela ("rabisco", "trecho apagado"). */
  label: string
  /** Pra VOLTAR: devolve o que havia antes. */
  antes: StrokePatch
  /** Pra AVANÇAR: refaz o que o passo tinha feito. */
  depois: StrokePatch
}

export interface History {
  /** Passos já feitos, do mais antigo pro mais recente. */
  feitos: HistoryStep[]
  /** Passos desfeitos, esperando o avançar. */
  desfeitos: HistoryStep[]
}

/**
 * Quantos passos a pilha guarda.
 *
 * Cada passo carrega traços inteiros na memória; é generoso o bastante pra uma
 * sentada de trabalho e pequeno o bastante pra não pesar no tablet.
 */
export const MAX_STEPS = 60

export const EMPTY_HISTORY: History = { feitos: [], desfeitos: [] }

/**
 * Registra um passo novo.
 *
 * Fazer qualquer coisa **apaga o avançar**: é a regra de todo editor, e o
 * motivo é prático — depois de voltar e escrever outra coisa, "avançar" não
 * teria onde encaixar o que foi desfeito.
 */
export function push(history: History, step: HistoryStep): History {
  const feitos = [...history.feitos, step]
  return {
    feitos: feitos.length > MAX_STEPS ? feitos.slice(feitos.length - MAX_STEPS) : feitos,
    desfeitos: [],
  }
}

/** O passo a desfazer e a pilha depois disso, ou nulo quando não há o que voltar. */
export function undo(history: History): { step: HistoryStep; history: History } | null {
  const step = history.feitos[history.feitos.length - 1]
  if (!step) return null
  return {
    step,
    history: {
      feitos: history.feitos.slice(0, -1),
      desfeitos: [...history.desfeitos, step],
    },
  }
}

/** O passo a refazer e a pilha depois disso, ou nulo quando não há o que avançar. */
export function redo(history: History): { step: HistoryStep; history: History } | null {
  const step = history.desfeitos[history.desfeitos.length - 1]
  if (!step) return null
  return {
    step,
    history: {
      feitos: [...history.feitos, step],
      desfeitos: history.desfeitos.slice(0, -1),
    },
  }
}

/**
 * Aplica um lado do passo sobre a lista de traços.
 *
 * Tira primeiro, devolve depois, e ordena por instante de início no fim: é a
 * ordem em que a tinta é desenhada, e sem ela um traço devolvido apareceria
 * por cima do que foi escrito depois dele.
 */
export function applyPatch(strokes: readonly Stroke[], patch: StrokePatch): Stroke[] {
  const fora = new Set(patch.remove)
  const vivos = strokes.filter((s) => !fora.has(s.id))
  // Um traço que já está lá não entra duas vezes: desfazer duas vezes seguidas
  // a mesma coisa não pode duplicar tinta.
  const presentes = new Set(vivos.map((s) => s.id))
  const voltando = patch.restore.filter((s) => !presentes.has(s.id))
  return [...vivos, ...voltando].sort((a, b) => a.startedAt - b.startedAt)
}

/** Os passos da página que saiu não servem pra página que entrou. */
export function forPage(history: History, pageId: Id | null): History {
  if (!pageId) return EMPTY_HISTORY
  const vale = (s: HistoryStep) => s.pageId === pageId
  return {
    feitos: history.feitos.filter(vale),
    desfeitos: history.desfeitos.filter(vale),
  }
}

/** O passo de um traço desenhado. */
export function drawStep(stroke: Stroke, label = 'traço'): HistoryStep {
  return {
    pageId: stroke.pageId,
    label,
    antes: { restore: [], remove: [stroke.id] },
    depois: { restore: [stroke], remove: [] },
  }
}

/** O passo de uma borrachada: os inteiros saíram e viraram pedaços. */
export function eraseStep(
  pageId: Id,
  inteiros: Stroke[],
  pedacos: Stroke[],
  itensAntes: Item[],
  itensDepois: Item[],
  label = 'trecho apagado',
): HistoryStep {
  return {
    pageId,
    label,
    antes: { restore: inteiros, remove: pedacos.map((s) => s.id), items: itensAntes },
    depois: { restore: pedacos, remove: inteiros.map((s) => s.id), items: itensDepois },
  }
}
