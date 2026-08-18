import type { Stroke } from '../domain/types'
import type { Pt } from '../lib/geometry'
import { boundsOf, boundsOverlap, padBounds, pointToSegment } from '../lib/geometry'

/**
 * Borracha de ponta: apaga só o pedaço por onde passou.
 *
 * A borracha de traço — que some com a palavra inteira ao encostar em qualquer
 * parte dela — é simples de fazer e péssima de usar quando o objetivo é
 * corrigir uma letra no meio de uma frase.
 *
 * Aqui, cada passada da borracha percorre um segmento entre a posição anterior
 * e a atual. Os pontos do traço que caem dentro do alcance desse segmento são
 * descartados, e o que sobra vira um ou mais PEDAÇOS independentes: apagar o
 * meio de uma palavra deixa duas metades, cada uma um traço por direito
 * próprio, que podem ser apagadas ou preservadas depois separadamente.
 *
 * Trabalhar por segmento, e não por ponto solto, é o que evita buracos quando
 * a mão anda rápido e os eventos do sistema chegam espaçados.
 */

/** Pedaços menores que isto viram sujeira na folha; somem junto. */
const MIN_FRAGMENT_POINTS = 2

export interface Replacement {
  /** O traço como estava antes desta passada. */
  original: Stroke
  /** O que sobrou dele. Vazio quando a borracha o consumiu inteiro. */
  fragments: Stroke[]
}

/**
 * Aplica uma passada da borracha, do ponto `from` ao ponto `to`.
 *
 * Não altera nada: devolve quais traços mudaram e em que se transformaram.
 * Quem decide o que fazer com isso é a camada de estado.
 */
export function eraseAlongSegment(
  strokes: readonly Stroke[],
  from: Pt,
  to: Pt,
  radius: number,
  makeId: () => string,
): Replacement[] {
  const reach = padBounds(boundsOf([from, to]), radius)
  const out: Replacement[] = []

  for (const stroke of strokes) {
    // Descarta de longe o que a passada nem chegou perto de tocar.
    if (!boundsOverlap(reach, stroke.bounds)) continue

    const survives = stroke.points.map((p) => pointToSegment(p, from, to) > radius)
    if (survives.every(Boolean)) continue

    const fragments: Stroke[] = []
    let run: Stroke['points'] = []

    const closeRun = () => {
      if (run.length >= MIN_FRAGMENT_POINTS) {
        fragments.push(makeFragment(stroke, run, makeId()))
      }
      run = []
    }

    for (let i = 0; i < stroke.points.length; i++) {
      if (survives[i]) run.push(stroke.points[i])
      else closeRun()
    }
    closeRun()

    out.push({ original: stroke, fragments })
  }

  return out
}

/**
 * Um pedaço herda tudo do traço de origem — cor, espessura, zona e o instante
 * em que foi escrito. O instante é o que mantém a ordem do desenho e a ligação
 * com o áudio; trocá-lo por "agora" embaralharia as duas coisas.
 */
function makeFragment(stroke: Stroke, points: Stroke['points'], id: string): Stroke {
  return {
    ...stroke,
    id,
    points: [...points],
    bounds: boundsOf(points),
  }
}

/** Quantos pedaços sobraram no total — usado nos avisos e nos testes. */
export function countFragments(replacements: readonly Replacement[]): number {
  return replacements.reduce((total, r) => total + r.fragments.length, 0)
}

/** A passada consumiu traço inteiro em algum caso? */
export function countFullyErased(replacements: readonly Replacement[]): number {
  return replacements.filter((r) => r.fragments.length === 0).length
}
