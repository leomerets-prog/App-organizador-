import { useState } from 'react'
import type { Item, ItemKind, Priority } from '../domain/types'
import { ITEM_COLOR, ITEM_GLYPH } from '../ink/renderer'
import { InkThumbnail } from './InkThumbnail'
import type { Origin } from '../items/central'

/**
 * A ficha de um registro.
 *
 * Pedido em uma frase: *"eu entro na central, uma tarefa, consigo colocar data
 * etc — assim eu me organizo sem precisar voltar nas anotações"*. É isso que
 * esta tela é: o que a letra não disse (quando vence, o que corre, com quem,
 * qualquer observação) escrito aqui, uma vez, e a lista se organiza sozinha.
 *
 * A letra continua à vista no meio da ficha, porque é ela que dá a certeza de
 * que se está mexendo no registro certo.
 */

const KIND_LABEL: Record<ItemKind, string> = {
  tarefa: 'Ação',
  pauta: 'Pauta',
  pendencia: 'Pendência',
  duvida: 'Dúvida',
  topico: 'Tópico',
  documento: 'Documento',
  importante: 'Importante',
  nota: 'Anotação',
}

const KINDS = Object.keys(KIND_LABEL) as ItemKind[]

const PRIORIDADES: { valor: Priority; nome: string; cor: string }[] = [
  { valor: 'alta', nome: 'Alta', cor: '#ef4444' },
  { valor: 'media', nome: 'Média', cor: '#f59e0b' },
  { valor: 'baixa', nome: 'Baixa', cor: '#22c55e' },
]

const DIA = 24 * 60 * 60 * 1000

export function ItemPanel({
  item,
  origin,
  onClose,
  onText,
  onKind,
  onStatus,
  onFields,
  onGo,
}: {
  item: Item
  origin: Origin | undefined
  onClose: () => void
  onText: (text: string) => void
  onKind: (kind: ItemKind) => void
  onStatus: (status: Item['status']) => void
  onFields: (patch: Partial<Pick<Item, 'dueAt' | 'priority' | 'assignee' | 'note'>>) => void
  onGo: () => void
}) {
  const [texto, setTexto] = useState(item.title)
  const [quem, setQuem] = useState(item.assignee ?? '')
  const [obs, setObs] = useState(item.note ?? '')

  const prazo = item.dueAt ?? null

  return (
    <aside className="ficha" role="dialog" aria-label="Ficha do registro">
      <header className="ficha-topo">
        <select
          className="ficha-kind"
          value={item.kind}
          onChange={(e) => onKind(e.target.value as ItemKind)}
          style={{ color: ITEM_COLOR[item.kind] }}
          aria-label="Tipo"
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ITEM_GLYPH[kind]} {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
        <button className="ficha-fechar" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </header>

      <div className="ficha-corpo">
        {/* O texto é editável aqui: corrigir a transcrição no lugar onde ela
            atrapalha é melhor que ter que voltar à folha pra isso. */}
        <label className="ficha-campo">
          <span>Texto</span>
          <textarea
            className="ficha-texto"
            rows={2}
            value={texto}
            placeholder="O que está escrito aqui"
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              if (texto.trim() !== item.title) onText(texto)
            }}
          />
        </label>

        <div className="ficha-letra">
          <InkThumbnail itemId={item.id} bounds={item.bounds} />
        </div>

        <div className="ficha-campo">
          <span>Prazo</span>
          <div className="ficha-prazo">
            <input
              type="date"
              value={prazo ? paraCampo(prazo) : ''}
              onChange={(e) => onFields({ dueAt: doCampo(e.target.value) })}
              aria-label="Data do prazo"
            />
            <div className="ficha-atalhos">
              <button onClick={() => onFields({ dueAt: inicioDoDia(Date.now()) })}>Hoje</button>
              <button onClick={() => onFields({ dueAt: inicioDoDia(Date.now() + DIA) })}>
                Amanhã
              </button>
              <button onClick={() => onFields({ dueAt: inicioDoDia(Date.now() + 7 * DIA) })}>
                7 dias
              </button>
              {prazo != null && <button onClick={() => onFields({ dueAt: null })}>Tirar</button>}
            </div>
          </div>
        </div>

        <div className="ficha-campo">
          <span>Prioridade</span>
          <div className="ficha-prioridade">
            {PRIORIDADES.map((p) => (
              <button
                key={p.valor}
                className={item.priority === p.valor ? 'active' : ''}
                style={{ '--p': p.cor } as React.CSSProperties}
                // Tocar de novo na que já está marcada tira a prioridade: sem
                // isso, escolher errado vira um estado do qual não se sai.
                onClick={() =>
                  onFields({ priority: item.priority === p.valor ? null : p.valor })
                }
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>

        <label className="ficha-campo">
          <span>Com quem</span>
          <input
            value={quem}
            placeholder="Nome de quem resolve"
            onChange={(e) => setQuem(e.target.value)}
            onBlur={() => {
              if (quem !== (item.assignee ?? '')) onFields({ assignee: quem.trim() })
            }}
          />
        </label>

        <label className="ficha-campo">
          <span>Observação</span>
          <textarea
            rows={3}
            value={obs}
            placeholder="O que a letra não disse"
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              if (obs !== (item.note ?? '')) onFields({ note: obs })
            }}
          />
        </label>

        <div className="ficha-origem">
          {origin ? `${origin.notebook} › ${origin.section} › ${origin.page}` : 'página apagada'}
          <button onClick={onGo}>Abrir a folha</button>
        </div>
      </div>

      <footer className="ficha-rodape">
        {item.status === 'concluido' ? (
          <button className="ficha-acao" onClick={() => onStatus('aberto')}>
            Reabrir
          </button>
        ) : (
          <button className="ficha-acao feito" onClick={() => onStatus('concluido')}>
            ✓ Concluir
          </button>
        )}
        {item.status === 'arquivado' ? (
          <button className="ficha-acao" onClick={() => onStatus('aberto')}>
            Devolver
          </button>
        ) : (
          <button className="ficha-acao" onClick={() => onStatus('arquivado')}>
            Arquivar
          </button>
        )}
      </footer>
    </aside>
  )
}

/**
 * Datas vão e voltam pelo fuso LOCAL, sempre.
 *
 * `new Date('2026-09-30')` é lido como UTC e, no Brasil, volta como dia 29 —
 * um prazo que anda um dia pra trás sozinho destrói a confiança na lista
 * inteira. Por isso a conversão é feita a dedo, campo a campo.
 */
function paraCampo(instante: number): string {
  const d = new Date(instante)
  const mes = `${d.getMonth() + 1}`.padStart(2, '0')
  const dia = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function doCampo(valor: string): number | null {
  if (!valor) return null
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (!ano || !mes || !dia) return null
  return new Date(ano, mes - 1, dia).getTime()
}

function inicioDoDia(instante: number): number {
  const d = new Date(instante)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
