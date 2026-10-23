import { useState, type FormEvent } from 'react'
import { errMsg, post, setToken, type User } from '../api'
import { Icon, LogoMark, Notice, Wordmark } from '../components/Shared'

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
      <section className="login-brand" aria-hidden="false">
        <svg className="login-route" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M94,30 C86,21 76,18 62,18 C36,18 20,33 20,58 L20,64 C20,89 36,102 60,102 C84,102 100,90 100,68 L100,62 L78,62" />
        </svg>
        <Wordmark reversed size={24} />
        <div className="login-copy">
          <h1>Little journeys.<br />Big peace of mind.</h1>
          <p>The control room for child-only school rides: gate release, live vehicles, vetted crew and every alert in one place.</p>
        </div>
        <ul className="login-points">
          <li><Icon name="gate" /> Release at the gate with a card scan</li>
          <li><Icon name="live" /> Every vehicle live on the map</li>
          <li><Icon name="shield" /> Only vetted crew can start a trip</li>
        </ul>
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-card">
          <span className="login-mark"><LogoMark size={40} /></span>
          <div>
            <h2 className="login-title">Sign in to LittleGo</h2>
            <p className="muted">For school staff and the ops centre. Parents and crew use the mobile app.</p>
          </div>
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
            <label>6-digit code<input className="code-input" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></label>
          )}
          {mode === 'code' && codeSent && <Notice kind="ok">If this number is registered, a code is on its way by SMS.</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn gold large" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : mode === 'password' ? 'Sign in' : codeSent ? 'Verify code' : 'Send me a code'}
          </button>
          <p className="hint">Test accounts: school 08030000001, ops 08030000002, password littlego123</p>
        </form>
      </section>
    </main>
  )
}
