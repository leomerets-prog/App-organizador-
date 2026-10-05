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
import { formatRate } from '../state/prefs'
import { getRecordingBlob } from '../db/repo'
import { newId } from '../lib/id'
import type { Recording } from '../domain/types'

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
   * A SONDA DA TRANSCRIÇÃO.
   *
   * Isto é um teste, e está escrito na tela que é um teste. Transcrever
   * reunião é caro de construir e o resultado depende do aparelho — então
   * antes de gastar versões, a pergunta: o tablet dele consegue?
   */
  const [sonda, setSonda] = useState<EstadoDaFala | null>(null)
  const [sondando, setSondando] = useState<string | null>(null)
  const [sondaResultado, setSondaResultado] = useState<ResultadoDaFala | null>(null)

  const testarTranscricao = async (rec: Recording) => {
    setSondaResultado(null)
    setSondando('Perguntando ao aparelho o que ele sabe fazer…')
    try {
      const estado = await estadoDaFala()
      setSonda(estado)
      if (!estado.ok || !estado.temReconhecedor) {
        setSondando(null)
        return
      }
      const blob = await getRecordingBlob(rec.id)
      if (!blob) throw new Error('Não achei o arquivo desta gravação.')
      const resultado = await tentarTranscrever(blob, (m) => setSondando(m))
      setSondaResultado(resultado)
    } catch (err) {
      setSondaResultado({
        ok: false,
        erro: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSondando(null)
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
        O resultado da sonda, dito por inteiro.
        
        Inclusive quando falha, e principalmente quando falha: uma sonda que
        responde só "não funcionou" não serve pra decidir nada. Versão do
        Android, se há reconhecedor, se há reconhecedor offline, se o
        decodificador deu conta e o que o reconhecedor disse.
      */}
      {(sondando || sonda || sondaResultado) && (
        <div className="rec-sonda-saida">
          <div className="rec-sonda-titulo">
            Teste de transcrição <span>— isto ainda não é um recurso, é uma medição</span>
          </div>

          {sonda && (
            <ul>
              <li>Android: {sonda.android ?? '?'}</li>
              <li>Reconhecedor de fala: {sonda.temReconhecedor ? 'sim' : 'NÃO'}</li>
              <li>
                Funciona sem internet: {sonda.temOffline ? 'sim' : 'não (ou Android abaixo do 13)'}
              </li>
              <li>
                Aceita ler um arquivo: {sonda.aceitaArquivo ? 'sim' : 'NÃO (Android abaixo do 12)'}
              </li>
              {sonda.erro && <li>Erro: {sonda.erro}</li>}
            </ul>
          )}

          {sondando && <div className="rec-sonda-andando">{sondando}</div>}

          {sondaResultado && (
            <div className={sondaResultado.ok ? 'rec-sonda-boa' : 'rec-sonda-ruim'}>
              {sondaResultado.ok ? (
                <>
                  <strong>Transcreveu.</strong>{' '}
                  {sondaResultado.segundos !== undefined &&
                    `${Math.round(sondaResultado.segundos)}s de áudio chegaram ao reconhecedor.`}
                  <p>{sondaResultado.texto}</p>
                </>
              ) : (
                <>
                  <strong>Não transcreveu</strong>
                  {sondaResultado.etapa && ` (parou em: ${sondaResultado.etapa})`}.{' '}
                  {sondaResultado.erro}
                </>
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
                    reconhecedor de fala do Android pra testar. */}
                {sondaPossivel() && (
                  <button
                    className="rec-sonda"
                    onClick={() => void testarTranscricao(rec)}
                    disabled={sondando !== null}
                    title="TESTE: ver se este tablet consegue transcrever o começo desta gravação"
                  >
                    ⌁ Testar transcrição
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
