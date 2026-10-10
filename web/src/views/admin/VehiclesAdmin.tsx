import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errMsg, patch, post, type Vehicle } from '../../api'
import { Card, Notice } from '../../components/Shared'

export default function VehiclesAdmin() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [form, setForm] = useState({ code: '', plate: '', kind: 'shared', seats: 16, camera_count: 3 })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const load = useCallback(async () => setVehicles(await api<Vehicle[]>('/admin/vehicles')), [])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await post('/admin/vehicles', { ...form, cameras_online: form.camera_count })
      setMsg({ ok: true, text: `${form.code} added.` })
      setForm({ ...form, code: '', plate: '' })
      load()
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }) }
  }

  async function setCams(v: Vehicle, n: number) {
    await patch(`/admin/vehicles/${v.id}`, { cameras_online: Math.max(0, Math.min(n, v.camera_count)) })
    load()
  }

  return (
    <>
      <Card title="Add vehicle">
        <form className="form-row" onSubmit={add}>
          <label>Fleet code<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WR-30" required /></label>
          <label>Plate<input value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })} required /></label>
          <label>Type
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              <option value="shared">Shared bus</option><option value="group">Small group van</option><option value="exclusive">Exclusive car</option>
            </select>
          </label>
          <label>Child seats<input type="number" min={1} max={60} value={form.seats} onChange={e => setForm({ ...form, seats: Number(e.target.value) })} /></label>
          <label>Cameras<input type="number" min={0} max={8} value={form.camera_count} onChange={e => setForm({ ...form, camera_count: Number(e.target.value) })} /></label>
          <button className="btn primary" type="submit">Add</button>
        </form>
        {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      </Card>
      <Card title="Fleet" extra={`${vehicles.length} vehicles`}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Plate</th><th>Type</th><th>Seats</th><th>Cameras online</th></tr></thead>
            <tbody>
              {vehicles.map(v => (
                <tr key={v.id}>
                  <td><strong>{v.code}</strong></td><td>{v.plate}</td><td>{v.kind}</td><td>{v.seats}</td>
                  <td>
                    <div className="row">
                      <button className="btn small" onClick={() => setCams(v, v.cameras_online - 1)} aria-label={`One fewer camera online on ${v.code}`}>−</button>
                      <span className={v.cameras_online < v.camera_count ? 'warn-text' : ''}>{v.cameras_online} / {v.camera_count}</span>
                      <button className="btn small" onClick={() => setCams(v, v.cameras_online + 1)} aria-label={`One more camera online on ${v.code}`}>+</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">A trip that starts with a camera offline raises a warning for ops. Connect this to the DVR vendor's health API later.</p>
      </Card>
    </>
  )
}
