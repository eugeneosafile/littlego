import { useCallback, useEffect, useState } from 'react'
import { api, API_URL, errMsg, patch, post, type AdminChild, type ImportReport, type School } from '../../api'
import { Card, Notice } from '../../components/Shared'
import QrCards from './QrCards'
import { useSchools } from './useSchools'

export default function FamiliesAdmin() {
  const schools = useSchools()
  const [schoolId, setSchoolId] = useState<number | ''>('')
  const [children, setChildren] = useState<AdminChild[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')
  const [showCards, setShowCards] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => { if (schoolId === '' && schools[0]) setSchoolId(schools[0].id) }, [schools, schoolId])

  const load = useCallback(async () => {
    if (schoolId === '') return
    setChildren(await api<AdminChild[]>(`/admin/children?school_id=${schoolId}`))
  }, [schoolId])
  useEffect(() => { load().catch(e => setError(errMsg(e))) }, [load])

  async function importCsv() {
    if (!file || schoolId === '') return
    setError(''); setReport(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      setReport(await post<ImportReport>(`/admin/families/import?school_id=${schoolId}`, fd))
      load()
    } catch (e) { setError(errMsg(e)) }
  }

  async function downloadTemplate() {
    const text = await fetch(`${API_URL}/admin/families/template.csv`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('wr_token')}` },
    }).then(r => r.text())
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
    a.download = 'wardride-families-template.csv'
    a.click()
  }

  const shown = children.filter(c => (c.name + c.parent_name + c.class_name).toLowerCase().includes(filter.toLowerCase()))
  const school = schools.find(s => s.id === schoolId)

  if (showCards && school) return <QrCards school={school} children={shown} onClose={() => setShowCards(false)} />

  return (
    <>
      <Card title="Import families">
        <p className="muted">One row per child. Parents are matched by phone number, so siblings share one account. Each child gets a card ID for QR boarding.</p>
        <div className="form-row">
          <SchoolPicker schools={schools} value={schoolId} onChange={setSchoolId} />
          <label>CSV file<input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
          <button className="btn primary" disabled={!file} onClick={importCsv}>Import</button>
          <button className="btn" onClick={downloadTemplate}>Download template</button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {report && (
          <Notice kind={report.rows_skipped.length ? 'warn' : 'ok'}>
            Imported {report.children_created} children, {report.parents_created} new parents, {report.receivers_added} approved adults.
            {report.rows_skipped.length > 0 && <> Skipped: {report.rows_skipped.join('; ')}</>}
          </Notice>
        )}
      </Card>
      <Card title="Children" extra={`${children.length} at ${school?.name ?? ''}`}>
        <div className="form-row">
          <input placeholder="Search by child, parent or class" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Search children" />
          <button className="btn" onClick={() => setShowCards(true)} disabled={!shown.length}>Print QR cards ({shown.length})</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Child</th><th>Class</th><th>Parent</th><th>Plan</th><th>Card</th><th>Home location</th><th /></tr></thead>
            <tbody>
              {shown.map(c => <ChildRow key={c.id} c={c} onSaved={load} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function ChildRow({ c, onSaved }: { c: AdminChild; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [coords, setCoords] = useState(c.home_lat != null ? `${c.home_lat}, ${c.home_lon}` : '')
  const [err, setErr] = useState('')
  async function save() {
    const m = coords.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/)
    if (!m) { setErr('Paste as "6.4430, 3.4800" (right-click the house in Google Maps to copy)'); return }
    try {
      await patch(`/admin/children/${c.id}`, { home_lat: Number(m[1]), home_lon: Number(m[3]) })
      setEditing(false); setErr(''); onSaved()
    } catch (e) { setErr(errMsg(e)) }
  }
  return (
    <tr>
      <td><strong>{c.name}</strong></td>
      <td>{c.class_name}</td>
      <td>{c.parent_name}<div className="muted">{c.parent_phone}</div></td>
      <td>{c.plan ? <span className="pill on_board">{c.plan}</span> : <span className="pill scheduled">no plan</span>}</td>
      <td><code>{c.card_uid}</code></td>
      <td>
        {editing ? (
          <div className="inline-edit">
            <input value={coords} onChange={e => setCoords(e.target.value)} aria-label={`Home coordinates for ${c.name}`} />
            <button className="btn small primary" onClick={save}>Save</button>
            {err && <div className="error small-text">{err}</div>}
          </div>
        ) : c.home_lat != null ? <span className="muted">{c.home_address || `${c.home_lat}, ${c.home_lon}`}</span>
          : <span className="warn-text">Missing</span>}
      </td>
      <td className="right">{!editing && <button className="btn small" onClick={() => setEditing(true)}>Set location</button>}</td>
    </tr>
  )
}

export function SchoolPicker({ schools, value, onChange }: { schools: School[]; value: number | ''; onChange: (id: number) => void }) {
  return (
    <label>School
      <select value={value} onChange={e => onChange(Number(e.target.value))}>
        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  )
}
