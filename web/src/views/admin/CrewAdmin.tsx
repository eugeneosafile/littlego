import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errMsg, patch, post, type Person } from '../../api'
import { Card, Notice } from '../../components/Shared'

const today = () => new Date().toISOString().slice(0, 10)

function vettingState(p: Person): { label: string; cls: string } {
  if (!p.active) return { label: 'Inactive', cls: 'absent' }
  if (!p.vetted_at) return { label: 'Not vetted', cls: 'at_safe_hub' }
  if (p.vetting_expires_at && p.vetting_expires_at < today()) return { label: 'Vetting expired', cls: 'at_safe_hub' }
  return { label: 'Vetted', cls: 'on_board' }
}

export default function CrewAdmin() {
  const [crew, setCrew] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('driver')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => setCrew(await api<Person[]>('/admin/people?role=crew')), [])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await post('/admin/crew', { name, phone, crew_role: role })
      setName(''); setPhone('')
      setMsg({ ok: true, text: `${name} added. Record their vetting before they can run trips.` })
      load()
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }) }
  }

  return (
    <>
      <Card title="Add crew member">
        <form className="form-row" onSubmit={add}>
          <label>Full name<input value={name} onChange={e => setName(e.target.value)} required /></label>
          <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" /></label>
          <label>Role
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="driver">Driver</option><option value="escort">Escort</option>
            </select>
          </label>
          <button className="btn primary" type="submit">Add</button>
        </form>
        {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      </Card>
      <Card title="Crew and vetting" extra={`${crew.filter(c => vettingState(c).label === 'Vetted').length} of ${crew.length} cleared`}>
        <p className="muted">A trip cannot start unless both the driver and escort are active, vetted and in date. Record the evidence for every check.</p>
        <div className="crew-list">
          {crew.map(p => <CrewRow key={p.id} p={p} onSaved={load} />)}
        </div>
      </Card>
    </>
  )
}

function CrewRow({ p, onSaved }: { p: Person; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(p.vetting_notes)
  const [expires, setExpires] = useState(p.vetting_expires_at ?? '')
  const [err, setErr] = useState('')
  const st = vettingState(p)

  async function save(vetted?: boolean, active?: boolean) {
    setErr('')
    try {
      await patch(`/admin/crew/${p.id}`, { vetting_notes: notes, vetting_expires_at: expires || null, vetted, active })
      setOpen(false); onSaved()
    } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div className="crew-row">
      <div className="row between">
        <div>
          <strong>{p.name}</strong> <span className="muted">· {p.crew_role} · {p.phone}</span>
          {p.vetting_expires_at && <div className="muted">Vetting valid until {p.vetting_expires_at}</div>}
        </div>
        <div className="row">
          <span className={`pill ${st.cls}`}>{st.label}</span>
          <button className="btn small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Vetting'}</button>
        </div>
      </div>
      {open && (
        <div className="vetting">
          <label>Evidence: police check reference, guarantor, address check, medical, training dates
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
          <label>Valid until<input type="date" value={expires} onChange={e => setExpires(e.target.value)} /></label>
          {err && <Notice kind="error">{err}</Notice>}
          <div className="row wrap">
            <button className="btn primary" onClick={() => save(true)}>Mark vetted</button>
            <button className="btn" onClick={() => save()}>Save notes</button>
            {p.vetted_at && <button className="btn" onClick={() => save(false)}>Revoke vetting</button>}
            <button className="btn" onClick={() => save(undefined, !p.active)}>{p.active ? 'Deactivate' : 'Reactivate'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
