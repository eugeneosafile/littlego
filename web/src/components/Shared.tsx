import type { ReactNode } from 'react'
import { time, type AlertEvent, type Trip } from '../api'

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function LogoMark({ size = 28, reversed }: { size?: number; reversed?: boolean }) {
  const stroke = reversed ? '#FFFFFF' : 'var(--navy)'
  const teal = reversed ? 'var(--teal-300)' : 'var(--teal)'
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M94,30 C86,21 76,18 62,18 C36,18 20,33 20,58 L20,64 C20,89 36,102 60,102" fill="none" stroke={stroke} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60,102 C84,102 100,90 100,68 L100,62 L78,62" fill="none" stroke={teal} strokeWidth="18" strokeLinejoin="round" />
      <circle cx="78" cy="62" r="9" fill={teal} />
      <circle cx="57" cy="62" r="9" fill="var(--gold)" />
    </svg>
  )
}

export function Wordmark({ reversed, size = 22 }: { reversed?: boolean; size?: number }) {
  return (
    <span className={`wordmark ${reversed ? 'reversed' : ''}`} style={{ fontSize: size }}>
      <LogoMark size={size * 1.35} reversed={reversed} />
      <span>Little<em>Go</em></span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Icons — same 24px line set as the mobile app.
// ---------------------------------------------------------------------------
const ICONS = {
  live: 'M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M5.6 18.4a9 9 0 0 1 0-12.8M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  bus: 'M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 17h14M5 17v3M19 17v3M5 11h14M8 14h.01M16 14h.01',
  school: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  check: 'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  message: 'M4 5h16v11H8l-4 4z',
  gate: 'M4 20V8l8-4 8 4v12M9 20v-7h6v7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2',
  camera: 'M15 10l5-3v10l-5-3M3 7h12v10H3z',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  done: 'M5 12.5l4.5 4.5L19 7.5',
} as const
export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {right}
    </header>
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
    <div className={`tile ${accent ? 'accent' : ''} ${warn ? 'warn' : ''}`}>
      <div className="tile-label">{label}</div>
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
    <Card title="Alerts" extra={open.length ? `${open.length} open` : undefined}>
      {open.length === 0 && (
        <div className="empty">
          <span className="empty-icon"><Icon name="shield" /></span>
          <p>All clear. New alerts appear here and on the ops phones.</p>
        </div>
      )}
      <ul className="alerts">
        {open.map(a => (
          <li key={a.id} className={`alert ${a.severity}`}>
            <span className="alert-icon"><Icon name="alert" size={18} /></span>
            <div className="alert-body">
              <div className="alert-title">{a.kind.replaceAll('_', ' ')}<span>{time(a.created_at)}</span></div>
              <div>{a.message}</div>
              <button className="btn small" onClick={() => onResolve(a.id)}>Mark resolved</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

const TRIP_LABEL: Record<string, string> = { scheduled: 'Not started', in_progress: 'On the road', completed: 'Completed' }

export function Fleet({ trips }: { trips: Trip[] }) {
  return (
    <Card title="Fleet today" extra={`${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`}>
      {trips.length === 0 && <p className="muted">No trips today. Create them from the Trips page.</p>}
      <div className="fleet">
        {trips.map(t => {
          const onBoard = t.children.filter(c => c.status === 'on_board').length
          const done = t.children.filter(c => c.status === 'handed_over' || c.status === 'at_safe_hub').length
          const camsOk = t.vehicle.cameras_online === t.vehicle.camera_count
          const pct = t.children.length ? Math.round((done / t.children.length) * 100) : 0
          return (
            <article key={t.id} className="vehicle">
              <div className="row between">
                <div className="vehicle-code">{t.vehicle.code}<span>{t.vehicle.kind}</span></div>
                <span className={`pill ${t.status}`}>{TRIP_LABEL[t.status] ?? t.status}</span>
              </div>
              <div className="muted">{t.school.name}</div>
              <div className="progress" aria-label={`${done} of ${t.children.length} children delivered`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <dl className="vehicle-stats">
                <div><dt>On board</dt><dd>{onBoard}</dd></div>
                <div><dt>Delivered</dt><dd>{done}/{t.children.length}</dd></div>
                <div><dt>Cameras</dt><dd className={camsOk ? '' : 'warn-text'}>{t.vehicle.cameras_online}/{t.vehicle.camera_count}</dd></div>
              </dl>
              <div className="vehicle-foot">
                <span>{t.driver.name} and {t.escort.name}</span>
                <span>{t.last_ping_at ? `Seen ${time(t.last_ping_at)}` : 'No location yet'}</span>
              </div>
            </article>
          )
        })}
      </div>
    </Card>
  )
}
