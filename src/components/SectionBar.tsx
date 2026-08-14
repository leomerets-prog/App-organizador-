import { useState } from 'react'
import { useStore } from '../state/store'
import { NOTEBOOK_COLORS } from '../domain/constants'
import { TEMPLATES } from '../domain/templates'

/**
 * A faixa de Seções e a lista de Páginas — as duas colunas do topo no OneNote.
 * No tablet elas viram uma barra horizontal só, pra sobrar folha pra escrever.
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
  const removePage = useStore((s) => s.removePage)

  const [newPageOpen, setNewPageOpen] = useState(false)
  const notebook = notebooks.find((n) => n.id === activeNotebookId)

  const addSection = () => {
    const color = NOTEBOOK_COLORS[sections.length % NOTEBOOK_COLORS.length]
    void createSection(`Seção ${sections.length + 1}`, color)
  }

  return (
    <div className="sectionbar">
      <div className="sectionbar-title">{notebook?.name ?? 'Organizador'}</div>

      <div className="sectionbar-row">
        <div className="chips">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`chip ${section.id === activeSectionId ? 'active' : ''}`}
              onClick={() => void selectSection(section.id)}
            >
              <span className="chip-tab" style={{ background: section.color }} aria-hidden />
              {section.name}
            </button>
          ))}
          <button className="chip ghost" onClick={addSection}>
            <span className="plus">+</span> Seção
          </button>
        </div>
      </div>

      <div className="sectionbar-row pages">
        <div className="chips">
          {pages.map((page) => (
            <button
              key={page.id}
              className={`chip page ${page.id === activePageId ? 'active' : ''}`}
              onClick={() => void selectPage(page.id)}
              onDoubleClick={() => {
                if (confirm(`Excluir a página "${page.title}"?`)) void removePage(page.id)
              }}
            >
              {page.title}
            </button>
          ))}
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
