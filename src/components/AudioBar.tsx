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

                <button
                  className="rec-save"
                  onClick={() => void salvar(rec)}
                  disabled={savingId === rec.id}
                  title="Salvar o arquivo no tablet, fora do aplicativo"
                >
                  {savingId === rec.id ? '…' : '⤓'} Salvar
                </button>

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
