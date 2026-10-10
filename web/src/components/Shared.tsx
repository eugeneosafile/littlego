import type { ReactNode } from 'react'
import { time, type AlertEvent, type Trip } from '../api'

export function Shield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  )
}

export function Card({ title, extra, children, className = '' }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{title}{extra && <span className="count">{extra}</span>}</h2>}
      {children}
    </section>
  )
}

export function Tile({ label, value, accent, warn }: { label: string; value: number | string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`card tile ${accent ? 'accent' : ''} ${warn ? 'warn' : ''}`}>
      <div className="muted">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'warn'; children: ReactNode }) {
  return <p className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>
}

export function Alerts({ items, onResolve }: { items: AlertEvent[]; onResolve: (id: number) => void }) {
  const open = items.filter(a => !a.resolved)
  return (
    <Card title="Alerts" extra={`${open.length} open`}>
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
    </Card>
  )
}

export function Fleet({ trips }: { trips: Trip[] }) {
  return (
    <Card title="Fleet today" extra={`${trips.length} trips`}>
      {trips.length === 0 && <p className="muted">No trips today. Generate them from the Trips tab.</p>}
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
              <div className="muted">{t.school.name}</div>
              <div className="muted">{t.driver.name} (driver) and {t.escort.name} (escort)</div>
              <div className="muted">{onBoard} of {t.children.length} on board · last location {time(t.last_ping_at) || 'none yet'}</div>
              <div className={camsOk ? 'muted' : 'warn-text'}>Cameras {t.vehicle.cameras_online}/{t.vehicle.camera_count} online</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
