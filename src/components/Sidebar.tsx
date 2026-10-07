import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { NOTEBOOK_COLORS } from '../domain/constants'
import { INSTALLED_VERSION } from '../update/updates'

/**
 * Barra lateral: a lista de Blocos de Anotações, com as lombadas coloridas.
 * Mesma hierarquia do OneNote — Bloco → Seção → Página.
 */
export function Sidebar({
  onOpenPanel,
  onOpenUpdate,
}: {
  onOpenPanel: () => void
  onOpenUpdate: () => void
}) {
  const notebooks = useStore((s) => s.notebooks)
  const activeNotebookId = useStore((s) => s.activeNotebookId)
  const selectNotebook = useStore((s) => s.selectNotebook)
  const createNotebook = useStore((s) => s.createNotebook)
  const renameNotebook = useStore((s) => s.renameNotebook)
  const removeNotebook = useStore((s) => s.removeNotebook)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  /*
   * O campo cria o bloco no Enter E ao perder o foco — e o Enter do teclado
   * pode fazer as duas coisas de uma vez, criando o bloco duas vezes (com
   * seção e página cada um). Criar não é como renomear: a segunda vez não é
   * inofensiva.
   */
  const criando = useRef(false)
  const submit = async () => {
    if (criando.current) return
    criando.current = true
    try {
      const trimmed = name.trim()
      if (trimmed) {
        const color = NOTEBOOK_COLORS[notebooks.length % NOTEBOOK_COLORS.length]
        await createNotebook(trimmed, color)
      }
      setName('')
      setCreating(false)
    } finally {
      criando.current = false
    }
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-head">
        <div className="avatar" aria-hidden />
        <span className="sidebar-user">Organizador</span>
      </div>

      <button className="sidebar-row" onClick={onOpenPanel}>
        <span className="sidebar-glyph panel-glyph">◫</span>
        <span className="sidebar-label">Central</span>
      </button>

      <div className="sidebar-divider" />

      <div className="sidebar-scroll">
        {notebooks.map((nb) =>
          editingId === nb.id ? (
            <NotebookRename
              key={nb.id}
              value={nb.name}
              onSave={(value) => void renameNotebook(nb.id, value)}
              onClose={() => setEditingId(null)}
              onDelete={
                notebooks.length > 1
                  ? () => {
                      if (confirm(`Excluir o bloco "${nb.name}" e tudo dentro dele?`)) {
                        void removeNotebook(nb.id)
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <button
              key={nb.id}
              className={`sidebar-row ${nb.id === activeNotebookId ? 'active' : ''}`}
              onClick={() => {
                // Igual às seções e páginas: o segundo toque no ativo renomeia.
                if (nb.id === activeNotebookId) setEditingId(nb.id)
                else void selectNotebook(nb.id)
              }}
            >
              <span className="notebook-spine" style={{ background: nb.color }} aria-hidden />
              <span className="sidebar-label">{nb.name}</span>
              {nb.id === activeNotebookId && <span className="chip-edit">✎</span>}
            </button>
          ),
        )}
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

      <button className="sidebar-version" onClick={onOpenUpdate}>
        Versão {INSTALLED_VERSION} · atualizar
      </button>
    </nav>
  )
}

/** Renomear o bloco, com exclusão ao lado. */
function NotebookRename({
  value,
  onSave,
  onClose,
  onDelete,
}: {
  value: string
  onSave: (value: string) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    onClose()
  }

  return (
    <form
      className="sidebar-new"
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
    >
      <div className="rename-form">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
          aria-label="Novo nome do bloco"
        />
        {onDelete && (
          <button
            type="button"
            className="rename-del"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onDelete()
              onClose()
            }}
            aria-label="Excluir bloco"
          >
            🗑
          </button>
        )}
      </div>
    </form>
  )
}
