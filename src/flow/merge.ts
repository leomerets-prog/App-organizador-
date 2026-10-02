import type { Flowchart, FlowChartEdge, FlowChartNode } from '../domain/types'
import type { FlowGraph } from './graph'

/**
 * Juntar a leitura nova com o que o usuário já editou.
 *
 * Este é o ponto mais perigoso do fluxograma inteiro, e por isso ele é um
 * módulo puro e testado: **remontar não pode apagar trabalho.** Quem corrigiu
 * quinze nomes, arrastou as caixas pro lugar certo, criou duas ramificações à
 * mão e escolheu as cores não pode perder nada disso por tocar em "Ler de
 * novo" — e vai tocar, porque desenhar mais na folha é o normal.
 *
 * As regras, em ordem de importância:
 *
 * 1. **O que o usuário fez à mão nunca some.** Caixa e ligação criadas no
 *    painel não têm tinta por trás; a leitura jamais as encontraria, e
 *    descartá-las seria apagar o trabalho dele
 * 2. **O que ele editou vence a leitura.** Nome corrigido, forma trocada,
 *    posição arrastada, tamanho ajustado, cor escolhida e o lado por onde cada
 *    seta sai e entra sobrevivem à remontagem
 * 3. **O que ele NÃO tocou segue a tinta.** Caixa que sumiu do desenho sai do
 *    fluxograma; caixa nova no desenho entra
 *
 * Verificado em `tools/flow-test.ts`.
 */

export interface Merged {
  nodes: FlowChartNode[]
  edges: FlowChartEdge[]
}

export function mergeFlowchart(anterior: Flowchart | undefined, grafo: FlowGraph): Merged {
  const antesNode = new Map((anterior?.nodes ?? []).map((n) => [n.id, n]))
  const antesEdge = new Map((anterior?.edges ?? []).map((e) => [e.id, e]))

  const nodes: FlowChartNode[] = grafo.nodes.map((n) => {
    const velho = antesNode.get(n.id)
    if (!velho) return { id: n.id, kind: n.kind, label: '', bounds: n.bounds }
    return {
      ...velho,
      // A forma e o nome só seguem a leitura enquanto o usuário não mexeu.
      kind: velho.editado ? velho.kind : n.kind,
      label: velho.editado ? velho.label : (velho.label ?? ''),
      // A caixa pode ter sido redesenhada noutro lugar da folha: a referência
      // de onde ela está no papel acompanha a tinta, sempre.
      bounds: n.bounds,
    }
  })

  // As caixas criadas no painel entram depois, na ordem em que foram criadas.
  const daLeitura = new Set(nodes.map((n) => n.id))
  for (const velho of anterior?.nodes ?? []) {
    if (velho.criadaAMao && !daLeitura.has(velho.id)) nodes.push(velho)
  }

  const vivos = new Set(nodes.map((n) => n.id))

  const edges: FlowChartEdge[] = grafo.edges
    .filter((e) => vivos.has(e.from) && vivos.has(e.to))
    .map((e) => {
      const velha = antesEdge.get(e.id)
      return {
        id: e.id,
        // Direção invertida à mão vence a leitura: quem olhou o desenho e
        // disse "esta aponta pro outro lado" sabe mais que o reconhecedor.
        from: velha?.direcao === 'mao' ? velha.from : e.from,
        to: velha?.direcao === 'mao' ? velha.to : e.to,
        label: velha?.label ?? '',
        direcao: velha?.direcao === 'mao' ? 'mao' : e.direcao,
        // As portas são escolha do usuário, como o nome e a cor: a leitura não
        // tem opinião sobre elas, e remontar não pode esquecê-las.
        saida: velha?.saida,
        entrada: velha?.entrada,
        saidaDesvio: velha?.saidaDesvio,
        entradaDesvio: velha?.entradaDesvio,
        dobra: velha?.dobra,
      }
    })

  // E as ligações feitas no painel, enquanto as duas pontas existirem.
  const daLeituraEdge = new Set(edges.map((e) => e.id))
  for (const velha of anterior?.edges ?? []) {
    if (!velha.criadaAMao || daLeituraEdge.has(velha.id)) continue
    if (vivos.has(velha.from) && vivos.has(velha.to)) edges.push(velha)
  }

  return { nodes, edges }
}
