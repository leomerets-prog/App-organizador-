import type { FlowShape, Id } from '../domain/types'

/**
 * O arranjo: do rabisco pro fluxograma de verdade.
 *
 * O desenho à mão tem as caixas onde coube na folha. O fluxograma "oficial"
 * tem as caixas em **níveis**: o começo em cima, e cada caixa um nível abaixo
 * da que a alimenta. É essa a única coisa que faz um fluxograma ser legível, e
 * é o que este módulo faz.
 *
 * ## As três decisões
 *
 * 1. **Nível = caminho mais longo até aqui.** Não o mais curto: se uma caixa é
 *    alimentada por duas, ela tem que ficar abaixo das DUAS, senão a seta
 *    sobe e o desenho vira nó
 * 2. **A ordem dentro do nível é a do desenho.** Quem desenhou a decisão com o
 *    "sim" à esquerda espera encontrar o "sim" à esquerda. Arranjo bonito que
 *    troca os lados obriga a reler tudo
 * 3. **Ciclo não trava.** Fluxograma de processo volta pra trás o tempo todo
 *    ("deu errado → refaz"). Essas setas são marcadas como retorno e
 *    contornadas por fora, em vez de o arranjo desistir
 *
 * Módulo puro: só contas. Verificado em `tools/flow-test.ts`.
 */

// ─── Medidas do desenho pronto ───────────────────────────────────────────────

export const NODE_W = 230
export const NODE_H = 86
/** O losango precisa de mais espaço pro texto caber no meio estreito. */
export const DECISION_W = 250
export const DECISION_H = 118
export const GAP_X = 46
export const GAP_Y = 76
export const MARGIN = 40

export interface GraphIn {
  nodes: {
    id: Id
    kind: FlowShape
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    /** Posição escolhida à mão; quando existe, manda no arranjo automático. */
    pos?: { x: number; y: number }
  }[]
  edges: { id: Id; from: Id; to: Id }[]
}

export interface PlacedNode {
  id: Id
  kind: FlowShape
  level: number
  x: number
  y: number
  w: number
  h: number
  /** A posição veio da mão do usuário, não do arranjo. */
  manual?: boolean
}

export interface PlacedEdge {
  id: Id
  from: Id
  to: Id
  /** Volta pra um nível igual ou acima: é desenhada contornando por fora. */
  retorno: boolean
  /** O caminho da seta, já em cotovelos retos. */
  points: { x: number; y: number }[]
}

export interface Layout {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  width: number
  height: number
}

/**
 * O tamanho de cada forma.
 *
 * Todas ocupam a mesma caixa, de propósito: um fluxograma com caixas de
 * tamanhos diferentes se lê como se as maiores importassem mais, e não é isso
 * que a forma quer dizer. As duas exceções têm motivo de desenho — o losango
 * estreita no meio, e o cilindro perde altura útil nas duas tampas.
 */
export function sizeOf(kind: FlowShape): { w: number; h: number } {
  if (kind === 'decisao') return { w: DECISION_W, h: DECISION_H }
  if (kind === 'banco') return { w: NODE_W, h: NODE_H + 22 }
  return { w: NODE_W, h: NODE_H }
}

/**
 * Em que nível cada caixa fica.
 *
 * Caminho mais longo a partir de quem não recebe nada. As setas de retorno
 * (que voltariam pra cima) são tiradas da conta ANTES, senão o caminho mais
 * longo não existiria — ele daria voltas pra sempre.
 */
export function levelize(graph: GraphIn): Map<Id, number> {
  const entram = new Map<Id, Id[]>()
  const saem = new Map<Id, Id[]>()
  for (const n of graph.nodes) {
    entram.set(n.id, [])
    saem.set(n.id, [])
  }
  const retorno = backEdges(graph)
  for (const e of graph.edges) {
    if (retorno.has(e.id)) continue
    entram.get(e.to)?.push(e.from)
    saem.get(e.from)?.push(e.to)
  }

  const nivel = new Map<Id, number>()
  // Ordem topológica (Kahn). Quem sobrar é parte de um emaranhado e cai no
  // nível que der — melhor um desenho torto que desenho nenhum.
  const grau = new Map<Id, number>()
  for (const n of graph.nodes) grau.set(n.id, entram.get(n.id)?.length ?? 0)

  const fila = graph.nodes.filter((n) => (grau.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of fila) nivel.set(id, 0)

  let i = 0
  while (i < fila.length) {
    const atual = fila[i++]
    for (const proximo of saem.get(atual) ?? []) {
      nivel.set(proximo, Math.max(nivel.get(proximo) ?? 0, (nivel.get(atual) ?? 0) + 1))
      const restante = (grau.get(proximo) ?? 0) - 1
      grau.set(proximo, restante)
      if (restante === 0) fila.push(proximo)
    }
  }

  for (const n of graph.nodes) if (!nivel.has(n.id)) nivel.set(n.id, 0)
  return nivel
}

/**
 * As setas que voltam pra trás.
 *
 * Busca em profundidade: uma seta que chega numa caixa que ainda está sendo
 * visitada fecha um ciclo. São elas, e só elas, que o arranjo contorna.
 */
export function backEdges(graph: GraphIn): Set<Id> {
  const saem = new Map<Id, { id: Id; to: Id }[]>()
  for (const n of graph.nodes) saem.set(n.id, [])
  for (const e of graph.edges) saem.get(e.from)?.push({ id: e.id, to: e.to })

  const estado = new Map<Id, 0 | 1 | 2>() // 0 = novo, 1 = visitando, 2 = pronto
  const retorno = new Set<Id>()

  const descer = (id: Id) => {
    estado.set(id, 1)
    for (const e of saem.get(id) ?? []) {
      const marca = estado.get(e.to) ?? 0
      if (marca === 1) retorno.add(e.id)
      else if (marca === 0) descer(e.to)
    }
    estado.set(id, 2)
  }

  // Começa por quem não recebe nada; o resto, na ordem do desenho.
  const recebe = new Set(graph.edges.map((e) => e.to))
  for (const n of graph.nodes) if (!recebe.has(n.id)) descer(n.id)
  for (const n of graph.nodes) if ((estado.get(n.id) ?? 0) === 0) descer(n.id)

  return retorno
}

/** O fluxograma arrumado: posições e caminhos prontos pra desenhar. */
export function layout(graph: GraphIn): Layout {
  const nivel = levelize(graph)
  const retorno = backEdges(graph)

  // Agrupa por nível, mantendo a ordem da esquerda pra direita do DESENHO.
  const porNivel = new Map<number, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const l = nivel.get(n.id) ?? 0
    const lista = porNivel.get(l) ?? []
    lista.push(n)
    porNivel.set(l, lista)
  }
  for (const lista of porNivel.values()) {
    lista.sort((a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY)
  }

  const niveis = [...porNivel.keys()].sort((a, b) => a - b)

  // Largura total = a do nível mais largo; os outros ficam centrados nela.
  let largura = 0
  for (const l of niveis) {
    const lista = porNivel.get(l) ?? []
    const soma =
      lista.reduce((t, n) => t + sizeOf(n.kind).w, 0) + GAP_X * Math.max(0, lista.length - 1)
    largura = Math.max(largura, soma)
  }

  const colocados: PlacedNode[] = []
  const porId = new Map<Id, PlacedNode>()
  let y = MARGIN

  for (const l of niveis) {
    const lista = porNivel.get(l) ?? []
    const soma =
      lista.reduce((t, n) => t + sizeOf(n.kind).w, 0) + GAP_X * Math.max(0, lista.length - 1)
    let x = MARGIN + (largura - soma) / 2
    const alturaDoNivel = Math.max(...lista.map((n) => sizeOf(n.kind).h))

    for (const n of lista) {
      const { w, h } = sizeOf(n.kind)
      const posto: PlacedNode = {
        id: n.id,
        kind: n.kind,
        level: l,
        // A posição escolhida à mão ganha do arranjo — mas a caixa continua
        // ocupando o lugar dela na fila, pra que mover uma não embaralhe as
        // outras de volta.
        x: n.pos ? n.pos.x : x,
        // Centraliza na faixa: níveis que misturam losango e retângulo ficam
        // alinhados pelo meio, e não pelo topo.
        y: n.pos ? n.pos.y : y + (alturaDoNivel - h) / 2,
        w,
        h,
        manual: n.pos ? true : undefined,
      }
      colocados.push(posto)
      porId.set(n.id, posto)
      x += w + GAP_X
    }
    y += alturaDoNivel + GAP_Y
  }

  /*
   * A tela cresce pra caber o que foi arrastado.
   *
   * Sem isto, mover uma caixa pra fora do que o arranjo previu a esconderia —
   * e a primeira coisa que alguém faz ao poder mover é justamente levar uma
   * caixa pra um canto vazio.
   */
  let altura = y - GAP_Y + MARGIN
  let total = largura + MARGIN * 2
  for (const posto of colocados) {
    total = Math.max(total, posto.x + posto.w + MARGIN)
    altura = Math.max(altura, posto.y + posto.h + MARGIN)
  }

  const setas: PlacedEdge[] = graph.edges.map((e) => {
    const de = porId.get(e.from)
    const para = porId.get(e.to)
    const volta = retorno.has(e.id)
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      retorno: volta,
      points: de && para ? caminho(de, para, volta, total) : [],
    }
  })

  return { nodes: colocados, edges: setas, width: total, height: altura }
}

/**
 * O caminho de uma seta, em cotovelos retos.
 *
 * Reto porque fluxograma oficial é reto: linha torta cruzando caixa é o que
 * faz um desenho desses virar ilegível. São três casos, e só três:
 *
 * - **pra baixo, na mesma coluna** — uma reta
 * - **pra baixo, mudando de coluna** — desce, anda no meio do vão, desce
 * - **de volta pra cima** — sai pela lateral, sobe pela margem e entra por lá
 */
function caminho(
  de: PlacedNode,
  para: PlacedNode,
  retorno: boolean,
  largura: number,
): { x: number; y: number }[] {
  const deX = de.x + de.w / 2
  const paraX = para.x + para.w / 2

  if (retorno || para.y <= de.y) {
    // Contorna por fora, pelo lado mais perto da borda — e nunca por cima das
    // caixas, que é o que o desvio existe pra evitar.
    const paraEsquerda = deX < largura / 2
    const corredor = paraEsquerda
      ? Math.min(de.x, para.x) - MARGIN / 2
      : Math.max(de.x + de.w, para.x + para.w) + MARGIN / 2
    const saida = paraEsquerda ? de.x : de.x + de.w
    const entrada = paraEsquerda ? para.x : para.x + para.w
    return [
      { x: saida, y: de.y + de.h / 2 },
      { x: corredor, y: de.y + de.h / 2 },
      { x: corredor, y: para.y + para.h / 2 },
      { x: entrada, y: para.y + para.h / 2 },
    ]
  }

  const saiEm = { x: deX, y: de.y + de.h }
  const chegaEm = { x: paraX, y: para.y }
  if (Math.abs(deX - paraX) < 2) return [saiEm, chegaEm]

  const meio = (de.y + de.h + para.y) / 2
  return [saiEm, { x: deX, y: meio }, { x: paraX, y: meio }, chegaEm]
}
