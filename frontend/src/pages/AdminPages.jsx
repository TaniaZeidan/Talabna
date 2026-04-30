import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { PageHero } from '../components/Layout.jsx';

/* ============= Activity dashboard (FR-A4) ============= */
export function AdminActivityPage() {
  const [data, setData] = useState(null);
  function refresh() { api.get('/admin/activity').then(setData).catch(() => {}); }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, []);
  if (!data) return <p>Loading…</p>;
  const c = data.counts;

  return (
    <div>
      <PageHero
        eyebrow="Admin · live"
        title="System"
        italicWord="activity"
        sub="Live counts and the most recent audit-log entries."
      />
      <div className="grid grid-3">
        <div className="stat-card"><div className="label">Active users</div>     <div className="value">{c.activeUsers}</div></div>
        <div className="stat-card"><div className="label">Approved vendors</div> <div className="value">{c.approvedVendors}</div></div>
        <div className="stat-card"><div className="label">Ongoing orders</div>   <div className="value">{c.ongoingOrders}</div></div>
        <div className="stat-card"><div className="label">Delivered (24h)</div>  <div className="value">{c.deliveredToday}</div></div>
      </div>
      <h3 style={{ marginTop: 36, marginBottom: 16 }}>Recent audit log</h3>
      <div className="card">
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {data.recentActivity.map(a => (
              <tr key={a.logID}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.timestamp}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{a.userID || '—'}</td>
                <td><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{a.action}</strong></td>
                <td className="muted">{a.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============= Vendor approval (FR-A2) ============= */
export function AdminVendorsPage() {
  const [pending, setPending] = useState([]);
  const [error,   setError]   = useState('');

  function refresh() { api.get('/admin/vendors/pending').then(setPending); }
  useEffect(refresh, []);

  async function decide(id, action) {
    setError('');
    try {
      await api.post(`/admin/vendors/${id}/${action}`, {});
      refresh();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="Approvals"
        title="Pending"
        italicWord="vendors"
        sub="Review and approve vendor applications before they go live."
      />
      {error && <div className="alert alert-error">{error}</div>}
      {pending.length === 0 && <p className="muted">No pending applications.</p>}
      {pending.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Business</th><th>Owner</th><th>Email</th><th>Phone</th><th>Category</th><th>Address</th><th></th></tr>
            </thead>
            <tbody>
              {pending.map(v => (
                <tr key={v.vendorID}>
                  <td><strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{v.businessName}</strong></td>
                  <td>{v.username}</td>
                  <td>{v.email}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{v.phone}</td>
                  <td>{v.category}</td>
                  <td>{v.address}</td>
                  <td className="text-right">
                    <button className="btn btn-success btn-sm" onClick={() => decide(v.vendorID, 'approve')}>Approve</button>{' '}
                    <button className="btn btn-danger btn-sm"  onClick={() => decide(v.vendorID, 'reject')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============= User management (FR-A3) ============= */
export function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');

  function refresh() {
    const q = filter ? `?role=${filter}` : '';
    api.get(`/admin/users${q}`).then(setUsers);
  }
  useEffect(refresh, [filter]);

  async function toggle(u) {
    const action = u.accountStatus === 'suspended' ? 'reactivate' : 'suspend';
    if (!confirm(`${action} user ${u.username}?`)) return;
    await api.post(`/admin/users/${u.userID}/${action}`, {});
    refresh();
  }

  return (
    <div>
      <PageHero
        eyebrow="Roster"
        title="User"
        italicWord="management"
      />
      <div className="filter-bar">
        <div className="form-group">
          <label>Filter by role</label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.userID}>
                <td><strong>{u.username}</strong></td>
                <td>{u.email}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.role}</td>
                <td><span className={`badge ${u.accountStatus === 'active' ? 'badge-delivered' : u.accountStatus === 'suspended' ? 'badge-cancelled' : 'badge-pending'}`}>{u.accountStatus}</span></td>
                <td className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.createdAt}</td>
                <td className="text-right">
                  {u.role !== 'admin' && (
                    <button className={`btn btn-sm ${u.accountStatus === 'suspended' ? 'btn-success' : 'btn-danger'}`}
                            onClick={() => toggle(u)}>
                      {u.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============= Reports (FR-A5) ============= */
export function AdminReportsPage() {
  const [range, setRange] = useState('week');
  const [data,  setData]  = useState(null);

  useEffect(() => { api.get(`/admin/reports?range=${range}`).then(setData); }, [range]);

  if (!data) return <p>Loading…</p>;
  return (
    <div>
      <PageHero
        eyebrow="Insight"
        title="Platform"
        italicWord="reports"
      />
      <div className="filter-bar">
        <div className="form-group">
          <label>Time range</label>
          <select value={range} onChange={e => setRange(e.target.value)}>
            <option value="day">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
        </div>
      </div>
      <div className="grid grid-3">
        <div className="stat-card"><div className="label">Delivered orders</div>   <div className="value">{data.orders.totalOrders}</div></div>
        <div className="stat-card"><div className="label">Revenue</div>            <div className="value">${Number(data.orders.revenue).toFixed(0)}</div></div>
        <div className="stat-card"><div className="label">Active customers</div>   <div className="value">{data.customerActivity.activeCustomers}</div></div>
        <div className="stat-card"><div className="label">Points earned</div>      <div className="value">{data.loyalty.pointsEarned}</div></div>
        <div className="stat-card"><div className="label">Points redeemed</div>    <div className="value">{data.loyalty.pointsRedeemed}</div></div>
      </div>
      <h3 style={{ marginTop: 36, marginBottom: 16 }}>Top vendors</h3>
      <div className="card">
        <table>
          <thead><tr><th>Vendor</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>
            {data.byVendor.map((v, i) => (
              <tr key={i}>
                <td><strong style={{ fontFamily: 'var(--font-display)' }}>{v.businessName}</strong></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{v.orders}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(v.revenue).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
