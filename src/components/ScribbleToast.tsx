import { useEffect } from 'react'

/**
 * Aviso rápido de que o rabisco apagou.
 *
 * Sem isso o traço some e fica a dúvida: foi o gesto ou foi bug? O aviso é a
 * confirmação de que o app entendeu o gesto — e some sozinho.
 */
export function ScribbleToast({ count, onDone }: { count: number; onDone: () => void }) {
  useEffect(() => {
    if (count === 0) return
    const timer = setTimeout(onDone, 1600)
    return () => clearTimeout(timer)
  }, [count, onDone])

  if (count === 0) return null

  return (
    <div className="scribble-toast" role="status">
      <span className="scribble-toast-icon">✎</span>
      {count === 1 ? 'Rabisco apagou 1 traço' : `Rabisco apagou ${count} traços`}
    </div>
  )
}
