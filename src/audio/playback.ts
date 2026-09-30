/**
 * As contas do tocador de áudio.
 *
 * Parece que não tem conta nenhuma — "toca, pausa, arrasta a barrinha" — mas
 * tem uma armadilha grande no meio: **o áudio gravado pelo navegador não sabe
 * quanto dura**. O `MediaRecorder` escreve o arquivo em fluxo, sem voltar pro
 * começo pra anotar a duração no cabeçalho, e o resultado é um elemento `audio`
 * cujo `duration` vem `Infinity`. Uma barra de posição montada em cima disso
 * fica parada em zero pra sempre, e arrastar não leva a lugar nenhum.
 *
 * O app tem a medida certa: o cronômetro da gravação (`durationMs`), marcado
 * pelo relógio enquanto se gravava. É ele que manda aqui.
 *
 * Módulo puro: sem React, sem banco, sem elemento de áudio. Verificado em
 * `tools/audio-test.ts`.
 */

/**
 * Quanto dura, em ms — a medida em que dá pra confiar.
 *
 * `doElemento` vem em SEGUNDOS (é o que o `<audio>` fala) e costuma vir
 * `Infinity` ou `NaN`; `gravado` vem em ms, do cronômetro da gravação.
 */
export function reliableDuration(doElemento: number, gravado: number): number {
  const emMs = doElemento * 1000
  if (Number.isFinite(emMs) && emMs > 0) return emMs
  return Number.isFinite(gravado) && gravado > 0 ? gravado : 0
}

/** Fração 0..1 pra desenhar a barra. Duração zero não vira divisão por zero. */
export function progress(posicao: number, duracao: number): number {
  if (!(duracao > 0)) return 0
  return clamp(posicao / duracao, 0, 1)
}

/** Pra onde a barra leva, em ms, dado o valor do controle (0..1). */
export function seekTarget(valor: number, duracao: number): number {
  if (!(duracao > 0)) return 0
  return Math.round(clamp(valor, 0, 1) * duracao)
}

/**
 * Sobra do fim que já conta como "acabou".
 *
 * A posição guardada quase nunca cai exatamente na duração: o evento de fim
 * chega com alguns décimos sobrando, e a duração medida pelo cronômetro não
 * bate no milissegundo com a do arquivo.
 */
const FIM = 400

/**
 * Onde retomar, em ms.
 *
 * Retomar de onde parou é o pedido; mas retomar a 200ms do fim é o mesmo que
 * não tocar nada — quem aperta ▶ nessa hora quer ouvir de novo, do começo.
 */
export function resumeAt(salva: number, duracao: number): number {
  if (!Number.isFinite(salva) || salva <= 0) return 0
  if (duracao > 0 && salva >= duracao - FIM) return 0
  return duracao > 0 ? clamp(salva, 0, duracao) : Math.max(0, salva)
}

/** Vale a pena guardar esta posição, ou ela só atrapalha na próxima vez? */
export function worthSaving(posicao: number, duracao: number): boolean {
  if (!Number.isFinite(posicao) || posicao <= FIM) return false
  if (duracao > 0 && posicao >= duracao - FIM) return false
  return true
}

/** `m:ss`, com hora na frente quando passa de uma hora. */
export function formatPosition(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dois = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`
}

/**
 * Quanto o áudio dura, como se lê — arredondado, não truncado.
 *
 * A posição é "quanto já passou", e trunca. A duração é "o tamanho", e
 * arredonda. Sem essa diferença o total na tela pula de 0:06 pra 0:05 no
 * instante em que se aperta tocar, porque o cronômetro da gravação (6,0s) e a
 * medida do arquivo (5,9s) nunca batem no décimo.
 */
export function formatLength(ms: number): string {
  return formatPosition(Math.round(Math.max(0, ms) / 1000) * 1000)
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return v < min ? min : v > max ? max : v
}
