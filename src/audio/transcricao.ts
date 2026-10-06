import type { Transcricao } from '../domain/types'

/**
 * AS REGRAS DA TRANSCRIÇÃO — e uma delas é a que protege o trabalho dele.
 *
 * O reconhecedor de fala do aparelho erra: ele mesmo relatou, *"ele trocou
 * palavras"*. Então o texto que sai de lá é rascunho, e a correção à mão é
 * inevitável — meia hora de reunião revisada palavra por palavra é o trabalho
 * mais caro que existe neste aplicativo.
 *
 * E é justamente o mais fácil de destruir: um toque em "Transcrever de novo"
 * chamaria o reconhecedor outra vez e escreveria o rascunho por cima. É a
 * mesma lição que já está escrita na leitura da letra manuscrita e na
 * remontagem do fluxograma — **correção do usuário nunca é sobrescrita** —, e
 * vale ainda mais aqui, porque aqui o que se perde é uma reunião inteira.
 *
 * Módulo puro de propósito: nada de React, nada de banco. A regra é a parte
 * que pode estar errada, e é a única que dá pra conferir sem um tablet.
 */

/**
 * Pode guardar o que o reconhecedor acabou de ouvir?
 *
 * Não, quando já existe um texto mexido à mão. Pra refazer de propósito,
 * apaga-se a transcrição primeiro — duas ações, que é o preço justo de uma
 * ação que destrói trabalho.
 */
export function aceitaDoReconhecedor(atual: Transcricao | undefined): boolean {
  return !atual?.corrigida
}

/** Uma transcrição recém-saída do reconhecedor. Nasce como rascunho. */
export function doReconhecedor(
  texto: string,
  extras: { segundos?: number; dicas?: number } = {},
  agora = Date.now(),
): Transcricao {
  return { texto, em: agora, ...extras }
}

/**
 * O texto mexido à mão. Daqui em diante ele é a verdade.
 *
 * Guarda o `em` original: a data que interessa é a da reunião, não a da
 * revisão. E mantém `segundos` e `dicas`, que descrevem o áudio e continuam
 * verdadeiros depois da correção.
 */
export function comCorrecao(atual: Transcricao | undefined, texto: string, agora = Date.now()): Transcricao {
  return {
    texto,
    em: atual?.em ?? agora,
    segundos: atual?.segundos,
    dicas: atual?.dicas,
    corrigida: true,
  }
}
