import type { Flowchart, Id } from '../domain/types'

/**
 * Voltar e avançar no fluxograma.
 *
 * Pedido em uma frase: *"não consigo voltar o que eu fiz (setas igual nos
 * textos)"*. A tinta já tinha ↶ e ↷; o painel não tinha nada, e no painel um
 * engano custa mais caro — um toque fora do lugar arrasta uma caixa pro outro
 * canto, e sem desfazer o jeito de consertar é arrastar de volta no olho.
 *
 * ## Por que aqui é FOTOGRAFIA e na tinta é remendo
 *
 * `ink/history.ts` guarda os dois lados de cada passo porque um traço pesa:
 * guardar a folha inteira a cada rabisco encheria a memória do tablet. Um
 * fluxograma é uma dúzia de caixas e uma dúzia de setas — o desenho inteiro é
 * menor que UM traço. Então cada passo guarda o fluxograma inteiro como estava.
 *
 * E isso compra a coisa mais importante: **"Ler de novo" vira um passo como
 * qualquer outro.** Remontar a partir da tinta não tem operação inversa pra
 * calcular; com a fotografia, voltar é só devolver a que estava guardada.
 *
 * ## A armadilha que esta pilha evita
 *
 * Passo que não muda nada é pior que passo nenhum: quem toca em "azul" numa
 * caixa que já era azul e depois aperta ↶ vê o botão piscar e a tela parada, e
 * conclui que o desfazer não funciona. Por isso quem grava compara a
 * `assinatura` dos dois lados e só registra o que de fato mudou.
 *
 * Módulo puro: sem React, sem banco. Verificado em `tools/flow-test.ts`.
 */

export interface FlowHistory {
  /**
   * De qual fluxograma esta pilha fala.
   *
   * Trocar de página troca de fluxograma, e os passos de um não servem ao
   * outro — voltar aplicaria uma fotografia de outro desenho por cima deste.
   */
  chartId: Id | null
  /** Fotografias de antes de cada passo, da mais antiga pra mais recente. */
  feitos: Flowchart[]
  /** As que foram desfeitas, esperando o avançar. */
  desfeitos: Flowchart[]
}

/**
 * Quantos passos a pilha guarda.
 *
 * Menor que o da tinta (60) porque cada passo aqui é o desenho inteiro, e
 * maior que o bastante pra uma sentada de edição — ninguém arrasta quarenta
 * caixas sem parar pra olhar o resultado.
 */
export const MAX_PASSOS = 40

export const SEM_HISTORIA: FlowHistory = { chartId: null, feitos: [], desfeitos: [] }

/**
 * O que distingue um fluxograma de outro, pra efeito de desfazer.
 *
 * Só o que o usuário vê e escolhe. `updatedAt` fica de fora de propósito: ele
 * muda a cada gravação e faria toda gravação parecer uma mudança. As listas
 * saem ordenadas por id porque a remontagem pode devolver as caixas noutra
 * ordem sem que nada tenha mudado pra quem olha.
 */
export function assinatura(chart: Flowchart): string {
  const caixas = [...chart.nodes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (n) =>
        `${n.id}|${n.kind}|${n.label}|${n.cor ?? ''}|` +
        (n.pos ? `${Math.round(n.pos.x)},${Math.round(n.pos.y)}` : '-') +
        '|' +
        (n.tamanho ? `${Math.round(n.tamanho.w)}x${Math.round(n.tamanho.h)}` : '-') +
        `|${n.porte ?? '-'}`,
    )
    .join(';')
  const setas = [...chart.edges]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (e) =>
        `${e.id}|${e.from}|${e.to}|${e.label}|${e.saida ?? '-'}|${e.entrada ?? '-'}` +
        `|${num(e.saidaDesvio)}|${num(e.entradaDesvio)}|${num(e.dobra)}|${e.ponta ?? '-'}`,
    )
    .join(';')
  return `${chart.titulo ?? ''}|${chart.subtitulo ?? ''}#${caixas}#${setas}`
}

/** Mudou alguma coisa que o usuário veria? */
export function mudou(antes: Flowchart, depois: Flowchart): boolean {
  return assinatura(antes) !== assinatura(depois)
}

/**
 * Registra um passo: a fotografia de ANTES.
 *
 * Fazer qualquer coisa apaga o avançar, como em todo editor: depois de voltar
 * e mexer noutra coisa, o que foi desfeito não teria mais onde encaixar.
 */
export function push(history: FlowHistory, antes: Flowchart): FlowHistory {
  const feitos = [...paraChart(history, antes.id).feitos, antes]
  return {
    chartId: antes.id,
    feitos: feitos.length > MAX_PASSOS ? feitos.slice(feitos.length - MAX_PASSOS) : feitos,
    desfeitos: [],
  }
}

/**
 * A fotografia pra voltar, e a pilha depois disso.
 *
 * `atual` entra na pilha do avançar — é ela que o ↷ vai devolver.
 */
export function undo(
  history: FlowHistory,
  atual: Flowchart,
): { chart: Flowchart; history: FlowHistory } | null {
  const pilha = paraChart(history, atual.id)
  const chart = pilha.feitos[pilha.feitos.length - 1]
  if (!chart) return null
  return {
    chart,
    history: {
      chartId: atual.id,
      feitos: pilha.feitos.slice(0, -1),
      desfeitos: [...pilha.desfeitos, atual],
    },
  }
}

/** A fotografia pra avançar, e a pilha depois disso. */
export function redo(
  history: FlowHistory,
  atual: Flowchart,
): { chart: Flowchart; history: FlowHistory } | null {
  const pilha = paraChart(history, atual.id)
  const chart = pilha.desfeitos[pilha.desfeitos.length - 1]
  if (!chart) return null
  return {
    chart,
    history: {
      chartId: atual.id,
      feitos: [...pilha.feitos, atual],
      desfeitos: pilha.desfeitos.slice(0, -1),
    },
  }
}

/** A pilha deste fluxograma; a de outro não serve e vai fora. */
export function paraChart(history: FlowHistory, chartId: Id | null): FlowHistory {
  if (!chartId) return SEM_HISTORIA
  if (history.chartId !== chartId) return { chartId, feitos: [], desfeitos: [] }
  return history
}

/**
 * Como o passo se chama na tela ("Voltar: caixa movida").
 *
 * Sai da comparação das duas fotografias, e não de quem chamou: assim nenhuma
 * edição nova precisa lembrar de se nomear, e nenhuma fica sem nome.
 */
export function rotulo(antes: Flowchart, depois: Flowchart): string {
  if ((antes.titulo ?? '') !== (depois.titulo ?? '')) return 'título'
  if ((antes.subtitulo ?? '') !== (depois.subtitulo ?? '')) return 'subtítulo'
  if (depois.nodes.length > antes.nodes.length) return 'caixa nova'
  if (depois.nodes.length < antes.nodes.length) return 'caixa tirada'
  if (depois.edges.length > antes.edges.length) return 'ligação nova'
  if (depois.edges.length < antes.edges.length) return 'ligação tirada'

  const arrumou =
    antes.nodes.some((n) => n.pos) && depois.nodes.every((n) => !n.pos)
  if (arrumou) return 'arrumar'

  for (const d of depois.nodes) {
    const a = antes.nodes.find((n) => n.id === d.id)
    if (!a) return 'leitura'
    if (lugar(a.pos) !== lugar(d.pos)) return 'caixa movida'
    if (a.kind !== d.kind) return 'forma'
    if (a.cor !== d.cor) return 'cor'
    if (tam(a.tamanho) !== tam(d.tamanho)) return 'tamanho'
    if (a.porte !== d.porte) return 'porte da letra'
    if (a.label !== d.label) return 'nome'
  }
  for (const d of depois.edges) {
    const a = antes.edges.find((e) => e.id === d.id)
    if (!a) return 'leitura'
    if (a.from === d.to && a.to === d.from) return 'seta invertida'
    if (a.saida !== d.saida || a.entrada !== d.entrada) return 'lado da seta'
    if (a.ponta !== d.ponta) return 'ponta da seta'
    if (num(a.dobra) !== num(d.dobra)) return 'dobra da seta'
    if (num(a.saidaDesvio) !== num(d.saidaDesvio) || num(a.entradaDesvio) !== num(d.entradaDesvio)) {
      return 'onde a seta encosta'
    }
    if (a.label !== d.label) return 'nome da seta'
  }
  return 'leitura'
}

function lugar(pos: { x: number; y: number } | undefined): string {
  return pos ? `${Math.round(pos.x)},${Math.round(pos.y)}` : '-'
}

function num(v: number | undefined): string {
  return typeof v === 'number' ? v.toFixed(3) : '-'
}

function tam(t: { w: number; h: number } | undefined): string {
  return t ? `${Math.round(t.w)}x${Math.round(t.h)}` : '-'
}
