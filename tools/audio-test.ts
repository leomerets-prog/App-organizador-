import { limpar } from '../src/audio/export'
import { adicionar, marcaDe, relogio, remover, renomear } from '../src/audio/marcas'
import { MAX_DICAS, palavrasDeDica } from '../src/audio/dicas'
import { aceitaDoReconhecedor, comCorrecao, doReconhecedor } from '../src/audio/transcricao'
import type { Marca } from '../src/domain/types'
import {
  formatLength,
  formatPosition,
  progress,
  reliableDuration,
  resumeAt,
  seekTarget,
  worthSaving,
} from '../src/audio/playback'

/**
 * As contas do tocador de áudio.
 *
 * O caso que dá nome a este arquivo é o primeiro: o navegador devolve
 * `Infinity` como duração de um áudio que ele mesmo gravou. Todo o resto — a
 * barrinha, o tempo na tela, retomar de onde parou — depende de esse caso estar
 * resolvido, e nenhum deles avisa quando não está: a barra simplesmente não
 * anda.
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

const casos: Caso[] = [
  {
    nome: 'duração Infinity do navegador cai pra do cronômetro',
    rodar() {
      const d = reliableDuration(Infinity, 125_000)
      return d === 125_000 ? null : `esperava 125000, veio ${d}`
    },
  },
  {
    nome: 'duração NaN também cai pra do cronômetro',
    rodar() {
      const d = reliableDuration(NaN, 9000)
      return d === 9000 ? null : `esperava 9000, veio ${d}`
    },
  },
  {
    nome: 'duração de verdade vem em segundos e sai em ms',
    rodar() {
      const d = reliableDuration(12.5, 13_400)
      return d === 12_500 ? null : `esperava 12500, veio ${d}`
    },
  },
  {
    nome: 'sem duração nenhuma, a barra fica em zero em vez de quebrar',
    rodar() {
      if (reliableDuration(Infinity, 0) !== 0) return 'duração deveria ser 0'
      if (progress(5000, 0) !== 0) return 'progresso deveria ser 0'
      if (seekTarget(0.5, 0) !== 0) return 'destino deveria ser 0'
      return null
    },
  },
  {
    nome: 'o progresso é fração, e não passa das pontas',
    rodar() {
      if (progress(30_000, 120_000) !== 0.25) return 'meio de caminho errado'
      if (progress(-5, 100) !== 0) return 'antes do começo deveria dar 0'
      if (progress(900, 100) !== 1) return 'depois do fim deveria dar 1'
      return null
    },
  },
  {
    nome: 'arrastar a barrinha leva ao ponto certo do áudio',
    rodar() {
      const alvo = seekTarget(0.75, 200_000)
      return alvo === 150_000 ? null : `esperava 150000, veio ${alvo}`
    },
  },
  {
    nome: 'retomar volta exatamente onde parou',
    rodar() {
      const de = resumeAt(42_000, 300_000)
      return de === 42_000 ? null : `esperava 42000, veio ${de}`
    },
  },
  {
    // Se parou no fim, "continuar de onde parou" é não tocar nada — e quem
    // aperta ▶ nessa hora quer ouvir de novo.
    nome: 'parado no fim, ▶ recomeça do zero',
    rodar() {
      if (resumeAt(299_900, 300_000) !== 0) return 'no fim deveria voltar a 0'
      if (resumeAt(300_000, 300_000) !== 0) return 'no fim exato deveria voltar a 0'
      return null
    },
  },
  {
    nome: 'posição maior que o arquivo não empurra o áudio pra fora',
    rodar() {
      const de = resumeAt(999_000, 60_000)
      return de === 0 ? null : `esperava 0, veio ${de}`
    },
  },
  {
    nome: 'posição inválida não vira retomada estranha',
    rodar() {
      if (resumeAt(NaN, 1000) !== 0) return 'NaN deveria dar 0'
      if (resumeAt(-100, 1000) !== 0) return 'negativo deveria dar 0'
      return null
    },
  },
  {
    // Guardar "parei no segundo 0,3" faria a próxima escuta parecer que nada
    // foi salvo; guardar "parei no fim" faria ela começar já acabada.
    nome: 'só vale guardar posição que serve pra alguma coisa',
    rodar() {
      if (worthSaving(200, 60_000)) return 'quase no começo não deveria valer'
      if (worthSaving(59_900, 60_000)) return 'no fim não deveria valer'
      if (!worthSaving(30_000, 60_000)) return 'no meio deveria valer'
      return null
    },
  },
  {
    nome: 'sem duração conhecida, a posição do meio ainda vale',
    rodar() {
      return worthSaving(30_000, 0) ? null : 'deveria valer mesmo sem duração'
    },
  },
  {
    nome: 'o tempo na tela ganha a hora quando passa de uma',
    rodar() {
      if (formatPosition(0) !== '0:00') return `zero saiu ${formatPosition(0)}`
      if (formatPosition(65_000) !== '1:05') return `1:05 saiu ${formatPosition(65_000)}`
      if (formatPosition(3_725_000) !== '1:02:05') {
        return `uma hora saiu ${formatPosition(3_725_000)}`
      }
      if (formatPosition(-500) !== '0:00') return 'negativo deveria dar 0:00'
      return null
    },
  },
  {
    // O cronômetro da gravação e a medida do arquivo nunca batem no décimo.
    // Truncando os dois, o total na tela pulava de 0:06 pra 0:05 ao tocar.
    nome: 'o total arredonda, pra não encolher quando aperta tocar',
    rodar() {
      if (formatLength(5900) !== formatLength(6000)) {
        return `5,9s saiu ${formatLength(5900)} e 6,0s saiu ${formatLength(6000)}`
      }
      if (formatLength(5900) !== '0:06') return `esperava 0:06, veio ${formatLength(5900)}`
      if (formatPosition(5900) !== '0:05') return 'a posição deveria continuar truncando'
      return null
    },
  },
  {
    /*
     * Medido no navegador, não suposto: um nome de arquivo com "ç" ou "ã" faz
     * o Chrome descartar o nome INTEIRO e salvar como "download". Em português
     * o acento é o caso normal, então um título como "Fluxo de aprovação"
     * perderia o nome todo.
     */
    nome: 'o nome do arquivo perde o acento, e só o acento',
    rodar() {
      const saiu = limpar('Fluxo de aprovação de pedido')
      if (saiu !== 'Fluxo de aprovacao de pedido') return `saiu "${saiu}"`
      if (limpar('Ação / Decisão: 50% ou "mais"') !== 'Acao - Decisao- 50- ou -mais-') {
        return `o resto da limpeza mudou: "${limpar('Ação / Decisão: 50% ou "mais"')}"`
      }
      return limpar('   ') === 'audio' ? null : 'nome vazio deveria cair no padrão'
    },
  },

  // ── Momentos marcados na gravação ───────────────────────────────────────
  {
    nome: 'a marca entra na ordem do tempo, não na de criação',
    rodar() {
      let marcas: Marca[] = []
      marcas = adicionar(marcas, { id: 'b', ms: 60_000, texto: '' })
      marcas = adicionar(marcas, { id: 'a', ms: 10_000, texto: '' })
      marcas = adicionar(marcas, { id: 'c', ms: 30_000, texto: '' })
      const ordem = marcas.map((m) => m.id).join('')
      return ordem === 'acb' ? null : `saiu na ordem ${ordem}`
    },
  },
  {
    /*
     * O dedo escorrega e o botão recebe dois toques. Duas marcas a trezentos
     * milissegundos uma da outra não dizem nada diferente — só sujam a lista
     * que existe pra ser lida de relance.
     */
    nome: 'toque repetido não vira duas marcas',
    rodar() {
      let marcas: Marca[] = [{ id: 'a', ms: 20_000, texto: '' }]
      marcas = adicionar(marcas, { id: 'b', ms: 20_300, texto: '' })
      if (marcas.length !== 1) return `ficaram ${marcas.length} marcas`
      // Mas uma marca de verdade, longe, entra.
      marcas = adicionar(marcas, { id: 'c', ms: 25_000, texto: '' })
      return marcas.length === 2 ? null : 'a marca seguinte não entrou'
    },
  },
  {
    nome: 'a marca que vale é a última que já passou',
    rodar() {
      const marcas: Marca[] = [
        { id: 'a', ms: 10_000, texto: 'abertura' },
        { id: 'b', ms: 40_000, texto: 'prazo' },
      ]
      if (marcaDe(marcas, 5_000) !== null) return 'antes da primeira deveria ser nenhuma'
      if (marcaDe(marcas, 39_000)?.id !== 'a') return 'no meio, deveria valer a primeira'
      // E não a mais PRÓXIMA: a 39s a seta está mais perto de "prazo", mas
      // "prazo" ainda não começou.
      return marcaDe(marcas, 41_000)?.id === 'b' ? null : 'depois, deveria valer a segunda'
    },
  },
  {
    nome: 'tirar e renomear mexem só na marca certa',
    rodar() {
      const marcas: Marca[] = [
        { id: 'a', ms: 1_000, texto: 'um' },
        { id: 'b', ms: 2_000, texto: 'dois' },
      ]
      const renomeada = renomear(marcas, 'b', '  decisão do prazo  ')
      if (renomeada.find((m) => m.id === 'b')?.texto !== 'decisão do prazo') {
        return 'o nome não foi gravado sem os espaços'
      }
      if (renomeada.find((m) => m.id === 'a')?.texto !== 'um') return 'mexeu na marca errada'
      const sobrou = remover(renomeada, 'a')
      return sobrou.length === 1 && sobrou[0].id === 'b' ? null : 'tirou a marca errada'
    },
  },
  {
    nome: 'o relógio da marca ganha a hora quando passa de uma',
    rodar() {
      if (relogio(0) !== '0:00') return `0ms virou ${relogio(0)}`
      if (relogio(65_000) !== '1:05') return `65s virou ${relogio(65_000)}`
      if (relogio(3_725_000) !== '1:02:05') return `1h02m05s virou ${relogio(3_725_000)}`
      // Trunca: a marca aponta pro ponto de voltar, e arredondar pra cima
      // faria voltar DEPOIS do que se quer ouvir.
      return relogio(59_900) === '0:59' ? null : `59,9s virou ${relogio(59_900)}`
    },
  },

  /*
   * ─── As dicas do caderno ───────────────────────────────────────────────────
   *
   * "Ele trocou palavras." Trocou nos nomes próprios, que é onde todo
   * reconhecedor de aparelho troca — e esses nomes estão escritos na folha.
   * Estes casos conferem a escolha: o que entra na lista, o que fica de fora,
   * e em que ordem. Lista errada não dá erro nenhum; ela só deixa de ajudar,
   * ou pior, faz o reconhecedor ver palavras que ninguém falou.
   */
  {
    nome: 'palavra comum não ocupa vaga de dica',
    rodar() {
      const d = palavrasDeDica(['Enviar para o Marcelo quando der'])
      if (d.some((p) => p.toLowerCase() === 'para')) return `"para" entrou: ${d.join(', ')}`
      if (d.some((p) => p.toLowerCase() === 'quando')) return `"quando" entrou: ${d.join(', ')}`
      return d.includes('Marcelo') ? null : `"Marcelo" ficou de fora: ${d.join(', ')}`
    },
  },
  {
    nome: 'nome próprio mantém acento e maiúscula',
    rodar() {
      const d = palavrasDeDica(['Falar com a Conceição'])
      // Tirar o acento aqui seria pedir pro reconhecedor escrever "Conceicao".
      return d.includes('Conceição') ? null : `veio ${d.join(', ')}`
    },
  },
  {
    nome: 'palavra com ç não é partida em duas',
    rodar() {
      const d = palavrasDeDica(['Revisar orçamento'])
      if (d.includes('or') || d.includes('amento')) return `partiu: ${d.join(', ')}`
      return d.includes('orçamento') ? null : `veio ${d.join(', ')}`
    },
  },
  {
    nome: 'sigla vem antes de palavra longa comum',
    rodar() {
      const d = palavrasDeDica(['processo administrativo do SUS'])
      const sus = d.indexOf('SUS')
      if (sus < 0) return `"SUS" ficou de fora: ${d.join(', ')}`
      const proc = d.indexOf('processo')
      return proc < 0 || sus < proc ? null : `"processo" veio antes de "SUS": ${d.join(', ')}`
    },
  },
  {
    nome: 'expressão curta entra inteira, e na frente',
    rodar() {
      const d = palavrasDeDica(['Unidade Básica de Saúde'])
      // A sequência é o que o reconhecedor erra; as palavras soltas, menos.
      return d[0] === 'Unidade Básica de Saúde' ? null : `a primeira foi ${d[0]}`
    },
  },
  {
    nome: 'frase comprida não vira dica inteira',
    rodar() {
      const linha = 'Combinamos de rever o cadastro dos pacientes na semana que vem'
      const d = palavrasDeDica([linha])
      return d.includes(linha) ? `a frase toda entrou: ${d.length} dicas` : null
    },
  },
  {
    nome: 'repetida com acento diferente conta uma vez',
    rodar() {
      const d = palavrasDeDica(['Saúde da família', 'saude', 'SAÚDE'])
      const quantas = d.filter(
        (p) => p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'saude',
      ).length
      if (quantas !== 1) return `apareceu ${quantas} vezes: ${d.join(', ')}`
      // E a grafia que fica é a PRIMEIRA que ele escreveu.
      return d.includes('Saúde') ? null : `a grafia guardada foi outra: ${d.join(', ')}`
    },
  },
  {
    nome: 'número solto não é dica',
    rodar() {
      const d = palavrasDeDica(['Prazo 15 dias 2026'])
      const so = d.filter((p) => !/\p{L}/u.test(p))
      return so.length === 0 ? null : `entrou número: ${so.join(', ')}`
    },
  },
  {
    nome: 'a lista tem teto',
    rodar() {
      const fontes = Array.from({ length: 200 }, (_, i) => `Palavra${i} Nome${i}`)
      const d = palavrasDeDica(fontes)
      if (d.length > MAX_DICAS) return `${d.length} dicas, teto é ${MAX_DICAS}`
      return d.length === MAX_DICAS ? null : `encheu só ${d.length} de ${MAX_DICAS}`
    },
  },
  {
    nome: 'a mesma folha dá a mesma lista, na mesma ordem',
    rodar() {
      /*
       * Ordem instável faria a transcrição mudar de resultado sem nada ter
       * mudado — e aí não dá pra saber se uma melhoria melhorou.
       */
      const fontes = ['Cadastro de pacientes', 'UBS Centro', 'Marcela', 'relatório mensal']
      const a = palavrasDeDica(fontes).join('|')
      const b = palavrasDeDica(fontes).join('|')
      return a === b ? null : `mudou de ordem:\n    ${a}\n    ${b}`
    },
  },
  {
    nome: 'folha vazia não gera dica nenhuma',
    rodar() {
      const d = palavrasDeDica(['', '   ', 'ok'])
      return d.length === 0 ? null : `veio ${d.join(', ')}`
    },
  },

  /*
   * ─── A regra que protege a correção dele ───────────────────────────────────
   *
   * O reconhecedor erra, então corrigir à mão é inevitável. Meia hora de
   * reunião revisada palavra por palavra é o trabalho mais caro deste app — e
   * o mais fácil de destruir, porque um toque em "Transcrever de novo"
   * escreveria o rascunho por cima.
   */
  {
    nome: 'gravação sem transcrição aceita a do reconhecedor',
    rodar() {
      return aceitaDoReconhecedor(undefined) ? null : 'recusou sem ter o que proteger'
    },
  },
  {
    nome: 'rascunho pode ser trocado por outro rascunho',
    rodar() {
      const antes = doReconhecedor('primeira tentativa', {}, 1000)
      return aceitaDoReconhecedor(antes) ? null : 'recusou trocar um rascunho por outro'
    },
  },
  {
    nome: 'texto corrigido à mão NÃO é sobrescrito',
    rodar() {
      const corrigido = comCorrecao(doReconhecedor('rascunho', {}, 1000), 'texto revisado', 2000)
      return aceitaDoReconhecedor(corrigido) ? 'deixou passar por cima da correção' : null
    },
  },
  {
    nome: 'corrigir guarda a data da reunião, não a da revisão',
    rodar() {
      // A data que interessa é a do áudio; a revisão pode ser semanas depois.
      const t = comCorrecao(doReconhecedor('rascunho', { segundos: 182 }, 1000), 'revisado', 999_000)
      if (t.em !== 1000) return `a data virou ${t.em}`
      // E o que descreve o áudio continua verdadeiro depois da correção.
      return t.segundos === 182 ? null : `perdeu os segundos: ${t.segundos}`
    },
  },
  {
    nome: 'corrigir sem transcrição anterior ainda funciona',
    rodar() {
      const t = comCorrecao(undefined, 'escrito do zero', 5000)
      if (t.texto !== 'escrito do zero') return `o texto veio ${t.texto}`
      return t.corrigida === true && t.em === 5000 ? null : 'não ficou marcado como corrigido'
    },
  },
]

console.log('\n  Tocador de áudio — a duração que o navegador não sabe\n')
let falhas = 0
for (const caso of casos) {
  const erro = caso.rodar()
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(52)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log(falhas ? `\n  ${falhas} caso(s) fora do esperado\n` : '\n  todos os casos passaram\n')
process.exit(falhas ? 1 : 0)
