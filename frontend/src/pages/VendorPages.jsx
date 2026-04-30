import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusBadge, PageHero } from '../components/Layout.jsx';

/* ============= Dashboard summary ============= */
export function VendorDashboard() {
  const [orders,    setOrders]    = useState([]);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api.get('/vendor/orders').then(setOrders).catch(() => {});
    api.get('/vendor/analytics').then(setAnalytics).catch(() => {});
  }, []);

  const pending = orders.filter(o => o.orderStatus === 'Pending').length;
  const active  = orders.filter(o =>
    ['Confirmed','InPreparation','ReadyForPickup','OnTheWay'].includes(o.orderStatus)).length;

  return (
    <div>
      <PageHero
        eyebrow="Vendor portal"
        title="Today's"
        italicWord="kitchen"
        sub="Real-time view of your orders and revenue."
      />

      <div className="grid grid-3">
        <div className="stat-card">
          <div className="label">Pending</div>
          <div className="value">{pending}</div>
          <div className="delta">awaiting confirmation</div>
        </div>
        <div className="stat-card">
          <div className="label">Active orders</div>
          <div className="value">{active}</div>
          <div className="delta">in progress</div>
        </div>
        {analytics && (
          <div className="stat-card">
            <div className="label">Lifetime revenue</div>
            <div className="value">${Number(analytics.totalRevenue).toFixed(0)}</div>
            <div className="delta">{analytics.totalOrders} delivered orders</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============= Product CRUD (FR-V2, FR-V3) ============= */
export function VendorProductsPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: '', availability: 0 });
  const [editing, setEditing] = useState(null);
  const [error, setError]   = useState('');

  function refresh() { api.get('/vendor/products').then(setProducts); }
  useEffect(refresh, []);

  function update(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function save() {
    setError('');
    try {
      if (editing) {
        await api.put(`/vendor/products/${editing}`, form);
      } else {
        await api.post('/vendor/products', form);
      }
      setForm({ name: '', description: '', price: '', category: '', availability: 0 });
      setEditing(null);
      refresh();
    } catch (err) { setError(err.message); }
  }

  function startEdit(p) {
    setEditing(p.productID);
    setForm({ name: p.name, description: p.description || '', price: p.price, category: p.category, availability: p.availability });
  }

  async function remove(id) {
    if (!confirm('Remove this product?')) return;
    await api.del(`/vendor/products/${id}`);
    refresh();
  }

  return (
    <div>
      <PageHero
        eyebrow="Catalog"
        title="Your"
        italicWord="menu"
        sub="Add, edit, and remove products. Out-of-stock items are hidden from customers."
      />

      <div className="card mb-12">
        <h3>{editing ? 'Edit product' : 'Add new product'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="row">
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Category</label>
            <input value={form.category} onChange={update('category')} required />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={update('description')} rows={2} />
        </div>
        <div className="row">
          <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
            <label>Price ($)</label>
            <input type="number" step="0.01" value={form.price} onChange={update('price')} required />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
            <label>Stock</label>
            <input type="number" value={form.availability} onChange={update('availability')} required />
          </div>
        </div>
        <button className="btn btn-accent" onClick={save}>{editing ? 'Save changes' : 'Add product'}</button>
        {editing && <button className="btn btn-secondary" style={{ marginLeft: 8 }}
          onClick={() => { setEditing(null); setForm({ name: '', description: '', price: '', category: '', availability: 0 }); }}>Cancel</button>}
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.productID}>
                <td><strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{p.name}</strong></td>
                <td>{p.category}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(p.price).toFixed(2)}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{p.availability}</td>
                <td className="text-right">
                  <button className="btn btn-sm btn-secondary" onClick={() => startEdit(p)}>Edit</button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(p.productID)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============= Order management (FR-V4, FR-V5) ============= */
export function VendorOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  function refresh() { api.get('/vendor/orders').then(setOrders); }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function action(id, kind, body = {}) {
    setError('');
    try {
      await api.post(`/vendor/orders/${id}/${kind}`, body);
      refresh();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="Live"
        title="Incoming"
        italicWord="orders"
        sub="Confirm pending orders within 10 minutes — auto-cancel after."
      />
      {error && <div className="alert alert-error">{error}</div>}
      {orders.length === 0 && <p className="muted">No orders yet.</p>}
      {orders.map(o => (
        <div key={o.orderID} className="order-row">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="id">#{o.orderID}</span>
              <h4>{o.customerName} · ${Number(o.totalPrice).toFixed(2)}</h4>
              <p className="muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.createdAt}</p>
            </div>
            <StatusBadge status={o.orderStatus} />
          </div>
          <div className="row gap-8 mt-12">
            {o.orderStatus === 'Pending' && (
              <>
                <button className="btn btn-success btn-sm" onClick={() => action(o.orderID, 'confirm')}>Confirm</button>
                <button className="btn btn-danger btn-sm"  onClick={() => action(o.orderID, 'reject')}>Reject</button>
              </>
            )}
            {o.orderStatus === 'Confirmed' && (
              <button className="btn btn-sm" onClick={() => action(o.orderID, 'prepare', { status: 'InPreparation' })}>Start preparing</button>
            )}
            {o.orderStatus === 'InPreparation' && (
              <button className="btn btn-success btn-sm" onClick={() => action(o.orderID, 'prepare', { status: 'ReadyForPickup' })}>Mark ready for pickup</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============= Analytics (FR-V6) ============= */
export function VendorAnalyticsPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/vendor/analytics').then(setData); }, []);
  if (!data) return <p>Loading…</p>;
  return (
    <div>
      <PageHero
        eyebrow="Insight"
        title="Performance"
        italicWord="overview"
      />
      <div className="grid grid-3">
        <div className="stat-card"><div className="label">Total delivered</div><div className="value">{data.totalOrders}</div><div className="delta">orders</div></div>
        <div className="stat-card"><div className="label">Total revenue</div><div className="value">${Number(data.totalRevenue).toFixed(0)}</div><div className="delta">all time</div></div>
        <div className="stat-card"><div className="label">Avg. preparation</div><div className="value">{data.avgPrepMinutes ? `${data.avgPrepMinutes}m` : '—'}</div><div className="delta">order to pickup</div></div>
      </div>
      <h3 style={{ marginTop: 36, marginBottom: 16 }}>Top products</h3>
      <div className="card">
        <table>
          <thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th></tr></thead>
          <tbody>
            {data.topProducts.map(p => (
              <tr key={p.productID}>
                <td><strong style={{ fontFamily: 'var(--font-display)' }}>{p.name}</strong></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{p.unitsSold}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(p.revenue).toFixed(2)}</td>
              </tr>
            ))}
            {data.topProducts.length === 0 && <tr><td colSpan="3" className="muted">No data yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
