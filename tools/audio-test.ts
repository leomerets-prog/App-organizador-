import { limpar } from '../src/audio/export'
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
