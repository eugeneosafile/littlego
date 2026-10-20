import { useState, type FormEvent } from 'react'
import { errMsg, post, setToken, type User } from '../api'
import { Notice, Shield } from '../components/Shared'

type Mode = 'password' | 'code'

export default function Login({ onIn }: { onIn: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function finish(r: { access_token: string; user: User }) {
    if (r.user.role !== 'school_admin' && r.user.role !== 'ops') {
      setError('This dashboard is for school staff and the ops centre. Parents and crew use the mobile app.')
      return
    }
    setToken(r.access_token)
    onIn(r.user)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'password') finish(await post('/auth/login', { phone, password }))
      else if (!codeSent) { await post('/auth/otp/request', { phone }); setCodeSent(true) }
      else finish(await post('/auth/otp/verify', { phone, code }))
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card login-card">
        <div className="brand"><Shield /> LittleGo</div>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'on' : ''}
            onClick={() => { setMode('password'); setError('') }}>Password</button>
          <button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'on' : ''}
            onClick={() => { setMode('code'); setError('') }}>SMS code</button>
        </div>
        <label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="username" inputMode="tel" placeholder="0803 000 0000" /></label>
        {mode === 'password' && (
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        )}
        {mode === 'code' && codeSent && (
          <label>6-digit code<input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>
        )}
        {mode === 'code' && codeSent && <Notice kind="ok">If this number is registered, a code is on its way by SMS.</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'password' ? 'Sign in' : codeSent ? 'Verify code' : 'Send me a code'}
        </button>
        <p className="hint">Demo: school 08030000001, ops 08030000002, password littlego123</p>
      </form>
    </main>
  )
}
