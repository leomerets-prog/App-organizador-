import type { Flowchart, Id, Item, ItemKind, Page, Priority, Recording } from '../domain/types'
import { relogio } from '../audio/marcas'

/**
 * A ATA DA REUNIÃO, montada do que já está na folha.
 *
 * Pedido dele: *"faz a ata separando os tópicos"*. A pergunta que decide tudo
 * aqui é DE ONDE vêm os tópicos — e a resposta honesta é: não de o app
 * entender a conversa. Ele não entende, e uma ata que inventa assunto é pior
 * que nenhuma, porque parece certa.
 *
 * Os tópicos vêm de quem estava na reunião, por dois caminhos que ele já usa:
 *
 * - **as marcas ⚑ na gravação** — cada marca abre um tópico, com hora, nome e
 *   a fala que veio depois dela (cortada no plugin, ver `ata/trechos.ts`)
 * - **as zonas da folha** — o que foi escrito em "Pauta" é pauta, em "Tarefas"
 *   é encaminhamento com responsável e prazo, em "Pendências" é pendência
 *
 * Nada aqui é decidido por palpite: cada linha da ata aponta pra uma marca ou
 * pra uma linha escrita à mão.
 *
 * Módulo puro de propósito: nada de React, nada de banco. A tela mostra o que
 * sai daqui, e o .txt é o mesmo texto — dá pra conferir a ata inteira sem um
 * tablet na mão.
 */

export interface TopicoDaAta {
  /** Hora do relógio em que o tópico começou ("14:32"). */
  hora: string
  /** Onde fica na gravação ("12:05"), pra ouvir de novo. */
  naGravacao: string
  ms: number
  titulo: string
  /** O nome veio da marca? Falso = ele ainda não deu nome. */
  temNome: boolean
  /**
   * A fala do tópico.
   *
   * `undefined` = não há fala separada pra este tópico (gravação não
   * transcrita, ou transcrita antes de a marca existir). `''` = o trecho foi
   * ouvido e nada foi entendido — que é diferente, e a ata diz.
   */
  fala?: string
  gravacaoId: Id
  marcaId?: Id
  /** Posição do trecho na transcrição, pra corrigir a fala deste tópico. */
  indiceDoTrecho?: number
}

export interface LinhaDaAta {
  texto: string
  observacao?: string
  /** Só nos encaminhamentos. */
  responsavel?: string
  prazo?: string
  prioridade?: string
  concluida: boolean
  itemId: Id
}

export interface Ata {
  titulo: string
  data: string
  inicio?: string
  duracao?: string
  participantes: string[]
  pauta: LinhaDaAta[]
  topicos: TopicoDaAta[]
  /** Tópicos escritos à mão na folha (carimbo "Tópico"). */
  outrosTopicos: LinhaDaAta[]
  destaques: LinhaDaAta[]
  anotacoes: LinhaDaAta[]
  acoes: LinhaDaAta[]
  pendencias: LinhaDaAta[]
  duvidas: LinhaDaAta[]
  documentos: LinhaDaAta[]
  fluxogramas: string[]
  /**
   * A fala que não pôde ser separada em tópicos, inteira.
   *
   * Aparece quando a gravação foi transcrita sem marcas, ou antes delas. A
   * fala não some só porque não tem tópico: ela vai pro fim, como registro.
   */
  registroCorrido?: string
  /** O que falta pra ata ficar completa, dito de um jeito que dá pra agir. */
  avisos: string[]
  /** Há fala transcrita que ninguém revisou. */
  falaRascunho: boolean
}

export interface EntradaDaAta {
  pagina: Page
  itens: readonly Item[]
  gravacoes: readonly Recording[]
  fluxogramas: readonly Flowchart[]
  /** O que ele escreveu no campo de participantes, do jeito que escreveu. */
  participantes?: string
}

/** Em que seção da ata cai cada tipo de linha escrita. */
const SECAO: Record<ItemKind, keyof Pick<
  Ata,
  'pauta' | 'outrosTopicos' | 'destaques' | 'anotacoes' | 'acoes' | 'pendencias' | 'duvidas' | 'documentos'
>> = {
  pauta: 'pauta',
  topico: 'outrosTopicos',
  importante: 'destaques',
  nota: 'anotacoes',
  tarefa: 'acoes',
  pendencia: 'pendencias',
  duvida: 'duvidas',
  documento: 'documentos',
}

const PRIORIDADE: Record<Priority, string> = { alta: 'alta', media: 'média', baixa: 'baixa' }

const dd = (n: number) => String(n).padStart(2, '0')

/** "14:32", no relógio do tablet. */
export function horaDoRelogio(instante: number): string {
  const d = new Date(instante)
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`
}

/** "07/10/2026". */
export function dataCurta(instante: number): string {
  const d = new Date(instante)
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** "1 h 05 min", "3 min", "40 s" — o tamanho da conversa, não um relógio. */
export function duracaoFalada(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${dd(min % 60)} min`
}

/**
 * Os participantes, do campo livre.
 *
 * Vírgula, ponto e vírgula ou uma linha por nome. Sai uma lista limpa, sem
 * repetido, na ordem em que ele escreveu.
 *
 * NÃO separa por " e ", embora "Maria e João" fosse o caso bonito: partiria
 * "Departamento de Ensino e Pesquisa" em dois participantes que não existem.
 */
export function separarParticipantes(texto: string | undefined): string[] {
  if (!texto) return []
  const vistos = new Set<string>()
  const fora: string[] = []
  for (const parte of texto.split(/[,;\n]+/)) {
    const nome = parte.trim()
    const chave = nome.toLowerCase()
    if (!nome || vistos.has(chave)) continue
    vistos.add(chave)
    fora.push(nome)
  }
  return fora
}

/** O que se lê de uma linha escrita: a letra lida, ou o que ele digitou. */
function textoDoItem(item: Item): string {
  return (item.title ?? '').trim() || (item.note ?? '').trim()
}

export function montarAta(entrada: EntradaDaAta): Ata {
  const { pagina } = entrada
  const avisos: string[] = []

  // ── As linhas escritas, por seção, na ordem em que estão na folha ──────────
  const itens = entrada.itens
    .filter((i) => i.pageId === pagina.id && i.status !== 'arquivado')
    // Ordem de leitura: de cima pra baixo, e na mesma altura da esquerda pra
    // direita. É a ordem em que ele escreveu — e a ordem em que se lê a pauta.
    .sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX)

  const secoes: Pick<
    Ata,
    'pauta' | 'outrosTopicos' | 'destaques' | 'anotacoes' | 'acoes' | 'pendencias' | 'duvidas' | 'documentos'
  > = {
    pauta: [],
    outrosTopicos: [],
    destaques: [],
    anotacoes: [],
    acoes: [],
    pendencias: [],
    duvidas: [],
    documentos: [],
  }

  let semLeitura = 0
  for (const item of itens) {
    const texto = textoDoItem(item)
    if (!texto) {
      // Linha que ainda não foi lida não pode virar "•" vazio na ata — mas
      // também não pode sumir calada. Conta, e o aviso diz o que fazer.
      semLeitura++
      continue
    }
    const linha: LinhaDaAta = {
      texto,
      concluida: item.status === 'concluido',
      itemId: item.id,
    }
    // A observação só entra quando é OUTRA coisa que o texto (se o texto já
    // veio dela, repetir seria ruído).
    const obs = (item.note ?? '').trim()
    if (obs && obs !== texto) linha.observacao = obs
    if (item.kind === 'tarefa') {
      if (item.assignee?.trim()) linha.responsavel = item.assignee.trim()
      if (item.dueAt) linha.prazo = dataCurta(item.dueAt).slice(0, 5)
      if (item.priority) linha.prioridade = PRIORIDADE[item.priority]
    }
    secoes[SECAO[item.kind]].push(linha)
  }
  if (semLeitura > 0) {
    avisos.push(
      `${semLeitura} linha(s) escrita(s) à mão ainda sem texto — toque em "Transcrever" na barra da folha pra que entrem na ata.`,
    )
  }

  // ── Os tópicos, das marcas da gravação ─────────────────────────────────────
  const gravacoes = entrada.gravacoes
    .filter((g) => g.pageId === pagina.id)
    .sort((a, b) => a.startedAt - b.startedAt)

  const topicos: TopicoDaAta[] = []
  const corridos: string[] = []
  let falaRascunho = false
  let semNome = 0

  for (const g of gravacoes) {
    const marcas = [...(g.marcas ?? [])].sort((a, b) => a.ms - b.ms)
    const tr = g.transcricao
    const trechos = tr?.trechos ?? []
    if (tr && tr.texto.trim() && !tr.corrigida) falaRascunho = true

    const doTopico = (ms: number) => ({
      hora: horaDoRelogio(g.startedAt + ms),
      naGravacao: relogio(ms),
      ms: g.startedAt + ms,
      gravacaoId: g.id,
    })

    // A conversa ANTES do primeiro assunto marcado. Só entra se teve fala:
    // um "Abertura" vazio no topo da ata não diz nada.
    trechos.forEach((t, indice) => {
      if (t.marcaId || !t.texto.trim()) return
      topicos.push({
        ...doTopico(t.inicioMs),
        titulo: 'Abertura',
        temNome: true,
        fala: t.texto.trim(),
        indiceDoTrecho: indice,
      })
    })

    const marcasComTrecho = new Set<Id>()
    for (const m of marcas) {
      const indice = trechos.findIndex((t) => t.marcaId === m.id)
      if (indice >= 0) marcasComTrecho.add(m.id)
      const nome = m.texto.trim()
      if (!nome) semNome++
      topicos.push({
        ...doTopico(m.ms),
        titulo: nome || 'Tópico sem nome',
        temNome: Boolean(nome),
        fala: indice >= 0 ? trechos[indice].texto.trim() : undefined,
        marcaId: m.id,
        indiceDoTrecho: indice >= 0 ? indice : undefined,
      })
    }

    /*
     * Trecho de uma marca que foi APAGADA depois da transcrição.
     *
     * A marca sumiu, a fala não: ela foi dita e transcrita, e pode ter sido
     * corrigida à mão. Entra na ata no lugar dela, com um título que diz o
     * que aconteceu.
     */
    trechos.forEach((t, indice) => {
      if (!t.marcaId || marcas.some((m) => m.id === t.marcaId)) return
      if (!t.texto.trim()) return
      topicos.push({
        ...doTopico(t.inicioMs),
        titulo: 'Trecho de uma marca apagada',
        temNome: true,
        fala: t.texto.trim(),
        indiceDoTrecho: indice,
      })
    })

    // Sem trechos, a fala não tem como ser repartida: vai inteira pro fim.
    if (tr && trechos.length === 0 && tr.texto.trim()) {
      corridos.push(tr.texto.trim())
      if (marcas.length > 0) {
        avisos.push(
          tr.corrigida
            ? 'A fala foi transcrita antes de os tópicos serem marcados, e já foi corrigida à mão — por isso aparece inteira no fim, e não debaixo de cada tópico.'
            : 'A fala foi transcrita antes de os tópicos serem marcados. Apague a transcrição e toque em "Transcrever" de novo pra cada tópico ganhar a sua fala.',
        )
      }
    } else if (!tr && marcas.length > 0) {
      avisos.push(
        'A gravação tem tópicos marcados mas ainda não foi transcrita — toque em "⌁ Transcrever" na gravação pra cada tópico ganhar a sua fala.',
      )
    } else if (tr && trechos.length > 0 && marcas.some((m) => !marcasComTrecho.has(m.id))) {
      const novas = marcas.filter((m) => !marcasComTrecho.has(m.id)).length
      avisos.push(
        `${novas} tópico(s) marcado(s) depois da transcrição, ou no último segundo da gravação, aparecem sem fala.`,
      )
    }
  }

  topicos.sort((a, b) => a.ms - b.ms)

  if (semNome > 0) {
    avisos.push(`${semNome} tópico(s) sem nome — dê nome às marcas na gravação (✎) pra ata dizer o assunto.`)
  }
  if (falaRascunho) {
    avisos.push('A fala transcrita é rascunho do reconhecedor de voz — confira antes de enviar.')
  }

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  const primeira = gravacoes[0]
  const total = gravacoes.reduce((soma, g) => soma + Math.max(0, g.durationMs || 0), 0)

  const fluxogramas = entrada.fluxogramas
    .filter((f) => f.pageId === pagina.id && f.nodes.length > 0)
    .map((f) => [f.titulo?.trim(), f.subtitulo?.trim()].filter(Boolean).join(' — ') || 'Fluxograma sem título')

  return {
    titulo: pagina.title?.trim() || 'Reunião',
    data: dataCurta(primeira ? primeira.startedAt : pagina.createdAt),
    inicio: primeira ? horaDoRelogio(primeira.startedAt) : undefined,
    duracao: total > 0 ? duracaoFalada(total) : undefined,
    participantes: separarParticipantes(entrada.participantes),
    topicos,
    fluxogramas,
    registroCorrido: corridos.length > 0 ? corridos.join('\n\n') : undefined,
    avisos,
    falaRascunho,
    ...secoes,
  }
}

// ─── A ata em texto ──────────────────────────────────────────────────────────

/**
 * A ata como texto puro — o que vai pro .txt, pro e-mail e pro WhatsApp.
 *
 * Texto puro de propósito: é o único formato que chega inteiro em qualquer
 * lugar onde ele cole. Seção vazia não aparece; uma ata com "DÚVIDAS" e nada
 * embaixo parece que esqueceram de preencher.
 */
export function ataEmTexto(ata: Ata, geradaEm = Date.now()): string {
  const linhas: string[] = []
  const secao = (titulo: string, corpo: string[]) => {
    if (corpo.length === 0) return
    linhas.push('', titulo, ...corpo)
  }
  const marcador = (l: LinhaDaAta) => {
    let s = `• ${l.texto}`
    if (l.concluida) s += ' (concluído)'
    if (l.observacao) s += ` — ${l.observacao}`
    return s
  }

  linhas.push('ATA DE REUNIÃO', ata.titulo)
  const cabecalho = [`Data: ${ata.data}`]
  if (ata.inicio) cabecalho.push(`Início: ${ata.inicio}`)
  if (ata.duracao) cabecalho.push(`Gravado: ${ata.duracao}`)
  linhas.push('', cabecalho.join(' · '))
  if (ata.participantes.length > 0) linhas.push(`Participantes: ${ata.participantes.join(', ')}`)

  secao('PAUTA', ata.pauta.map(marcador))

  secao(
    'TÓPICOS DISCUTIDOS',
    ata.topicos.flatMap((t, i) => {
      const corpo = [`${i > 0 ? '\n' : ''}${i + 1}. ${t.hora} — ${t.titulo}`]
      if (t.fala !== undefined) corpo.push(t.fala || '(nada foi entendido neste trecho da gravação)')
      return corpo
    }),
  )

  secao('OUTROS TÓPICOS ANOTADOS', ata.outrosTopicos.map(marcador))
  secao('PONTOS IMPORTANTES', ata.destaques.map(marcador))
  secao('ANOTAÇÕES', ata.anotacoes.map(marcador))

  secao(
    'ENCAMINHAMENTOS',
    ata.acoes.map((a) => {
      const partes = [a.texto]
      if (a.responsavel) partes.push(`Responsável: ${a.responsavel}`)
      if (a.prazo) partes.push(`Prazo: ${a.prazo}`)
      if (a.prioridade) partes.push(`Prioridade: ${a.prioridade}`)
      let s = `• ${partes.join(' — ')}`
      if (a.concluida) s += ' (concluído)'
      if (a.observacao) s += `\n  ${a.observacao}`
      return s
    }),
  )

  secao('PENDÊNCIAS', ata.pendencias.map(marcador))
  secao('DÚVIDAS', ata.duvidas.map(marcador))
  secao('DOCUMENTOS CITADOS', ata.documentos.map(marcador))
  secao('FLUXOGRAMAS (em anexo)', ata.fluxogramas.map((f) => `• ${f}`))
  secao('REGISTRO DA CONVERSA', ata.registroCorrido ? [ata.registroCorrido] : [])

  linhas.push('', '—')
  if (ata.falaRascunho) {
    linhas.push('A fala foi transcrita automaticamente e pode conter erros.')
  }
  linhas.push(`Ata gerada pelo Organizador em ${dataCurta(geradaEm)}, ${horaDoRelogio(geradaEm)}.`)

  return linhas.join('\n') + '\n'
}
