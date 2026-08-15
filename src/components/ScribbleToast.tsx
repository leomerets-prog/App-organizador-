import { useEffect, useState } from 'react'

/**
 * Confirmação de que o rabisco foi reconhecido.
 *
 * Sem isso o gesto ligaria a borracha em silêncio e o próximo traço sumiria
 * sem explicação. O aviso some sozinho; quem fica na tela avisando que a
 * borracha está ligada é a faixa fixa, não este aviso.
 */
export function ScribbleToast({ trigger }: { trigger: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (trigger === 0) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 1800)
    return () => clearTimeout(timer)
  }, [trigger])

  if (!visible) return null

  return (
    <div className="scribble-toast" role="status">
      <span className="scribble-toast-icon">⌫</span>
      Rabisco reconhecido — borracha ligada
    </div>
  )
}
