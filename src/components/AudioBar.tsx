import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { formatDuration, isRecordingSupported, startRecording } from '../audio/recorder'
import type { RecorderHandle } from '../audio/recorder'
import {
  formatLength,
  formatPosition,
  progress,
  reliableDuration,
  resumeAt,
  seekTarget,
  worthSaving,
} from '../audio/playback'
import { salvarAudio } from '../audio/export'
import { relogio } from '../audio/marcas'
import { estadoDaFala, sondaPossivel, tentarTranscrever } from '../audio/fala'
import type { EstadoDaFala, ResultadoDaFala } from '../audio/fala'
import { palavrasDeDica } from '../audio/dicas'
import { casarTrechos, cortesDasMarcas } from '../ata/trechos'
import { salvarTexto } from '../audio/export'
import { formatRate } from '../state/prefs'
import { getRecordingBlob } from '../db/repo'
import { newId } from '../lib/id'
import type { Recording, TrechoFalado } from '../domain/types'

/**
 * Barra de áudio da página.
 *
 * Gravar é um botão só. Enquanto grava, os traços continuam guardando o instante
 * em que saíram da caneta — é o que vai permitir, depois, tocar num rabisco e
 * ouvir o que estava sendo dito naquele momento.
 *
 * Ouvir é um tocador de verdade, e não era: pausar recomeçava do zero na vez
 * seguinte, e não havia como pular pro meio. Uma conversa de uma hora se escuta
 * em pedaços, ao longo de dias — por isso a posição fica GUARDADA NO BANCO, e
 * não só na tela. Fechar o app e voltar amanhã continua de onde parou.
 *
 * E tem o botão de salvar: até aqui o áudio só existia dentro do aplicativo, e
 * desinstalar levava tudo junto.
 */
export function AudioBar() {
  const recordings = useStore((s) => s.recordings)
  const activePageId = useStore((s) => s.activePageId)
  const addRecording = useStore((s) => s.addRecording)
  const removeRecording = useStore((s) => s.removeRecording)
  const setRecordingPosition = useStore((s) => s.setRecordingPosition)
  const marcarMomento = useStore((s) => s.marcarMomento)
  const renomearMarca = useStore((s) => s.renomearMarca)
  const tirarMarca = useStore((s) => s.tirarMarca)
  /*
   * A TRANSCRIÇÃO.
   *
   * Isto era uma sonda — um teste pra descobrir se o tablet dele dava conta,
   * antes de gastar versões construindo. A sonda rodou e respondeu SIM:
   * Android 16, reconhecedor de aparelho, sem internet, um minuto de reunião
   * transcrito com texto legível. Então virou recurso.
   *
   * O relato dele sobre o resultado foi "ele trocou palavras", e é verdade:
   * reconhecedor de aparelho erra, principalmente em nome próprio. Três coisas
   * atacam isso — áudio melhor decodificado, as PALAVRAS DO CADERNO entregues
   * como dica, e o texto ficando editável pra ele corrigir por cima.
   */
  const [sonda, setSonda] = useState<EstadoDaFala | null>(null)
  const [sondando, setSondando] = useState<string | null>(null)
  const [sondaResultado, setSondaResultado] = useState<ResultadoDaFala | null>(null)
  /** O texto chegando aos pedaços, enquanto o reconhecedor trabalha. */
  const [aoVivo, setAoVivo] = useState<string>('')
  /*
   * O MESMO texto, numa ref.
   *
   * O `aoVivo` lido dentro da função assíncrona seria o do momento em que ela
   * começou — sempre vazio. É o mesmo tipo de erro que já apareceu no
   * fluxograma: closure velha fingindo ser estado atual. A ref é o valor de
   * agora; o estado é só pra pintar a tela.
   */
  const aoVivoRef = useRef('')
  /** Qual gravação está sendo transcrita agora. */
  const [transcrevendoId, setTranscrevendoId] = useState<string | null>(null)
  /** Qual transcrição está aberta pra corrigir, e o texto em edição. */
  const [corrigindo, setCorrigindo] = useState<{
    recId: string
    texto: string
    /** Com a fala partida em tópicos, corrige-se um tópico de cada vez. */
    trechos?: string[]
  } | null>(null)
  /*
   * QUAL TRANSCRIÇÃO ESTÁ ABERTA — e `null` é o normal.
   *
   * A caixa do texto mora na barra de cima, que é IRMÃ da folha: cada píxel
   * que ela cresce é um píxel que a folha perde. Aberta, ela levava a folha de
   * 677px pra 202px — uma tira no rodapé. Por isso o estado de partida é
   * fechada, e abrir é escolha dele.
   */
  const [textoAberto, setTextoAberto] = useState<string | null>(null)
  /** Os detalhes técnicos ficam fechados: já serviram, agora atrapalham. */
  const [verDetalhes, setVerDetalhes] = useState(false)

  const items = useStore((s) => s.items)
  const zones = useStore((s) => s.zones)
  const pages = useStore((s) => s.pages)
  const guardarTranscricao = useStore((s) => s.guardarTranscricao)
  const corrigirTranscricao = useStore((s) => s.corrigirTranscricao)
  const corrigirTrechos = useStore((s) => s.corrigirTrechos)
  const tirarTranscricao = useStore((s) => s.tirarTranscricao)

  /**
   * AS PALAVRAS DESTA FOLHA, pra puxar o reconhecedor.
   *
   * Tudo que ele escreveu nesta página: o que foi lido da letra dele, o nome
   * de quem ficou responsável, as observações digitadas, os rótulos das zonas
   * e o título da folha. São exatamente os nomes que o reconhecedor troca — e
   * estavam ali o tempo todo, escritos antes de a transcrição começar.
   */
  const palavrasDaFolha = (): string[] => {
    const fontes: string[] = []
    const pagina = pages.find((p) => p.id === activePageId)
    if (pagina?.title) fontes.push(pagina.title)
    for (const z of zones) {
      if (z.pageId === activePageId && z.label) fontes.push(z.label)
    }
    for (const it of items) {
      if (it.pageId !== activePageId) continue
      if (it.title) fontes.push(it.title)
      if (it.assignee) fontes.push(it.assignee)
      if (it.note) fontes.push(it.note)
    }
    return palavrasDeDica(fontes)
  }

  const transcrever = async (rec: Recording) => {
    setSondaResultado(null)
    setAoVivo('')
    aoVivoRef.current = ''
    setTranscrevendoId(rec.id)
    // Transcrevendo, a caixa abre sozinha: é agora que ele quer ver o texto
    // chegando. Terminada, ele fecha quando quiser a folha de volta.
    setTextoAberto(rec.id)
    setSondando('Perguntando ao aparelho o que ele sabe fazer…')
    try {
      const estado = await estadoDaFala()
      setSonda(estado)
      if (!estado.ok || !estado.temReconhecedor) {
        setVerDetalhes(true)
        return
      }
      const blob = await getRecordingBlob(rec.id)
      if (!blob) throw new Error('Não achei o arquivo desta gravação.')
      const palavras = palavrasDaFolha()
      /*
       * OS TÓPICOS, das marcas. Cada marca vira um corte, e o plugin ouve
       * cada pedaço numa sessão própria — é o que dá a cada tópico da ata a
       * sua fala. Sem marca, um pedaço só: o caminho que já funcionava.
       */
      const divisao = cortesDasMarcas(rec.marcas ?? [], rec.durationMs)
      const resultado = await tentarTranscrever(blob, {
        aviso: (m) => setSondando(m),
        aoVivo: (parcial) => {
          aoVivoRef.current = parcial.texto
          setAoVivo(parcial.texto)
          if (parcial.topicos && parcial.topicos > 1) {
            setSondando(`Ouvindo o tópico ${parcial.topico ?? 1} de ${parcial.topicos}…`)
          }
        },
        palavras,
        cortes: divisao.cortes,
      })
      setSondaResultado(resultado)
      if (!resultado.ok) setVerDetalhes(true)
      /*
       * Guarda mesmo quando o reconhecedor devolveu só um pedaço: meia
       * reunião transcrita vale mais que nenhuma, e perder isso obrigaria a
       * rodar tudo de novo.
       */
      const texto = resultado.texto?.trim() || aoVivoRef.current.trim()
      if (texto) {
        await guardarTranscricao(rec.id, texto, {
          segundos: resultado.segundos,
          dicas: resultado.dicas ?? palavras.length,
          trechos: casarTrechos(divisao, resultado.trechos),
        })
      }
    } catch (err) {
      setSondaResultado({
        ok: false,
        erro: err instanceof Error ? err.message : String(err),
      })
      setVerDetalhes(true)
    } finally {
      setSondando(null)
      setTranscrevendoId(null)
    }
  }

  /** Qual marca está ganhando nome agora. */
  const [editandoMarca, setEditandoMarca] = useState<
    { recId: string; marcaId: string; texto: string } | null
  >(null)
  const audioRate = useStore((s) => s.audioRate)
  const cycleAudioRate = useStore((s) => s.cycleAudioRate)

  const [handle, setHandle] = useState<RecorderHandle | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  /** Qual está tocando agora (null = nada tocando). */
  const [playingId, setPlayingId] = useState<string | null>(null)
  /** Qual está carregado no elemento de áudio — carregado não é tocando. */
  const [loadedId, setLoadedId] = useState<string | null>(null)
  /** Posição de cada gravação, em ms, do jeito que a tela mostra agora. */
  const [positions, setPositions] = useState<Record<string, number>>({})
  /** Duração que o elemento informou (segundos); costuma vir Infinity. */
  const [elementDuration, setElementDuration] = useState(0)

  const [savingId, setSavingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; onde: string } | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  /** Última posição já gravada no banco, por id — evita escrever a cada tique. */
  const persistedRef = useRef<Record<string, number>>({})
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  // A posição guardada no banco é a verdade quando a página abre.
  useEffect(() => {
    setPositions((atual) => {
      const novo = { ...atual }
      for (const rec of recordings) {
        if (novo[rec.id] === undefined) novo[rec.id] = rec.positionMs ?? 0
      }
      return novo
    })
  }, [recordings])

  // Cronômetro e medidor de volume enquanto grava.
  useEffect(() => {
    if (!handle) return
    const timer = setInterval(() => {
      setElapsed(Date.now() - handle.startedAt)
      setLevel(handle.level())
    }, 100)
    return () => clearInterval(timer)
  }, [handle])

  /** Quanto dura, em ms — a do elemento quando é confiável, senão a do cronômetro. */
  const duracaoDe = (rec: Recording) =>
    loadedId === rec.id ? reliableDuration(elementDuration, rec.durationMs) : rec.durationMs

  const guardarPosicao = (id: string, ms: number) => {
    const rec = recordings.find((r) => r.id === id)
    const duracao = rec ? duracaoDe(rec) : 0
    const alvo = worthSaving(ms, duracao) ? Math.round(ms) : 0
    if (persistedRef.current[id] === alvo) return
    persistedRef.current[id] = alvo
    void setRecordingPosition(id, alvo)
  }

  /*
   * Os ouvintes do elemento de áudio e a limpeza da saída vivem mais que o
   * render que os criou. Se guardassem a função daquele momento, escreveriam
   * no banco com a lista de gravações de antes — por isso passam por ref.
   */
  const loadedIdRef = useRef<string | null>(null)
  loadedIdRef.current = loadedId
  const guardarPosicaoRef = useRef(guardarPosicao)
  guardarPosicaoRef.current = guardarPosicao

  // A velocidade vale na hora, inclusive com o áudio já tocando: é assim que
  // se descobre qual serve, ouvindo a diferença no mesmo trecho.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = audioRate
  }, [audioRate])

  // Ao sair da página: solta o áudio e grava onde a escuta parou. Sem isto,
  // trocar de página perderia justamente a posição que o recurso existe pra ter.
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      const id = loadedIdRef.current
      if (audio && id) guardarPosicaoRef.current(id, audio.currentTime * 1000)
      audio?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const begin = async () => {
    setError(null)
    try {
      setHandle(await startRecording())
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada.'
          : 'Não consegui acessar o microfone.',
      )
    }
  }

  const finish = async () => {
    if (!handle || !activePageId) return
    try {
      const result = await handle.stop()
      const rec: Recording = {
        id: newId(),
        pageId: activePageId,
        startedAt: handle.startedAt,
        durationMs: result.durationMs,
        mimeType: result.mimeType,
        anchor: { x: 40, y: 40 },
        label: new Date(handle.startedAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      await addRecording(rec, result.blob)
    } catch {
      setError('A gravação não pôde ser salva.')
    } finally {
      setHandle(null)
      setElapsed(0)
      setLevel(0)
    }
  }

  /** Carrega a gravação no elemento, sem tocar. */
  const carregar = async (rec: Recording): Promise<HTMLAudioElement | null> => {
    if (loadedId === rec.id && audioRef.current) return audioRef.current

    const blob = await getRecordingBlob(rec.id)
    if (!blob) {
      setError('Não achei o arquivo desta gravação.')
      return null
    }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(blob)
    urlRef.current = url

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.src = url
    audio.preload = 'auto'
    audio.playbackRate = audioRate

    audio.onended = () => {
      setPlayingId(null)
      setPositions((p) => ({ ...p, [rec.id]: 0 }))
      guardarPosicaoRef.current(rec.id, 0)
    }
    audio.ontimeupdate = () => {
      const ms = audio.currentTime * 1000
      setPositions((p) => ({ ...p, [rec.id]: ms }))
      // De cinco em cinco segundos o banco também fica sabendo: se o app
      // fechar sozinho, a escuta não volta pro começo.
      if (Math.abs(ms - (persistedRef.current[rec.id] ?? 0)) > 5000) {
        guardarPosicaoRef.current(rec.id, ms)
      }
    }
    audio.ondurationchange = () => setElementDuration(audio.duration)

    setLoadedId(rec.id)
    setElementDuration(audio.duration)
    await destravarDuracao(audio)
    setElementDuration(audio.duration)
    return audio
  }

  const tocar = async (rec: Recording) => {
    setError(null)

    // Pausar é pausar: a posição fica onde está, na tela e no banco.
    if (playingId === rec.id) {
      const audio = audioRef.current
      audio?.pause()
      setPlayingId(null)
      if (audio) guardarPosicao(rec.id, audio.currentTime * 1000)
      return
    }

    // Trocar de gravação com outra tocando: a que sai também guarda onde parou.
    if (playingId && audioRef.current) {
      audioRef.current.pause()
      guardarPosicao(playingId, audioRef.current.currentTime * 1000)
      setPlayingId(null)
    }

    try {
      const audio = await carregar(rec)
      if (!audio) return
      const duracao = reliableDuration(audio.duration, rec.durationMs)
      const de = resumeAt(positionsRef.current[rec.id] ?? rec.positionMs ?? 0, duracao)
      audio.currentTime = de / 1000
      setPositions((p) => ({ ...p, [rec.id]: de }))
      // De novo aqui: trocar o `src` devolve a velocidade pra 1 em parte dos
      // navegadores, e o único sintoma seria o áudio voltar ao normal sozinho.
      audio.playbackRate = audioRate
      await audio.play()
      setPlayingId(rec.id)
    } catch {
      setError('Não consegui tocar esta gravação.')
      setPlayingId(null)
    }
  }

  /** Arrastar a barrinha: vale mesmo com a gravação parada ou nem carregada. */
  const correr = (rec: Recording, fracao: number) => {
    const alvo = seekTarget(fracao, duracaoDe(rec))
    setPositions((p) => ({ ...p, [rec.id]: alvo }))
    if (loadedId === rec.id && audioRef.current) audioRef.current.currentTime = alvo / 1000
  }

  /**
   * Levar a escuta pro instante de uma marca.
   *
   * Se a gravação não está carregada, carrega e toca: tocar numa marca é
   * dizer "quero ouvir ISTO", e parar na posição certa sem começar a tocar
   * obrigaria um segundo toque pra fazer o que já foi pedido.
   */
  const irParaMarca = async (rec: Recording, ms: number) => {
    setPositions((p) => ({ ...p, [rec.id]: ms }))
    if (loadedId === rec.id && audioRef.current) {
      audioRef.current.currentTime = ms / 1000
      if (playingId !== rec.id) await tocar(rec)
      return
    }
    await tocar(rec)
    if (audioRef.current) audioRef.current.currentTime = ms / 1000
  }

  const salvar = async (rec: Recording) => {
    setError(null)
    setSaved(null)
    setSavingId(rec.id)
    try {
      const blob = await getRecordingBlob(rec.id)
      if (!blob) throw new Error('Não achei o arquivo desta gravação.')
      const { onde } = await salvarAudio(rec, blob)
      setSaved({ id: rec.id, onde })
    } catch (err) {
      setError(
        err instanceof Error && err.message ? `Não deu pra salvar: ${err.message}` : 'Não deu pra salvar o áudio.',
      )
    } finally {
      setSavingId(null)
    }
  }

  /**
   * Salvar a transcrição como arquivo de texto.
   *
   * Mesmo motivo do áudio: o que fica só dentro do aplicativo morre com o
   * aplicativo. E se ele corrigiu a reunião inteira à mão, esse é o trabalho
   * mais caro de refazer de tudo que existe aqui.
   */
  const salvarTranscricao = async (rec: Recording) => {
    const texto = rec.transcricao?.texto
    if (!texto) return
    setError(null)
    setSaved(null)
    setSavingId(rec.id)
    try {
      const { onde } = await salvarTexto(texto, `Organizador ${rec.label} - transcricao`)
      setSaved({ id: rec.id, onde })
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Não deu pra salvar o texto: ${err.message}`
          : 'Não deu pra salvar o texto.',
      )
    } finally {
      setSavingId(null)
    }
  }

  const apagar = (rec: Recording) => {
    if (playingId === rec.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    }
    if (loadedId === rec.id) setLoadedId(null)
    if (saved?.id === rec.id) setSaved(null)
    void removeRecording(rec.id)
  }

  if (!isRecordingSupported()) return null

  return (
    <div className="audiobar">
      {handle ? (
        <button className="rec-btn recording" onClick={() => void finish()}>
          <span className="rec-dot" style={{ transform: `scale(${1 + level * 0.6})` }} />
          Parar · {formatDuration(elapsed)}
        </button>
      ) : (
        <button className="rec-btn" onClick={() => void begin()} disabled={!activePageId}>
          <span className="rec-dot idle" />
          Gravar áudio
        </button>
      )}

      {error && <span className="audio-error">{error}</span>}

      {/*
        OS DETALHES TÉCNICOS, agora fechados.
        
        Eles existiam porque a transcrição era uma medição e os números eram o
        produto. Agora o produto é o texto, e estes números só interessam
        quando algo dá errado — por isso abrem sozinhos no erro e ficam
        fechados no acerto. Mas continuam aqui por inteiro: foram eles que
        mostraram que o problema era a sessão segmentada, e não o áudio.
      */}
      {(sonda || sondaResultado) && (
        <button className="rec-sonda-abrir" onClick={() => setVerDetalhes(!verDetalhes)}>
          {verDetalhes ? '▾' : '▸'} Detalhes da transcrição
        </button>
      )}

      {verDetalhes && (sonda || sondaResultado) && (
        <div className="rec-sonda-saida">
          <div className="rec-sonda-titulo">
            O que o aparelho relatou <span>— serve pra descobrir o que falhou</span>
          </div>

          {sonda && (
            <ul>
              <li>Android: {sonda.android ?? '?'}</li>
              <li>Reconhecedor de fala: {sonda.temReconhecedor ? 'sim' : 'NÃO'}</li>
              <li>
                Funciona sem internet: {sonda.temOffline ? 'sim' : 'não (ou Android abaixo do 13)'}
              </li>
              {/* Este é o campo que mais engana: ele confere a VERSÃO do
                  Android, não se o serviço de fala do aparelho realmente
                  aceita. O nome na tela precisa dizer isso. */}
              <li>
                Android 12+ (necessário pra ler arquivo):{' '}
                {sonda.aceitaArquivo ? 'sim' : 'NÃO'}
              </li>
              {sonda.erro && <li>Erro: {sonda.erro}</li>}
            </ul>
          )}

          {sondaResultado && (
            <div className={sondaResultado.ok ? 'rec-sonda-boa' : 'rec-sonda-ruim'}>
              {sondaResultado.ok ? (
                <>
                  <strong>Transcreveu.</strong>{' '}
                  {sondaResultado.segundos !== undefined &&
                    `${Math.round(sondaResultado.segundos)}s de áudio chegaram ao reconhecedor.`}
                  {/* O texto em si fica na ficha da gravação, acima — repetido
                      aqui, ele faria a mesma reunião aparecer duas vezes na
                      tela. */}
                </>
              ) : (
                <>
                  <strong>Não transcreveu</strong>
                  {sondaResultado.etapa && ` (parou em: ${sondaResultado.etapa})`}.{' '}
                  {sondaResultado.erro}
                </>
              )}
              {/*
                O que a sonda MEDIU, sempre — inclusive quando falha.
                
                Foi aqui que ela calou da primeira vez: deu o quadro vermelho
                sem número nenhum, e com isso não dava pra saber se o problema
                era o áudio ou o serviço de fala. Estes três respondem isso.
              */}
              {(sondaResultado.segundos !== undefined || sondaResultado.trilha !== undefined) && (
                <ul className="rec-sonda-medida">
                  {sondaResultado.segundos !== undefined && (
                    <li>Áudio entregue: {sondaResultado.segundos.toFixed(1)}s</li>
                  )}
                  {sondaResultado.pico !== undefined && (
                    <li>
                      Força do som: {sondaResultado.pico} de 32767
                      {sondaResultado.pico < 500 && ' — quase silêncio; o áudio não chegou bom'}
                    </li>
                  )}
                  {sondaResultado.codificacao && <li>Formato lido: {sondaResultado.codificacao}</li>}
                  {sondaResultado.dicas !== undefined && (
                    <li>
                      Palavras do caderno entregues como dica: {sondaResultado.dicas}
                      {sondaResultado.dicas === 0 &&
                        ' — escreva na folha os nomes da reunião e transcreva de novo'}
                    </li>
                  )}
                  <li>
                    O reconhecedor respondeu:{' '}
                    {sondaResultado.trilha ? sondaResultado.trilha : 'nada'}
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dar nome à marca: um campo só, sobre a lista, como no fluxograma. */}
      {editandoMarca && (
        <div className="rec-marca-editor">
          <label>
            <span>O que foi dito aqui</span>
            <input
              autoFocus
              value={editandoMarca.texto}
              onChange={(e) => setEditandoMarca({ ...editandoMarca, texto: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void renomearMarca(editandoMarca.recId, editandoMarca.marcaId, editandoMarca.texto)
                  setEditandoMarca(null)
                }
                if (e.key === 'Escape') setEditandoMarca(null)
              }}
            />
          </label>
          <button
            className="rec-marca-ok"
            onClick={() => {
              void renomearMarca(editandoMarca.recId, editandoMarca.marcaId, editandoMarca.texto)
              setEditandoMarca(null)
            }}
          >
            Pronto
          </button>
        </div>
      )}

      <div className="rec-list">
        {recordings.map((rec) => {
          const duracao = duracaoDe(rec)
          const posicao = positions[rec.id] ?? rec.positionMs ?? 0
          const tocando = playingId === rec.id

          return (
            <div key={rec.id} className={`rec-chip ${tocando ? 'tocando' : ''}`}>
              <div className="rec-linha">
                <button
                  className="rec-play"
                  onClick={() => void tocar(rec)}
                  aria-label={tocando ? 'Pausar' : 'Tocar'}
                >
                  {tocando ? '❚❚' : '▶'}
                </button>

                <span className="rec-meta">{rec.label}</span>

                {/* A velocidade. Um toque passa pra próxima e volta pro 1x
                    depois do 2x — sem menu, que numa tela de tablet custa
                    dois toques e um alvo pequeno. */}
                <button
                  className={`rec-rate ${audioRate !== 1 ? 'ativo' : ''}`}
                  onClick={cycleAudioRate}
                  title="Velocidade de escuta; toque pra acelerar"
                >
                  {formatRate(audioRate)}
                </button>

                {/*
                  Marcar o momento.
                  
                  Fica ao lado do ▶ porque é usado COM a reunião acontecendo:
                  um toque, sem parar de ouvir, sem escrever nada. O nome vem
                  depois — exigir o nome na hora é garantir que ninguém marque.
                */}
                <button
                  className="rec-marcar"
                  onClick={() => void marcarMomento(rec.id, posicao)}
                  title="Marcar este instante da gravação"
                >
                  ⚑ Marcar
                </button>

                <button
                  className="rec-save"
                  onClick={() => void salvar(rec)}
                  disabled={savingId === rec.id}
                  title="Salvar o arquivo no tablet, fora do aplicativo"
                >
                  {savingId === rec.id ? '…' : '⤓'} Salvar
                </button>

                {/* Só aparece no aplicativo: no navegador não existe
                    reconhecedor de fala do Android. */}
                {sondaPossivel() && (
                  <button
                    className="rec-sonda"
                    onClick={() => void transcrever(rec)}
                    disabled={sondando !== null}
                    title={
                      rec.transcricao
                        ? 'Transcrever de novo esta gravação'
                        : 'Ouvir esta gravação e escrever o que foi dito'
                    }
                  >
                    {transcrevendoId === rec.id ? '…' : '⌁'}{' '}
                    {rec.transcricao ? 'Transcrever de novo' : 'Transcrever'}
                  </button>
                )}

                <button className="rec-del" onClick={() => apagar(rec)} aria-label="Excluir gravação">
                  ✕
                </button>
              </div>

              {/* A barrinha: correr do início ao fim sem precisar tocar tudo. */}
              <div className="rec-corrida">
                <input
                  className="rec-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={progress(posicao, duracao)}
                  onChange={(e) => correr(rec, Number(e.target.value))}
                  onPointerUp={() => guardarPosicao(rec.id, positionsRef.current[rec.id] ?? 0)}
                  onKeyUp={() => guardarPosicao(rec.id, positionsRef.current[rec.id] ?? 0)}
                  style={{ '--andado': `${progress(posicao, duracao) * 100}%` } as React.CSSProperties}
                  aria-label={`Posição em ${rec.label}`}
                />
                <span className="rec-tempo">
                  {formatPosition(posicao)} / {formatLength(duracao)}
                </span>
              </div>

              {/* A linha do tempo da reunião: cada marca leva a escuta pro
                  instante dela, e o nome se escreve quando der. */}
              {(rec.marcas?.length ?? 0) > 0 && (
                <div className="rec-marcas">
                  {[...(rec.marcas ?? [])]
                    .sort((a, b) => a.ms - b.ms)
                    .map((m) => (
                      <span key={m.id} className="rec-marca">
                        <button
                          className="rec-marca-ir"
                          onClick={() => void irParaMarca(rec, m.ms)}
                          title="Ouvir a partir daqui"
                        >
                          <strong>{relogio(m.ms)}</strong>
                          {m.texto ? ` ${m.texto}` : ' —'}
                        </button>
                        <button
                          className="rec-marca-acao"
                          onClick={() => setEditandoMarca({ recId: rec.id, marcaId: m.id, texto: m.texto })}
                          aria-label="Dar nome a esta marca"
                          title="Dar nome a esta marca"
                        >
                          ✎
                        </button>
                        <button
                          className="rec-marca-acao"
                          onClick={() => void tirarMarca(rec.id, m.id)}
                          aria-label="Tirar esta marca"
                          title="Tirar esta marca"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}

              {/*
                O QUE FOI DITO.

                Fica na própria ficha da gravação, e não numa tela separada,
                porque é dela que o texto fala. Guardado no banco: fechar o app
                e voltar amanhã acha o texto no lugar, como a posição da escuta
                e as marcas.

                O selo em cima não é enfeite. "Rascunho do reconhecedor" é a
                informação mais importante da caixa: ele JÁ VIU o aparelho
                trocar palavras, e um texto bonito sem aviso nenhum convida a
                copiar errado pra dentro de uma ata.
              */}
              {(rec.transcricao || transcrevendoId === rec.id) && (
                <div className={`rec-texto ${textoAberto === rec.id ? '' : 'fechada'}`}>
                  {/*
                    O CABEÇALHO É O BOTÃO DE ABRIR E FECHAR.
                    
                    Fechada, esta caixa é uma linha só — e a folha fica inteira.
                    Esse é o estado NORMAL: ao abrir o app, a transcrição está
                    guardada, não escancarada. Palavras dele quando ela abria
                    sozinha: *"assim eu não consigo usar nada"*.
                    
                    É um <button> de verdade, com seta e fundo próprio. Já
                    custou uma volta transformar um elemento que já existia em
                    botão só pondo um onClick: ele continua parecendo o que
                    sempre foi, e ninguém acha.
                  */}
                  <button
                    className="rec-texto-topo"
                    onClick={() => setTextoAberto(textoAberto === rec.id ? null : rec.id)}
                    aria-expanded={textoAberto === rec.id}
                    title={textoAberto === rec.id ? 'Fechar o texto' : 'Abrir o texto'}
                  >
                    <span className="rec-texto-seta">{textoAberto === rec.id ? '▾' : '▸'}</span>
                    <strong>O que foi dito</strong>
                    {rec.transcricao?.corrigida ? (
                      <span className="rec-texto-selo bom">✓ corrigido por você</span>
                    ) : (
                      <span className="rec-texto-selo">
                        {textoAberto === rec.id
                          ? 'rascunho do reconhecedor — confira antes de usar'
                          : 'rascunho'}
                      </span>
                    )}
                  </button>

                  {textoAberto === rec.id && (
                   <>
                  <div className="rec-texto-topo linha">
                    {rec.transcricao && corrigindo?.recId !== rec.id && (
                      <>
                        <button
                          className="rec-texto-acao"
                          onClick={() =>
                            setCorrigindo({
                              recId: rec.id,
                              texto: rec.transcricao?.texto ?? '',
                              trechos: temTopicos(rec)
                                ? rec.transcricao?.trechos?.map((t) => t.texto)
                                : undefined,
                            })
                          }
                          title="Corrigir o texto à mão"
                        >
                          ✎ Corrigir
                        </button>
                        <button
                          className="rec-texto-acao"
                          onClick={() => void salvarTranscricao(rec)}
                          disabled={savingId === rec.id}
                          title="Salvar o texto como arquivo no tablet"
                        >
                          {savingId === rec.id ? '…' : '⤓'} Salvar texto
                        </button>
                        <button
                          className="rec-texto-acao"
                          onClick={() => {
                            /*
                             * Pergunta sempre, e com aviso maior quando foi
                             * corrigido: aqui o que se perde pode ser uma
                             * reunião inteira revisada à mão.
                             */
                            const aviso = rec.transcricao?.corrigida
                              ? 'Apagar o texto que VOCÊ corrigiu desta gravação? Isso não volta.'
                              : 'Apagar esta transcrição? O áudio continua guardado.'
                            if (window.confirm(aviso)) void tirarTranscricao(rec.id)
                          }}
                          title="Apagar a transcrição (o áudio continua)"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>

                  {corrigindo?.recId === rec.id ? (
                    <>
                      {/*
                        Com tópicos, um campo por tópico. Um campo só com a
                        reunião inteira obrigaria a desfazer a separação pra
                        corrigir uma palavra — e a ata perderia os tópicos
                        justamente depois de ele ter revisado tudo.
                      */}
                      {corrigindo.trechos ? (
                        corrigindo.trechos.map((texto, i) => {
                          const t = rec.transcricao?.trechos?.[i]
                          return (
                            <label key={i} className="rec-topico-campo">
                              <span className="rec-topico-nome">
                                {t ? rotuloDoTrecho(rec, t) : `Tópico ${i + 1}`}
                              </span>
                              <textarea
                                className="rec-texto-campo"
                                value={texto}
                                onChange={(e) => {
                                  const novos = [...(corrigindo.trechos ?? [])]
                                  novos[i] = e.target.value
                                  setCorrigindo({ ...corrigindo, trechos: novos })
                                }}
                                rows={Math.min(8, Math.max(2, Math.ceil(texto.length / 60)))}
                              />
                            </label>
                          )
                        })
                      ) : (
                        <textarea
                          className="rec-texto-campo"
                          value={corrigindo.texto}
                          onChange={(e) => setCorrigindo({ recId: rec.id, texto: e.target.value })}
                          rows={10}
                          aria-label="Texto da transcrição"
                        />
                      )}
                      <div className="rec-texto-botoes">
                        <button
                          className="rec-texto-acao"
                          onClick={() => {
                            if (corrigindo.trechos) {
                              void corrigirTrechos(rec.id, corrigindo.trechos)
                            } else {
                              void corrigirTranscricao(rec.id, corrigindo.texto)
                            }
                            setCorrigindo(null)
                          }}
                        >
                          ✓ Guardar correção
                        </button>
                        <button className="rec-texto-acao" onClick={() => setCorrigindo(null)}>
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : transcrevendoId !== rec.id && temTopicos(rec) ? (
                    /* A fala JÁ separada: cada tópico com o seu pedaço, como
                       vai sair na ata. */
                    <div className="rec-texto-corpo">
                      {(rec.transcricao?.trechos ?? []).map((t, i) =>
                        !t.marcaId && !t.texto ? null : (
                          <div key={i} className="rec-topico">
                            <strong className="rec-topico-nome">{rotuloDoTrecho(rec, t)}</strong>
                            <p>{t.texto || '(nada foi entendido neste trecho)'}</p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="rec-texto-corpo">
                      {transcrevendoId === rec.id && aoVivo
                        ? aoVivo
                        : rec.transcricao?.texto || '—'}
                    </p>
                  )}

                  {transcrevendoId === rec.id && (
                    <div className="rec-texto-andando">
                      {sondando ?? 'Ouvindo…'}
                      {aoVivo ? ' · o texto vai aparecendo acima' : ''}
                    </div>
                  )}

                  {rec.transcricao && corrigindo?.recId !== rec.id && (
                    <div className="rec-texto-pé">
                      {rec.transcricao.segundos !== undefined &&
                        `${Math.round(rec.transcricao.segundos / 60)} min de áudio ouvidos`}
                      {(rec.transcricao.dicas ?? 0) > 0 &&
                        ` · ${rec.transcricao.dicas} palavra(s) do seu caderno usadas como dica`}
                    </div>
                  )}
                   </>
                  )}
                </div>
              )}

              {saved?.id === rec.id && (
                <div className="rec-salvo">✓ Salvo — {saved.onde}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Faz o navegador descobrir quanto o arquivo dura.
 *
 * Áudio gravado pelo `MediaRecorder` sai sem a duração no cabeçalho — o
 * gravador escreve em fluxo e nunca volta pro começo pra anotá-la. O elemento
 * então informa `duration = Infinity`, a barra de posição fica morta e o
 * navegador recusa pular pro meio.
 *
 * O jeito conhecido de resolver sem reescrever o arquivo: mandar tocar num
 * ponto absurdamente à frente. O navegador é obrigado a percorrer o arquivo
 * inteiro pra descobrir que aquilo não existe, e nesse caminho ele aprende o
 * tamanho de verdade. Depois é só voltar pro começo.
 *
 * Tem prazo: se em 2 segundos nada acontecer, segue como está — barra travada é
 * ruim, mas ficar esperando sem tocar nada é pior.
 */
function destravarDuracao(audio: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve()

  return new Promise((resolve) => {
    let encerrado = false
    const encerrar = (voltarAoComeco: boolean) => {
      if (encerrado) return
      encerrado = true
      audio.removeEventListener('timeupdate', andou)
      clearTimeout(prazo)
      if (voltarAoComeco) {
        try {
          audio.currentTime = 0
        } catch {
          // Alguns navegadores recusam; a posição será ajustada por quem chamou.
        }
      }
      resolve()
    }

    const andou = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) encerrar(true)
    }

    audio.addEventListener('timeupdate', andou)
    const prazo = setTimeout(() => encerrar(true), 2000)

    try {
      audio.currentTime = 1e7
    } catch {
      encerrar(false)
    }
  })
}

/** A fala desta gravação está separada em tópicos? */
function temTopicos(rec: Recording): boolean {
  return (rec.transcricao?.trechos ?? []).some((t) => Boolean(t.marcaId))
}

/**
 * O nome de um pedaço da fala: a hora na gravação e o nome da marca.
 *
 * Lido da marca AGORA, e não guardado no trecho: o nome vem depois da reunião
 * ("marca nasce sem nome"), e renomear tem que mudar aqui também.
 */
function rotuloDoTrecho(rec: Recording, t: TrechoFalado): string {
  if (!t.marcaId) return `${relogio(t.inicioMs)} · Abertura`
  const m = rec.marcas?.find((x) => x.id === t.marcaId)
  if (!m) return `${relogio(t.inicioMs)} · Marca apagada`
  return `${relogio(m.ms)} · ${m.texto.trim() || 'Tópico sem nome'}`
}
