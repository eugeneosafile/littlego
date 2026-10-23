import { useCallback, useState } from 'react'
import { api, post, type AlertEvent, type Trip } from '../api'
import LiveMap from '../components/LiveMap'
import { Alerts, Card, Fleet, type IconName, PageHeader, Tile } from '../components/Shared'
import { usePoll } from '../usePoll'
import CrewAdmin from './admin/CrewAdmin'
import FamiliesAdmin from './admin/FamiliesAdmin'
import MessagesAdmin from './admin/MessagesAdmin'
import ReadinessAdmin from './admin/ReadinessAdmin'
import RoutesAdmin from './admin/RoutesAdmin'
import SchoolsAdmin from './admin/SchoolsAdmin'
import TripsAdmin from './admin/TripsAdmin'
import VehiclesAdmin from './admin/VehiclesAdmin'
import WaitlistAdmin from './admin/WaitlistAdmin'

export const OPS_NAV = [
  { tab: 'Live', icon: 'live', sub: 'Every vehicle, child and alert, updated every 5 seconds.' },
  { tab: 'Trips', icon: 'calendar', sub: 'Create the day’s trips from the routes.' },
  { tab: 'Routes', icon: 'route', sub: 'Vehicles, crew and drop-off order for each run.' },
  { tab: 'Families', icon: 'users', sub: 'Children, parents, plans and QR cards.' },
  { tab: 'Crew', icon: 'shield', sub: 'Drivers and escorts, and their vetting.' },
  { tab: 'Vehicles', icon: 'bus', sub: 'The fleet and its cameras.' },
  { tab: 'Schools & staff', icon: 'school', sub: 'Partner schools, safe hubs and gate staff.' },
  { tab: 'Pilot readiness', icon: 'check', sub: 'What still needs doing before children ride.' },
  { tab: 'Waitlist', icon: 'mail', sub: 'Parents who joined early access on littlego.ng.' },
  { tab: 'Messages', icon: 'message', sub: 'SMS the system has sent while in test mode.' },
] as const satisfies readonly { tab: string; icon: IconName; sub: string }[]
export type OpsTab = (typeof OPS_NAV)[number]['tab']

const lagosDate = () => new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' })

export default function OpsView({ tab }: { tab: OpsTab }) {
  const nav = OPS_NAV.find(n => n.tab === tab)!
  return (
    <>
      <PageHeader title={tab === 'Live' ? 'Live operations' : tab} sub={tab === 'Live' ? `${lagosDate()}. ${nav.sub}` : nav.sub} />
      {tab === 'Live' && <Live />}
      {tab === 'Trips' && <TripsAdmin />}
      {tab === 'Routes' && <RoutesAdmin />}
      {tab === 'Families' && <FamiliesAdmin />}
      {tab === 'Crew' && <CrewAdmin />}
      {tab === 'Vehicles' && <VehiclesAdmin />}
      {tab === 'Schools & staff' && <SchoolsAdmin />}
      {tab === 'Pilot readiness' && <ReadinessAdmin />}
      {tab === 'Waitlist' && <WaitlistAdmin />}
      {tab === 'Messages' && <MessagesAdmin />}
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
