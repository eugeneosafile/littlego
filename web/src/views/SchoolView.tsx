import { useCallback, useState } from 'react'
import { api, errMsg, post, time, type AlertEvent, type ChildStatus, type QueueItem, type Summary, type Trip } from '../api'
import LiveMap from '../components/LiveMap'
import { Alerts, Card, Fleet, Notice, Tile } from '../components/Shared'
import { usePoll } from '../usePoll'

const STATUS_LABEL: Record<ChildStatus, string> = {
  scheduled: 'Waiting', released: 'Released', on_board: 'On board',
  handed_over: 'Handed over', at_safe_hub: 'At safe hub', absent: 'Absent',
}

export default function SchoolView() {
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
      const tc = await post<{ child: { name: string } }>('/school/release', { card_uid: cardUid.trim().toUpperCase() })
      setMsg({ ok: true, text: `${tc.child.name} released. Hand over to the escort.` })
      setCard('')
      load()
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    }
  }

  return (
    <>
      {summary && (
        <div className="tiles">
          <Tile label="Booked today" value={summary.booked_today} />
          <Tile label="Waiting at school" value={summary.waiting} />
          <Tile label="With LittleGo" value={summary.on_board + summary.released} accent />
          <Tile label="Handed over" value={summary.handed_over} />
          <Tile label="Open alerts" value={summary.open_alerts} warn={summary.open_alerts > 0} />
        </div>
      )}
      <div className="split">
        <Card title="Release queue" className="grow">
          <form className="scan" onSubmit={e => { e.preventDefault(); if (card) release(card) }}>
            <label className="sr-only" htmlFor="card">Child card ID</label>
            <input id="card" placeholder="Scan the child's card (a USB QR scanner types here)" value={card}
              onChange={e => setCard(e.target.value)} autoFocus />
            <button className="btn primary" type="submit">Scan and release</button>
          </form>
          {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
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
        </Card>
        <aside className="side"><Alerts items={alerts} onResolve={async id => { await post(`/school/alerts/${id}/resolve`); load() }} /></aside>
      </div>
      <Card title="Live map"><LiveMap trips={trips} /></Card>
      <Fleet trips={trips} />
    </>
  )
}
