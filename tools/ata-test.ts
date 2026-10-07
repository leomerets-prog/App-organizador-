import { casarTrechos, cortesDasMarcas, FIM_DO_AUDIO, INICIO_DO_AUDIO } from '../src/ata/trechos'
import { ataEmTexto, montarAta, separarParticipantes } from '../src/ata/ata'
import type { EntradaDaAta } from '../src/ata/ata'
import {
  aceitaDoReconhecedor,
  comCorrecao,
  comTrechosCorrigidos,
  doReconhecedor,
} from '../src/audio/transcricao'
import type {
  Flowchart,
  Item,
  ItemKind,
  Marca,
  Page,
  Recording,
  Transcricao,
  TrechoFalado,
} from '../src/domain/types'

/**
 * A ATA DA REUNIÃO.
 *
 * Ele pediu a ata "separando os tópicos". Os tópicos vêm das marcas ⚑ que ele
 * toca durante a reunião e das zonas onde ele escreve — nunca de o app
 * adivinhar assunto. Estes casos conferem as três coisas que podem estragar a
 * ata sem dar erro nenhum:
 *
 *   1. um tópico levar a FALA DO VIZINHO (casar trecho com marca errado)
 *   2. uma linha escrita cair na SEÇÃO ERRADA, ou sumir
 *   3. a correção que ele fez à mão SE PERDER
 */

interface Caso {
  nome: string
  rodar: () => string | null
}

// ─── Exemplos ────────────────────────────────────────────────────────────────

const PAGINA: Page = {
  id: 'pag',
  sectionId: 'sec',
  title: 'Reunião MAURÍCIO',
  templateId: 'reuniao',
  height: 1754,
  createdAt: new Date(2026, 9, 7, 8, 0).getTime(),
  updatedAt: 0,
  order: 0,
}

/** 07/10/2026 às 08:36 — a hora do print dele. */
const INICIO = new Date(2026, 9, 7, 8, 36, 0).getTime()

let seq = 0
function item(kind: ItemKind, title: string, y: number, extra: Partial<Item> = {}): Item {
  seq++
  return {
    id: `it${seq}`,
    pageId: 'pag',
    kind,
    status: 'aberto',
    source: 'auto',
    zoneId: null,
    strokeIds: [],
    bounds: { minX: extra.bounds?.minX ?? 10, minY: y, maxX: 200, maxY: y + 20 },
    title,
    ocr: { status: 'pendente' },
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  }
}

function gravacao(extra: Partial<Recording> = {}): Recording {
  return {
    id: 'rec',
    pageId: 'pag',
    startedAt: INICIO,
    durationMs: 207_000,
    mimeType: 'audio/webm',
    anchor: { x: 0, y: 0 },
    label: '07/10, 08:36',
    ...extra,
  }
}

const marca = (id: string, ms: number, texto = ''): Marca => ({ id, ms, texto })

function entrada(extra: Partial<EntradaDaAta> = {}): EntradaDaAta {
  return { pagina: PAGINA, itens: [], gravacoes: [], fluxogramas: [], ...extra }
}

const trecho = (inicioMs: number, fimMs: number, texto: string, marcaId?: string): TrechoFalado => ({
  inicioMs,
  fimMs,
  texto,
  marcaId,
})

// ─── Casos ───────────────────────────────────────────────────────────────────

const casos: Caso[] = [
  /*
   * ── De marca a corte ──────────────────────────────────────────────────────
   */
  {
    nome: 'sem marca nenhuma, a gravação é um pedaço só, sem dono',
    rodar() {
      const d = cortesDasMarcas([], 60_000)
      if (d.cortes.length !== 0) return `cortou: ${d.cortes}`
      return d.marcaDoTrecho.length === 1 && d.marcaDoTrecho[0] === undefined
        ? null
        : `donos: ${JSON.stringify(d.marcaDoTrecho)}`
    },
  },
  {
    nome: 'cada corte é de uma marca, na ordem do áudio',
    rodar() {
      // Fora de ordem de propósito: a lista guardada não é garantia de ordem.
      const d = cortesDasMarcas([marca('c', 90_000), marca('a', 10_000), marca('b', 40_000)], 120_000)
      if (d.cortes.join() !== '10000,40000,90000') return `cortes: ${d.cortes}`
      return d.marcaDoTrecho.join() === ',a,b,c' ? null : `donos: ${d.marcaDoTrecho.join()}`
    },
  },
  {
    nome: 'marca logo no início abre a reunião, sem cortar',
    rodar() {
      const d = cortesDasMarcas([marca('abre', 800), marca('b', 30_000)], 60_000)
      if (d.cortes.join() !== '30000') return `cortes: ${d.cortes}`
      return d.marcaDoTrecho[0] === 'abre' ? null : `o trecho 0 ficou de ${d.marcaDoTrecho[0]}`
    },
  },
  {
    nome: 'duas marcas no começo: vale a última',
    rodar() {
      const d = cortesDasMarcas([marca('primeira', 100), marca('segunda', INICIO_DO_AUDIO - 1)], 60_000)
      return d.marcaDoTrecho[0] === 'segunda' && d.cortes.length === 0
        ? null
        : `abertura ${d.marcaDoTrecho[0]}, cortes ${d.cortes}`
    },
  },
  {
    nome: 'marca no último segundo não vira corte vazio',
    rodar() {
      const d = cortesDasMarcas([marca('a', 20_000), marca('fim', 60_000 - FIM_DO_AUDIO + 200)], 60_000)
      return d.cortes.join() === '20000' ? null : `cortes: ${d.cortes}`
    },
  },
  {
    nome: 'duração desconhecida não descarta marca nenhuma',
    rodar() {
      const d = cortesDasMarcas([marca('a', 20_000), marca('b', 500_000)], 0)
      return d.cortes.length === 2 ? null : `cortes: ${d.cortes}`
    },
  },
  {
    nome: 'sempre um dono a mais que cortes — é isso que casa trecho com marca',
    rodar() {
      const conjuntos: Marca[][] = [
        [],
        [marca('a', 100)],
        [marca('a', 100), marca('b', 5000), marca('c', 59_900)],
        [marca('a', 3000), marca('b', 3000), marca('c', -5), marca('d', NaN)],
      ]
      for (const ms of conjuntos) {
        const d = cortesDasMarcas(ms, 60_000)
        if (d.marcaDoTrecho.length !== d.cortes.length + 1) {
          return `${d.cortes.length} cortes e ${d.marcaDoTrecho.length} donos`
        }
      }
      return null
    },
  },

  {
    nome: 'cada pedaço devolvido ganha a marca que o abriu',
    rodar() {
      const d = cortesDasMarcas([marca('abre', 500), marca('a', 30_000), marca('b', 90_000)], 120_000)
      const t = casarTrechos(d, [
        { inicioMs: 0, fimMs: 30_400, texto: ' oi ' },
        { inicioMs: 30_400, fimMs: 89_100, texto: 'assunto a' },
        { inicioMs: 89_100, fimMs: 120_000, texto: 'assunto b' },
      ])
      if (!t) return 'não casou'
      const donos = t.map((x) => x.marcaId ?? '-').join()
      if (donos !== 'abre,a,b') return `donos: ${donos}`
      return t[0].texto === 'oi' ? null : `texto não foi aparado: "${t[0].texto}"`
    },
  },
  {
    nome: 'contagem que não bate não casa nada — melhor sem fala que com a trocada',
    rodar() {
      const d = cortesDasMarcas([marca('a', 30_000), marca('b', 90_000)], 120_000)
      const t = casarTrechos(d, [
        { inicioMs: 0, fimMs: 1, texto: 'x' },
        { inicioMs: 1, fimMs: 2, texto: 'y' },
      ])
      return t === undefined ? null : 'casou dois pedaços com três lugares'
    },
  },
  {
    nome: 'sem marca, a gravação não vira um tópico chamado "Abertura"',
    rodar() {
      const d = cortesDasMarcas([], 60_000)
      const t = casarTrechos(d, [{ inicioMs: 0, fimMs: 60_000, texto: 'reunião inteira' }])
      return t === undefined ? null : 'guardou a reunião inteira como trecho sem dono'
    },
  },

  /*
   * ── A correção dele ───────────────────────────────────────────────────────
   */
  {
    nome: 'corrigir tópico a tópico mantém onde cada fala começa e de quem é',
    rodar() {
      const atual = doReconhecedor('um dois', {
        trechos: [trecho(0, 5000, 'um', undefined), trecho(5000, 9000, 'dois', 'm1')],
      })
      const t = comTrechosCorrigidos(atual, ['Um.', 'Dois, corrigido.'])
      if (!t?.trechos) return 'sumiram os trechos'
      if (t.trechos[1].marcaId !== 'm1' || t.trechos[1].inicioMs !== 5000) return 'o corte mudou'
      if (t.texto !== 'Um. Dois, corrigido.') return `o texto corrido veio "${t.texto}"`
      return t.corrigida ? null : 'não ficou marcado como corrigido'
    },
  },
  {
    nome: 'correção com quantidade errada de tópicos é recusada',
    rodar() {
      const atual = doReconhecedor('um dois', { trechos: [trecho(0, 1, 'um'), trecho(1, 2, 'dois')] })
      const t = comTrechosCorrigidos(atual, ['só um'])
      // Casar errado poria a fala de um tópico debaixo do outro.
      return t === atual ? null : 'aceitou e desalinhou'
    },
  },
  {
    nome: 'corrigida tópico a tópico, transcrever de novo não passa por cima',
    rodar() {
      const atual = doReconhecedor('a b', { trechos: [trecho(0, 1, 'a'), trecho(1, 2, 'b')] })
      const t = comTrechosCorrigidos(atual, ['A', 'B'])
      return aceitaDoReconhecedor(t) ? 'deixou o reconhecedor sobrescrever' : null
    },
  },
  {
    nome: 'reescrever o texto inteiro descarta os cortes velhos',
    rodar() {
      const atual: Transcricao = doReconhecedor('a b', { trechos: [trecho(0, 1, 'a'), trecho(1, 2, 'b')] })
      const t = comCorrecao(atual, 'texto todo novo')
      // Trechos velhos ao lado de texto novo fariam a ata mostrar a versão errada.
      return t.trechos === undefined ? null : 'ficaram trechos desatualizados'
    },
  },

  /*
   * ── As linhas escritas na folha ───────────────────────────────────────────
   */
  {
    nome: 'cada linha escrita cai na seção da sua zona',
    rodar() {
      const ata = montarAta(
        entrada({
          itens: [
            item('pauta', 'Cadastro de pacientes', 10),
            item('tarefa', 'Levantar os números', 300),
            item('pendencia', 'Acesso ao sistema', 400),
            item('duvida', 'Quem aprova?', 350),
            item('nota', 'Processo inverso', 200),
            item('documento', 'Portaria 12', 500),
            item('importante', 'Prazo curto', 150),
            item('topico', 'Perfis de usuário', 120),
          ],
        }),
      )
      const onde = [
        ['pauta', ata.pauta],
        ['ações', ata.acoes],
        ['pendências', ata.pendencias],
        ['dúvidas', ata.duvidas],
        ['anotações', ata.anotacoes],
        ['documentos', ata.documentos],
        ['destaques', ata.destaques],
        ['outros tópicos', ata.outrosTopicos],
      ] as const
      for (const [nome, lista] of onde) {
        if (lista.length !== 1) return `${nome} tem ${lista.length} linha(s)`
      }
      return null
    },
  },
  {
    nome: 'a pauta sai na ordem em que está escrita na folha',
    rodar() {
      const ata = montarAta(
        entrada({
          itens: [
            item('pauta', 'Terceiro', 300),
            item('pauta', 'Primeiro', 10),
            // Mesma altura: o da esquerda vem antes.
            item('pauta', 'Segundo B', 150, { bounds: { minX: 400, minY: 150, maxX: 500, maxY: 170 } }),
            item('pauta', 'Segundo A', 150, { bounds: { minX: 10, minY: 150, maxX: 100, maxY: 170 } }),
          ],
        }),
      )
      const ordem = ata.pauta.map((l) => l.texto).join(' | ')
      return ordem === 'Primeiro | Segundo A | Segundo B | Terceiro' ? null : ordem
    },
  },
  {
    nome: 'o encaminhamento leva responsável, prazo e prioridade',
    rodar() {
      const ata = montarAta(
        entrada({
          itens: [
            item('tarefa', 'Levantar os números', 10, {
              assignee: 'Marcela',
              dueAt: new Date(2026, 9, 14).getTime(),
              priority: 'alta',
            }),
          ],
        }),
      )
      const texto = ataEmTexto(ata)
      if (!texto.includes('Responsável: Marcela')) return 'sem responsável'
      if (!texto.includes('Prazo: 14/10')) return 'sem prazo'
      return texto.includes('Prioridade: alta') ? null : 'sem prioridade'
    },
  },
  {
    nome: 'linha arquivada e de outra folha ficam de fora',
    rodar() {
      const ata = montarAta(
        entrada({
          itens: [
            item('tarefa', 'Vale', 10),
            item('tarefa', 'Arquivada', 20, { status: 'arquivado' }),
            item('tarefa', 'Outra folha', 30, { pageId: 'outra' }),
          ],
        }),
      )
      return ata.acoes.map((a) => a.texto).join() === 'Vale' ? null : ata.acoes.map((a) => a.texto).join()
    },
  },
  {
    nome: 'linha concluída continua na ata, dita como concluída',
    rodar() {
      const ata = montarAta(entrada({ itens: [item('tarefa', 'Enviar planilha', 10, { status: 'concluido' })] }))
      return ataEmTexto(ata).includes('Enviar planilha (concluído)') ? null : 'não disse que estava concluída'
    },
  },
  {
    nome: 'linha ainda não lida não vira "•" vazio, e o aviso diz o que fazer',
    rodar() {
      const ata = montarAta(entrada({ itens: [item('pauta', '', 10), item('pauta', 'Lida', 20)] }))
      if (ata.pauta.length !== 1) return `a pauta tem ${ata.pauta.length} linha(s)`
      return ata.avisos.some((a) => a.includes('1 linha(s)') && a.includes('Transcrever'))
        ? null
        : `avisos: ${ata.avisos.join(' / ')}`
    },
  },

  /*
   * ── Os tópicos da gravação ────────────────────────────────────────────────
   */
  {
    nome: 'cada tópico leva a SUA fala, não a do vizinho',
    rodar() {
      /*
       * O caso que mais importa. Os trechos vêm na ordem do áudio, e as
       * marcas guardadas podem vir em qualquer ordem — o casamento é pelo id
       * da marca, nunca pela posição na lista de marcas.
       */
      /*
       * A primeira versão deste caso PASSAVA casando pela posição: com todas
       * as marcas tendo trecho e em ordem, posição e id coincidem por acaso.
       * Aqui eles discordam, como na vida real: uma marca no começo (que abre
       * a reunião sem cortar) e uma marcada DEPOIS da transcrição, no meio,
       * sem trecho nenhum.
       */
      const g = gravacao({
        marcas: [
          marca('prazo', 120_000, 'Prazo'),
          marca('nova', 60_000, 'Marcada depois'),
          marca('cad', 30_000, 'Cadastro'),
          marca('abre', 800, 'Boas-vindas'),
        ],
        transcricao: doReconhecedor('...', {
          trechos: [
            trecho(0, 30_000, 'fala da abertura', 'abre'),
            trecho(30_000, 120_000, 'fala do cadastro', 'cad'),
            trecho(120_000, 207_000, 'fala do prazo', 'prazo'),
          ],
        }),
      })
      const ata = montarAta(entrada({ gravacoes: [g] }))
      const fala = (titulo: string) => ata.topicos.find((t) => t.titulo === titulo)?.fala
      if (fala('Boas-vindas') !== 'fala da abertura') return `Boas-vindas levou "${fala('Boas-vindas')}"`
      if (fala('Cadastro') !== 'fala do cadastro') return `Cadastro levou "${fala('Cadastro')}"`
      if (fala('Marcada depois') !== undefined) return `a marca sem trecho levou "${fala('Marcada depois')}"`
      return fala('Prazo') === 'fala do prazo' ? null : `Prazo levou "${fala('Prazo')}"`
    },
  },
  {
    nome: 'os tópicos saem na ordem da reunião, com a hora do relógio',
    rodar() {
      const g = gravacao({ marcas: [marca('b', 125_000, 'Dois'), marca('a', 65_000, 'Um')] })
      const ata = montarAta(entrada({ gravacoes: [g] }))
      const ordem = ata.topicos.map((t) => `${t.hora} ${t.titulo}`).join(' | ')
      // 08:36:00 + 1min05 = 08:37 ; + 2min05 = 08:38
      return ordem === '08:37 Um | 08:38 Dois' ? null : ordem
    },
  },
  {
    nome: 'trecho ouvido sem nada entendido é diferente de trecho que não existe',
    rodar() {
      const g = gravacao({
        marcas: [marca('a', 30_000, 'Ouvido'), marca('b', 60_000, 'Marcado depois')],
        transcricao: doReconhecedor('', { trechos: [trecho(0, 30_000, ''), trecho(30_000, 207_000, '', 'a')] }),
      })
      const texto = ataEmTexto(montarAta(entrada({ gravacoes: [g] })))
      const ouvido = texto.split('Ouvido')[1]?.split('\n')[1] ?? ''
      if (!ouvido.includes('nada foi entendido')) return `debaixo de "Ouvido": "${ouvido}"`
      const depois = texto.split('Marcado depois')[1]?.split('\n')[1] ?? ''
      return depois.includes('nada foi entendido') ? 'o tópico sem trecho fingiu ter sido ouvido' : null
    },
  },
  {
    nome: 'a conversa antes da primeira marca entra como Abertura, só se teve fala',
    rodar() {
      const com = gravacao({
        marcas: [marca('a', 30_000, 'Assunto')],
        transcricao: doReconhecedor('x', { trechos: [trecho(0, 30_000, 'bom dia a todos'), trecho(30_000, 9e4, 'x', 'a')] }),
      })
      const sem = gravacao({
        marcas: [marca('a', 30_000, 'Assunto')],
        transcricao: doReconhecedor('x', { trechos: [trecho(0, 30_000, '  '), trecho(30_000, 9e4, 'x', 'a')] }),
      })
      const a = montarAta(entrada({ gravacoes: [com] })).topicos[0]
      if (a.titulo !== 'Abertura' || a.fala !== 'bom dia a todos') return `primeiro tópico: ${a.titulo}`
      const b = montarAta(entrada({ gravacoes: [sem] })).topicos
      return b.some((t) => t.titulo === 'Abertura') ? 'Abertura vazia entrou na ata' : null
    },
  },
  {
    nome: 'marca apagada depois da transcrição não leva a fala junto',
    rodar() {
      const g = gravacao({
        marcas: [],
        transcricao: doReconhecedor('x', {
          trechos: [trecho(0, 30_000, ''), trecho(30_000, 9e4, 'isto foi dito', 'apagada')],
        }),
      })
      const ata = montarAta(entrada({ gravacoes: [g] }))
      return ata.topicos.some((t) => t.fala === 'isto foi dito') ? null : 'a fala sumiu com a marca'
    },
  },
  {
    nome: 'fala sem tópicos vai inteira pro registro, e o aviso explica',
    rodar() {
      const g = gravacao({
        marcas: [marca('a', 30_000, 'Assunto')],
        transcricao: doReconhecedor('tudo que foi dito'),
      })
      const ata = montarAta(entrada({ gravacoes: [g] }))
      if (ata.registroCorrido !== 'tudo que foi dito') return `registro: ${ata.registroCorrido}`
      return ata.avisos.some((a) => a.includes('antes de os tópicos'))
        ? null
        : `avisos: ${ata.avisos.join(' / ')}`
    },
  },
  {
    nome: 'duas gravações: os tópicos se intercalam pela hora',
    rodar() {
      const manha = gravacao({ id: 'g1', startedAt: INICIO, marcas: [marca('x', 600_000, 'Dez minutos')] })
      const depois = gravacao({
        id: 'g2',
        startedAt: INICIO + 120_000,
        marcas: [marca('y', 60_000, 'Três minutos')],
      })
      const ata = montarAta(entrada({ gravacoes: [manha, depois] }))
      const ordem = ata.topicos.map((t) => t.titulo).join(' | ')
      return ordem === 'Três minutos | Dez minutos' ? null : ordem
    },
  },
  {
    nome: 'marca sem nome aparece, e o aviso pede o nome',
    rodar() {
      const ata = montarAta(entrada({ gravacoes: [gravacao({ marcas: [marca('a', 30_000, '')] })] }))
      if (ata.topicos[0]?.titulo !== 'Tópico sem nome') return `título: ${ata.topicos[0]?.titulo}`
      return ata.avisos.some((a) => a.includes('sem nome')) ? null : 'sem aviso'
    },
  },

  /*
   * ── A ata em texto ────────────────────────────────────────────────────────
   */
  {
    nome: 'o cabeçalho tem título, data, hora de início e quanto foi gravado',
    rodar() {
      const texto = ataEmTexto(montarAta(entrada({ gravacoes: [gravacao()] })))
      if (!texto.includes('Reunião MAURÍCIO')) return 'sem título'
      if (!texto.includes('Data: 07/10/2026')) return 'sem data'
      if (!texto.includes('Início: 08:36')) return 'sem hora de início'
      return texto.includes('Gravado: 3 min') ? null : 'sem duração'
    },
  },
  {
    nome: 'seção vazia não aparece',
    rodar() {
      const texto = ataEmTexto(montarAta(entrada({ itens: [item('pauta', 'Único', 10)] })))
      for (const s of ['DÚVIDAS', 'PENDÊNCIAS', 'ENCAMINHAMENTOS', 'TÓPICOS DISCUTIDOS']) {
        if (texto.includes(s)) return `apareceu "${s}" vazia`
      }
      return texto.includes('PAUTA') ? null : 'sumiu a pauta, que tinha conteúdo'
    },
  },
  {
    nome: 'o aviso de rascunho sai só quando há fala sem revisar',
    rodar() {
      const crua = gravacao({ transcricao: doReconhecedor('texto cru') })
      const revisada = gravacao({ transcricao: comCorrecao(undefined, 'texto revisado') })
      const a = ataEmTexto(montarAta(entrada({ gravacoes: [crua] })))
      const b = ataEmTexto(montarAta(entrada({ gravacoes: [revisada] })))
      if (!a.includes('pode conter erros')) return 'fala crua sem aviso'
      return b.includes('pode conter erros') ? 'fala revisada ainda com aviso de rascunho' : null
    },
  },
  {
    nome: 'participantes por vírgula, ponto e vírgula ou linha, sem repetir',
    rodar() {
      const p = separarParticipantes('Maurício, Marcela; maurício\nDepartamento de Ensino e Pesquisa')
      return p.join(' | ') === 'Maurício | Marcela | Departamento de Ensino e Pesquisa' ? null : p.join(' | ')
    },
  },
  {
    nome: 'fluxograma da folha entra como anexo; o vazio, não',
    rodar() {
      const base: Omit<Flowchart, 'id' | 'nodes'> = { pageId: 'pag', edges: [], soltos: 0, updatedAt: 0 }
      const no = { id: 'n', kind: 'processo', label: 'x', x: 0, y: 0 } as unknown as Flowchart['nodes'][number]
      const ata = montarAta(
        entrada({
          fluxogramas: [
            { ...base, id: 'f1', titulo: 'Fluxo de cadastro', nodes: [no] },
            { ...base, id: 'f2', nodes: [] },
          ],
        }),
      )
      return ata.fluxogramas.join() === 'Fluxo de cadastro' ? null : ata.fluxogramas.join()
    },
  },
]

console.log('\n  Ata da reunião — tópicos pelas marcas, seções pelas zonas\n')
let falhas = 0
for (const caso of casos) {
  let erro: string | null
  try {
    erro = caso.rodar()
  } catch (e) {
    erro = `estourou: ${e instanceof Error ? e.message : String(e)}`
  }
  if (erro) {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${caso.nome.padEnd(60)} ${erro}`)
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${caso.nome}`)
  }
}
console.log(falhas ? `\n  ${falhas} caso(s) fora do esperado\n` : '\n  todos os casos passaram\n')
process.exit(falhas ? 1 : 0)
