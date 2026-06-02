import React, { useState, useEffect, useCallback } from 'react'
import api from './api'

// ── Types ─────────────────────────────────────────────────────────
interface User { id: string; role: string; full_name: string; phone: string; email: string }

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtShort = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })

// ── UI Components ─────────────────────────────────────────────────
const Badge = ({ color, children }: { color: string; children: React.ReactNode }) => {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800', blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-600', purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
  }
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>{children}</span>
}

const Stat = ({ label, value, color = 'text-gray-900' }: { label: string; value: string | number; color?: string }) => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
  </div>
)

const Btn = ({ onClick, variant = 'primary', children, disabled = false, sm = false }: any) => {
  const base = `font-semibold rounded-lg transition-all ${sm ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} disabled:opacity-40`
  const v: Record<string, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    ghost: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
  }
  return <button className={`${base} ${v[variant]}`} onClick={onClick} disabled={disabled}>{children}</button>
}

// ── Login ─────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!phone || !password) { setErr('Enter phone and password'); return }
    setLoading(true); setErr('')
    try {
      const res = await api.post('/auth/login', { phone, password })
      const { user, accessToken } = res.data.data
      if (user.role !== 'admin') { setErr('Admin accounts only'); setLoading(false); return }
      localStorage.setItem('link_admin_token', accessToken)
      onLogin(user, accessToken)
    } catch (e: any) {
      setErr(e.response?.data?.message || 'Login failed')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <h1 className="text-4xl font-black text-indigo-600 tracking-tight">Link</h1>
        <p className="text-gray-400 text-sm mt-1 mb-8">Admin Panel</p>
        {err && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">{err}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <input className="w-full px-4 h-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="08XXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" className="w-full px-4 h-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          <button onClick={submit} disabled={loading}
            className="w-full h-11 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)

  useEffect(() => {
    Promise.all([api.get('/admin/dashboard'), api.get('/admin/metrics')])
      .then(([d, m]) => { setStats(d.data.data); setMetrics(m.data.data) })
      .catch(console.error)
  }, [])

  if (!stats) return <div className="p-8 text-gray-400 animate-pulse">Loading dashboard...</div>

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-black text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Overview of Link marketplace activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Pending KYC" value={stats.stats.pending_kyc} color="text-indigo-600" />
        <Stat label="Open Disputes" value={stats.stats.open_disputes} color="text-red-600" />
        <Stat label="Jobs Today" value={stats.stats.jobs_today} color="text-blue-600" />
        <Stat label="Revenue Today" value={stats.stats.revenue_today_formatted} color="text-green-600" />
      </div>

      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="GMV (30 days)" value={metrics.gmv_formatted} />
          <Stat label="Platform Revenue" value={metrics.platform_revenue_formatted} color="text-green-700" />
          <Stat label="Dispute Rate" value={`${metrics.dispute_rate_percent}%`} color={metrics.dispute_rate_percent > 5 ? 'text-red-600' : 'text-green-600'} />
          <Stat label="Verified Vendors" value={metrics.total_verified_vendors} color="text-indigo-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Pending KYC Reviews</h3>
          {stats.recent_kyc.length === 0 ? (
            <p className="text-sm text-gray-400">No pending reviews 🎉</p>
          ) : stats.recent_kyc.map((v: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-semibold text-sm text-gray-800">{v.full_name}</p>
                <p className="text-xs text-gray-400">{(v.services || []).join(', ') || '—'} · {fmtShort(v.kyc_submitted_at)}</p>
              </div>
              <Badge color="yellow">Under Review</Badge>
            </div>
          ))}
        </div>

        {metrics && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">Top Services (30 days)</h3>
            {metrics.top_services.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-5">{i + 1}</span>
                  <span className="text-sm text-gray-800">{s.name}</span>
                </div>
                <span className="text-sm font-bold text-indigo-600">{s.job_count} jobs</span>
              </div>
            ))}
            {metrics.top_services.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KYC Queue ─────────────────────────────────────────────────────
function KYCQueue() {
  const [vendors, setVendors] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('under_review')

  const load = useCallback(() => {
    api.get(`/admin/kyc?status=${filter}`).then(r => setVendors(r.data.data.vendors)).catch(console.error)
  }, [filter])

  useEffect(() => { load() }, [load])

  const review = async (action: string) => {
    if ((action === 'reject' || action === 'request_info') && !reason.trim()) {
      alert('Please provide a reason'); return
    }
    setLoading(true)
    try {
      await api.post(`/admin/kyc/${selected.vendor_profile_id}/review`, { action, reason })
      setSelected(null); setReason(''); load()
    } catch (e: any) { alert(e.response?.data?.message || 'Failed') }
    setLoading(false)
  }

  const statusColor: Record<string, string> = { under_review: 'yellow', approved: 'green', rejected: 'red', info_requested: 'blue', pending: 'gray' }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900">KYC Review</h2>
          <p className="text-gray-500 text-sm mt-1">Verify vendor identities before they go live</p>
        </div>
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="info_requested">Info Requested</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {vendors.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No vendors in this queue</div>
          ) : vendors.map((v: any) => (
            <button key={v.vendor_profile_id}
              className={`w-full text-left px-5 py-4 border-b border-gray-50 hover:bg-indigo-50 transition-colors ${selected?.vendor_profile_id === v.vendor_profile_id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
              onClick={() => { setSelected(v); setReason('') }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{v.full_name}</p>
                  <p className="text-xs text-gray-400">{v.phone} · {(v.services || []).join(', ') || 'No services'}</p>
                  <p className="text-xs text-gray-400">{v.location_area || '—'} · {v.kyc_submitted_at ? fmtShort(v.kyc_submitted_at) : '—'}</p>
                </div>
                <Badge color={statusColor[v.kyc_status]}>{v.kyc_status?.replace('_', ' ')}</Badge>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5 overflow-y-auto max-h-[80vh]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.full_name}</h3>
                <p className="text-sm text-gray-500">{selected.email} · {selected.phone}</p>
              </div>
              <Badge color={statusColor[selected.kyc_status]}>{selected.kyc_status?.replace('_', ' ')}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['ID Type', selected.id_type?.replace('_', ' ') || '—'],
                ['Services', (selected.services || []).join(', ') || '—'],
                ['Location', selected.location_area || '—'],
                ['Portfolio', `${selected.image_count || 0} images`],
                ['BVN', selected.bvn_verified ? '✓ Verified' : '✗ Not verified'],
                ['Bank Account', selected.account_name ? `${selected.account_name} · ${selected.bank_name}` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 font-medium">{k}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{v}</p>
                </div>
              ))}
            </div>

            {selected.id_document_url && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">ID Document</p>
                <img src={selected.id_document_url} alt="ID" className="w-full max-h-48 rounded-lg object-cover border border-gray-100" />
              </div>
            )}

            {selected.selfie_url && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Selfie</p>
                <img src={selected.selfie_url} alt="Selfie" className="w-32 h-32 rounded-full object-cover mx-auto border-2 border-gray-100" />
              </div>
            )}

            {selected.kyc_status === 'under_review' && (
              <div className="space-y-3 pt-2 border-t">
                <textarea
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2} placeholder="Reason (required for reject / request info)"
                  value={reason} onChange={e => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Btn variant="success" onClick={() => review('approve')} disabled={loading} sm>✓ Approve</Btn>
                  <Btn variant="warning" onClick={() => review('request_info')} disabled={loading} sm>Request Info</Btn>
                  <Btn variant="danger" onClick={() => review('reject')} disabled={loading} sm>✗ Reject</Btn>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            Select a vendor to review their KYC
          </div>
        )}
      </div>
    </div>
  )
}

// ── Disputes ──────────────────────────────────────────────────────
function Disputes() {
  const [disputes, setDisputes] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [ruling, setRuling] = useState('full_refund')
  const [split, setSplit] = useState(50)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => api.get('/admin/disputes').then(r => setDisputes(r.data.data)).catch(console.error)
  useEffect(() => { load() }, [])

  const rule = async () => {
    setLoading(true)
    try {
      await api.post(`/admin/disputes/${selected.id}/rule`, {
        ruling,
        ruling_split: ruling === 'partial_split' ? split : undefined,
        ruling_notes: notes || undefined,
      })
      setSelected(null); setNotes(''); load()
    } catch (e: any) { alert(e.response?.data?.message || 'Failed') }
    setLoading(false)
  }

  const issueLabel: Record<string, string> = {
    never_started: 'Service never started', incomplete: 'Incomplete service',
    quality: 'Quality dispute', no_show: 'Vendor no-show', other: 'Other',
  }

  const hoursLeft = (d: string) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 3600000))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-black text-gray-900">Disputes</h2>
        <p className="text-gray-500 text-sm mt-1">Review and rule on customer-vendor disputes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {disputes.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No open disputes 🎉</div>
          ) : disputes.map((d: any) => (
            <button key={d.id}
              className={`w-full text-left px-5 py-4 border-b border-gray-50 hover:bg-red-50 transition-colors ${selected?.id === d.id ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}
              onClick={() => { setSelected(d); setNotes('') }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{d.customer_name} vs {d.vendor_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{issueLabel[d.issue]} · {fmt(d.agreed_amount)}</p>
                </div>
                <Badge color={d.deadline_at && hoursLeft(d.deadline_at) < 6 ? 'red' : 'yellow'}>
                  {d.deadline_at ? `${hoursLeft(d.deadline_at)}h left` : 'Open'}
                </Badge>
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="font-bold text-gray-900">{selected.customer_name} vs {selected.vendor_name}</h3>
              <p className="text-sm text-gray-500">{selected.service_name} · {fmt(selected.agreed_amount)}</p>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-800">Issue: {issueLabel[selected.issue]}</p>
              {selected.deadline_at && (
                <p className="text-xs text-red-500 mt-1">Deadline: {fmtDate(selected.deadline_at)}</p>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <p className="font-semibold text-gray-800 text-sm">Make a ruling</p>

              {[
                { k: 'full_refund', l: 'Full refund to customer', c: 'blue' },
                { k: 'partial_split', l: 'Split between both parties', c: 'yellow' },
                { k: 'full_payment', l: 'Full payment to vendor', c: 'green' },
              ].map(opt => (
                <label key={opt.k} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${ruling === opt.k ? `border-${opt.c}-300 bg-${opt.c}-50` : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="ruling" value={opt.k} checked={ruling === opt.k} onChange={() => setRuling(opt.k)} />
                  <span className="text-sm font-medium text-gray-800">{opt.l}</span>
                </label>
              ))}

              {ruling === 'partial_split' && (
                <div className="space-y-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <label className="text-sm font-medium text-gray-700">
                    Customer gets {split}% — Vendor gets {100 - split}%
                  </label>
                  <input type="range" min={1} max={99} value={split} onChange={e => setSplit(parseInt(e.target.value))} className="w-full" />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Customer: {fmt(Math.round((selected.agreed_amount || 0) * split / 100))}</span>
                    <span>Vendor: {fmt(Math.round((selected.agreed_amount || 0) * (100 - split) / 100))}</span>
                  </div>
                </div>
              )}

              <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                rows={2} placeholder="Ruling notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

              <Btn variant="primary" onClick={rule} disabled={loading}>
                {loading ? 'Processing...' : 'Submit Ruling'}
              </Btn>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            Select a dispute to review
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vendors ───────────────────────────────────────────────────────
function Vendors() {
  const [vendors, setVendors] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (filter) params.append('status', filter)
    api.get(`/admin/vendors?${params}`).then(r => setVendors(r.data.data)).catch(console.error).finally(() => setLoading(false))
  }, [search, filter])

  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [load])

  const updateStatus = async (id: string, action: string) => {
    const reason = action !== 'reinstate' ? prompt(`Reason for ${action}:`) : 'Reinstated'
    if (action !== 'reinstate' && !reason) return
    try {
      await api.post(`/admin/vendors/${id}/status`, { action, reason })
      load()
    } catch (e: any) { alert(e.response?.data?.message || 'Failed') }
  }

  const statusColor: Record<string, string> = { approved: 'green', rejected: 'red', under_review: 'yellow', pending: 'gray', info_requested: 'blue' }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-black text-gray-900">Vendors</h2>
        <p className="text-gray-500 text-sm mt-1">Manage all vendors on the platform</p>
      </div>

      <div className="flex gap-3">
        <input className="flex-1 px-4 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Search by name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="under_review">Under Review</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Vendor', 'Contact', 'Services', 'Location', 'Rating', 'Jobs', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">No vendors found</td></tr>
            ) : vendors.map((v: any) => (
              <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-gray-800">{v.full_name}</td>
                <td className="px-4 py-3 text-xs text-gray-500"><div>{v.phone}</div><div>{v.email}</div></td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{(v.services || []).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{v.location_area || '—'}</td>
                <td className="px-4 py-3 font-semibold">{v.avg_rating ? parseFloat(v.avg_rating).toFixed(1) : '—'}</td>
                <td className="px-4 py-3 font-semibold">{v.total_jobs}</td>
                <td className="px-4 py-3"><Badge color={statusColor[v.status] || 'gray'}>{v.status?.replace('_', ' ')}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {v.is_active && <Btn variant="warning" sm onClick={() => updateStatus(v.id, 'suspend')}>Suspend</Btn>}
                    {v.is_active && <Btn variant="danger" sm onClick={() => updateStatus(v.id, 'ban')}>Ban</Btn>}
                    {!v.is_active && <Btn variant="success" sm onClick={() => updateStatus(v.id, 'reinstate')}>Reinstate</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── App Shell ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'kyc', label: 'KYC Review', icon: '✓' },
  { id: 'disputes', label: 'Disputes', icon: '⚑' },
  { id: 'vendors', label: 'Vendors', icon: '♟' },
]

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState('dashboard')

  useEffect(() => {
    const token = localStorage.getItem('link_admin_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUser({ id: payload.userId, role: payload.role, full_name: 'Admin', phone: '', email: '' })
      } catch { localStorage.removeItem('link_admin_token') }
    }
  }, [])

  const handleLogin = (u: User) => setUser(u)

  const handleLogout = () => {
    localStorage.removeItem('link_admin_token')
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />

  const pages: Record<string, React.FC> = { dashboard: Dashboard, kyc: KYCQueue, disputes: Disputes, vendors: Vendors }
  const PageComponent = pages[page] || Dashboard

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shadow-sm flex-shrink-0">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-black text-indigo-600 tracking-tight">Link</h1>
          <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <button key={item.id}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${page === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              onClick={() => setPage(item.id)}>
              <span className="mr-2 opacity-70">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 px-1 mb-2 truncate">Signed in</p>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <PageComponent />
      </main>
    </div>
  )
}
