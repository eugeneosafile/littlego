import { useCallback, useMemo, useState } from 'react'
import { API_URL, api, errMsg } from '../../api'
import { Card, Notice, Tile } from '../../components/Shared'
import { usePoll } from '../../usePoll'

interface Signup {
  id: number; full_name: string; email: string; phone: string | null; area: string
  journeys: string[]; start_window: string | null; utm_source: string | null
  created_at: string; unsubscribed: boolean
}
interface WaitlistData {
  total: number
  by_area: Record<string, number>
  by_journey: Record<string, number>
  signups: Signup[]
}

const JOURNEYS: Record<string, string> = {
  school: 'School runs', lessons: 'Lessons', sports_clubs: 'Sports and clubs', other: 'Other',
}
const WHEN: Record<string, string> = {
  asap: 'As soon as available', next_term: 'Next school term', within_6_months: 'Within 6 months', later: 'Later',
}
/** Names for the area codes in littlegoSite/config.js. New codes there still show sensibly via areaName(). */
const AREAS: Record<string, string> = {
  lagos_vi: "Victoria Island",
  lagos_ikoyi: "Ikoyi / Banana Island",
  lagos_island: "Lagos Island / Obalende",
  lagos_lekki_phase1: "Lekki Phase 1 / Oniru",
  lagos_lekki_ikate: "Ikate / Chevron / Osapa London / Agungi",
  lagos_lekki_ajah: "Ajah / Badore / Abraham Adesanya / Sangotedo",
  lagos_ibeju_lekki: "Awoyaya / Lakowe / Ibeju-Lekki",
  lagos_yaba: "Yaba / Akoka / Ebute-Metta",
  lagos_surulere: "Surulere / Aguda / Itire",
  lagos_shomolu_bariga: "Shomolu / Bariga / Palmgrove",
  lagos_gbagada: "Gbagada / Ifako / Anthony",
  lagos_ilupeju_mushin: "Ilupeju / Mushin / Idi-Araba",
  lagos_maryland: "Maryland / Mende / Onigbongbo",
  lagos_ojota_ketu: "Ojota / Ketu / Mile 12",
  lagos_magodo: "Magodo / Isheri / Alapere",
  lagos_apapa: "Apapa / Ajegunle",
  lagos_festac_amuwo: "Festac / Amuwo-Odofin / Satellite Town / Mile 2",
  lagos_ojo: "Ojo / Iba / Igando",
  lagos_ikeja_gra: "Ikeja GRA / Allen / Opebi / Alausa",
  lagos_ogba_agege: "Ogba / Agege / Ifako-Ijaiye",
  lagos_omole_ojodu: "Omole / Ojodu / Berger / Isheri North",
  lagos_oshodi_isolo: "Oshodi / Isolo / Ejigbo / Ajao Estate",
  lagos_alimosho: "Ikotun / Egbeda / Idimu / Alimosho",
  lagos_ipaja_ayobo: "Ipaja / Ayobo / Abule Egba",
  lagos_ikorodu: "Ikorodu",
  lagos_badagry: "Badagry",
  lagos_other: "Elsewhere in Lagos",
  ogun_mowe_ibafo: "Mowe / Ibafo / Arepo / Magboro",
  ogun_ota_sango: "Sango-Ota / Ota / Agbara",
  abuja: "Abuja (FCT)",
  port_harcourt: "Port Harcourt",
  ibadan: "Ibadan",
  other_nigeria: "Elsewhere in Nigeria",
  outside_nigeria: "Outside Nigeria",
}
const WORDS: Record<string, string> = {
  vi: 'Victoria Island', gra: 'GRA', phase1: 'Phase 1', fct: 'FCT', festac: 'Festac', amuwo: 'Amuwo-Odofin',
}

/** Area codes come from the website's config.js; turn them into readable names. */
function areaName(code: string): string {
  if (AREAS[code]) return AREAS[code]
  const [prefix, ...rest] = code.split('_')
  const parts = prefix === 'lagos' || prefix === 'ogun' ? rest : [prefix, ...rest]
  const name = parts.map(w => WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(' / ')
  return prefix === 'ogun' ? `${name} (Ogun)` : name || code
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })

export default function WaitlistAdmin() {
  const [data, setData] = useState<WaitlistData | null>(null)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [loadedAt, setLoadedAt] = useState(0)

  const load = useCallback(async () => {
    try { setData(await api<WaitlistData>('/ops/waitlist')); setLoadedAt(Date.now()); setErr('') }
    catch (e) { setErr(errMsg(e)) }
  }, [])
  usePoll(load, 30_000)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.signups ?? []).filter(s =>
      (!area || s.area === area) &&
      (!q || [s.full_name, s.email, s.phone ?? '', areaName(s.area), s.area.replace(/_/g, ' ')].some(v => v.toLowerCase().includes(q))))
  }, [data, query, area])

  const thisWeek = useMemo(() => {
    const since = loadedAt - 7 * 24 * 3600 * 1000
    return (data?.signups ?? []).filter(s => !s.unsubscribed && new Date(s.created_at).getTime() >= since).length
  }, [data, loadedAt])

  async function downloadCsv() {
    setDownloading(true); setErr('')
    try {
      const token = sessionStorage.getItem('lg_token')
      const res = await fetch(`${API_URL}/ops/waitlist.csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error(res.status === 403 ? 'Only ops accounts can download the waitlist.' : 'Download failed. Please try again.')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `littlego-waitlist-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Download failed. Please try again.') }
    finally { setDownloading(false) }
  }

  if (!data) return err ? <Notice kind="error">{err}</Notice> : <p className="muted">Loading the waitlist…</p>

  const areas = Object.entries(data.by_area)
  const topArea = areas[0]
  const maxArea = topArea ? topArea[1] : 0
  const journeys = Object.entries(data.by_journey)

  return (
    <>
      <div className="tiles">
        <Tile label="On the waitlist" value={data.total} accent />
        <Tile label="Joined in the last 7 days" value={thisWeek} />
        <Tile label="Top area" value={topArea ? areaName(topArea[0]).split(' / ')[0] : '—'} />
        <Tile label="Areas represented" value={areas.length} />
      </div>

      {data.total > 0 && (
        <div className="waitlist-breakdown">
          <Card title="By area" extra="people still subscribed">
            <ul className="bars">
              {areas.map(([code, n]) => (
                <li key={code}>
                  <button type="button" className={`bar-row ${area === code ? 'active' : ''}`}
                    onClick={() => setArea(area === code ? '' : code)} aria-pressed={area === code}
                    title={area === code ? 'Show all areas' : 'Show only this area'}>
                    <span className="bar-label">{areaName(code)}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / maxArea) * 100}%` }} /></span>
                    <span className="bar-value">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="By journey" extra="people can choose more than one">
            <ul className="bars">
              {journeys.map(([code, n]) => (
                <li key={code} className="bar-row static">
                  <span className="bar-label">{JOURNEYS[code] ?? code}</span>
                  <span className="bar-track"><span className="bar-fill teal" style={{ width: `${(n / data.total) * 100}%` }} /></span>
                  <span className="bar-value">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card title="Everyone on the waitlist" extra={`${shown.length} of ${data.signups.length}`}>
        <div className="form-row waitlist-tools">
          <input placeholder="Search name, email, phone or area" value={query}
            onChange={e => setQuery(e.target.value)} aria-label="Search the waitlist" />
          <select value={area} onChange={e => setArea(e.target.value)} aria-label="Filter by area">
            <option value="">All areas</option>
            {areas.map(([code, n]) => <option key={code} value={code}>{areaName(code)} ({n})</option>)}
          </select>
          <button className="btn primary" type="button" onClick={downloadCsv} disabled={downloading || data.signups.length === 0}>
            {downloading ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        {err && <Notice kind="error">{err}</Notice>}
        {data.signups.length === 0 ? (
          <p className="muted">No one has joined yet. Sign-ups from littlego.ng appear here within 30 seconds.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Joined</th><th>Name</th><th>Email</th><th>Phone</th><th>Area</th><th>Journeys</th><th>When</th><th>Status</th></tr>
              </thead>
              <tbody>
                {shown.map(s => (
                  <tr key={s.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.created_at)}</td>
                    <td><strong>{s.full_name}</strong></td>
                    <td><a href={`mailto:${s.email}`}>{s.email}</a></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.phone ?? <span className="muted">—</span>}</td>
                    <td>{areaName(s.area)}</td>
                    <td>{s.journeys.map(j => JOURNEYS[j] ?? j).join(', ')}</td>
                    <td className="muted">{s.start_window ? WHEN[s.start_window] ?? s.start_window : 'Not sure'}</td>
                    <td>{s.unsubscribed
                      ? <span className="pill absent">Unsubscribed</span>
                      : <span className="pill on_board">Subscribed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.signups.length > 0 && shown.length === 0 && <p className="muted">No one matches that search.</p>}
        <p className="muted waitlist-note">Personal data: use it only to contact people about LittleGo's launch, as the Privacy Policy says. Don't share the CSV outside the team.</p>
      </Card>
    </>
  )
}
