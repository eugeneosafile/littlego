import { useCallback, useState } from 'react'
import { api, ApiError, time } from '../../api'
import { Card, Notice } from '../../components/Shared'
import { usePoll } from '../../usePoll'

interface Msg { id: number; to: string; message: string; at: string }

/** Test SMS mode only: shows messages that would have been sent, so testers get codes and PINs. */
export default function MessagesAdmin() {
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [off, setOff] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    try { setMsgs(await api<Msg[]>('/ops/messages')); setOff(false) }
    catch (e) { if (e instanceof ApiError && e.status === 404) setOff(true) }
  }, [])
  usePoll(load, 5_000)

  if (off) {
    return <Notice kind="ok">Real SMS is switched on, so messages go to phones and are not shown here.</Notice>
  }
  const digits = filter.replace(/\D/g, '').replace(/^0/, '')
  const shown = (msgs ?? []).filter(m => !digits || m.to.includes(digits))
  return (
    <Card title="Test messages" extra="refreshes every 5 seconds">
      <Notice kind="warn">
        Test SMS mode: nothing is sent to phones. Read sign-in codes and PINs to testers from here.
        Switch to real SMS before any child rides.
      </Notice>
      <div className="form-row">
        <input placeholder="Filter by phone number, e.g. 0803 000 0100" value={filter}
          onChange={e => setFilter(e.target.value)} aria-label="Filter by phone number" />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>To</th><th>Message</th></tr></thead>
          <tbody>
            {shown.map(m => (
              <tr key={m.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{time(m.at)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{m.to}</td>
                <td>{m.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msgs && shown.length === 0 && <p className="muted">No messages yet.</p>}
    </Card>
  )
}
