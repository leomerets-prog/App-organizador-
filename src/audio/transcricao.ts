import type { Transcricao, TrechoFalado } from '../domain/types'

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
  extras: { segundos?: number; dicas?: number; trechos?: TrechoFalado[] } = {},
  agora = Date.now(),
): Transcricao {
  return { texto, em: agora, ...extras }
}

/** Os trechos costurados num texto só — a mesma costura do plugin. */
export function juntarTrechos(trechos: readonly TrechoFalado[]): string {
  return trechos
    .map((t) => t.texto.trim())
    .filter((t) => t.length > 0)
    .join(' ')
}

/**
 * O texto mexido à mão. Daqui em diante ele é a verdade.
 *
 * Guarda o `em` original: a data que interessa é a da reunião, não a da
 * revisão. E mantém `segundos` e `dicas`, que descrevem o áudio e continuam
 * verdadeiros depois da correção.
 *
 * NÃO mantém os `trechos`, de propósito: reescrito o texto inteiro de uma vez,
 * não há mais como saber que frase é de qual tópico, e trechos velhos ao lado
 * de um texto novo fariam a ata mostrar a versão errada. Quem tem trechos
 * corrige por `comTrechosCorrigidos`, que é o que a tela usa nesse caso.
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

/**
 * A correção feita TÓPICO A TÓPICO — o jeito de corrigir quando a fala está
 * partida nas marcas.
 *
 * `textos` vem na ordem dos trechos, um por trecho. O corte de cada um (início,
 * fim, de qual marca) não muda: corrigir a fala não muda quando ela foi dita.
 * O texto corrido é refeito da junção, pra que salvar o .txt e o resto que lê
 * o texto inteiro vejam a mesma correção que a ata.
 *
 * Quantidade diferente da dos trechos é recusada (devolve a transcrição como
 * estava): casar correção com trecho errado poria a fala revisada de um
 * tópico debaixo do outro.
 */
export function comTrechosCorrigidos(
  atual: Transcricao | undefined,
  textos: readonly string[],
  agora = Date.now(),
): Transcricao | undefined {
  const trechos = atual?.trechos
  if (!atual || !trechos || trechos.length !== textos.length) return atual
  const novos = trechos.map((t, i) => ({ ...t, texto: textos[i] }))
  return {
    texto: juntarTrechos(novos),
    em: atual.em ?? agora,
    segundos: atual.segundos,
    dicas: atual.dicas,
    trechos: novos,
    corrigida: true,
  }
}
