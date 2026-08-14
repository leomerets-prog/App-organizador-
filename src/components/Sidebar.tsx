import { useState } from 'react'
import { useStore } from '../state/store'
import { NOTEBOOK_COLORS } from '../domain/constants'

/**
 * Barra lateral: a lista de Blocos de Anotações, com as lombadas coloridas.
 * Mesma hierarquia do OneNote — Bloco → Seção → Página.
 */
export function Sidebar({ onOpenPanel }: { onOpenPanel: () => void }) {
  const notebooks = useStore((s) => s.notebooks)
  const activeNotebookId = useStore((s) => s.activeNotebookId)
  const selectNotebook = useStore((s) => s.selectNotebook)
  const createNotebook = useStore((s) => s.createNotebook)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const submit = async () => {
    const trimmed = name.trim()
    if (trimmed) {
      const color = NOTEBOOK_COLORS[notebooks.length % NOTEBOOK_COLORS.length]
      await createNotebook(trimmed, color)
    }
    setName('')
    setCreating(false)
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <div className="avatar" aria-hidden />
        <span className="sidebar-user">Organizador</span>
      </div>

      <button className="sidebar-row" onClick={onOpenPanel}>
        <span className="sidebar-glyph panel-glyph">◫</span>
        <span className="sidebar-label">Painel</span>
      </button>

      <div className="sidebar-divider" />

      <div className="sidebar-scroll">
        {notebooks.map((nb) => (
          <button
            key={nb.id}
            className={`sidebar-row ${nb.id === activeNotebookId ? 'active' : ''}`}
            onClick={() => void selectNotebook(nb.id)}
          >
            <span className="notebook-spine" style={{ background: nb.color }} aria-hidden />
            <span className="sidebar-label">{nb.name}</span>
          </button>
        ))}
      </div>

      {creating ? (
        <form
          className="sidebar-new"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={name}
            placeholder="Nome do bloco"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void submit()}
          />
        </form>
      ) : (
        <button className="sidebar-add" onClick={() => setCreating(true)}>
          <span className="plus">+</span> Bl. Anotações
        </button>
      )}
    </nav>
  )
}
