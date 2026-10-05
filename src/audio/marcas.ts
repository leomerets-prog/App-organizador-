import type { Marca } from '../domain/types'

/**
 * Momentos marcados dentro de uma gravação.
 *
 * Pedido depois de uma conversa sobre transcrever reuniões: o app **não
 * entende** o que foi dito, e não vai entender tão cedo. Mas quem está na
 * reunião entende — e um toque no instante certo vale mais que uma hora de
 * áudio sem referência nenhuma.
 *
 * ## As decisões
 *
 * 1. **A marca nasce sem nome.** Quem está ouvindo a reunião não para pra
 *    escrever; ele toca, e o nome vem depois. Exigir o nome na hora é garantir
 *    que ninguém marque nada
 * 2. **Duas marcas muito perto viram uma.** O dedo escorrega, o botão recebe
 *    dois toques, e duas marcas a 300ms uma da outra não dizem nada diferente —
 *    só sujam a lista
 * 3. **A lista vive ordenada pelo tempo**, não pela ordem em que foi criada:
 *    é uma linha do tempo, e uma linha do tempo fora de ordem é um enigma
 *
 * Módulo puro: sem React, sem banco. Verificado em `tools/audio-test.ts`.
 */

/** Marcas mais próximas que isto são a mesma marca. */
export const PERTO_DEMAIS = 1500

export function adicionar(marcas: readonly Marca[], nova: Marca): Marca[] {
  const jaTem = marcas.some((m) => Math.abs(m.ms - nova.ms) < PERTO_DEMAIS)
  if (jaTem) return [...marcas].sort((a, b) => a.ms - b.ms)
  return [...marcas, nova].sort((a, b) => a.ms - b.ms)
}

export function remover(marcas: readonly Marca[], id: string): Marca[] {
  return marcas.filter((m) => m.id !== id)
}

export function renomear(marcas: readonly Marca[], id: string, texto: string): Marca[] {
  return marcas.map((m) => (m.id === id ? { ...m, texto: texto.trim() } : m))
}

/**
 * A marca que vale pra um instante da escuta.
 *
 * É a última que já passou — a que está valendo agora —, e não a mais próxima.
 * "Mais próxima" faria o nome do assunto seguinte aparecer antes de ele
 * começar, o que é o contrário do que a lista serve pra dizer.
 */
export function marcaDe(marcas: readonly Marca[], posicaoMs: number): Marca | null {
  let valendo: Marca | null = null
  for (const m of [...marcas].sort((a, b) => a.ms - b.ms)) {
    if (m.ms <= posicaoMs) valendo = m
    else break
  }
  return valendo
}

/**
 * O relógio da marca, pra lista e pra ata: `m:ss`, ou `h:mm:ss` se passar
 * de uma hora.
 *
 * Trunca, nunca arredonda: a marca aponta pro ponto em que se deve voltar, e
 * arredondar pra cima faria voltar DEPOIS do que se quer ouvir.
 */
export function relogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const dd = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`
}
