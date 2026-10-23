import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet'
import { time, type Trip } from '../api'

// Map tiles: OpenStreetMap is fine for a pilot (light use). For production volume, switch to a
// commercial tile provider (e.g. MapTiler, Mapbox, Google) per OSM's tile usage policy.
const TILES = import.meta.env.VITE_MAP_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const LAGOS: [number, number] = [6.45, 3.45]

const busIcon = (label: string, running: boolean) => L.divIcon({
  className: '',
  html: `<div class="bus-marker ${running ? 'running' : ''}">${label}</div>`,
  iconSize: [62, 28],
  iconAnchor: [31, 14],
})

export default function LiveMap({ trips }: { trips: Trip[] }) {
  const schools = new Map(trips.map(t => [t.school.id, t.school]))
  const first = trips.find(t => t.last_lat != null) ?? trips[0]
  const center: [number, number] = first?.last_lat != null
    ? [first.last_lat, first.last_lon as number]
    : first ? [first.school.lat, first.school.lon] : LAGOS

  return (
    <div className="map-wrap">
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILES} attribution='&copy; OpenStreetMap contributors' />
        {[...schools.values()].map(s => (
          <CircleMarker key={`s${s.id}`} center={[s.lat, s.lon]} radius={9} pathOptions={{ color: '#0F2D5B', fillColor: '#0F2D5B', fillOpacity: 0.95, weight: 3 }}>
            <Tooltip>{s.name}</Tooltip>
          </CircleMarker>
        ))}
        {trips.map(t => {
          const stops = t.children.filter(c => c.child.home_lat != null)
          const line: [number, number][] = [[t.school.lat, t.school.lon], ...stops.map(c => [c.child.home_lat as number, c.child.home_lon as number] as [number, number])]
          return (
            <span key={t.id}>
              <Polyline positions={line} pathOptions={{ color: '#008F7A', weight: 3, opacity: 0.7, dashArray: '6 7' }} />
              {stops.map(c => (
                <CircleMarker key={c.id} center={[c.child.home_lat as number, c.child.home_lon as number]} radius={6}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: c.status === 'handed_over' ? '#F4B400' : '#24467F', fillOpacity: 1 }}>
                  <Tooltip>{c.stop_order}. {c.child.name} · {c.status.replace('_', ' ')}</Tooltip>
                </CircleMarker>
              ))}
              {t.last_lat != null && (
                <Marker position={[t.last_lat, t.last_lon as number]} icon={busIcon(t.vehicle.code, t.status === 'in_progress')}>
                  <Popup>
                    <strong>{t.vehicle.code}</strong><br />
                    {t.driver.name} and {t.escort.name}<br />
                    {t.children.filter(c => c.status === 'on_board').length} on board · {time(t.last_ping_at)}
                  </Popup>
                </Marker>
              )}
            </span>
          )
        })}
      </MapContainer>
    </div>
  )
}
