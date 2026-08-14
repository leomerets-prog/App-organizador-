import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { formatDuration, isRecordingSupported, startRecording } from '../audio/recorder'
import type { RecorderHandle } from '../audio/recorder'
import { getRecordingBlob } from '../db/repo'
import { newId } from '../lib/id'
import type { Recording } from '../domain/types'

/**
 * Barra de áudio da página.
 *
 * Gravar é um botão só. Enquanto grava, os traços continuam guardando o instante
 * em que saíram da caneta — é o que vai permitir, depois, tocar num rabisco e
 * ouvir o que estava sendo dito naquele momento.
 */
export function AudioBar() {
  const recordings = useStore((s) => s.recordings)
  const activePageId = useStore((s) => s.activePageId)
  const addRecording = useStore((s) => s.addRecording)
  const removeRecording = useStore((s) => s.removeRecording)

  const [handle, setHandle] = useState<RecorderHandle | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  // Cronômetro e medidor de volume enquanto grava.
  useEffect(() => {
    if (!handle) return
    const timer = setInterval(() => {
      setElapsed(Date.now() - handle.startedAt)
      setLevel(handle.level())
    }, 100)
    return () => clearInterval(timer)
  }, [handle])

  // Libera a URL do blob ao sair, senão o áudio fica preso na memória.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      audioRef.current?.pause()
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

  const play = async (id: string) => {
    if (playingId === id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    const blob = await getRecordingBlob(id)
    if (!blob) return

    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(blob)
    urlRef.current = url

    if (!audioRef.current) audioRef.current = new Audio()
    audioRef.current.src = url
    audioRef.current.onended = () => setPlayingId(null)
    await audioRef.current.play()
    setPlayingId(id)
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
        {recordings.map((rec) => (
          <div key={rec.id} className="rec-chip">
            <button className="rec-play" onClick={() => void play(rec.id)}>
              {playingId === rec.id ? '❚❚' : '▶'}
            </button>
            <span className="rec-meta">
              {rec.label} · {formatDuration(rec.durationMs)}
            </span>
            <button
              className="rec-del"
              onClick={() => {
                if (playingId === rec.id) {
                  audioRef.current?.pause()
                  setPlayingId(null)
                }
                void removeRecording(rec.id)
              }}
              aria-label="Excluir gravação"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
