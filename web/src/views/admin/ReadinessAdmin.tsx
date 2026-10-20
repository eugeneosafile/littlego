import { useCallback, useEffect, useState } from 'react'
import { api, errMsg } from '../../api'
import { Card, Notice, Tile } from '../../components/Shared'

interface Check { area: string; name: string; status: 'pass' | 'warn' | 'fail'; detail: string; fix: string }
interface Report { ready: boolean; counts: { pass: number; warn: number; fail: number }; checks: Check[] }

const LABEL = { pass: 'Pass', warn: 'Check', fail: 'Blocking' }
const PILL = { pass: 'on_board', warn: 'scheduled', fail: 'at_safe_hub' }

export default function ReadinessAdmin() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setReport(await api<Report>('/admin/readiness')); setError('') } catch (e) { setError(errMsg(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!report) return null
  const areas = [...new Set(report.checks.map(c => c.area))]
  return (
    <>
      <div className="tiles">
        <Tile label="Pilot status" value={report.ready ? 'Ready' : 'Not ready'} accent={report.ready} warn={!report.ready} />
        <Tile label="Blocking" value={report.counts.fail} warn={report.counts.fail > 0} />
        <Tile label="To check" value={report.counts.warn} />
        <Tile label="Passed" value={report.counts.pass} />
      </div>
      {areas.map(area => (
        <Card key={area} title={area}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Check</th><th>Status</th><th>Now</th><th>What to do</th></tr></thead>
              <tbody>
                {report.checks.filter(c => c.area === area).sort((a, b) => order(a) - order(b)).map(c => (
                  <tr key={c.name}>
                    <td><strong>{c.name}</strong></td>
                    <td><span className={`pill ${PILL[c.status]}`}>{LABEL[c.status]}</span></td>
                    <td className="muted">{c.detail}</td>
                    <td>{c.status !== 'pass' ? c.fix : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <button className="btn" onClick={load}>Check again</button>
    </>
  )
}

const order = (c: Check) => ({ fail: 0, warn: 1, pass: 2 })[c.status]
