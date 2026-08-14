import { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { Sidebar } from './components/Sidebar'
import { SectionBar } from './components/SectionBar'
import { PageCanvas } from './components/PageCanvas'
import { Toolbar } from './components/Toolbar'
import { AudioBar } from './components/AudioBar'
import { Panel } from './components/Panel'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const [panelOpen, setPanelOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(true)

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
      <Sidebar onOpenPanel={() => setPanelOpen(true)} />

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

      {panelOpen && <Panel onClose={() => setPanelOpen(false)} />}
    </div>
  )
}
