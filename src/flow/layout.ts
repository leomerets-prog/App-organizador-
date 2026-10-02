import type { FlowShape, Id, Porta } from '../domain/types'

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
    /** Tamanho escolhido à mão; é um mínimo — o texto pode pedir mais. */
    tamanho?: { w: number; h: number }
    /** O nome, porque é ele que decide a altura mínima da caixa. */
    label?: string
  }[]
  edges: {
    id: Id
    from: Id
    to: Id
    saida?: Porta
    entrada?: Porta
    saidaDesvio?: number
    entradaDesvio?: number
    dobra?: number
  }[]
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

/** Altura de uma linha de nome, e a margem de dentro da caixa. */
export const LINHA = 18
const RECUO = 14
/** Largura média de uma letra a 15px em system-ui. Medida, não chutada. */
const LETRA = 7.8
/** Ninguém consegue tocar no que é menor que isto. */
const MIN_W = 120
const MIN_H = 54
/** O texto solto pode ser mais raso: não tem borda pra apertar. */
const MIN_H_TEXTO = 30

/**
 * O tamanho padrão de cada forma.
 *
 * Todas ocupam a mesma caixa, de propósito: um fluxograma com caixas de
 * tamanhos diferentes se lê como se as maiores importassem mais, e não é isso
 * que a forma quer dizer. As duas exceções têm motivo de desenho — o losango
 * estreita no meio, e o cilindro perde altura útil nas duas tampas.
 */
function padrao(kind: FlowShape): { w: number; h: number } {
  if (kind === 'decisao') return { w: DECISION_W, h: DECISION_H }
  if (kind === 'banco') return { w: NODE_W, h: NODE_H + 22 }
  // O texto solto nasce largo e raso: ele é uma frase, não um passo.
  if (kind === 'texto') return { w: NODE_W + 90, h: 46 }
  return { w: NODE_W, h: NODE_H }
}

/**
 * Quantas letras cabem numa linha dentro de uma caixa desta largura.
 *
 * O losango usa pouco mais da metade: o texto mora na faixa do meio, que é a
 * única parte larga dele.
 */
export function limiteDeLetras(largura: number, kind: FlowShape): number {
  const util = (largura - RECUO * 2) * (kind === 'decisao' ? 0.62 : 1)
  return Math.max(4, Math.floor(util / LETRA))
}

/**
 * Quebra o nome em linhas que caibam na largura, sem partir palavra no meio.
 *
 * Devolve TODAS as linhas — nunca corta. Cortar aqui era o que escondia o
 * texto: *"escrevi muito e está ficando oculto"*. Palavra maior que a linha é
 * partida, porque a alternativa é ela sair pra fora da caixa.
 *
 * É a mesma função que o painel usa pra desenhar. Se fossem duas, o dia em que
 * uma mudasse a caixa voltaria a ter altura de menos.
 */
export function quebrarTexto(texto: string, limite: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return ['…']
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    let p = palavra
    while (p.length > limite) {
      if (atual) {
        linhas.push(atual)
        atual = ''
      }
      linhas.push(p.slice(0, limite))
      p = p.slice(limite)
    }
    if (!atual) atual = p
    else if (atual.length + 1 + p.length <= limite) atual += ` ${p}`
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/** A altura mínima pra caber estas linhas nesta forma. */
export function alturaParaTexto(linhas: number, kind: FlowShape): number {
  // Sem borda, o texto solto não precisa da margem de dentro de uma caixa.
  if (kind === 'texto') return linhas * LINHA + 12
  const texto = linhas * LINHA + RECUO * 2
  // No losango o texto só cabe na faixa do meio: a caixa precisa do dobro.
  return kind === 'decisao' ? texto * 1.9 : texto
}

/**
 * O tamanho de uma caixa: o que o usuário escolheu, nunca menor que o texto.
 *
 * O tamanho escolhido é um MÍNIMO, e não uma camisa de força. Uma caixa que
 * recusasse crescer esconderia o nome — que é exatamente o defeito que o
 * tamanho ajustável veio consertar.
 */
export function sizeOf(
  kind: FlowShape,
  tamanho?: { w: number; h: number },
  label?: string,
): { w: number; h: number } {
  const base = padrao(kind)
  const w = Math.max(MIN_W, tamanho?.w ?? base.w)
  const linhas = quebrarTexto(label ?? '', limiteDeLetras(w, kind)).length
  const h = Math.max(
    kind === 'texto' ? MIN_H_TEXTO : MIN_H,
    tamanho?.h ?? base.h,
    alturaParaTexto(linhas, kind),
  )
  return { w, h }
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
      lista.reduce((t, n) => t + sizeOf(n.kind, n.tamanho, n.label).w, 0) +
      GAP_X * Math.max(0, lista.length - 1)
    largura = Math.max(largura, soma)
  }

  const colocados: PlacedNode[] = []
  const porId = new Map<Id, PlacedNode>()
  let y = MARGIN

  for (const l of niveis) {
    const lista = porNivel.get(l) ?? []
    const soma =
      lista.reduce((t, n) => t + sizeOf(n.kind, n.tamanho, n.label).w, 0) +
      GAP_X * Math.max(0, lista.length - 1)
    let x = MARGIN + (largura - soma) / 2
    const alturaDoNivel = Math.max(...lista.map((n) => sizeOf(n.kind, n.tamanho, n.label).h))

    for (const n of lista) {
      const { w, h } = sizeOf(n.kind, n.tamanho, n.label)
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
      points: de && para ? caminho(de, para, volta, total, e) : [],
    }
  })

  return { nodes: colocados, edges: setas, width: total, height: altura }
}

/** Folga pra decidir "está embaixo" / "está ao lado" sem brigar por um píxel. */
const FOLGA_LADO = 8

/**
 * O caminho de uma seta, em cotovelos retos.
 *
 * Reto porque fluxograma oficial é reto: linha torta cruzando caixa é o que faz
 * um desenho desses virar ilegível.
 *
 * ## Por onde a seta sai e por onde ela entra
 *
 * A pergunta que manda é **onde está o destino**, não "é pra frente ou pra
 * trás". Quem decide errado produz exatamente o que o usuário relatou:
 *
 * > "quando vêm da esquerda para um novo quadrado na direita, a linha não fica
 * > na lateral esquerda do novo quadrado, ela sobe e aponta para o topo"
 *
 * Antes toda seta pra frente saía por BAIXO e entrava por CIMA, viesse de onde
 * viesse. Num fluxograma só arrumado pelo arranjo isso quase sempre casa,
 * porque o destino fica mesmo embaixo. Mas o painel virou editor: o usuário
 * arrasta as caixas pro lado, e aí a seta descia, atravessava e subia pra
 * entrar pelo telhado da caixa vizinha.
 *
 * Hoje são quatro casos:
 *
 * - **o destino está embaixo** — sai por baixo, entra por cima (o do
 *   fluxograma arrumado, e o mais legível)
 * - **está ao lado** — sai pela lateral e entra pela lateral de frente,
 *   com o cotovelo no meio do vão
 * - **é retorno de ciclo**, ou está acima sem estar ao lado — contorna por
 *   fora, pela margem
 * - **as duas se sobrepõem** — cai no primeiro, que é o menos feio
 */
export interface Ajuste {
  saida?: Porta
  entrada?: Porta
  saidaDesvio?: number
  entradaDesvio?: number
  dobra?: number
}

function caminho(
  de: PlacedNode,
  para: PlacedNode,
  retorno: boolean,
  largura: number,
  ajuste: Ajuste,
): { x: number; y: number }[] {
  const mexida =
    ajuste.saida ||
    ajuste.entrada ||
    ajuste.saidaDesvio !== undefined ||
    ajuste.entradaDesvio !== undefined ||
    ajuste.dobra !== undefined

  // Escolha do usuário manda — inclusive num retorno. Quem está montando o
  // desenho sabe de que lado a seta fica legível; o contorno é só o palpite
  // do arranjo pra quando ninguém disse nada.
  if (!mexida && retorno) return contornando(de, para, largura)

  const { acima, aDireita, aEsquerda } = ondeEsta(de, para)
  if (!mexida && acima && !aDireita && !aEsquerda) return contornando(de, para, largura)

  const auto = portasAutomaticas(de, para)
  return rota(de, ajuste.saida ?? auto.saida, para, ajuste.entrada ?? auto.entrada, ajuste)
}

function ondeEsta(de: PlacedNode, para: PlacedNode) {
  return {
    abaixo: para.y >= de.y + de.h - FOLGA_LADO,
    acima: para.y + para.h <= de.y + FOLGA_LADO,
    aDireita: para.x >= de.x + de.w - FOLGA_LADO,
    aEsquerda: para.x + para.w <= de.x + FOLGA_LADO,
  }
}

/**
 * De que lado a seta sai e entra, quando ninguém escolheu.
 *
 * A pergunta que manda é **onde está o destino**, e não "é pra frente ou pra
 * trás". Decidir isso errado produz exatamente o que o usuário relatou: *"a
 * linha não fica na lateral esquerda do novo quadrado, ela sobe e aponta para
 * o topo"*. A caixa embaixo recebe por cima; a caixa ao lado recebe pelo lado
 * que olha de volta pra origem — nunca pelas costas.
 */
export function portasAutomaticas(
  de: PlacedNode,
  para: PlacedNode,
): { saida: Porta; entrada: Porta } {
  const { abaixo, acima, aDireita, aEsquerda } = ondeEsta(de, para)
  if (abaixo) return { saida: 'baixo', entrada: 'cima' }
  if (aDireita) return { saida: 'direita', entrada: 'esquerda' }
  if (aEsquerda) return { saida: 'esquerda', entrada: 'direita' }
  if (acima) return { saida: 'cima', entrada: 'baixo' }
  return { saida: 'baixo', entrada: 'cima' }
}

/** Até onde a seta pode escorregar na borda sem sair da caixa. */
export const DESVIO_MAX = 0.42
/** E onde a dobra pode ficar, sem colar numa das pontas. */
export const DOBRA_MIN = 0.08
export const DOBRA_MAX = 0.92

const prender = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * O ponto exato de uma porta, na borda da caixa.
 *
 * `desvio` escorrega o ponto ao longo dessa borda, a partir do meio. É o que
 * permite tirar o trecho reto de cima do caminho de outra seta — e o que
 * separa duas setas que saem da mesma caixa pelo mesmo lado.
 */
export function pontoDaPorta(n: PlacedNode, porta: Porta, desvio = 0): { x: number; y: number } {
  const d = prender(desvio, -DESVIO_MAX, DESVIO_MAX)
  if (porta === 'cima') return { x: n.x + n.w * (0.5 + d), y: n.y }
  if (porta === 'baixo') return { x: n.x + n.w * (0.5 + d), y: n.y + n.h }
  if (porta === 'esquerda') return { x: n.x, y: n.y + n.h * (0.5 + d) }
  return { x: n.x + n.w, y: n.y + n.h * (0.5 + d) }
}

const ehVertical = (p: Porta) => p === 'cima' || p === 'baixo'

/**
 * O caminho entre duas portas, em cotovelos retos.
 *
 * Três formas, conforme as portas: duas verticais descem com o degrau no meio
 * da altura; duas laterais atravessam com o degrau no meio do vão; e uma de
 * cada dá um cotovelo só. A seta sempre CHEGA na direção da porta de destino,
 * que é o que faz a ponta apontar pro lado certo.
 */
export function rota(
  de: PlacedNode,
  saida: Porta,
  para: PlacedNode,
  entrada: Porta,
  ajuste: Ajuste = {},
): { x: number; y: number }[] {
  const a = pontoDaPorta(de, saida, ajuste.saidaDesvio ?? 0)
  const b = pontoDaPorta(para, entrada, ajuste.entradaDesvio ?? 0)
  const dobra = prender(ajuste.dobra ?? 0.5, DOBRA_MIN, DOBRA_MAX)

  if (ehVertical(saida) && ehVertical(entrada)) {
    if (Math.abs(a.x - b.x) < 2 && ajuste.dobra === undefined) return [a, b]
    const meio = a.y + (b.y - a.y) * dobra
    return [a, { x: a.x, y: meio }, { x: b.x, y: meio }, b]
  }

  if (!ehVertical(saida) && !ehVertical(entrada)) {
    if (Math.abs(a.y - b.y) < 2 && ajuste.dobra === undefined) return [a, b]
    const meio = a.x + (b.x - a.x) * dobra
    return [a, { x: meio, y: a.y }, { x: meio, y: b.y }, b]
  }

  return ehVertical(saida) ? [a, { x: a.x, y: b.y }, b] : [a, { x: b.x, y: a.y }, b]
}

/**
 * Contorna por fora, pela margem.
 *
 * Pelo lado mais perto da borda, e nunca por cima das caixas — que é o que o
 * desvio existe pra evitar.
 */
function contornando(
  de: PlacedNode,
  para: PlacedNode,
  largura: number,
): { x: number; y: number }[] {
  const paraEsquerda = de.x + de.w / 2 < largura / 2
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
