/**
 * AS PALAVRAS DO CADERNO, viradas em dica pro reconhecedor.
 *
 * O problema que isto resolve está nas palavras dele mesmo: *"ele trocou
 * palavras"*. E trocou onde era previsível — o reconhecedor de aparelho acerta
 * português comum e erra justamente o que é próprio daquela reunião: nome de
 * pessoa, nome de setor, sigla, nome de sistema. "Marcela" vira "mas cela",
 * "SUS" vira "sul", "unidade de saúde" vira "unidade saudável".
 *
 * Só que essas palavras JÁ ESTÃO na folha. Ele as escreveu à mão enquanto a
 * reunião acontecia, antes de a transcrição existir. Do Android 13 pra cima há
 * um campo pra entregar essa lista ao reconhecedor, que então puxa o resultado
 * na direção dela quando o som é parecido.
 *
 * Isto é um módulo puro de propósito: nada de React, nada de banco. Escolher o
 * que entra na lista é a parte que erra, e é a única que dá pra conferir sem
 * um tablet na mão.
 */

/**
 * Quantas dicas no máximo.
 *
 * A lista não é de graça: cada palavra puxa o reconhecedor, e uma lista enorme
 * puxa pra todo lado ao mesmo tempo — aí ele começa a VER essas palavras onde
 * elas não estão, que é um erro pior que o original, porque parece acerto.
 */
export const MAX_DICAS = 60

/** Tamanho mínimo de uma palavra pra valer como dica. */
const MINIMO = 3

/** Até quantos caracteres uma expressão de várias palavras ainda serve. */
const MAX_EXPRESSAO = 40

/**
 * O que NÃO vira dica.
 *
 * Palavra que o reconhecedor já acerta de olhos fechados não ganha nada em ser
 * puxada — e ocupa uma vaga que um nome próprio usaria. Esta lista é curta de
 * propósito: são as palavras que aparecem em toda anotação de reunião sem
 * dizer nada sobre ela.
 */
const COMUNS = new Set([
  'para', 'com', 'sem', 'por', 'que', 'não', 'nao', 'sim', 'dos', 'das', 'uma',
  'uns', 'umas', 'mais', 'menos', 'muito', 'pouco', 'todo', 'toda', 'todos',
  'todas', 'este', 'esta', 'isso', 'aquilo', 'ele', 'ela', 'eles', 'elas',
  'nós', 'nos', 'você', 'voce', 'foi', 'ser', 'ter', 'está', 'esta', 'estão',
  'fazer', 'feito', 'ficar', 'ficou', 'vai', 'vão', 'vamos', 'pode', 'podem',
  'deve', 'devem', 'quando', 'onde', 'como', 'porque', 'então', 'entao',
  'também', 'tambem', 'ainda', 'depois', 'antes', 'agora', 'hoje', 'amanhã',
  'amanha', 'ontem', 'dia', 'dias', 'mês', 'mes', 'ano', 'hora', 'horas',
  'coisa', 'coisas', 'ver', 'ok',
])

/**
 * Quebra um texto em palavras, respeitando acento.
 *
 * `\p{L}` em vez de `[a-z]`: cortar em "ç" partiria "orçamento" em duas
 * palavras que não existem, e as duas entrariam na lista como dica.
 */
function palavrasDe(texto: string): string[] {
  return texto.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length > 0)
}

/** Tem letra maiúscula no meio ou é toda maiúscula? Sinal de nome ou sigla. */
function pareceNome(palavra: string): boolean {
  if (palavra.length < 2) return false
  // Toda maiúscula = sigla (SUS, UBS, CNES). A segunda metade da conta
  // descarta "15", que é "todo maiúsculo" só por não ter letra nenhuma.
  if (palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()) return true
  // Começa com maiúscula = nome próprio.
  return palavra[0] !== palavra[0].toLowerCase()
}

/**
 * Quanto esta dica vale.
 *
 * Nome próprio e sigla valem mais porque são exatamente o que o reconhecedor
 * erra; palavra longa vale mais que curta porque curta colide com tudo.
 */
function peso(candidata: string): number {
  let p = 0
  const partes = palavrasDe(candidata)
  if (partes.length > 1) p += 1
  if (partes.some(pareceNome)) p += 2
  if (candidata.replace(/\s/g, '').length >= 7) p += 1
  if (candidata === candidata.toUpperCase() && candidata.length >= 2) p += 1
  return p
}

/**
 * As dicas, a partir de tudo que está escrito na folha.
 *
 * `fontes` são os textos crus: títulos dos registros, responsável, observação,
 * nome das zonas, título da página. Entra tudo misturado; a escolha é aqui.
 *
 * Mantém a grafia original (com acento e maiúscula) porque é ela que o
 * reconhecedor vai devolver — tirar o acento aqui seria pedir pra ele escrever
 * "Joao".
 */
export function palavrasDeDica(fontes: string[], maximo = MAX_DICAS): string[] {
  const candidatas: string[] = []

  for (const fonte of fontes) {
    const linha = (fonte ?? '').trim()
    if (!linha) continue

    /*
     * A EXPRESSÃO INTEIRA, antes das palavras soltas.
     *
     * "Unidade Básica de Saúde" como uma dica só vale mais que as quatro
     * palavras separadas: o reconhecedor passa a esperar a sequência, e é a
     * sequência que ele erra. Linha comprida não entra — ela é uma frase, não
     * um nome, e puxar uma frase inteira não ajuda.
     */
    const partes = palavrasDe(linha)
    if (partes.length > 1 && partes.length <= 5 && linha.length <= MAX_EXPRESSAO) {
      candidatas.push(linha)
    }

    for (const palavra of partes) {
      if (palavra.length < MINIMO) continue
      if (COMUNS.has(palavra.toLowerCase())) continue
      // Número solto não é dica: "15" não ajuda o reconhecedor a ouvir nada.
      if (!/\p{L}/u.test(palavra)) continue
      candidatas.push(palavra)
    }
  }

  /*
   * Sem repetidas, ignorando maiúscula e acento na COMPARAÇÃO — mas guardando
   * a primeira grafia, que é a que o usuário escreveu.
   */
  const vistas = new Set<string>()
  const unicas: string[] = []
  for (const c of candidatas) {
    const chave = c
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
    if (vistas.has(chave)) continue
    vistas.add(chave)
    unicas.push(c)
  }

  /*
   * Ordem estável: o `index` no desempate impede que duas dicas de peso igual
   * troquem de lugar entre chamadas. Lista que muda de ordem sozinha faz a
   * transcrição mudar de resultado sem nada ter mudado — e aí não dá pra
   * medir se uma melhoria melhorou.
   */
  return unicas
    .map((texto, index) => ({ texto, p: peso(texto), index }))
    .sort((a, b) => (b.p - a.p) || (a.index - b.index))
    .slice(0, Math.max(0, maximo))
    .map((c) => c.texto)
}
