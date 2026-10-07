import type { Id, Marca, TrechoFalado } from '../domain/types'

/**
 * DAS MARCAS AOS CORTES — onde a gravação é partida pra ata.
 *
 * Ele pediu a ata "separando os tópicos". O app não entende a conversa e não
 * vai fingir que entende: quem separa os tópicos é quem estava na reunião, com
 * o ⚑ Marcar. Cada marca abre um tópico, e a fala do tópico é o que foi dito
 * dali até a próxima marca.
 *
 * Este módulo decide ONDE cortar e QUAL marca é dona de cada pedaço. O plugin
 * corta, ouve cada pedaço numa sessão própria e devolve `cortes + 1` trechos na
 * ordem pedida — sempre, mesmo vazios. É essa contagem fixa que deixa o
 * `marcaDoTrecho` daqui valer lá: o trecho i é da marca i desta lista.
 *
 * Módulo puro de propósito: nada de React, nada de banco, nada de plugin. É a
 * parte que casa fala com tópico, e casar errado não dá erro nenhum — dá uma
 * ata em que cada assunto traz a fala do vizinho.
 */

/**
 * Marca tocada nos primeiros dois segundos ABRE a reunião: o tópico dela
 * começa no começo do áudio. Cortar ali criaria um trecho de um segundo, sem
 * fala, só pra marca seguinte nascer.
 */
export const INICIO_DO_AUDIO = 2000

/**
 * Marca tocada no último segundo e meio não vira corte: o trecho dela não
 * teria fala nenhuma. Ela continua na ata, só que sem texto.
 */
export const FIM_DO_AUDIO = 1500

export interface Divisao {
  /** Onde cortar, em ms desde o começo da gravação, em ordem crescente. */
  cortes: number[]
  /**
   * De quem é cada trecho — um a mais que os cortes.
   *
   * O trecho 0 vai do começo até o primeiro corte; é da marca de abertura,
   * se ele marcou logo no início, ou de ninguém (a conversa antes do primeiro
   * assunto marcado).
   */
  marcaDoTrecho: (Id | undefined)[]
}

export function cortesDasMarcas(marcas: readonly Marca[], duracaoMs: number): Divisao {
  const ordenadas = [...marcas]
    .filter((m) => Number.isFinite(m.ms) && m.ms >= 0)
    .sort((a, b) => a.ms - b.ms)

  // Duração desconhecida não pode descartar marca nenhuma: o plugin mede o
  // áudio de verdade e prende os cortes que passarem do fim.
  const duracaoConhecida = Number.isFinite(duracaoMs) && duracaoMs > 0
  const limite = duracaoConhecida ? duracaoMs - FIM_DO_AUDIO : Infinity

  let abertura: Id | undefined
  const cortes: number[] = []
  const donos: Id[] = []

  for (const m of ordenadas) {
    if (m.ms < INICIO_DO_AUDIO) {
      // Se ele tocou duas vezes no começo, vale a última: é a que ficou.
      abertura = m.id
      continue
    }
    if (m.ms > limite) continue
    cortes.push(Math.round(m.ms))
    donos.push(m.id)
  }

  return { cortes, marcaDoTrecho: [abertura, ...donos] }
}

/**
 * Os pedaços que o plugin devolveu, cada um com a sua marca.
 *
 * Devolve `undefined` — e a fala fica só como texto corrido — em dois casos:
 *
 * - **a contagem não bate.** O plugin promete `cortes + 1` pedaços. Se vier
 *   outra coisa, casar por posição poria a fala de um tópico debaixo do outro.
 *   Melhor uma ata sem fala separada que uma ata com a fala trocada.
 * - **nenhum pedaço tem dono.** Sem marca, a gravação inteira é um pedaço só;
 *   guardá-lo como "trecho" faria a ata chamar a reunião inteira de
 *   "Abertura". O lugar dela é o registro corrido.
 */
export function casarTrechos(
  divisao: Divisao,
  devolvidos: readonly { inicioMs: number; fimMs: number; texto: string }[] | undefined,
): TrechoFalado[] | undefined {
  if (!devolvidos || devolvidos.length !== divisao.marcaDoTrecho.length) return undefined
  if (!divisao.marcaDoTrecho.some(Boolean)) return undefined
  return devolvidos.map((t, i) => {
    const trecho: TrechoFalado = {
      inicioMs: Math.max(0, Math.round(t.inicioMs)),
      fimMs: Math.max(0, Math.round(t.fimMs)),
      texto: (t.texto ?? '').trim(),
    }
    const dono = divisao.marcaDoTrecho[i]
    if (dono) trecho.marcaId = dono
    return trecho
  })
}
