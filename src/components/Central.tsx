import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { listAllItems, listAllPages, listAllSections } from '../db/repo'
import type { Item, ItemKind, Notebook, Page, Priority, Section } from '../domain/types'
import { ITEM_COLOR, ITEM_GLYPH } from '../ink/renderer'
import { InkThumbnail } from './InkThumbnail'
import {
  DEFAULT_FILTER,
  DUE_BUCKET_TITLE,
  dueBucket,
  groupByDue,
  selectItems,
  sortItems,
  summarize,
} from '../items/central'
import type { CentralFilter, CentralView, Origin, SortKey } from '../items/central'
import { ItemPanel } from './ItemPanel'

/**
 * A Central.
 *
 * A folha é onde se escreve. Aqui é onde o que foi escrito vira trabalho: tudo
 * que saiu das faixas de todos os cadernos, já transcrito, com busca, filtro
 * por caderno e as ações que se faz com um item — concluir, reclassificar,
 * voltar pra página onde ele nasceu.
 *
 * O texto continua também na folha, embaixo da letra. Os dois lugares mostram
 * o MESMO item: marcar concluído aqui risca a linha lá, e vice-versa.
 */

const ORDER: ItemKind[] = [
  'tarefa',
  'pauta',
  'pendencia',
  'duvida',
  'topico',
  'documento',
  'importante',
  'nota',
]

const PLURAL: Record<ItemKind, string> = {
  tarefa: 'Ações',
  pauta: 'Pautas',
  pendencia: 'Pendências',
  duvida: 'Dúvidas',
  topico: 'Tópicos',
  documento: 'Documentos',
  importante: 'Importantes',
  nota: 'Anotações',
}

const PRIO_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

/** Por onde a lista pode ser ordenada, com o nome que aparece no botão. */
const ORDENS: { key: SortKey; nome: string }[] = [
  { key: 'recentes', nome: 'Recentes' },
  { key: 'prazo', nome: 'Prazo' },
  { key: 'prioridade', nome: 'Prioridade' },
]

/**
 * A data como se fala.
 *
 * "ontem", "hoje", "amanhã" dizem mais de relance que 29/09 — e é de relance
 * que essa lista é lida. Fora dessa janela, a data escrita, que é exata.
 */
function rotuloPrazo(prazo: number): string {
  const dia = 24 * 60 * 60 * 1000
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(prazo)
  alvo.setHours(0, 0, 0, 0)
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / dia)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  if (dias < 0) return `${-dias} dias atrás`
  return alvo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const SINGULAR: Record<ItemKind, string> = {
  tarefa: 'Ação',
  pauta: 'Pauta',
  pendencia: 'Pendência',
  duvida: 'Dúvida',
  topico: 'Tópico',
  documento: 'Documento',
  importante: 'Importante',
  nota: 'Anotação',
}

export function Central({ onClose }: { onClose: () => void }) {
  const [allItems, setAllItems] = useState<Item[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [filter, setFilter] = useState<CentralFilter>(DEFAULT_FILTER)

  const localItems = useStore((s) => s.items)
  const notebooks = useStore((s) => s.notebooks)
  const activePageId = useStore((s) => s.activePageId)
  const irParaPagina = useStore((s) => s.irParaPagina)
  const toggleItemStatus = useStore((s) => s.toggleItemStatus)
  const setItemStatus = useStore((s) => s.setItemStatus)
  const setItemKind = useStore((s) => s.setItemKind)
  const setItemText = useStore((s) => s.setItemText)
  const updateItemFields = useStore((s) => s.updateItemFields)
  const transcription = useStore((s) => s.transcription)
  const transcribePage = useStore((s) => s.transcribePage)

  /** Registro com a ficha aberta. */
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<SortKey>('recentes')

  // Recarrega ao abrir e a cada mudança nos itens da página aberta: é por aqui
  // que o que acabou de ser escrito aparece na Central sem recarregar nada.
  // `itensMexidos` cobre o item de OUTRA folha editado aqui: ele não está na
  // lista da folha aberta, então só o contador avisa que a lista mudou.
  const itensMexidos = useStore((s) => s.itensMexidos)
  useEffect(() => {
    void listAllItems().then(setAllItems)
  }, [localItems, itensMexidos])

  useEffect(() => {
    void listAllPages().then(setPages)
    void listAllSections().then(setSections)
  }, [])

  /** O estado da página aberta é mais fresco que o que veio do banco. */
  const items = useMemo(() => {
    const fresh = new Map(localItems.map((i) => [i.id, i]))
    const merged = allItems.map((i) => fresh.get(i.id) ?? i)
    const known = new Set(merged.map((i) => i.id))
    return [...merged, ...localItems.filter((i) => !known.has(i.id))]
  }, [allItems, localItems])

  const origins = useMemo(() => buildOrigins(notebooks, sections, pages), [notebooks, sections, pages])

  const resumo = useMemo(() => {
    const noEscopo =
      filter.scope === 'pagina' ? items.filter((i) => i.pageId === activePageId) : items
    const doCaderno =
      filter.notebookId === 'todos'
        ? noEscopo
        : noEscopo.filter((i) => origins.get(i.pageId)?.notebookId === filter.notebookId)
    return summarize(doCaderno, origins)
  }, [items, origins, filter.scope, filter.notebookId, activePageId])

  const lista = useMemo(
    () => sortItems(selectItems(items, origins, { ...filter, pageId: activePageId }), ordem),
    [items, origins, filter, activePageId, ordem],
  )

  /** Por prazo a lista sai repartida em faixas; nas outras ordens, corrida. */
  const faixas = useMemo(
    () => (ordem === 'prazo' ? groupByDue(lista) : null),
    [ordem, lista],
  )

  const ficha = fichaId ? (items.find((i) => i.id === fichaId) ?? null) : null

  const arquivados = useMemo(
    () => items.filter((i) => i.status === 'arquivado').length,
    [items],
  )

  // A aba de arquivados some quando esvazia; estando aberta nessa hora, a
  // Central volta pra visão geral em vez de ficar numa aba que não existe.
  useEffect(() => {
    if (filter.view === 'arquivados' && arquivados === 0) {
      setFilter((f) => ({ ...f, view: 'geral' }))
    }
  }, [filter.view, arquivados])

  const abrir = (item: Item) => {
    void irParaPagina(item.pageId)
    onClose()
  }

  const linha = (item: Item) => (
    <ItemRow
      key={item.id}
      item={item}
      origin={origins.get(item.pageId)}
      onToggle={() => void toggleItemStatus(item.id)}
      onKind={(kind) => void setItemKind(item.id, kind)}
      onArchive={() => void setItemStatus(item.id, 'arquivado')}
      onRestore={() => void setItemStatus(item.id, 'aberto')}
      onOpen={() => setFichaId(item.id)}
    />
  )

  return (
    <div className={`central ${ficha ? 'com-ficha' : ''}`}>
      <header className="central-top">
        <div className="central-title">
          <h1>Central</h1>
          <p className="muted">
            {resumo.open === 0
              ? 'Nada em aberto'
              : `${resumo.open} em aberto`}
            {resumo.correndo > 0 && ` · ${resumo.correndo} vencendo`}
            {resumo.notas > 0 && ` · ${resumo.notas} anotação(ões)`}
            {resumo.done > 0 && ` · ${resumo.done} concluído${resumo.done === 1 ? '' : 's'}`}
            {filter.scope === 'pagina' && ' · só esta página'}
          </p>

          {/* O estado da leitura da letra também aparece aqui: é nesta tela que
              se percebe que falta texto, e é aqui que a explicação tem que estar. */}
          {transcription.message && (
            <button className="central-ocr" onClick={() => void transcribePage({ forcar: true })}>
              {transcription.message}
              <span>tentar de novo</span>
            </button>
          )}
        </div>

        <div className="central-tools">
          <input
            className="central-search"
            type="search"
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="Procurar no que você escreveu"
            aria-label="Procurar"
          />

          <select
            className="central-select"
            value={filter.notebookId}
            onChange={(e) => setFilter((f) => ({ ...f, notebookId: e.target.value }))}
            aria-label="Caderno"
          >
            <option value="todos">Todos os cadernos</option>
            {notebooks.map((nb) => (
              <option key={nb.id} value={nb.id}>
                {nb.name}
              </option>
            ))}
          </select>

          {/* A ordem da lista. Em "Prazo" ela sai repartida em faixas (atrasadas,
              hoje, amanhã…), que é a leitura que responde "o que corre agora". */}
          <div className="scope-switch ordem-switch">
            {ORDENS.map((o) => (
              <button
                key={o.key}
                className={ordem === o.key ? 'active' : ''}
                onClick={() => setOrdem(o.key)}
              >
                {o.nome}
              </button>
            ))}
          </div>

          <div className="scope-switch">
            <button
              className={filter.scope === 'tudo' ? 'active' : ''}
              onClick={() => setFilter((f) => ({ ...f, scope: 'tudo' }))}
            >
              Tudo
            </button>
            <button
              className={filter.scope === 'pagina' ? 'active' : ''}
              onClick={() => setFilter((f) => ({ ...f, scope: 'pagina' }))}
              disabled={!activePageId}
            >
              Esta página
            </button>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={filter.showDone}
              onChange={(e) => setFilter((f) => ({ ...f, showDone: e.target.checked }))}
            />
            Concluídos
          </label>

          <button className="panel-close" onClick={onClose}>
            Voltar à folha
          </button>
        </div>
      </header>

      <div className="central-body">
        <nav className="central-rail">
          <RailButton
            label="Visão geral"
            glyph="▦"
            active={filter.view === 'geral'}
            onClick={() => setFilter((f) => ({ ...f, view: 'geral' }))}
          />
          {ORDER.map((kind) => (
            <RailButton
              key={kind}
              label={PLURAL[kind]}
              glyph={ITEM_GLYPH[kind]}
              color={ITEM_COLOR[kind]}
              count={resumo.byKind[kind]}
              active={filter.view === kind}
              onClick={() => setFilter((f) => ({ ...f, view: kind }))}
            />
          ))}
          {arquivados > 0 && (
            <RailButton
              label="Arquivados"
              glyph="␡"
              count={arquivados}
              active={filter.view === 'arquivados'}
              onClick={() => setFilter((f) => ({ ...f, view: 'arquivados' }))}
            />
          )}
        </nav>

        <section className="central-main">
          {filter.view === 'geral' && !filter.query && (
            <Overview
              resumo={resumo}
              onView={(view) => setFilter((f) => ({ ...f, view }))}
              onNotebook={(id) => setFilter((f) => ({ ...f, notebookId: id }))}
            />
          )}

          {lista.length === 0 ? (
            <Empty filter={filter} />
          ) : (
            <>
              <div className="central-listhead">
                {filter.view === 'geral'
                  ? filter.query
                    ? `${lista.length} resultado${lista.length === 1 ? '' : 's'}`
                    : 'Tudo em aberto'
                  : filter.view === 'arquivados'
                    ? 'Arquivados'
                    : PLURAL[filter.view]}
              </div>
              {faixas ? (
                faixas.map((faixa) => (
                  <div key={faixa.bucket} className={`faixa ${faixa.bucket}`}>
                    <h3 className="faixa-titulo">
                      {DUE_BUCKET_TITLE[faixa.bucket]}
                      <span>{faixa.items.length}</span>
                    </h3>
                    <div className="central-list">{faixa.items.map(linha)}</div>
                  </div>
                ))
              ) : (
                <div className="central-list">{lista.map(linha)}</div>
              )}
            </>
          )}
        </section>

        {/* A ficha do registro aberto. Fica ao lado da lista no tablet deitado e
            toma a tela inteira em pé — nos dois casos a lista atrás continua
            sendo a mesma, e fechar volta exatamente pro lugar onde se estava. */}
        {ficha && (
          <ItemPanel
            item={ficha}
            origin={origins.get(ficha.pageId)}
            onClose={() => setFichaId(null)}
            onText={(text) => void setItemText(ficha.id, text)}
            onKind={(kind) => void setItemKind(ficha.id, kind)}
            onStatus={(status) => void setItemStatus(ficha.id, status)}
            onFields={(patch) => void updateItemFields(ficha.id, patch)}
            onGo={() => abrir(ficha)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Trilho lateral ──────────────────────────────────────────────────────────

function RailButton({
  label,
  glyph,
  color,
  count,
  active,
  onClick,
}: {
  label: string
  glyph: string
  color?: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`rail-btn ${active ? 'active' : ''}`}
      style={color ? ({ '--rail': color } as React.CSSProperties) : undefined}
      onClick={onClick}
    >
      <span className="rail-glyph">{glyph}</span>
      <span className="rail-label">{label}</span>
      {count !== undefined && <span className="rail-count">{count}</span>}
    </button>
  )
}

// ─── Visão geral ─────────────────────────────────────────────────────────────

function Overview({
  resumo,
  onView,
  onNotebook,
}: {
  resumo: ReturnType<typeof summarize>
  onView: (view: CentralView) => void
  onNotebook: (id: string) => void
}) {
  return (
    <div className="overview">
      <div className="tiles">
        {ORDER.filter((kind) => resumo.byKind[kind] > 0).map((kind) => (
          <button
            key={kind}
            className="tile"
            style={{ '--tile': ITEM_COLOR[kind] } as React.CSSProperties}
            onClick={() => onView(kind)}
          >
            <span className="tile-count">{resumo.byKind[kind]}</span>
            <span className="tile-label">
              <span className="tile-glyph">{ITEM_GLYPH[kind]}</span>
              {PLURAL[kind]}
            </span>
          </button>
        ))}
      </div>

      {resumo.byNotebook.length > 1 && (
        <div className="overview-block">
          <h2>Por caderno</h2>
          <div className="notebook-bars">
            {resumo.byNotebook.map((linha) => (
              <button key={linha.id} className="notebook-bar" onClick={() => onNotebook(linha.id)}>
                <span className="bar-name">{linha.name}</span>
                <span
                  className="bar-fill"
                  style={{
                    width: `${Math.round((linha.open / Math.max(1, resumo.byNotebook[0].open)) * 100)}%`,
                  }}
                />
                <span className="bar-count">{linha.open}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {resumo.semTexto > 0 && (
        <p className="overview-note">
          {resumo.semTexto === 1
            ? '1 item ainda sem texto.'
            : `${resumo.semTexto} itens ainda sem texto.`}{' '}
          No aplicativo instalado a letra é lida sozinha; em qualquer lugar, segure o dedo sobre a
          linha na folha pra escrever o texto.
        </p>
      )}
    </div>
  )
}

// ─── Linha da lista ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  origin,
  onToggle,
  onKind,
  onArchive,
  onRestore,
  onOpen,
}: {
  item: Item
  origin: Origin | undefined
  onToggle: () => void
  onKind: (kind: ItemKind) => void
  onArchive: () => void
  onRestore: () => void
  onOpen: () => void
}) {
  const arquivado = item.status === 'arquivado'
  const faixa = item.dueAt != null ? dueBucket(item) : null

  return (
    <article className={`central-row ${item.status === 'concluido' ? 'done' : ''}`}>
      {arquivado ? (
        <button className="row-check restore" onClick={onRestore} aria-label="Devolver à Central">
          ↩
        </button>
      ) : (
        <button
          className="row-check"
          style={{ borderColor: ITEM_COLOR[item.kind] }}
          onClick={onToggle}
          aria-label="Alternar concluído"
        >
          {item.status === 'concluido' ? '✓' : ''}
        </button>
      )}

      {/* Clicar no texto abre a FICHA do registro, não a folha. Foi o pedido em
          uma frase: "assim eu me organizo sem precisar voltar nas anotações" —
          voltar à folha continua existindo, mas dentro da ficha, num botão. */}
      <button className="row-main" onClick={onOpen}>
        <span className={`row-text ${item.title ? '' : 'sem-texto'}`}>
          {item.title || 'sem texto ainda'}
        </span>
        <span className="row-meta">
          {/* Prazo e prioridade aparecem na linha pra não obrigar a abrir cada
              ficha só pra saber o que corre. */}
          {faixa && (
            <span className={`chip prazo ${faixa}`}>
              {faixa === 'atrasado' ? '⚠ ' : ''}
              {rotuloPrazo(item.dueAt!)}
            </span>
          )}
          {item.priority && (
            <span className={`chip prio ${item.priority}`}>{PRIO_LABEL[item.priority]}</span>
          )}
          {item.assignee && <span className="chip quem">{item.assignee}</span>}
          <span className="row-origin">
            {origin ? `${origin.notebook} › ${origin.section} › ${origin.page}` : 'página apagada'}
          </span>
        </span>
      </button>

      {/* A letra fica junto: é ela que faz reconhecer a anotação quando a
          transcrição sai errada ou ainda não saiu. */}
      <div className="row-thumb">
        <InkThumbnail itemId={item.id} bounds={item.bounds} />
      </div>

      <select
        className="row-kind"
        value={item.kind}
        onChange={(e) => onKind(e.target.value as ItemKind)}
        style={{ color: ITEM_COLOR[item.kind] }}
        aria-label="Tipo"
      >
        {ORDER.map((kind) => (
          <option key={kind} value={kind}>
            {ITEM_GLYPH[kind]} {SINGULAR[kind]}
          </option>
        ))}
      </select>

      {!arquivado && (
        <button
          className="row-archive"
          onClick={onArchive}
          title="Não era item: tira da Central sem apagar a anotação"
        >
          ✕
        </button>
      )}
    </article>
  )
}

// ─── Vazio ───────────────────────────────────────────────────────────────────

function Empty({ filter }: { filter: CentralFilter }) {
  if (filter.query) {
    return (
      <div className="panel-empty">
        <p>Nada encontrado para "{filter.query}".</p>
        <p className="muted">
          A busca olha o texto transcrito e o caminho (caderno, seção, página). Linha ainda sem
          texto não é encontrada pela busca.
        </p>
      </div>
    )
  }

  return (
    <div className="panel-empty">
      <p>
        {filter.view === 'arquivados'
          ? 'Nada arquivado.'
          : filter.view === 'geral'
            ? 'Nada em aberto.'
            : `Nenhum item em ${PLURAL[filter.view].toLowerCase()}.`}
      </p>
      <p className="muted">
        Escreva dentro de uma faixa da folha — <strong>Pauta</strong>, <strong>Tarefas</strong>,{' '}
        <strong>Dúvidas</strong>, <strong>Pendências</strong> — e cada linha chega aqui sozinha. Ou
        pegue o <strong>laço</strong>, cerque uma anotação e escolha o carimbo.
      </p>
    </div>
  )
}

/** Caminho de cada página: caderno › seção › página, resolvido uma vez só. */
function buildOrigins(
  notebooks: Notebook[],
  sections: Section[],
  pages: Page[],
): Map<string, Origin> {
  const secoes = new Map(sections.map((s) => [s.id, s]))
  const cadernos = new Map(notebooks.map((n) => [n.id, n]))

  const out = new Map<string, Origin>()
  for (const page of pages) {
    const section = secoes.get(page.sectionId)
    const notebook = section ? cadernos.get(section.notebookId) : undefined
    out.set(page.id, {
      notebookId: notebook?.id ?? section?.notebookId ?? '',
      notebook: notebook?.name ?? 'Caderno',
      section: section?.name ?? 'Seção',
      page: page.title,
    })
  }
  return out
}
