import { useState } from 'react'
import { errMsg, post, type GenerateReport } from '../../api'
import { Card, Notice } from '../../components/Shared'

const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })

export default function TripsAdmin() {
  const [date, setDate] = useState(lagosToday())
  const [report, setReport] = useState<GenerateReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true); setError(''); setReport(null)
    try { setReport(await post<GenerateReport>('/admin/trips/generate', { run_date: date })) }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <Card title="Daily trips">
      <p className="muted">Trips are created automatically at 05:00 on school days. Use this to create them by hand, for example after changing a route. Running it twice is safe.</p>
      <div className="form-row">
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <button className="btn primary" onClick={generate} disabled={busy}>Create trips</button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {report && (
        <div className="report">
          <Notice kind={report.warnings.length ? 'warn' : 'ok'}>
            {report.created.length} trip(s) created for {report.run_date}{report.already_existed.length ? `, ${report.already_existed.length} already existed` : ''}.
          </Notice>
          <List title="Created" items={report.created} />
          <List title="Already existed" items={report.already_existed} />
          <List title="Crew problems (fix before the run)" items={report.warnings} warn />
          <List title="Children left off (no active paid plan)" items={report.skipped_children} warn />
        </div>
      )}
    </Card>
  )
}

function List({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items.length) return null
  return (
    <>
      <h3 className={warn ? 'warn-text' : ''}>{title}</h3>
      <ul className="plain">{items.map(i => <li key={i}>{i}</li>)}</ul>
    </>
  )
}
