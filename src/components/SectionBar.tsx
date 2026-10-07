import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { NOTEBOOK_COLORS } from '../domain/constants'
import { TEMPLATES } from '../domain/templates'

/**
 * A faixa de Seções e a lista de Páginas — as duas colunas do topo no OneNote.
 * No tablet elas viram uma barra horizontal só, pra sobrar folha pra escrever.
 *
 * Renomear: tocar de novo no item JÁ ativo abre o campo de nome. É um gesto
 * que não atrapalha a navegação (o primeiro toque só troca de aba) e não exige
 * pressionar e segurar, que no tablet compete com a rolagem.
 */
export function SectionBar() {
  const sections = useStore((s) => s.sections)
  const pages = useStore((s) => s.pages)
  const activeSectionId = useStore((s) => s.activeSectionId)
  const activePageId = useStore((s) => s.activePageId)
  const activeNotebookId = useStore((s) => s.activeNotebookId)
  const notebooks = useStore((s) => s.notebooks)

  const selectSection = useStore((s) => s.selectSection)
  const selectPage = useStore((s) => s.selectPage)
  const createSection = useStore((s) => s.createSection)
  const createPage = useStore((s) => s.createPage)
  const renameSection = useStore((s) => s.renameSection)
  const renamePage = useStore((s) => s.renamePage)
  const removePage = useStore((s) => s.removePage)
  const removeSection = useStore((s) => s.removeSection)

  const [newPageOpen, setNewPageOpen] = useState(false)
  const [editing, setEditing] = useState<{ kind: 'section' | 'page'; id: string } | null>(null)

  const notebook = notebooks.find((n) => n.id === activeNotebookId)

  /*
   * A folha aberta fica à vista na fileira. Com muitas páginas, a fileira
   * abria rolada pro começo: a folha ativa e o "+ Página" ficavam fora da
   * tela, e quem não sabe que dá pra arrastar a fileira acha que sumiram.
   */
  const linhaDasPaginas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const linha = linhaDasPaginas.current
    const ativa = linha?.querySelector<HTMLElement>('.chip.page.active')
    if (!linha || !ativa) return
    // Sendo a última, o "+ Página" logo depois dela vem junto.
    const depois = ativa.nextElementSibling
    const fim = depois?.classList.contains('ghost') ? (depois as HTMLElement) : ativa
    const caixa = linha.getBoundingClientRect()
    const esquerda = ativa.getBoundingClientRect().left
    const direita = fim.getBoundingClientRect().right
    if (direita > caixa.right) linha.scrollLeft += direita - caixa.right + 8
    else if (esquerda < caixa.left) linha.scrollLeft -= caixa.left - esquerda + 8
  }, [activePageId, pages.length])

  const addSection = () => {
    const color = NOTEBOOK_COLORS[sections.length % NOTEBOOK_COLORS.length]
    void createSection(`Seção ${sections.length + 1}`, color)
  }

  return (
    <div className="sectionbar">
      <div className="sectionbar-title">{notebook?.name ?? 'Organizador'}</div>

      <div className="sectionbar-row">
        <div className="chips">
          {sections.map((section) =>
            editing?.kind === 'section' && editing.id === section.id ? (
              <RenameField
                key={section.id}
                value={section.name}
                onSave={(name) => void renameSection(section.id, name)}
                onClose={() => setEditing(null)}
                onDelete={
                  sections.length > 1
                    ? () => {
                        if (confirm(`Excluir a seção "${section.name}" e todas as páginas dela?`)) {
                          void removeSection(section.id)
                        }
                      }
                    : undefined
                }
              />
            ) : (
              <button
                key={section.id}
                className={`chip ${section.id === activeSectionId ? 'active' : ''}`}
                onClick={() => {
                  // Já está aberta: o segundo toque é pra renomear.
                  if (section.id === activeSectionId) setEditing({ kind: 'section', id: section.id })
                  else void selectSection(section.id)
                }}
              >
                <span className="chip-tab" style={{ background: section.color }} aria-hidden />
                {section.name}
                {section.id === activeSectionId && <span className="chip-edit">✎</span>}
              </button>
            ),
          )}
          <button className="chip ghost" onClick={addSection}>
            <span className="plus">+</span> Seção
          </button>
        </div>
      </div>

      <div className="sectionbar-row pages" ref={linhaDasPaginas}>
        <div className="chips">
          {pages.map((page) =>
            editing?.kind === 'page' && editing.id === page.id ? (
              <RenameField
                key={page.id}
                value={page.title}
                onSave={(title) => void renamePage(page.id, title)}
                onClose={() => setEditing(null)}
                onDelete={() => {
                  if (confirm(`Excluir a página "${page.title}"?`)) void removePage(page.id)
                }}
              />
            ) : (
              <button
                key={page.id}
                className={`chip page ${page.id === activePageId ? 'active' : ''}`}
                onClick={() => {
                  if (page.id === activePageId) setEditing({ kind: 'page', id: page.id })
                  else void selectPage(page.id)
                }}
              >
                {page.title}
                {page.id === activePageId && <span className="chip-edit">✎</span>}
              </button>
            ),
          )}
          <button
            className="chip ghost"
            onClick={() => setNewPageOpen((v) => !v)}
            disabled={!activeSectionId}
          >
            <span className="plus">+</span> Página
          </button>
        </div>
      </div>

      {newPageOpen && (
        <div className="template-picker">
          <div className="template-picker-title">Modelo de folha</div>
          <div className="template-list">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => {
                  void createPage(t.name, t.id)
                  setNewPageOpen(false)
                }}
              >
                <TemplatePreview templateId={t.id} />
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Campo de renomear, com exclusão ao lado.
 * Guardar o texto num estado local (e não gravar a cada tecla) evita escrever
 * no banco a cada letra digitada.
 */
function RenameField({
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
    // Nome vazio manteria o item invisível na barra; nesse caso o antigo fica.
    if (trimmed && trimmed !== value) onSave(trimmed)
    onClose()
  }

  return (
    <form
      className="rename-form"
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        aria-label="Novo nome"
      />
      {onDelete && (
        <button
          type="button"
          className="rename-del"
          // onMouseDown evita que o blur do campo feche o formulário antes do clique.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onDelete()
            onClose()
          }}
          aria-label="Excluir"
        >
          🗑
        </button>
      )}
    </form>
  )
}

/** Miniatura das zonas do modelo, pra escolher pelo desenho e não pelo nome. */
function TemplatePreview({ templateId }: { templateId: string }) {
  const template = TEMPLATES.find((t) => t.id === templateId)
  if (!template) return null
  return (
    <span className="template-preview" aria-hidden>
      {template.zones.map((zone, i) => (
        <span
          key={i}
          className={`template-zone zone-${zone.kind}`}
          style={{
            left: `${zone.rect.x * 100}%`,
            top: `${zone.rect.y * 100}%`,
            width: `${zone.rect.w * 100}%`,
            height: `${zone.rect.h * 100}%`,
          }}
        />
      ))}
    </span>
  )
}
