import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusBadge, PageHero } from '../components/Layout.jsx';

export function DriverAvailablePage() {
  const [available, setAvailable] = useState([]);
  const [error,     setError]     = useState('');

  function refresh() { api.get('/driver/available').then(setAvailable).catch(() => {}); }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function accept(id) {
    setError('');
    try {
      await api.post(`/driver/deliveries/${id}/accept`, {});
      refresh();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="Driver portal"
        title="Pickups"
        italicWord="ready"
        sub="Accept a delivery to claim it. Updates every 5 seconds."
      />
      {error && <div className="alert alert-error">{error}</div>}
      {available.length === 0 && <p className="muted">No deliveries available right now. Check back soon.</p>}
      {available.map(o => (
        <div key={o.orderID} className="order-row">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="id">#{o.orderID}</span>
              <h4>{o.businessName}</h4>
              <p className="muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Pickup: {o.pickupAddress} · ${Number(o.totalPrice).toFixed(2)}
              </p>
            </div>
            <button className="btn btn-success btn-sm" onClick={() => accept(o.orderID)}>Accept →</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DriverDeliveriesPage() {
  const [items, setItems] = useState([]);
  const [issue, setIssue] = useState({});
  const [error, setError] = useState('');

  function refresh() { api.get('/driver/deliveries').then(setItems).catch(() => {}); }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(id, status) {
    setError('');
    try {
      await api.post(`/driver/deliveries/${id}/status`, { status });
      refresh();
    } catch (err) { setError(err.message); }
  }

  async function reportIssue(id) {
    if (!issue[id]) return;
    try {
      await api.post(`/driver/deliveries/${id}/issue`, { issue: issue[id] });
      setIssue(prev => ({ ...prev, [id]: '' }));
      alert('Issue reported');
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="Active runs"
        title="My"
        italicWord="deliveries"
      />
      {error && <div className="alert alert-error">{error}</div>}
      {items.length === 0 && <p className="muted">No assigned deliveries.</p>}
      {items.map(d => (
        <div key={d.deliveryID} className="order-row">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="id">#{d.orderID}</span>
              <h4>{d.businessName}</h4>
              <p className="muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Pickup: {d.pickupAddress}<br/>
                Customer: {d.customerName} · {d.customerPhone}
              </p>
            </div>
            <StatusBadge status={d.deliveryStatus} />
          </div>
          <div className="row gap-8 mt-12">
            {d.deliveryStatus === 'Assigned' && (
              <button className="btn btn-sm" onClick={() => setStatus(d.orderID, 'PickedUp')}>Mark picked up</button>
            )}
            {(d.deliveryStatus === 'PickedUp' || d.deliveryStatus === 'OnTheWay') && (
              <>
                <button className="btn btn-success btn-sm" onClick={() => setStatus(d.orderID, 'Delivered')}>Mark delivered</button>
                <button className="btn btn-danger btn-sm"  onClick={() => setStatus(d.orderID, 'Failed')}>Delivery failed</button>
              </>
            )}
          </div>
          <div className="row gap-8 mt-12" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Report an issue</label>
              <input value={issue[d.orderID] || ''} onChange={e => setIssue({ ...issue, [d.orderID]: e.target.value })} placeholder="describe issue" />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => reportIssue(d.orderID)} disabled={!issue[d.orderID]}>Report</button>
          </div>
        </div>
      ))}
    </div>
  );
}
