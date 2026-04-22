import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

// Attach admin token
API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('admin_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

const fmt = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtShort = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Components ────────────────────────────────────────────────────
const Badge = ({ color, children }: any) => {
  const colors: any = {
    green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800', blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-600', purple: 'bg-purple-100 text-purple-800',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>{children}</span>;
};

const StatCard = ({ label, value, color }: any) => (
  <div className={`bg-white rounded-xl p-5 border border-gray-100 shadow-sm`}>
    <p className="text-sm text-gray-500 font-medium">{label}</p>
    <p className={`text-3xl font-black mt-1 ${color || 'text-gray-900'}`}>{value}</p>
  </div>
);

const Button = ({ onClick, variant = 'primary', children, disabled, small }: any) => {
  const base = `font-semibold rounded-lg transition-all ${small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm'}`;
  const variants: any = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    ghost: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
  };
  return <button className={`${base} ${variants[variant]}`} onClick={onClick} disabled={disabled}>{children}</button>;
};

// ── Login ─────────────────────────────────────────────────────────
function Login({ onLogin }: any) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const res = await API.post('/auth/login', { phone, password });
      const { user, accessToken } = res.data.data;
      if (user.role !== 'admin') { setError('Admin access only'); return; }
      localStorage.setItem('admin_token', accessToken);
      onLogin(user);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <h1 className="text-4xl font-black text-indigo-600 mb-1">Link</h1>
        <p className="text-gray-500 mb-8 text-sm">Admin Panel</p>
        {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
        <div className="space-y-4">
          <input className="w-full px-4 h-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} />
          <input type="password" className="w-full px-4 h-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <button onClick={handleLogin} disabled={loading}
            className="w-full h-12 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    Promise.all([API.get('/admin/dashboard'), API.get('/admin/metrics')])
      .then(([d, m]) => { setData(d.data.data); setMetrics(m.data.data); });
  }, []);

  if (!data || !metrics) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 space-y-8">
      <h2 className="text-2xl font-black text-gray-900">Dashboard</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending KYC" value={data.stats.pending_kyc} color="text-indigo-600" />
        <StatCard label="Open Disputes" value={data.stats.open_disputes} color="text-red-600" />
        <StatCard label="Jobs Today" value={data.stats.jobs_today} color="text-blue-600" />
        <StatCard label="Revenue Today" value={data.stats.revenue_today_formatted} color="text-green-600" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="GMV (30 days)" value={metrics.gmv_formatted} color="text-gray-900" />
        <StatCard label="Platform Revenue" value={metrics.platform_revenue_formatted} color="text-green-700" />
        <StatCard label="Dispute Rate" value={`${metrics.dispute_rate_percent}%`} color={metrics.dispute_rate_percent > 5 ? 'text-red-600' : 'text-green-600'} />
        <StatCard label="Verified Vendors" value={metrics.total_verified_vendors} color="text-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent KYC */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Pending KYC</h3>
          <div className="space-y-3">
            {data.recent_kyc.map((v: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{v.full_name}</p>
                  <p className="text-xs text-gray-400">{v.primary_service} · {fmtShort(v.updated_at)}</p>
                </div>
                <Badge color="yellow">Pending</Badge>
              </div>
            ))}
            {data.recent_kyc.length === 0 && <p className="text-sm text-gray-400">No pending reviews</p>}
          </div>
        </div>

        {/* Top services */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4">Top Services (30 days)</h3>
          <div className="space-y-3">
            {metrics.top_services.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                </div>
                <span className="text-sm font-bold text-indigo-600">{s.job_count} jobs</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KYC Queue ─────────────────────────────────────────────────────
function KYCQueue() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('under_review');

  const load = useCallback(async () => {
    const res = await API.get('/admin/kyc', { params: { status: statusFilter } });
    setVendors(res.data.data.vendors);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const review = async (action: string) => {
    if ((action === 'reject' || action === 'request_info') && !reason) {
      alert('Please provide a reason'); return;
    }
    setLoading(true);
    try {
      await API.post(`/admin/kyc/${selected.vendor_profile_id}/review`, { action, reason });
      setSelected(null); setReason('');
      load();
    } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const kycStatusColor: any = { under_review: 'yellow', approved: 'green', rejected: 'red', info_requested: 'blue', pending: 'gray' };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-gray-900">KYC Review</h2>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="info_requested">Info Requested</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {vendors.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No vendors in this queue</div>
          ) : vendors.map((v: any) => (
            <button key={v.vendor_profile_id}
              className={`w-full text-left px-5 py-4 border-b border-gray-50 hover:bg-indigo-50 transition-colors ${selected?.vendor_profile_id === v.vendor_profile_id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
              onClick={() => { setSelected(v); setReason(''); }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{v.full_name}</p>
                  <p className="text-xs text-gray-400">{(v.services || []).join(', ') || 'No services'} · {v.location_area || '—'}</p>
                </div>
                <Badge color={kycStatusColor[v.kyc_status]}>{v.kyc_status}</Badge>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.full_name}</h3>
                <p className="text-sm text-gray-500">{selected.email} · {selected.phone}</p>
              </div>
              <Badge color={kycStatusColor[selected.kyc_status]}>{selected.kyc_status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['ID Type', selected.id_type?.replace('_', ' ') || '—'],
                ['Services', (selected.services || []).join(', ') || '—'],
                ['Location', selected.location_area || '—'],
                ['Portfolio', `${selected.image_count || 0} images`],
                ['BVN', selected.has_bvn ? '✓ Present' : '✗ Missing'],
                ['Account', selected.account_name ? `${selected.account_name} · ${selected.bank_name}` : '—'],
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
                <img src={selected.id_document_url} alt="ID" className="w-full rounded-lg object-cover max-h-40" />
              </div>
            )}

            {selected.selfie_url && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Selfie</p>
                <img src={selected.selfie_url} alt="Selfie" className="w-32 h-32 rounded-full object-cover mx-auto" />
              </div>
            )}

            {selected.kyc_status === 'under_review' && (
              <>
                <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2} placeholder="Rejection or info request reason (required for reject/request info)"
                  value={reason} onChange={e => setReason(e.target.value)} />

                <div className="flex gap-2">
                  <Button variant="success" onClick={() => review('approve')} disabled={loading} small>Approve</Button>
                  <Button variant="warning" onClick={() => review('request_info')} disabled={loading} small>Request Info</Button>
                  <Button variant="danger" onClick={() => review('reject')} disabled={loading} small>Reject</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
            Select a vendor to review
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dispute Dashboard ─────────────────────────────────────────────
function DisputeDashboard() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [ruling, setRuling] = useState('full_refund');
  const [split, setSplit] = useState(50);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    API.get('/admin/disputes').then(r => setDisputes(r.data.data));
  }, []);

  const selectDispute = async (d: any) => {
    setSelected(d);
    const res = await API.get(`/disputes/${d.id}`);
    setDetail(res.data.data);
  };

  const ruleDispute = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await API.post(`/admin/disputes/${selected.id}/rule`, {
        ruling, ruling_split: ruling === 'partial_split' ? split : undefined, ruling_notes: notes,
      });
      setSelected(null); setDetail(null); setNotes('');
      const res = await API.get('/admin/disputes');
      setDisputes(res.data.data);
    } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const issueLabel: any = {
    never_started: 'Service never started', incomplete: 'Incomplete service',
    quality: 'Quality dispute', no_show: 'Vendor no-show',
  };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-black text-gray-900">Disputes</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {disputes.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No open disputes</div>
          ) : disputes.map((d: any) => (
            <button key={d.id}
              className={`w-full text-left px-5 py-4 border-b border-gray-50 hover:bg-red-50 transition-colors ${selected?.id === d.id ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}
              onClick={() => selectDispute(d)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-xs text-gray-400">{d.reference}</p>
                  <p className="font-semibold text-sm text-gray-800 mt-0.5">{d.customer_name} vs {d.vendor_name}</p>
                  <p className="text-xs text-gray-400">{issueLabel[d.issue]} · {fmt(d.agreed_amount)}</p>
                </div>
                <div className="text-right">
                  <Badge color={d.hours_remaining < 6 ? 'red' : 'yellow'}>{Math.max(0, Math.round(d.hours_remaining))}h left</Badge>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        {detail && selected ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5 overflow-y-auto max-h-screen">
            <div>
              <h3 className="text-base font-bold text-gray-900">Job {detail.dispute.reference}</h3>
              <p className="text-sm text-gray-500">{detail.dispute.service_name} · {fmt(detail.dispute.agreed_amount)}</p>
            </div>

            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-800">Issue: {issueLabel[detail.dispute.issue]}</p>
              <p className="text-xs text-red-600 mt-1">Raised by {detail.dispute.customer_id === detail.dispute.raised_by ? 'customer' : 'vendor'}</p>
            </div>

            {/* Call recordings */}
            {detail.call_recordings?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call Recordings</p>
                {detail.call_recordings.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-2">
                    <span className="text-xs text-gray-500">{fmtDate(c.started_at)} · {c.duration_secs}s</span>
                    {c.recording_url && <a href={c.recording_url} target="_blank" className="text-xs text-indigo-600 font-semibold">▶ Play</a>}
                  </div>
                ))}
              </div>
            )}

            {/* Voice notes */}
            {detail.voice_notes?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Voice Notes</p>
                {detail.voice_notes.map((v: any) => (
                  <div key={v.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-2">
                    <span className="text-xs text-gray-500">{v.sent_by_name} · {v.duration_secs}s · {fmtDate(v.created_at)}</span>
                    <a href={v.recording_url} target="_blank" className="text-xs text-indigo-600 font-semibold">▶ Play</a>
                  </div>
                ))}
              </div>
            )}

            {/* Evidence */}
            {detail.evidence?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evidence ({detail.evidence.length} files)</p>
                <div className="flex flex-wrap gap-2">
                  {detail.evidence.map((e: any) => (
                    <a key={e.id} href={e.file_url} target="_blank">
                      {e.type === 'photo' ? (
                        <img src={e.file_url} className="w-20 h-20 rounded-lg object-cover border" />
                      ) : (
                        <div className="w-20 h-20 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-500">{e.type}</div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Ruling */}
            {detail.dispute.status !== 'resolved' && (
              <div className="space-y-3 border-t pt-4">
                <p className="font-bold text-gray-800">Make a ruling</p>

                <div className="space-y-2">
                  {[
                    { k: 'full_refund', l: 'Full refund to customer', c: 'border-blue-300 bg-blue-50' },
                    { k: 'partial_split', l: 'Partial split', c: 'border-yellow-300 bg-yellow-50' },
                    { k: 'full_payment', l: 'Full payment to vendor', c: 'border-green-300 bg-green-50' },
                  ].map(opt => (
                    <label key={opt.k} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${ruling === opt.k ? opt.c : 'border-gray-200'}`}>
                      <input type="radio" value={opt.k} checked={ruling === opt.k} onChange={() => setRuling(opt.k)} />
                      <span className="text-sm font-medium">{opt.l}</span>
                    </label>
                  ))}
                </div>

                {ruling === 'partial_split' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Customer gets {split}%, Vendor gets {100 - split}%</label>
                    <input type="range" min={1} max={99} value={split} onChange={e => setSplit(parseInt(e.target.value))}
                      className="w-full" />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Customer: {fmt(Math.round((detail.dispute.agreed_amount || 0) * split / 100))}</span>
                      <span>Vendor: {fmt(Math.round((detail.dispute.agreed_amount || 0) * (100 - split) / 100))}</span>
                    </div>
                  </div>
                )}

                <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2} placeholder="Ruling notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

                <Button variant="primary" onClick={ruleDispute} disabled={loading}>
                  {loading ? 'Processing...' : 'Submit Ruling'}
                </Button>
              </div>
            )}

            {detail.dispute.status === 'resolved' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-bold text-green-800">Resolved: {detail.dispute.ruling?.replace('_', ' ')}</p>
                {detail.dispute.ruling_notes && <p className="text-xs text-green-600 mt-1">{detail.dispute.ruling_notes}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
            Select a dispute to review
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vendor Management ─────────────────────────────────────────────
function VendorManagement() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/vendors', { params: { search: search || undefined, status: statusFilter || undefined } });
      setVendors(res.data.data);
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t); }, [load]);

  const updateStatus = async (vendorId: string, action: string) => {
    const reason = action !== 'reinstate' ? prompt(`Reason for ${action}:`) : 'Reinstated by admin';
    if (action !== 'reinstate' && !reason) return;
    try {
      await API.post(`/admin/vendors/${vendorId}/status`, { action, reason });
      load();
    } catch (e: any) { alert(e.response?.data?.message || 'Failed'); }
  };

  const statusColor: any = { active: 'green', suspended: 'yellow', banned: 'red', pending_kyc: 'gray' };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-black text-gray-900">Vendors</h2>

      <div className="flex gap-3">
        <input className="flex-1 px-4 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Search by name, phone, or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-xl px-3 text-sm focus:outline-none"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="pending_kyc">Pending KYC</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Vendor', 'Services', 'Location', 'Rating', 'Jobs', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No vendors found</td></tr>
            ) : vendors.map((v: any) => (
              <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{v.full_name}</p>
                  <p className="text-xs text-gray-400">{v.phone}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-gray-600">{(v.services || []).join(', ') || '—'}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{v.location_area || '—'}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{v.avg_rating ? parseFloat(v.avg_rating).toFixed(1) : '—'}</span>
                </td>
                <td className="px-4 py-3 font-semibold">{v.total_jobs}</td>
                <td className="px-4 py-3"><Badge color={statusColor[v.status]}>{v.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {v.status === 'active' && <Button variant="warning" small onClick={() => updateStatus(v.id, 'suspend')}>Suspend</Button>}
                    {v.status === 'active' && <Button variant="danger" small onClick={() => updateStatus(v.id, 'ban')}>Ban</Button>}
                    {(v.status === 'suspended' || v.status === 'banned') && <Button variant="success" small onClick={() => updateStatus(v.id, 'reinstate')}>Reinstate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Services ──────────────────────────────────────────────────────
function ServicesPanel() {
  const [pending, setPending] = useState<any[]>([]);

  const load = () => API.get('/admin/services/pending').then(r => setPending(r.data.data));
  useEffect(() => { load(); }, []);

  const act = async (id: string, action: string) => {
    await API.post(`/admin/services/${id}`, { action });
    load();
  };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-black text-gray-900">Service Suggestions</h2>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {pending.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No pending service suggestions</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Service Name', 'Suggested By', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.map((s: any) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500">{s.suggested_by_name || 'Anonymous'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtShort(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button variant="success" small onClick={() => act(s.id, 'approve')}>Approve</Button>
                      <Button variant="danger" small onClick={() => act(s.id, 'reject')}>Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'kyc', label: 'KYC Review', icon: '✓' },
  { id: 'disputes', label: 'Disputes', icon: '⚑' },
  { id: 'vendors', label: 'Vendors', icon: '♟' },
  { id: 'services', label: 'Services', icon: '⊕' },
];

// ── App ───────────────────────────────────────────────────────────
export default function AdminApp() {
  const [user, setUser] = useState<any>(null);
  const [page, setPage] = useState('dashboard');

  // Check existing session
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      // Decode minimal info from token
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.userId, role: 'admin' });
      } catch { localStorage.removeItem('admin_token'); }
    }
  }, []);

  if (!user) return <Login onLogin={setUser} />;

  const pages: any = { dashboard: Dashboard, kyc: KYCQueue, disputes: DisputeDashboard, vendors: VendorManagement, services: ServicesPanel };
  const PageComponent = pages[page] || Dashboard;

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-100 flex flex-col shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-black text-indigo-600">Link</h1>
          <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <button key={item.id}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${page === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setPage(item.id)}>
              <span className="mr-2">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
            onClick={() => { localStorage.removeItem('admin_token'); setUser(null); }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <PageComponent />
      </div>
    </div>
  );
}
