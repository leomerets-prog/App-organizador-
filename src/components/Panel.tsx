import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { listAllItems } from '../db/repo'
import type { Item, ItemKind } from '../domain/types'
import { ITEM_COLOR, ITEM_GLYPH } from '../ink/renderer'
import { InkThumbnail } from './InkThumbnail'

/**
 * Painel estratificado: tudo que foi carimbado, de todos os cadernos, agrupado.
 *
 * Cada item aparece com um recorte da própria letra do usuário — é o que
 * permite reconhecer a anotação sem depender de transcrição.
 */

const ORDER: ItemKind[] = ['pendencia', 'tarefa', 'duvida', 'topico', 'documento', 'importante']

const GROUP_TITLE: Record<ItemKind, string> = {
  pendencia: 'Pendências',
  tarefa: 'Tarefas',
  duvida: 'Dúvidas',
  topico: 'Tópicos',
  documento: 'Documentos',
  importante: 'Importantes',
}

export function Panel({ onClose }: { onClose: () => void }) {
  const [allItems, setAllItems] = useState<Item[]>([])
  const [showDone, setShowDone] = useState(false)

  const localItems = useStore((s) => s.items)
  const pages = useStore((s) => s.pages)
  const selectPage = useStore((s) => s.selectPage)
  const toggleItemStatus = useStore((s) => s.toggleItemStatus)

  // Recarrega ao abrir e sempre que os itens da página aberta mudarem.
  useEffect(() => {
    void listAllItems().then(setAllItems)
  }, [localItems])

  const groups = useMemo(() => {
    const visible = allItems.filter((i) => showDone || i.status !== 'concluido')
    return ORDER.map((kind) => ({
      kind,
      items: visible
        .filter((i) => i.kind === kind)
        .sort((a, b) => b.createdAt - a.createdAt),
    })).filter((g) => g.items.length > 0)
  }, [allItems, showDone])

  const openCount = allItems.filter((i) => i.status !== 'concluido').length

  return (
    <div className="panel">
      <header className="panel-head">
        <div>
          <h1>Painel</h1>
          <p className="muted">
            {openCount === 0
              ? 'Nada em aberto.'
              : `${openCount} ${openCount === 1 ? 'item em aberto' : 'itens em aberto'}`}
          </p>
        </div>
        <div className="panel-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Mostrar concluídos
          </label>
          <button className="panel-close" onClick={onClose}>
            Voltar à folha
          </button>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="panel-empty">
          <p>Nada carimbado ainda.</p>
          <p className="muted">
            Na folha: pegue o <strong>laço</strong>, cerque uma anotação e escolha o carimbo
            (Tarefa, Dúvida, Pendência…). Ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="panel-groups">
          {groups.map((group) => (
            <section key={group.kind} className="panel-group">
              <h2 style={{ color: ITEM_COLOR[group.kind] }}>
                <span className="group-glyph">{ITEM_GLYPH[group.kind]}</span>
                {GROUP_TITLE[group.kind]}
                <span className="group-count">{group.items.length}</span>
              </h2>

              <div className="panel-cards">
                {group.items.map((item) => {
                  const page = pages.find((p) => p.id === item.pageId)
                  return (
                    <article
                      key={item.id}
                      className={`panel-card ${item.status === 'concluido' ? 'done' : ''}`}
                    >
                      <button
                        className="card-check"
                        style={{ borderColor: ITEM_COLOR[item.kind] }}
                        onClick={() => void toggleItemStatus(item.id)}
                        aria-label="Alternar concluído"
                      >
                        {item.status === 'concluido' ? '✓' : ''}
                      </button>

                      <div className="card-body">
                        <InkThumbnail itemId={item.id} bounds={item.bounds} />
                        <div className="card-meta">
                          {item.title && <span className="card-title">{item.title}</span>}
                          <span className="card-source">
                            {page ? page.title : 'outra página'} ·{' '}
                            {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>

                      {page && (
                        <button
                          className="card-goto"
                          onClick={() => {
                            void selectPage(item.pageId)
                            onClose()
                          }}
                        >
                          Ir
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
