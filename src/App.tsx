import { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { Sidebar } from './components/Sidebar'
import { SectionBar } from './components/SectionBar'
import { PageCanvas } from './components/PageCanvas'
import { Toolbar } from './components/Toolbar'
import { AudioBar } from './components/AudioBar'
import { Central } from './components/Central'
import { UpdatePanel } from './components/UpdatePanel'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const [panelOpen, setPanelOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  // Em tela estreita a lateral vira sobreposição e cobre a folha; começa
  // fechada pra que o tablet em pé abra já mostrando a página.
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 820)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-mark">O</div>
        <p>Abrindo seus cadernos…</p>
      </div>
    )
  }

  return (
    <div className={`app ${navOpen ? '' : 'nav-hidden'}`}>
      <Sidebar onOpenPanel={() => setPanelOpen(true)} onOpenUpdate={() => setUpdateOpen(true)} />

      <main className="main">
        <div className="topbar">
          <button
            className="nav-toggle"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Mostrar ou esconder a navegação"
          >
            ☰
          </button>
          <SectionBar />
          <AudioBar />
        </div>

        <div className="workspace">
          <PageCanvas />
          <Toolbar />
        </div>
      </main>

      {/* Toque fora fecha a lateral sobreposta — em tela estreita ela cobre o
          próprio botão ☰, e sem isto não haveria como fechá-la. */}
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      {panelOpen && <Central onClose={() => setPanelOpen(false)} />}
      {updateOpen && <UpdatePanel onClose={() => setUpdateOpen(false)} />}
    </div>
  )
}
