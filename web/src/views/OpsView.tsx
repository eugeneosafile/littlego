import { useCallback, useState } from 'react'
import { api, post, type AlertEvent, type Trip } from '../api'
import LiveMap from '../components/LiveMap'
import { Alerts, Card, Fleet, Tile } from '../components/Shared'
import { usePoll } from '../usePoll'
import CrewAdmin from './admin/CrewAdmin'
import FamiliesAdmin from './admin/FamiliesAdmin'
import RoutesAdmin from './admin/RoutesAdmin'
import SchoolsAdmin from './admin/SchoolsAdmin'
import TripsAdmin from './admin/TripsAdmin'
import VehiclesAdmin from './admin/VehiclesAdmin'

const TABS = ['Live', 'Trips', 'Routes', 'Families', 'Crew', 'Vehicles', 'Schools & staff'] as const
type Tab = (typeof TABS)[number]

export default function OpsView() {
  const [tab, setTab] = useState<Tab>('Live')
  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Ops sections">
        {TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === 'Live' && <Live />}
      {tab === 'Trips' && <TripsAdmin />}
      {tab === 'Routes' && <RoutesAdmin />}
      {tab === 'Families' && <FamiliesAdmin />}
      {tab === 'Crew' && <CrewAdmin />}
      {tab === 'Vehicles' && <VehiclesAdmin />}
      {tab === 'Schools & staff' && <SchoolsAdmin />}
    </>
  )
}

function Live() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const load = useCallback(async () => {
    const [t, a] = await Promise.all([api<Trip[]>('/ops/trips/today'), api<AlertEvent[]>('/ops/alerts')])
    setTrips(t); setAlerts(a)
  }, [])
  usePoll(load, 5_000)
  const running = trips.filter(t => t.status === 'in_progress')
  const onBoard = trips.reduce((n, t) => n + t.children.filter(c => c.status === 'on_board').length, 0)
  const critical = alerts.filter(a => !a.resolved && a.severity === 'critical').length
  return (
    <>
      <div className="tiles">
        <Tile label="Trips today" value={trips.length} />
        <Tile label="Running now" value={running.length} accent />
        <Tile label="Children on board" value={onBoard} />
        <Tile label="Critical alerts" value={critical} warn={critical > 0} />
      </div>
      <div className="split">
        <Card title="Live map" className="grow"><LiveMap trips={trips} /></Card>
        <aside className="side"><Alerts items={alerts} onResolve={async id => { await post(`/ops/alerts/${id}/resolve`); load() }} /></aside>
      </div>
      <Fleet trips={trips} />
    </>
  )
}
