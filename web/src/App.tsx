import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  api, ApiError, post, setToken,
  type AlertEvent, type ChildStatus, type QueueItem, type Summary, type Trip, type User,
} from './api'

const STATUS_LABEL: Record<ChildStatus, string> = {
  scheduled: 'Waiting', released: 'Released', on_board: 'On board',
  handed_over: 'Handed over', at_safe_hub: 'At safe hub', absent: 'Absent',
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''

function usePoll(fn: () => Promise<void>, ms = 10_000) {
  useEffect(() => {
    fn()
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  }, [fn, ms])
}

// ---------------- Login ----------------
function Login({ onIn }: { onIn: (u: User) => void }) {
  const [phone, setPhone] = useState('08030000001')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const r = await post<{ access_token: string; user: User }>('/auth/login', { phone, password })
      if (r.user.role !== 'school_admin' && r.user.role !== 'ops') {
        setError('This dashboard is for school staff and the ops centre. Parents and crew use the mobile app.')
        return
      }
      setToken(r.access_token)
      onIn(r.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server')
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card login-card">
        <div className="brand"><Shield /> WardRide for Schools</div>
        <label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit">Sign in</button>
        <p className="hint">Demo: school 08030000001, ops 08030000002, password wardride123</p>
      </form>
    </main>
  )
}

// ---------------- Shared pieces ----------------
function Shield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  )
}

function Alerts({ items, onResolve }: { items: AlertEvent[]; onResolve: (id: number) => void }) {
  const open = items.filter(a => !a.resolved)
  return (
    <section className="card">
      <h2>Alerts <span className="count">{open.length} open</span></h2>
      {open.length === 0 && <p className="muted">No open alerts.</p>}
      <ul className="alerts">
        {open.map(a => (
          <li key={a.id} className={`alert ${a.severity}`}>
            <div>
              <div className="alert-title">{a.kind.replaceAll('_', ' ')} · {time(a.created_at)}</div>
              <div>{a.message}</div>
            </div>
            <button className="btn small" onClick={() => onResolve(a.id)}>Resolve</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Fleet({ trips }: { trips: Trip[] }) {
  return (
    <section className="card">
      <h2>Fleet today</h2>
      <div className="fleet">
        {trips.map(t => {
          const onBoard = t.children.filter(c => c.status === 'on_board').length
          const camsOk = t.vehicle.cameras_online === t.vehicle.camera_count
          return (
            <div key={t.id} className="vehicle">
              <div className="row between">
                <strong>{t.vehicle.code} · {t.vehicle.kind}</strong>
                <span className={`pill ${t.status}`}>{t.status.replace('_', ' ')}</span>
              </div>
              <div className="muted">{t.driver.name} (driver) and {t.escort.name} (escort)</div>
              <div className="muted">{onBoard} of {t.children.length} on board · last update {time(t.last_ping_at) || 'none'}</div>
              <div className={camsOk ? 'muted' : 'warn-text'}>Cameras {t.vehicle.cameras_online}/{t.vehicle.camera_count} online</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------- School view ----------------
function SchoolView() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [card, setCard] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [q, t, a, s] = await Promise.all([
      api<QueueItem[]>('/school/queue'), api<Trip[]>('/school/trips'),
      api<AlertEvent[]>('/school/alerts'), api<Summary>('/school/summary'),
    ])
    setQueue(q); setTrips(t); setAlerts(a); setSummary(s)
  }, [])
  usePoll(load)

  async function release(cardUid: string) {
    try {
      const tc = await post<{ child: { name: string } }>('/school/release', { card_uid: cardUid })
      setMsg({ ok: true, text: `${tc.child.name} released. Hand over to the escort.` })
      setCard('')
      load()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Release failed' })
    }
  }

  async function resolve(id: number) {
    await post(`/school/alerts/${id}/resolve`)
    load()
  }

  return (
    <>
      {summary && (
        <div className="tiles">
          <Tile label="Booked today" value={summary.booked_today} />
          <Tile label="Waiting at school" value={summary.waiting} />
          <Tile label="On board" value={summary.on_board + summary.released} accent />
          <Tile label="Handed over" value={summary.handed_over} />
          <Tile label="Open alerts" value={summary.open_alerts} warn={summary.open_alerts > 0} />
        </div>
      )}
      <div className="split">
        <section className="card grow">
          <h2>Release queue</h2>
          <form className="scan" onSubmit={e => { e.preventDefault(); if (card) release(card) }}>
            <label className="sr-only" htmlFor="card">Child card ID</label>
            <input id="card" placeholder="Scan or type the child's card ID" value={card} onChange={e => setCard(e.target.value)} />
            <button className="btn primary" type="submit">Scan and release</button>
          </form>
          {msg && <p className={msg.ok ? 'ok-text' : 'error'} role="status">{msg.text}</p>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Child</th><th>Class</th><th>Vehicle</th><th>Status</th><th>Time</th><th /></tr></thead>
              <tbody>
                {queue.map(q => (
                  <tr key={q.trip_child.id}>
                    <td><strong>{q.trip_child.child.name}</strong></td>
                    <td>{q.trip_child.child.class_name}</td>
                    <td>{q.vehicle_code}</td>
                    <td><span className={`pill ${q.trip_child.status}`}>{STATUS_LABEL[q.trip_child.status]}</span></td>
                    <td className="muted">{time(q.trip_child.handed_over_at ?? q.trip_child.boarded_at ?? q.trip_child.released_at)}</td>
                    <td className="right">
                      {q.trip_child.status === 'scheduled' &&
                        <button className="btn small primary" onClick={() => release(q.card_uid)}>Release</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="side"><Alerts items={alerts} onResolve={resolve} /></aside>
      </div>
      <Fleet trips={trips} />
    </>
  )
}

// ---------------- Ops view ----------------
function OpsView() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const load = useCallback(async () => {
    const [t, a] = await Promise.all([api<Trip[]>('/ops/trips/today'), api<AlertEvent[]>('/ops/alerts')])
    setTrips(t); setAlerts(a)
  }, [])
  usePoll(load, 5_000)
  return (
    <>
      <Alerts items={alerts} onResolve={async id => { await post(`/ops/alerts/${id}/resolve`); load() }} />
      <Fleet trips={trips} />
    </>
  )
}

function Tile({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`card tile ${accent ? 'accent' : ''} ${warn ? 'warn' : ''}`}>
      <div className="muted">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  )
}

// ---------------- App shell ----------------
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
      <header className="topbar">
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
