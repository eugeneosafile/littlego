import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errMsg, post, type Person } from '../../api'
import { Card, Notice } from '../../components/Shared'
import { SchoolPicker } from './FamiliesAdmin'
import { useSchools } from './useSchools'

export default function SchoolsAdmin() {
  const [reload, setReload] = useState(0)
  const schools = useSchools(reload)
  const [school, setSchool] = useState({ name: '', address: '', coords: '', safe_hub_name: '' })
  const [staff, setStaff] = useState<Person[]>([])
  const [person, setPerson] = useState({ name: '', phone: '', role: 'school_admin', school_id: '' as number | '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadStaff = useCallback(async () => {
    const [a, b] = await Promise.all([api<Person[]>('/admin/people?role=school_admin'), api<Person[]>('/admin/people?role=ops')])
    setStaff([...a, ...b])
  }, [])
  useEffect(() => { loadStaff() }, [loadStaff])
  useEffect(() => { if (person.school_id === '' && schools[0]) setPerson(p => ({ ...p, school_id: schools[0].id })) }, [schools, person.school_id])

  async function addSchool(e: FormEvent) {
    e.preventDefault()
    const m = school.coords.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/)
    if (!m) { setMsg({ ok: false, text: 'Location must be "latitude, longitude", e.g. 6.4474, 3.4720' }); return }
    try {
      await post('/admin/schools', { name: school.name, address: school.address, lat: Number(m[1]), lon: Number(m[3]),
        safe_hub_name: school.safe_hub_name || `${school.name} safe hub` })
      setMsg({ ok: true, text: `${school.name} added.` })
      setSchool({ name: '', address: '', coords: '', safe_hub_name: '' })
      setReload(r => r + 1)
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }) }
  }

  async function addPerson(e: FormEvent) {
    e.preventDefault()
    try {
      await post('/admin/staff', { ...person, school_id: person.role === 'ops' ? null : person.school_id })
      setMsg({ ok: true, text: `${person.name} added. They sign in with an SMS code.` })
      setPerson({ ...person, name: '', phone: '' })
      loadStaff()
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }) }
  }

  return (
    <>
      {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      <div className="split">
        <Card title="Add school" className="grow">
          <form className="stack" onSubmit={addSchool}>
            <label>School name<input value={school.name} onChange={e => setSchool({ ...school, name: e.target.value })} required /></label>
            <label>Address<input value={school.address} onChange={e => setSchool({ ...school, address: e.target.value })} /></label>
            <label>Gate location (latitude, longitude)<input value={school.coords} onChange={e => setSchool({ ...school, coords: e.target.value })} placeholder="6.4474, 3.4720" required /></label>
            <label>Safe hub for late pickups<input value={school.safe_hub_name} onChange={e => setSchool({ ...school, safe_hub_name: e.target.value })} placeholder="e.g. School library, supervised" /></label>
            <button className="btn primary" type="submit">Add school</button>
          </form>
          <ul className="plain">{schools.map(s => <li key={s.id}><strong>{s.name}</strong> <span className="muted">· {s.address} · hub: {s.safe_hub_name}</span></li>)}</ul>
        </Card>
        <Card title="Add staff" className="side">
          <form className="stack" onSubmit={addPerson}>
            <label>Full name<input value={person.name} onChange={e => setPerson({ ...person, name: e.target.value })} required /></label>
            <label>Phone<input value={person.phone} onChange={e => setPerson({ ...person, phone: e.target.value })} required inputMode="tel" /></label>
            <label>Role
              <select value={person.role} onChange={e => setPerson({ ...person, role: e.target.value })}>
                <option value="school_admin">School staff (release at gate)</option><option value="ops">LittleGo ops</option>
              </select>
            </label>
            {person.role === 'school_admin' && <SchoolPicker schools={schools} value={person.school_id} onChange={id => setPerson({ ...person, school_id: id })} />}
            <button className="btn primary" type="submit">Add staff</button>
          </form>
          <ul className="plain">{staff.map(p => <li key={p.id}>{p.name} <span className="muted">· {p.role === 'ops' ? 'ops' : schools.find(s => s.id === p.school_id)?.name}</span></li>)}</ul>
        </Card>
      </div>
    </>
  )
}
