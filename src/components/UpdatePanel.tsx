import { useEffect, useRef, useState } from 'react'
import {
  INSTALLED_VERSION,
  RELEASES_PAGE,
  checkForUpdate,
  openReleasesPage,
} from '../update/updates'
import type { UpdateCheck } from '../update/updates'

/**
 * Tela de versão e atualização.
 *
 * Só abre quando o usuário pede: um app de anotação não deve interromper a
 * escrita para falar de si mesmo.
 */
export function UpdatePanel({ onClose }: { onClose: () => void }) {
  const [checando, setChecando] = useState(false)
  const [resultado, setResultado] = useState<UpdateCheck | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const verificar = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setChecando(true)
    setResultado(await checkForUpdate(controller.signal))
    setChecando(false)
  }

  return (
    <div className="update-backdrop" onClick={onClose}>
      <div className="update-card" onClick={(e) => e.stopPropagation()}>
        <h2>Organizador</h2>
        <p className="update-version">
          Versão instalada: <strong>{INSTALLED_VERSION}</strong>
        </p>

        {resultado && <Resultado resultado={resultado} />}

        <div className="update-actions">
          <button className="update-secondary" onClick={() => void verificar()} disabled={checando}>
            {checando ? 'Verificando…' : 'Verificar atualização'}
          </button>
          <button className="update-primary" onClick={openReleasesPage}>
            Abrir página de versões
          </button>
        </div>

        <p className="update-note">
          A página abre no navegador, onde você baixa o <code>Organizador.apk</code> e toca no
          arquivo para instalar. <strong>Suas anotações são preservadas.</strong>
        </p>

        <p className="update-link">{RELEASES_PAGE}</p>

        <button className="update-close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function Resultado({ resultado }: { resultado: UpdateCheck }) {
  switch (resultado.estado) {
    case 'disponivel':
      return (
        <p className="update-status novo">
          Versão <strong>{resultado.versao}</strong> disponível — a sua é a {INSTALLED_VERSION}.
        </p>
      )
    case 'atualizado':
      return <p className="update-status ok">Você já está na versão mais recente.</p>
    case 'sem-internet':
      return <p className="update-status">Sem internet agora. O app funciona offline normalmente.</p>
    case 'sem-acesso':
      // O caso comum: repositório privado. Dizer isso claramente evita que
      // pareça defeito, e aponta pro caminho que funciona.
      return (
        <p className="update-status">
          Não dá para verificar automaticamente porque o repositório é privado. Use o botão abaixo:
          a página mostra a versão mais recente.
        </p>
      )
    default:
      return <p className="update-status">Não consegui verificar agora.</p>
  }
}
