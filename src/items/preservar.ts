import type { Id, Item } from '../domain/types'

/**
 * O QUE O USUÁRIO DISSE SOBRE UM ITEM — e as regras que impedem que isso se
 * perca.
 *
 * A revisão da casa (os revisores do everything-claude-code, um por área)
 * achou quatro caminhos diferentes pelos quais a ficha de um item sumia sem
 * aviso: o voltar da borracha repunha a lista inteira de itens como estava; a
 * leitura da letra gravava por cima a cópia de antes da espera; mudar a zona
 * apagava os itens com a tinta ainda na folha; e voltar-e-avançar um traço
 * recriava o item vazio. Os quatro têm a mesma raiz: código automático
 * tratando o item como se ele fosse só tinta.
 *
 * Um item é tinta MAIS o que o usuário acrescentou — concluído, tipo
 * escolhido, com quem, prazo, prioridade, observação, texto corrigido. Este
 * módulo diz o que é dado do usuário e como cada caminho automático deve
 * mexer só no que é dele.
 *
 * Puro de propósito: sem React, sem banco. Conferido em tools/preservar-test.ts.
 */

/** O item carrega algo que só o usuário poderia ter posto? */
export function temDadosDoUsuario(item: Item): boolean {
  return (
    item.status !== 'aberto' ||
    item.kindByUser === true ||
    Boolean(item.assignee?.trim()) ||
    Boolean(item.note?.trim()) ||
    item.dueAt != null ||
    item.priority != null ||
    item.ocr.status === 'manual'
  )
}

/** O que a leitura da letra devolveu pra uma linha. */
export type ResultadoDaLeitura = Pick<Item, 'ocr'> & { title?: string }

/**
 * Onde gravar o que o reconhecedor leu.
 *
 * A leitura leva segundos por linha, e a fila foi montada ANTES de começar.
 * Gravar `{ ...copiaDaFila, title, ocr }` jogava fora tudo o que o usuário fez
 * com o item nesse meio tempo (marcar concluído, escolher o tipo, preencher a
 * ficha). O certo é pôr só o texto lido em cima do item COMO ESTÁ AGORA.
 *
 * Devolve `null` — não grava nada — quando:
 * - o item sumiu (apagado ou a página mudou);
 * - o usuário já corrigiu o texto à mão (vale mais que qualquer leitura);
 * - a tinta do item mudou durante a leitura: o texto lido é de uma linha que
 *   não existe mais, e a próxima passada lê a nova.
 */
export function leituraSobreOAtual(
  lidoDe: Item,
  atual: Item | undefined,
  resultado: ResultadoDaLeitura,
  agora = Date.now(),
): Item | null {
  if (!atual || atual.ocr.status === 'manual') return null
  if (!mesmaTinta(lidoDe.strokeIds, atual.strokeIds)) return null
  const proximo: Item = { ...atual, ocr: resultado.ocr, updatedAt: agora }
  if (resultado.title !== undefined) proximo.title = resultado.title
  return proximo
}

function mesmaTinta(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false
  const conjunto = new Set(a)
  return b.every((id) => conjunto.has(id))
}

/** O que fazer com os itens ao aplicar um lado de um passo de voltar/avançar. */
export interface ItensDoPasso {
  /** A lista nova pra memória. */
  itens: Item[]
  /** O que precisa ir pro banco. */
  gravar: Item[]
  /** O que precisa sair do banco. */
  apagar: Id[]
}

/**
 * Voltar (ou avançar) uma borrachada SEM desfazer o que veio depois dela.
 *
 * O passo guarda a lista de itens dos dois lados. Repor a lista inteira — que
 * era o que se fazia — devolvia cada item ao estado do momento da borracha:
 * marcou concluído depois, preencheu a ficha depois, e o ↶ de um risquinho
 * apagava tudo isso.
 *
 * Só são mexidos os itens que A BORRACHA mexeu: aqueles cuja tinta difere
 * entre os dois lados, ou que existem só de um lado. Deles, só a tinta
 * (`strokeIds`, `bounds`) vem do passo; o resto vem do item como está agora.
 * Item que existe no lado alvo e sumiu da lista é reposto como o passo o
 * guardou — ele não existia no meio tempo, então não há versão mais nova.
 * Item que só existe no outro lado sai. Os demais ficam intocados.
 */
export function itensDoPasso(
  atuais: readonly Item[],
  alvo: readonly Item[],
  outro: readonly Item[],
): ItensDoPasso {
  const doAlvo = new Map(alvo.map((i) => [i.id, i]))
  const doOutro = new Map(outro.map((i) => [i.id, i]))

  const tocados = new Set<Id>()
  for (const [id, item] of doAlvo) {
    const par = doOutro.get(id)
    if (!par || !mesmaTinta(item.strokeIds, par.strokeIds)) tocados.add(id)
  }
  for (const id of doOutro.keys()) if (!doAlvo.has(id)) tocados.add(id)

  const gravar: Item[] = []
  const apagar: Id[] = []
  const itens: Item[] = []
  const presentes = new Set<Id>()

  for (const atual of atuais) {
    presentes.add(atual.id)
    if (!tocados.has(atual.id)) {
      itens.push(atual)
      continue
    }
    const daqui = doAlvo.get(atual.id)
    if (!daqui) {
      apagar.push(atual.id)
      continue
    }
    const proximo: Item = { ...atual, strokeIds: [...daqui.strokeIds], bounds: daqui.bounds }
    itens.push(proximo)
    gravar.push(proximo)
  }

  for (const id of tocados) {
    const daqui = doAlvo.get(id)
    if (daqui && !presentes.has(id)) {
      itens.push(daqui)
      gravar.push(daqui)
    }
  }

  return { itens, gravar, apagar }
}

/**
 * Os campos que o usuário pôs num item, pra passar adiante.
 *
 * Carimbar com o laço a tinta de um item automático cria um item novo e o
 * automático sai. Sem isto, o prazo, o responsável e o texto corrigido do
 * automático sumiam com ele.
 */
export function dadosParaHerdar(
  de: readonly Item[],
): Partial<Pick<Item, 'status' | 'assignee' | 'note' | 'dueAt' | 'priority' | 'title' | 'ocr'>> {
  const fora: Partial<Pick<Item, 'status' | 'assignee' | 'note' | 'dueAt' | 'priority' | 'title' | 'ocr'>> = {}
  // O mais antigo primeiro: é o que o usuário trabalhou há mais tempo.
  for (const item of [...de].sort((a, b) => a.createdAt - b.createdAt)) {
    if (fora.status === undefined && item.status === 'concluido') fora.status = item.status
    if (!fora.assignee && item.assignee?.trim()) fora.assignee = item.assignee
    if (!fora.note && item.note?.trim()) fora.note = item.note
    if (fora.dueAt == null && item.dueAt != null) fora.dueAt = item.dueAt
    if (fora.priority == null && item.priority != null) fora.priority = item.priority
    if (fora.ocr === undefined && item.ocr.status === 'manual') {
      fora.ocr = item.ocr
      fora.title = item.title
    }
  }
  return fora
}
