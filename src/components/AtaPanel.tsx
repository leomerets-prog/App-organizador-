import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { ataEmTexto, montarAta } from '../ata/ata'
import type { Ata, LinhaDaAta, TopicoDaAta } from '../ata/ata'
import { salvarTexto } from '../audio/export'

/**
 * A ATA DA REUNIÃO — a folha aberta, escrita como ata.
 *
 * Pedido dele: *"faz a ata separando os tópicos"*. A ata é uma VISTA, não um
 * documento à parte: ela é montada na hora, de tudo que está na folha
 * (`ata/ata.ts`). Corrigir o nome de uma marca, a ficha de uma tarefa ou a
 * fala de um tópico corrige a ata — não existe uma cópia velha esperando pra
 * ser reconciliada.
 *
 * Os tópicos vêm das marcas ⚑ da gravação e das zonas da folha. O app não
 * adivinha assunto, e a tela diz isso no lugar certo: quando falta marca, nome
 * ou leitura, o aviso no topo diz o que tocar pra completar.
 *
 * A única coisa que se escreve AQUI é quem estava na reunião, que não tem
 * outro lugar no app pra morar. E a fala de cada tópico pode ser corrigida
 * aqui mesmo — é lendo a ata que se percebe a palavra trocada.
 */
export function AtaPanel({ onClose }: { onClose: () => void }) {
  const activePageId = useStore((s) => s.activePageId)
  const pages = useStore((s) => s.pages)
  const items = useStore((s) => s.items)
  const recordings = useStore((s) => s.recordings)
  const flowcharts = useStore((s) => s.flowcharts)
  const setParticipantes = useStore((s) => s.setParticipantes)
  const corrigirTrechos = useStore((s) => s.corrigirTrechos)

  const pagina = pages.find((p) => p.id === activePageId)

  const ata: Ata | null = useMemo(
    () =>
      pagina
        ? montarAta({
            pagina,
            itens: items,
            gravacoes: recordings,
            fluxogramas: flowcharts,
            participantes: pagina.participantes,
          })
        : null,
    [pagina, items, recordings, flowcharts],
  )

  const [feito, setFeito] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** O tópico cuja fala está sendo corrigida aqui, e o texto em edição. */
  const [editando, setEditando] = useState<{ chave: string; texto: string } | null>(null)

  if (!pagina || !ata) {
    return (
      <div className="ata">
        <header className="ata-topo">
          <h1>Ata</h1>
          <button className="panel-close" onClick={onClose}>
            Fechar
          </button>
        </header>
        <p className="panel-empty">Abra uma folha pra montar a ata dela.</p>
      </div>
    )
  }

  const texto = () => ataEmTexto(ata)
  const nomeDoArquivo = `Ata ${ata.titulo} ${ata.data}`

  const copiar = async () => {
    setErro(null)
    setFeito(null)
    try {
      await copiarTexto(texto())
      setFeito('Ata copiada — é só colar no WhatsApp ou no e-mail.')
    } catch {
      setErro('Não consegui copiar. Use "Salvar" e mande o arquivo.')
    }
  }

  const salvar = async () => {
    setErro(null)
    setFeito(null)
    try {
      const { onde } = await salvarTexto(texto(), nomeDoArquivo)
      setFeito(`Ata salva — ${onde}.`)
    } catch (err) {
      setErro(err instanceof Error && err.message ? `Não deu pra salvar: ${err.message}` : 'Não deu pra salvar.')
    }
  }

  /** Grava a fala corrigida de UM tópico, sem mexer na dos outros. */
  const guardarFala = (t: TopicoDaAta, novo: string) => {
    const rec = recordings.find((r) => r.id === t.gravacaoId)
    const trechos = rec?.transcricao?.trechos
    if (!rec || !trechos || t.indiceDoTrecho === undefined) return
    const textos = trechos.map((x) => x.texto)
    textos[t.indiceDoTrecho] = novo
    void corrigirTrechos(rec.id, textos)
  }

  const vazia =
    ata.pauta.length +
      ata.topicos.length +
      ata.outrosTopicos.length +
      ata.destaques.length +
      ata.anotacoes.length +
      ata.acoes.length +
      ata.pendencias.length +
      ata.duvidas.length +
      ata.documentos.length ===
      0 && !ata.registroCorrido

  return (
    <div className="ata">
      <header className="ata-topo">
        <div className="ata-topo-titulo">
          <h1>Ata</h1>
          <p className="muted">montada do que está nesta folha</p>
        </div>
        <div className="ata-acoes">
          <button className="ata-botao" onClick={() => void copiar()}>
            ⧉ Copiar
          </button>
          <button className="ata-botao" onClick={() => void salvar()}>
            ⤓ Salvar
          </button>
          <button className="panel-close" onClick={onClose}>
            Fechar
          </button>
        </div>
      </header>

      <div className="ata-rolagem">
        <article className="ata-folha">
          {(feito || erro) && (
            <div className={erro ? 'ata-aviso ruim' : 'ata-aviso bom'}>{erro ?? feito}</div>
          )}

          {/* O que falta pra ata ficar completa — dito de um jeito que dá pra
              fazer alguma coisa. É aqui que fica claro que o app não
              inventa: tópico sem marca não aparece, linha sem leitura também
              não. */}
          {ata.avisos.length > 0 && (
            <ul className="ata-pendente">
              {ata.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <p className="ata-rotulo">Ata de reunião</p>
          <h2 className="ata-titulo">{ata.titulo}</h2>
          <p className="ata-cabecalho">
            Data: {ata.data}
            {ata.inicio && ` · Início: ${ata.inicio}`}
            {ata.duracao && ` · Gravado: ${ata.duracao}`}
          </p>

          <label className="ata-participantes">
            <span>Participantes</span>
            <input
              type="text"
              value={pagina.participantes ?? ''}
              placeholder="Quem estava — separe com vírgula"
              onChange={(e) => void setParticipantes(pagina.id, e.target.value)}
            />
          </label>

          {vazia && (
            <p className="ata-vazia">
              Esta folha ainda não tem nada pra ata. Escreva nas zonas da folha (Pauta, Tarefas,
              Pendências…) e, durante a reunião, toque em <strong>⚑ Marcar</strong> na gravação a
              cada assunto novo — cada marca vira um tópico.
            </p>
          )}

          <Secao titulo="Pauta" linhas={ata.pauta} />

          {ata.topicos.length > 0 && (
            <section className="ata-secao">
              <h3>Tópicos discutidos</h3>
              <ol className="ata-topicos">
                {ata.topicos.map((t, i) => {
                  const chave = `${t.gravacaoId}:${t.marcaId ?? t.indiceDoTrecho ?? i}`
                  const aberto = editando?.chave === chave
                  return (
                    <li key={chave} className="ata-topico">
                      <div className="ata-topico-cabeca">
                        <span className="ata-hora">{t.hora}</span>
                        <strong className={t.temNome ? '' : 'sem-nome'}>{t.titulo}</strong>
                        <span className="ata-na-gravacao">na gravação: {t.naGravacao}</span>
                        {t.indiceDoTrecho !== undefined && !aberto && (
                          <button
                            className="ata-corrigir"
                            onClick={() => setEditando({ chave, texto: t.fala ?? '' })}
                            title="Corrigir a fala deste tópico"
                          >
                            ✎ Corrigir
                          </button>
                        )}
                      </div>

                      {aberto ? (
                        <div className="ata-editor">
                          <textarea
                            value={editando.texto}
                            onChange={(e) => setEditando({ chave, texto: e.target.value })}
                            rows={Math.min(10, Math.max(3, Math.ceil(editando.texto.length / 70)))}
                            aria-label={`Fala do tópico ${t.titulo}`}
                          />
                          <div className="ata-editor-botoes">
                            <button
                              className="ata-botao"
                              onClick={() => {
                                guardarFala(t, editando.texto)
                                setEditando(null)
                              }}
                            >
                              ✓ Guardar
                            </button>
                            <button className="ata-botao leve" onClick={() => setEditando(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : t.fala === undefined ? null : (
                        <p className={t.fala ? 'ata-fala' : 'ata-fala vazia'}>
                          {t.fala || 'Nada foi entendido neste trecho da gravação.'}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          <Secao titulo="Outros tópicos anotados" linhas={ata.outrosTopicos} />
          <Secao titulo="Pontos importantes" linhas={ata.destaques} />
          <Secao titulo="Anotações" linhas={ata.anotacoes} />

          {ata.acoes.length > 0 && (
            <section className="ata-secao">
              <h3>Encaminhamentos</h3>
              <ul className="ata-acoes-lista">
                {ata.acoes.map((a) => (
                  <li key={a.itemId} className={a.concluida ? 'feita' : ''}>
                    <span className="ata-acao-texto">
                      {a.texto}
                      {a.concluida && <em> (concluído)</em>}
                    </span>
                    <span className="ata-acao-ficha">
                      {a.responsavel ? (
                        <span>Responsável: {a.responsavel}</span>
                      ) : (
                        <span className="falta">sem responsável</span>
                      )}
                      {a.prazo ? <span>Prazo: {a.prazo}</span> : <span className="falta">sem prazo</span>}
                      {a.prioridade && <span>prioridade {a.prioridade}</span>}
                    </span>
                    {a.observacao && <span className="ata-obs">{a.observacao}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Secao titulo="Pendências" linhas={ata.pendencias} />
          <Secao titulo="Dúvidas" linhas={ata.duvidas} />
          <Secao titulo="Documentos citados" linhas={ata.documentos} />

          {ata.fluxogramas.length > 0 && (
            <section className="ata-secao">
              <h3>Fluxogramas (em anexo)</h3>
              <ul>
                {ata.fluxogramas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          {ata.registroCorrido && (
            <section className="ata-secao">
              <h3>Registro da conversa</h3>
              <p className="ata-fala">{ata.registroCorrido}</p>
            </section>
          )}

          {ata.falaRascunho && (
            <p className="ata-rodape">A fala foi transcrita automaticamente e pode conter erros.</p>
          )}
        </article>
      </div>
    </div>
  )
}

function Secao({ titulo, linhas }: { titulo: string; linhas: LinhaDaAta[] }) {
  if (linhas.length === 0) return null
  return (
    <section className="ata-secao">
      <h3>{titulo}</h3>
      <ul>
        {linhas.map((l) => (
          <li key={l.itemId} className={l.concluida ? 'feita' : ''}>
            {l.texto}
            {l.concluida && <em> (concluído)</em>}
            {l.observacao && <span className="ata-obs">{l.observacao}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Copiar pra área de transferência.
 *
 * `navigator.clipboard` é o caminho moderno, mas a WebView do Android pode
 * recusar sem gesto ou sem permissão. O caminho antigo (selecionar um campo
 * escondido e mandar copiar) ainda funciona onde o novo não funciona — e uma
 * ata que não copia é uma ata que ele tem que redigitar.
 */
async function copiarTexto(texto: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return
    }
  } catch {
    // Cai no caminho antigo abaixo.
  }
  const campo = document.createElement('textarea')
  campo.value = texto
  campo.setAttribute('readonly', '')
  campo.style.position = 'fixed'
  campo.style.opacity = '0'
  document.body.appendChild(campo)
  campo.select()
  const ok = document.execCommand('copy')
  campo.remove()
  if (!ok) throw new Error('copiar recusado')
}
