import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { AdminChild, School } from '../../api'

/** Printable sheet of child ID cards. Print on card stock, laminate, attach to school bags. */
export default function QrCards({ school, children, onClose }: { school: School; children: AdminChild[]; onClose: () => void }) {
  const [codes, setCodes] = useState<Record<number, string>>({})
  useEffect(() => {
    Promise.all(children.map(async c => [c.id, await QRCode.toDataURL(c.card_uid, { margin: 1, width: 240 })] as const))
      .then(pairs => setCodes(Object.fromEntries(pairs)))
  }, [children])

  return (
    <div className="qr-page">
      <div className="no-print row between">
        <button className="btn" onClick={onClose}>Back</button>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
      </div>
      <div className="qr-grid">
        {children.map(c => (
          <div key={c.id} className="qr-card">
            <div className="qr-brand">LittleGo</div>
            {codes[c.id] ? <img src={codes[c.id]} alt={`QR code for ${c.name}`} width={120} height={120} /> : <div style={{ height: 120 }} />}
            <div className="qr-name">{c.name}</div>
            <div className="qr-meta">{c.class_name} · {school.name}</div>
            <div className="qr-id">{c.card_uid}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
