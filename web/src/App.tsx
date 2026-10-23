import { useEffect, useState } from 'react'
import { api, setToken, type User } from './api'
import { Icon, Wordmark } from './components/Shared'
import Login from './views/Login'
import OpsView, { OPS_NAV, type OpsTab } from './views/OpsView'
import SchoolView from './views/SchoolView'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState<OpsTab>('Live')

  useEffect(() => {
    api<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (!user) return <Login onIn={setUser} />

  const ops = user.role === 'ops'
  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="sidebar-brand">
          <Wordmark reversed size={21} />
          <span className="sidebar-role">{ops ? 'Ops centre' : 'For schools'}</span>
        </div>
        <nav className="sidebar-nav" aria-label="Sections">
          {ops ? OPS_NAV.map(n => (
            <button key={n.tab} className={tab === n.tab ? 'on' : ''} aria-current={tab === n.tab ? 'page' : undefined} onClick={() => setTab(n.tab)}>
              <Icon name={n.icon} /> <span>{n.tab}</span>
            </button>
          )) : (
            <button className="on" aria-current="page"><Icon name="gate" /> <span>Today at the gate</span></button>
          )}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials}</span>
          <div className="sidebar-user-name">
            <strong>{user.name}</strong>
            <span>{ops ? 'Operations' : 'School staff'}</span>
          </div>
          <button className="icon-btn" onClick={() => { setToken(null); setUser(null) }} aria-label="Sign out" title="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="page">{ops ? <OpsView tab={tab} /> : <SchoolView />}</main>
    </div>
  )
}
