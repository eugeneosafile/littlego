import { useCallback, useEffect, useState } from 'react'
import { api, del, errMsg, post, put, type AdminChild, type Person, type RouteRow, type Vehicle } from '../../api'
import { Card, Notice } from '../../components/Shared'
import { SchoolPicker } from './FamiliesAdmin'
import { useSchools } from './useSchools'

interface Draft { id?: number; name: string; school_id: number | ''; vehicle_id: number | ''; driver_id: number | ''; escort_id: number | ''; run: string; child_ids: number[] }
const EMPTY: Draft = { name: '', school_id: '', vehicle_id: '', driver_id: '', escort_id: '', run: 'afternoon', child_ids: [] }

export default function RoutesAdmin() {
  const schools = useSchools()
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [crew, setCrew] = useState<Person[]>([])
  const [children, setChildren] = useState<AdminChild[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const [r, v, c] = await Promise.all([api<RouteRow[]>('/admin/routes'), api<Vehicle[]>('/admin/vehicles'), api<Person[]>('/admin/people?role=crew')])
    setRoutes(r); setVehicles(v); setCrew(c.filter(p => p.active))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (draft?.school_id) api<AdminChild[]>(`/admin/children?school_id=${draft.school_id}`).then(setChildren)
  }, [draft?.school_id])

  function edit(r: RouteRow) {
    const v = vehicles.find(x => x.code === r.vehicle_code)
    setDraft({ id: r.id, name: r.name, school_id: r.school_id, vehicle_id: v?.id ?? '', run: r.run,
      driver_id: crew.find(c => c.name === r.driver_name)?.id ?? '', escort_id: crew.find(c => c.name === r.escort_name)?.id ?? '',
      child_ids: r.stops.map(s => s.child_id) })
  }

  async function save() {
    if (!draft) return
    try {
      const body = { ...draft }
      delete body.id
      if (draft.id) await put(`/admin/routes/${draft.id}`, body)
      else await post('/admin/routes', body)
      setMsg({ ok: true, text: `Route "${draft.name}" saved.` })
      setDraft(null); load()
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
  }

  const move = (i: number, d: number) => {
    if (!draft) return
    const ids = [...draft.child_ids]
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setDraft({ ...draft, child_ids: ids })
  }

  const name = (id: number) => children.find(c => c.id === id)
  const seats = vehicles.find(v => v.id === draft?.vehicle_id)?.seats

  return (
    <>
      {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      {!draft && (
        <Card title="Routes" extra={`${routes.filter(r => r.active).length} active`}>
          <button className="btn primary" onClick={() => setDraft({ ...EMPTY, school_id: schools[0]?.id ?? '' })}>New route</button>
          <div className="fleet" style={{ marginTop: 12 }}>
            {routes.filter(r => r.active).map(r => (
              <div key={r.id} className="vehicle">
                <div className="row between"><strong>{r.name}</strong><span className="pill">{r.run}</span></div>
                <div className="muted">{r.vehicle_code} · {r.driver_name} (driver) · {r.escort_name} (escort)</div>
                <ol className="stops">{r.stops.map(s => <li key={s.child_id}>{s.child_name}</li>)}</ol>
                <div className="row">
                  <button className="btn small" onClick={() => edit(r)}>Edit</button>
                  <button className="btn small" onClick={async () => { await del(`/admin/routes/${r.id}`); load() }}>Retire</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {draft && (
        <Card title={draft.id ? 'Edit route' : 'New route'}>
          <div className="form-row">
            <label>Route name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Lekki Phase 1 bus" /></label>
            <SchoolPicker schools={schools} value={draft.school_id} onChange={id => setDraft({ ...draft, school_id: id, child_ids: [] })} />
            <label>Run
              <select value={draft.run} onChange={e => setDraft({ ...draft, run: e.target.value })}>
                <option value="afternoon">Afternoon (school to home)</option><option value="morning">Morning (home to school)</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>Vehicle
              <select value={draft.vehicle_id} onChange={e => setDraft({ ...draft, vehicle_id: Number(e.target.value) })}>
                <option value="">Choose…</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.code} · {v.kind} · {v.seats} seats</option>)}
              </select>
            </label>
            <CrewPick label="Driver" crew={crew.filter(c => c.crew_role === 'driver')} value={draft.driver_id} onChange={id => setDraft({ ...draft, driver_id: id })} />
            <CrewPick label="Escort" crew={crew.filter(c => c.crew_role === 'escort')} value={draft.escort_id} onChange={id => setDraft({ ...draft, escort_id: id })} />
          </div>
          <div className="split">
            <div className="grow">
              <h3>Stops in drop-off order {seats ? <span className="muted">({draft.child_ids.length}/{seats} seats)</span> : null}</h3>
              <ol className="stops editable">
                {draft.child_ids.map((id, i) => (
                  <li key={id}>
                    <span>{name(id)?.name ?? `Child ${id}`} <span className="muted">{name(id)?.home_address}</span></span>
                    <span className="row">
                      <button className="btn small" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                      <button className="btn small" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                      <button className="btn small" onClick={() => setDraft({ ...draft, child_ids: draft.child_ids.filter(x => x !== id) })}>Remove</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="side">
              <h3>Add children</h3>
              <ul className="plain pick">
                {children.filter(c => c.active && !draft.child_ids.includes(c.id)).map(c => (
                  <li key={c.id}>
                    <button className="btn small" onClick={() => setDraft({ ...draft, child_ids: [...draft.child_ids, c.id] })}>Add</button>
                    {' '}{c.name} <span className="muted">{c.class_name}{c.home_lat == null ? ' · no location' : ''}{!c.plan ? ' · no plan' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>Save route</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </Card>
      )}
    </>
  )
}

function CrewPick({ label, crew, value, onChange }: { label: string; crew: Person[]; value: number | ''; onChange: (id: number) => void }) {
  return (
    <label>{label}
      <select value={value} onChange={e => onChange(Number(e.target.value))}>
        <option value="">Choose…</option>
        {crew.map(c => <option key={c.id} value={c.id}>{c.name}{c.vetted_at ? '' : ' (not vetted)'}</option>)}
      </select>
    </label>
  )
}
