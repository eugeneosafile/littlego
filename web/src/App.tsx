import { useEffect, useState } from 'react'
import { api, setToken, type User } from './api'
import { Shield } from './components/Shared'
import Login from './views/Login'
import OpsView from './views/OpsView'
import SchoolView from './views/SchoolView'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (!user) return <Login onIn={setUser} />

  return (
    <>
      <header className="topbar no-print">
        <div className="brand"><Shield /> WardRide {user.role === 'ops' ? 'Ops Centre' : 'for Schools'}</div>
        <div className="row">
          <span className="muted-light">{user.name}</span>
          <button className="btn ghost" onClick={() => { setToken(null); setUser(null) }}>Sign out</button>
        </div>
      </header>
      <main className="page">{user.role === 'ops' ? <OpsView /> : <SchoolView />}</main>
    </>
  )
}
