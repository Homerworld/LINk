import React, { useState, useEffect, useCallback } from 'react'
import { adminApi } from './api'

const naira = (kobo) => `\u20A6${((kobo || 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`

function Badge({ text, color }) {
  return <span className={`badge badge-${color}`}>{(text || '').replace(/_/g, ' ')}</span>
}

// ---------- Login ----------
function Login({ onLogin }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!phone || !password) { setErr('Enter phone and password'); return }
    setBusy(true); setErr('')
    try {
      const { user, accessToken } = await adminApi.login(phone.trim(), password)
      if (user.role !== 'admin') { setErr('This is not an admin account'); setBusy(false); return }
      localStorage.setItem('link_admin_token', accessToken)
      onLogin(user)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">Link</div>
        <p className="muted" style={{ marginBottom: 24 }}>Admin panel</p>
        {err && <div className="err">{err}</div>}
        <label className="label">Phone number</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08140439590" />
        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Your password" />
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </div>
  )
}

// ---------- Dashboard ----------
function Dashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { adminApi.dashboard().then(setData).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="empty">{err}</div>
  if (!data) return <div className="empty">Loading…</div>
  const s = data.stats || {}
  return (
    <div>
      <div className="h1">Dashboard</div>
      <div className="sub">Overview of activity on Link</div>
      <div className="stats">
        <div className="stat"><div className="stat-label">Pending KYC</div><div className="stat-value" style={{ color: 'var(--primary)' }}>{s.pendingKyc ?? 0}</div></div>
        <div className="stat"><div className="stat-label">Open disputes</div><div className="stat-value" style={{ color: 'var(--red)' }}>{s.openDisputes ?? 0}</div></div>
        <div className="stat"><div className="stat-label">Verified vendors</div><div className="stat-value" style={{ color: 'var(--green)' }}>{s.verifiedVendors ?? 0}</div></div>
        <div className="stat"><div className="stat-label">Total</div><div className="stat-value">{(s.pendingKyc ?? 0) + (s.verifiedVendors ?? 0)}</div></div>
      </div>
      <div className="card">
        <div className="card-title">Vendors waiting for review</div>
        {(data.recentKyc || []).length === 0 ? <p className="muted">Nothing waiting — you're all caught up.</p> :
          (data.recentKyc || []).map((v) => (
            <div className="row" key={v.id}>
              <div>
                <div className="row-title">{v.fullName}</div>
                <div className="row-sub">{(v.services || []).join(', ') || 'No services'} · {v.phone}</div>
              </div>
              <Badge text="under review" color="yellow" />
            </div>
          ))}
      </div>
    </div>
  )
}

// ---------- KYC Review ----------
function KycReview() {
  const [list, setList] = useState([])
  const [sel, setSel] = useState(null)
  const [reason, setReason] = useState('')
  const [filter, setFilter] = useState('under_review')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    adminApi.kycQueue(filter).then((r) => { setList(r); setSel(null) }).catch(() => setList([]))
  }, [filter])
  useEffect(() => { load() }, [load])

  const review = async (action) => {
    if ((action === 'reject' || action === 'request_info') && !reason.trim()) { alert('Please add a reason'); return }
    setBusy(true)
    try { await adminApi.reviewKyc(sel.id, action, reason); setReason(''); load() }
    catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  const colors = { under_review: 'yellow', approved: 'green', rejected: 'red', info_requested: 'yellow', pending: 'gray' }

  return (
    <div>
      <div className="h1">KYC review</div>
      <div className="sub">Approve vendors so customers can find them</div>
      <div style={{ marginBottom: 16 }}>
        <select className="input" style={{ width: 220, marginBottom: 0 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="under_review">Under review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Not submitted</option>
        </select>
      </div>
      <div className="split">
        <div>
          {list.length === 0 ? <div className="empty">No vendors here</div> :
            list.map((v) => (
              <div key={v.id} className={`list-item ${sel?.id === v.id ? 'selected' : ''}`} onClick={() => { setSel(v); setReason('') }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="row-title">{v.fullName}</div>
                    <div className="row-sub">{(v.services || []).join(', ') || 'No services'}</div>
                    <div className="row-sub">{v.locationArea || '—'} · {v.phone}</div>
                  </div>
                  <Badge text={v.kycStatus} color={colors[v.kycStatus] || 'gray'} />
                </div>
              </div>
            ))}
        </div>
        <div>
          {!sel ? <div className="card"><div className="empty">Select a vendor to review</div></div> : (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 2 }}>{sel.fullName}</div>
                  <div className="muted">{sel.email || '—'} · {sel.phone}</div>
                </div>
                <Badge text={sel.kycStatus} color={colors[sel.kycStatus] || 'gray'} />
              </div>
              <div className="grid2">
                <div className="kv"><div className="kv-k">Services</div><div className="kv-v">{(sel.services || []).join(', ') || '—'}</div></div>
                <div className="kv"><div className="kv-k">Location</div><div className="kv-v">{sel.locationArea || '—'}</div></div>
                <div className="kv"><div className="kv-k">Bank</div><div className="kv-v">{sel.bankName || '—'}</div></div>
                <div className="kv"><div className="kv-k">Account</div><div className="kv-v">{sel.accountNumber || '—'}{sel.accountName ? ` · ${sel.accountName}` : ''}</div></div>
              </div>
              {sel.kycStatus === 'under_review' && (
                <>
                  <textarea className="textarea" style={{ marginTop: 16 }} placeholder="Reason (needed if rejecting or requesting info)"
                    value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="actions">
                    <button className="btn btn-sm btn-green" disabled={busy} onClick={() => review('approve')}>Approve</button>
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => review('request_info')}>Request info</button>
                    <button className="btn btn-sm btn-red" disabled={busy} onClick={() => review('reject')}>Reject</button>
                  </div>
                </>
              )}
              {sel.kycRejectionReason && <p className="muted" style={{ marginTop: 12 }}>Note: {sel.kycRejectionReason}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Disputes ----------
function Disputes() {
  const [list, setList] = useState([])
  const [sel, setSel] = useState(null)
  const [ruling, setRuling] = useState('full_refund')
  const [split, setSplit] = useState(50)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => adminApi.disputes().then((r) => { setList(r); setSel(null) }).catch(() => setList([]))
  useEffect(() => { load() }, [])

  const rule = async () => {
    setBusy(true)
    try {
      await adminApi.ruleDispute(sel.id, { ruling, rulingSplit: ruling === 'partial_split' ? Number(split) : undefined, rulingNotes: notes || undefined })
      setNotes(''); load()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  const issueLabel = { never_started: 'Never started', incomplete: 'Incomplete', quality: 'Quality', no_show: 'No-show', other: 'Other' }

  return (
    <div>
      <div className="h1">Disputes</div>
      <div className="sub">Review and rule on customer–vendor disputes</div>
      <div className="split">
        <div>
          {list.length === 0 ? <div className="empty">No open disputes</div> :
            list.map((d) => (
              <div key={d.id} className={`list-item ${sel?.id === d.id ? 'selected' : ''}`} onClick={() => { setSel(d); setNotes('') }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="row-title">{d.customerName} vs {d.vendorName}</div>
                    <div className="row-sub">{issueLabel[d.issue] || d.issue} · {naira(d.agreedAmount)}</div>
                  </div>
                  <Badge text={d.status} color="yellow" />
                </div>
              </div>
            ))}
        </div>
        <div>
          {!sel ? <div className="card"><div className="empty">Select a dispute</div></div> : (
            <div className="card">
              <div className="card-title">{sel.customerName} vs {sel.vendorName}</div>
              <div className="muted" style={{ marginBottom: 12 }}>{sel.serviceName} · {naira(sel.agreedAmount)}</div>
              <div className="kv" style={{ marginBottom: 16 }}>
                <div className="kv-k">Issue raised</div>
                <div className="kv-v">{issueLabel[sel.issue] || sel.issue}</div>
                {sel.description ? <div className="row-sub" style={{ marginTop: 6 }}>{sel.description}</div> : null}
              </div>
              <div className="card-title" style={{ fontSize: 14 }}>Ruling</div>
              {[
                ['full_refund', 'Full refund to customer'],
                ['partial_split', 'Split between both'],
                ['full_payment', 'Full payment to vendor'],
              ].map(([k, label]) => (
                <div key={k} className={`radio-row ${ruling === k ? 'on' : ''}`} onClick={() => setRuling(k)}>
                  <input type="radio" checked={ruling === k} readOnly />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                </div>
              ))}
              {ruling === 'partial_split' && (
                <div style={{ margin: '8px 0 14px' }}>
                  <label className="label">Customer gets {split}% · Vendor gets {100 - split}%</label>
                  <input type="range" min="1" max="99" value={split} onChange={(e) => setSplit(e.target.value)} style={{ width: '100%' }} />
                  <div className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Customer: {naira(Math.round((sel.agreedAmount || 0) * split / 100))}</span>
                    <span>Vendor: {naira(Math.round((sel.agreedAmount || 0) * (100 - split) / 100))}</span>
                  </div>
                </div>
              )}
              <textarea className="textarea" placeholder="Ruling notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button className="btn btn-sm" disabled={busy} onClick={rule}>{busy ? 'Processing…' : 'Submit ruling'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Vendors ----------
function Vendors() {
  const [list, setList] = useState([])
  const [q, setQ] = useState('')
  const load = () => adminApi.vendors().then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])

  const act = async (id, action) => {
    if (!confirm(`Really ${action} this vendor?`)) return
    try { await adminApi.vendorStatus(id, action); load() } catch (e) { alert(e.message) }
  }

  const colors = { approved: 'green', under_review: 'yellow', rejected: 'red', pending: 'gray', info_requested: 'yellow' }
  const filtered = list.filter((v) => !q || (v.fullName || '').toLowerCase().includes(q.toLowerCase()) || (v.phone || '').includes(q))

  return (
    <div>
      <div className="h1">Vendors</div>
      <div className="sub">Everyone offering services on Link</div>
      <input className="input" style={{ maxWidth: 360 }} placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="table">
        <thead><tr><th>Vendor</th><th>Phone</th><th>Services</th><th>KYC</th><th>Rating</th><th>Jobs</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {filtered.length === 0 ? <tr><td colSpan="8"><div className="empty">No vendors found</div></td></tr> :
            filtered.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 700 }}>{v.fullName}</td>
                <td>{v.phone}</td>
                <td style={{ color: 'var(--text-sec)' }}>{(v.services || []).join(', ') || '—'}</td>
                <td><Badge text={v.kycStatus} color={colors[v.kycStatus] || 'gray'} /></td>
                <td>{v.avgRating ? Number(v.avgRating).toFixed(1) : '—'}</td>
                <td>{v.totalJobs || 0}</td>
                <td>{v.isActive ? '✓' : '✗'}</td>
                <td>
                  {v.isActive
                    ? <button className="btn btn-sm btn-red" onClick={() => act(v.id, 'suspend')}>Suspend</button>
                    : <button className="btn btn-sm btn-green" onClick={() => act(v.id, 'reinstate')}>Reinstate</button>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Shell ----------
const NAV = [
  ['dashboard', 'Dashboard'],
  ['kyc', 'KYC review'],
  ['disputes', 'Disputes'],
  ['vendors', 'Vendors'],
]

export default function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('link_admin_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.role === 'admin') setUser({ role: 'admin' })
        else localStorage.removeItem('link_admin_token')
      } catch { localStorage.removeItem('link_admin_token') }
    }
    setChecking(false)
  }, [])

  if (checking) return null
  if (!user) return <Login onLogin={setUser} />

  const signOut = () => { localStorage.removeItem('link_admin_token'); setUser(null) }
  const Page = { dashboard: Dashboard, kyc: KycReview, disputes: Disputes, vendors: Vendors }[page] || Dashboard

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">Link</div>
        {NAV.map(([k, label]) => (
          <button key={k} className={`nav-item ${page === k ? 'active' : ''}`} onClick={() => setPage(k)}>{label}</button>
        ))}
        <button className="signout" onClick={signOut}>Sign out</button>
      </aside>
      <main className="main"><Page /></main>
    </div>
  )
}
