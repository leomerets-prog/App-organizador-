import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { listAllItems, listAllPages } from '../db/repo'
import type { Item, ItemKind, Page } from '../domain/types'
import { ITEM_COLOR, ITEM_GLYPH } from '../ink/renderer'
import { InkThumbnail } from './InkThumbnail'

/**
 * Painel estratificado: tudo que a folha produziu, separado por aba.
 *
 * Duas coisas chegam aqui: o que o usuário carimbou com o laço e o que o app
 * identificou sozinho pela zona em que a escrita caiu (ver `items/detect.ts`).
 * Cada item aparece com um recorte da própria letra — é o que permite
 * reconhecer a anotação sem depender de transcrição.
 */

const ORDER: ItemKind[] = [
  'tarefa',
  'pauta',
  'pendencia',
  'duvida',
  'topico',
  'documento',
  'importante',
]

/** Nome da aba, no plural — é uma lista, não um item. */
const TAB_TITLE: Record<ItemKind, string> = {
  tarefa: 'Tarefas',
  pauta: 'Pautas',
  pendencia: 'Pendências',
  duvida: 'Dúvidas',
  topico: 'Tópicos',
  documento: 'Documentos',
  importante: 'Importantes',
}

/** Nome no singular, pro seletor de tipo de cada cartão. */
const KIND_TITLE: Record<ItemKind, string> = {
  tarefa: 'Tarefa',
  pauta: 'Pauta',
  pendencia: 'Pendência',
  duvida: 'Dúvida',
  topico: 'Tópico',
  documento: 'Documento',
  importante: 'Importante',
}

type Tab = 'tudo' | ItemKind | 'arquivados'
type Scope = 'tudo' | 'pagina'

export function Panel({ onClose }: { onClose: () => void }) {
  const [allItems, setAllItems] = useState<Item[]>([])
  const [allPages, setAllPages] = useState<Page[]>([])
  const [tab, setTab] = useState<Tab>('tudo')
  const [scope, setScope] = useState<Scope>('tudo')
  const [showDone, setShowDone] = useState(false)

  const localItems = useStore((s) => s.items)
  const activePageId = useStore((s) => s.activePageId)
  const autoFields = useStore((s) => s.autoFields)
  const selectPage = useStore((s) => s.selectPage)
  const toggleItemStatus = useStore((s) => s.toggleItemStatus)
  const setItemStatus = useStore((s) => s.setItemStatus)
  const setItemKind = useStore((s) => s.setItemKind)

  // Recarrega ao abrir e sempre que os itens da página aberta mudarem — é por
  // aqui que a identificação automática aparece no painel sem recarregar nada.
  useEffect(() => {
    void listAllItems().then(setAllItems)
  }, [localItems])

  useEffect(() => {
    void listAllPages().then(setAllPages)
  }, [])

  /** Itens da lista do estado ganham prioridade: são os mais frescos. */
  const items = useMemo(() => {
    const fresh = new Map(localItems.map((i) => [i.id, i]))
    const merged = allItems.map((i) => fresh.get(i.id) ?? i)
    const known = new Set(merged.map((i) => i.id))
    return [...merged, ...localItems.filter((i) => !known.has(i.id))]
  }, [allItems, localItems])

  const inScope = useMemo(
    () => items.filter((i) => scope === 'tudo' || i.pageId === activePageId),
    [items, scope, activePageId],
  )

  const arquivados = useMemo(
    () => inScope.filter((i) => i.status === 'arquivado'),
    [inScope],
  )

  const vivos = useMemo(
    () => inScope.filter((i) => i.status !== 'arquivado' && (showDone || i.status !== 'concluido')),
    [inScope, showDone],
  )

  const counts = useMemo(() => {
    const out = {} as Record<ItemKind, number>
    for (const kind of ORDER) out[kind] = 0
    for (const item of vivos) out[item.kind]++
    return out
  }, [vivos])

  // A aba de arquivados some quando esvazia; se estiver aberta nessa hora,
  // volta pra "Tudo" em vez de deixar a tela num estado sem aba selecionada.
  useEffect(() => {
    if (tab === 'arquivados' && arquivados.length === 0) setTab('tudo')
  }, [tab, arquivados.length])

  const shown = useMemo(() => {
    const list = tab === 'arquivados' ? arquivados : tab === 'tudo' ? vivos : vivos.filter((i) => i.kind === tab)
    return [...list].sort((a, b) => b.createdAt - a.createdAt)
  }, [tab, vivos, arquivados])

  const groups = useMemo(() => {
    if (tab !== 'tudo') return null
    return ORDER.map((kind) => ({ kind, items: shown.filter((i) => i.kind === kind) })).filter(
      (g) => g.items.length > 0,
    )
  }, [tab, shown])

  const abertos = vivos.filter((i) => i.status !== 'concluido').length

  const card = (item: Item) => (
    <ItemCard
      key={item.id}
      item={item}
      page={allPages.find((p) => p.id === item.pageId)}
      onToggle={() => void toggleItemStatus(item.id)}
      onKind={(kind) => void setItemKind(item.id, kind)}
      onArchive={() => void setItemStatus(item.id, 'arquivado')}
      onRestore={() => void setItemStatus(item.id, 'aberto')}
      onGo={() => {
        void selectPage(item.pageId)
        onClose()
      }}
    />
  )

  return (
    <div className="panel">
      <header className="panel-head">
        <div>
          <h1>Painel</h1>
          <p className="muted">
            {abertos === 0
              ? 'Nada em aberto.'
              : `${abertos} ${abertos === 1 ? 'item em aberto' : 'itens em aberto'}`}
            {scope === 'pagina' ? ' nesta página' : ''}
          </p>
        </div>
        <div className="panel-actions">
          <div className="scope-switch">
            <button
              className={scope === 'tudo' ? 'active' : ''}
              onClick={() => setScope('tudo')}
            >
              Tudo
            </button>
            <button
              className={scope === 'pagina' ? 'active' : ''}
              onClick={() => setScope('pagina')}
              disabled={!activePageId}
            >
              Esta página
            </button>
          </div>
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

      <nav className="panel-tabs">
        <button
          className={`panel-tab ${tab === 'tudo' ? 'active' : ''}`}
          onClick={() => setTab('tudo')}
        >
          Tudo
          <span className="tab-count">{vivos.length}</span>
        </button>

        {ORDER.map((kind) => (
          <button
            key={kind}
            className={`panel-tab ${tab === kind ? 'active' : ''} ${
              counts[kind] === 0 ? 'empty' : ''
            }`}
            style={{ '--tab': ITEM_COLOR[kind] } as React.CSSProperties}
            onClick={() => setTab(kind)}
          >
            <span className="tab-glyph">{ITEM_GLYPH[kind]}</span>
            {TAB_TITLE[kind]}
            <span className="tab-count">{counts[kind]}</span>
          </button>
        ))}

        {arquivados.length > 0 && (
          <button
            className={`panel-tab ${tab === 'arquivados' ? 'active' : ''}`}
            onClick={() => setTab('arquivados')}
          >
            Arquivados
            <span className="tab-count">{arquivados.length}</span>
          </button>
        )}
      </nav>

      {shown.length === 0 ? (
        <PanelEmpty tab={tab} autoFields={autoFields} />
      ) : groups ? (
        <div className="panel-groups">
          {groups.map((group) => (
            <section key={group.kind} className="panel-group">
              <h2 style={{ color: ITEM_COLOR[group.kind] }}>
                <span className="group-glyph">{ITEM_GLYPH[group.kind]}</span>
                {TAB_TITLE[group.kind]}
                <span className="group-count">{group.items.length}</span>
              </h2>
              <div className="panel-cards">{group.items.map(card)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel-groups">
          <div className="panel-cards">{shown.map(card)}</div>
        </div>
      )}
    </div>
  )
}

// ─── Cartão ──────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  page,
  onToggle,
  onKind,
  onArchive,
  onRestore,
  onGo,
}: {
  item: Item
  page: Page | undefined
  onToggle: () => void
  onKind: (kind: ItemKind) => void
  onArchive: () => void
  onRestore: () => void
  onGo: () => void
}) {
  const arquivado = item.status === 'arquivado'

  return (
    <article className={`panel-card ${item.status === 'concluido' ? 'done' : ''}`}>
      {arquivado ? (
        <button className="card-check restore" onClick={onRestore} aria-label="Devolver ao painel">
          ↩
        </button>
      ) : (
        <button
          className="card-check"
          style={{ borderColor: ITEM_COLOR[item.kind] }}
          onClick={onToggle}
          aria-label="Alternar concluído"
        >
          {item.status === 'concluido' ? '✓' : ''}
        </button>
      )}

      <div className="card-body">
        <InkThumbnail itemId={item.id} bounds={item.bounds} />
        <div className="card-meta">
          {item.title && <span className="card-title">{item.title}</span>}
          <span className="card-source">
            {page ? page.title : 'página apagada'} ·{' '}
            {new Date(item.createdAt).toLocaleDateString('pt-BR')} ·{' '}
            {item.source === 'auto' ? 'identificado' : 'carimbado'}
          </span>

          {/* Trocar o tipo é o conserto do palpite errado do app. Fica à vista,
              no próprio cartão: sem isto, um campo identificado como pendência
              teria que ser apagado e reescrito pra virar tarefa. */}
          <select
            className="card-kind"
            value={item.kind}
            onChange={(e) => onKind(e.target.value as ItemKind)}
            style={{ color: ITEM_COLOR[item.kind] }}
            aria-label="Tipo do item"
          >
            {ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {ITEM_GLYPH[kind]} {KIND_TITLE[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card-side">
        {page && (
          <button className="card-goto" onClick={onGo}>
            Ir
          </button>
        )}
        {!arquivado && (
          <button
            className="card-archive"
            onClick={onArchive}
            title="Não era item: tira do painel sem apagar a anotação"
          >
            ✕
          </button>
        )}
      </div>
    </article>
  )
}

// ─── Vazios ──────────────────────────────────────────────────────────────────

function PanelEmpty({ tab, autoFields }: { tab: Tab; autoFields: boolean }) {
  if (tab === 'arquivados') {
    return (
      <div className="panel-empty">
        <p>Nada arquivado.</p>
      </div>
    )
  }

  return (
    <div className="panel-empty">
      <p>{tab === 'tudo' ? 'Nada aqui ainda.' : `Nenhum item em ${TAB_TITLE[tab].toLowerCase()}.`}</p>
      <p className="muted">
        {autoFields ? (
          <>
            Escreva dentro de uma faixa da folha — <strong>Pauta</strong>, <strong>Tarefas</strong>,{' '}
            <strong>Dúvidas</strong>, <strong>Pendências</strong> — e cada linha aparece aqui
            sozinha. Ou pegue o <strong>laço</strong>, cerque uma anotação e escolha o carimbo.
          </>
        ) : (
          <>
            A identificação automática está desligada. Ligue em <strong>Campos</strong>, na barra de
            ferramentas, ou use o <strong>laço</strong> pra carimbar à mão.
          </>
        )}
      </p>
    </div>
  )
}
