import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { PageHero, getCategoryImage, getProductImage, handleImgError, validateCard, formatCardNumber, formatExpiry } from '../components/Layout.jsx';

/**
 * Multi-store cart: a cart that can span multiple vendors in one session.
 * Cart shape (kept in state): { [vendorID]: { vendor, items: { [productID]: { product, qty } } } }
 */
export default function MultiStoreCartPage() {
  const navigate = useNavigate();
  const [vendors,  setVendors]  = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart,     setCart]     = useState({});
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardErrors, setCardErrors] = useState([]);

  useEffect(() => { api.get('/vendors').then(setVendors); }, []);

  function loadProducts(vendor) {
    setSelectedVendor(vendor);
    api.get(`/products?vendorID=${vendor.vendorID}`).then(setProducts);
  }

  function addItem(p) {
    setCart(c => {
      const v = c[selectedVendor.vendorID] || { vendor: selectedVendor, items: {} };
      const existing = v.items[p.productID];
      v.items[p.productID] = {
        product: p,
        qty: existing ? existing.qty + 1 : 1,
      };
      return { ...c, [selectedVendor.vendorID]: { ...v } };
    });
  }

  function decItem(vid, pid) {
    setCart(c => {
      const v = c[vid];
      if (!v) return c;
      const it = v.items[pid];
      if (!it) return c;
      if (it.qty <= 1) {
        delete v.items[pid];
      } else {
        v.items[pid] = { ...it, qty: it.qty - 1 };
      }
      if (Object.keys(v.items).length === 0) {
        const next = { ...c };
        delete next[vid];
        return next;
      }
      return { ...c, [vid]: { ...v } };
    });
  }

  function removeItem(vid, pid) {
    setCart(c => {
      const v = c[vid];
      if (!v) return c;
      delete v.items[pid];
      if (Object.keys(v.items).length === 0) {
        const next = { ...c };
        delete next[vid];
        return next;
      }
      return { ...c, [vid]: { ...v } };
    });
  }

  // Compute per-vendor and grand totals
  const vendorTotals = Object.values(cart).map(v => ({
    vendorID: v.vendor.vendorID,
    businessName: v.vendor.businessName,
    vendor: v.vendor,
    items: Object.values(v.items),
    subtotal: Object.values(v.items).reduce((s, it) => s + Number(it.product.price) * it.qty, 0),
  }));
  const DELIVERY_FEE = 2.00;
  const itemSubtotal = vendorTotals.reduce((s, v) => s + v.subtotal, 0);
  const grandTotal = vendorTotals.length > 0 ? itemSubtotal + DELIVERY_FEE : 0;
  const totalItems = vendorTotals.reduce((s, v) => s + v.items.reduce((a, it) => a + it.qty, 0), 0);

  async function checkout() {
    setError(''); setSuccess(''); setCardErrors([]);
    if (paymentMethod === 'card') {
      const errs = validateCard(cardNumber, cardExpiry, cardCvv);
      if (errs.length) { setCardErrors(errs); return; }
    }
    if (vendorTotals.length === 0) { setError('Cart is empty'); return; }

    try {
      if (vendorTotals.length === 1) {
        // Single vendor — use existing /orders endpoint
        const v = vendorTotals[0];
        const items = v.items.map(it => ({ productID: it.product.productID, quantity: it.qty }));
        const data = await api.post('/orders', { vendorID: v.vendorID, items, paymentMethod });
        setSuccess(`Order #${data.orderID} placed (total $${data.total})`);
      } else {
        // Multi-vendor — use new endpoint
        const groups = vendorTotals.map(v => ({
          vendorID: v.vendorID,
          items: v.items.map(it => ({ productID: it.product.productID, quantity: it.qty })),
        }));
        const data = await api.post('/orders/multi-store', { groups, paymentMethod });
        setSuccess(`Multi-store order placed: ${data.orders.length} orders, total $${data.grandTotal}`);
      }
      setCart({});
      setTimeout(() => navigate('/customer/orders'), 1500);
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="One session, many stores"
        title="Multi-store"
        italicWord="cart"
        sub="Add items from multiple vendors and check out everything at once."
      />

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          {!selectedVendor && (
            <>
              <h3>Pick a vendor to add items from</h3>
              <div className="grid grid-2">
                {vendors.map(v => (
                  <div key={v.vendorID} className="vendor-card" onClick={() => loadProducts(v)} style={{ cursor: 'pointer' }}>
                    <div className="vendor-card-image vendor-card-image-photo">
                      <img src={getCategoryImage(v.category)} alt={v.businessName} onError={handleImgError} />
                      <div className="vendor-card-rating">
                        <span className="stars" style={{ fontSize: 12 }}>★</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{Number(v.rating).toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="vendor-card-body">
                      <h3>{v.businessName}</h3>
                      <div className="meta">{v.category} · {v.address}</div>
                      <div className="footer">
                        <span className="muted" style={{ fontSize: 12 }}>~25 min</span>
                        <span className="view-link">Browse menu →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedVendor && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>{selectedVendor.businessName}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedVendor(null); setProducts([]); }}>← Back to vendors</button>
              </div>
              <div className="grid grid-3">
                {products.map(p => {
                  const inCart = cart[selectedVendor.vendorID]?.items[p.productID]?.qty || 0;
                  return (
                    <div key={p.productID} className="product-card-pro">
                      <div className="product-card-image">
                        <img src={getProductImage(p.name, p.category, p.imageUrl)} alt={p.name} onError={handleImgError} />
                        <span className="product-card-cat">{p.category}</span>
                      </div>
                      <div className="product-card-body">
                        <h4>{p.name}</h4>
                        <p className="desc">{p.description}</p>
                        <div className="price-row">
                          <span className="price">${Number(p.price).toFixed(2)}</span>
                        </div>
                        <div className="qty-control">
                          <button className="qty-btn" onClick={() => decItem(selectedVendor.vendorID, p.productID)} disabled={!inCart}>−</button>
                          <span className="qty-display">{inCart}</span>
                          <button className="qty-btn" onClick={() => addItem(p)}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 300, maxWidth: 380 }}>
          <div className="cart-pro">
            <div className="cart-pro-header">
              <h3>Multi-store basket</h3>
              {totalItems > 0 && <span className="cart-pro-count">{totalItems} item{totalItems > 1 ? 's' : ''}</span>}
            </div>

            {vendorTotals.length === 0 && (
              <div className="cart-pro-empty">
                <div style={{ fontSize: 36, marginBottom: 8 }}>🏪</div>
                <p>No items yet</p>
                <span className="muted">Add from any vendor to start.</span>
              </div>
            )}

            {vendorTotals.length > 0 && (
              <>
                <div className="cart-pro-items">
                  {vendorTotals.map(v => (
                    <div key={v.vendorID} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(246,241,232,.12)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-soft)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                        {v.businessName} · ${v.subtotal.toFixed(2)}
                      </div>
                      {v.items.map(it => (
                        <div key={it.product.productID} className="cart-pro-item" style={{ paddingTop: 8, paddingBottom: 8 }}>
                          <img src={getProductImage(it.product.name, it.product.category, it.product.imageUrl)} alt={it.product.name} className="cart-pro-thumb" onError={handleImgError} />
                          <div className="cart-pro-item-body">
                            <div className="cart-pro-item-name">{it.product.name}</div>
                            <div className="cart-pro-item-price">${Number(it.product.price).toFixed(2)} each</div>
                            <div className="cart-pro-qty">
                              <button onClick={() => decItem(v.vendorID, it.product.productID)}>−</button>
                              <span>{it.qty}</span>
                              <button onClick={() => addItem(it.product)}>+</button>
                            </div>
                          </div>
                          <div className="cart-pro-item-total">
                            <strong>${(Number(it.product.price) * it.qty).toFixed(2)}</strong>
                            <button className="cart-pro-remove" onClick={() => removeItem(v.vendorID, it.product.productID)} title="Remove">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="cart-pro-extras">
                  <div className="form-group">
                    <label>Payment method</label>
                    <div className="payment-method-picker">
                      <button
                        className={`payment-method-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('cash')}
                        type="button"
                      >
                        <span className="payment-icon">💵</span> Pay on delivery
                      </button>
                      <button
                        className={`payment-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('card')}
                        type="button"
                      >
                        <span className="payment-icon">💳</span> Pay by card
                      </button>
                    </div>
                  </div>
                  {paymentMethod === 'card' && (
                    <div className="card-form">
                      {cardErrors.length > 0 && (
                        <div className="alert alert-error" style={{ marginBottom: 10, fontSize: 13 }}>
                          {cardErrors.map((e, i) => <div key={i}>{e}</div>)}
                        </div>
                      )}
                      <div className="form-group">
                        <label>Card number</label>
                        <input
                          type="text"
                          placeholder="1234 5678 9012 3456"
                          maxLength="19"
                          value={cardNumber}
                          onChange={e => { setCardNumber(formatCardNumber(e.target.value)); setCardErrors([]); }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Expiry</label>
                          <input
                            type="text"
                            placeholder="MM/YY"
                            maxLength="5"
                            value={cardExpiry}
                            onChange={e => { setCardExpiry(formatExpiry(e.target.value)); setCardErrors([]); }}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>CVV</label>
                          <input
                            type="text"
                            placeholder="123"
                            maxLength="4"
                            value={cardCvv}
                            onChange={e => { setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErrors([]); }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="cart-pro-totals">
                  <div className="cart-pro-line"><span>{vendorTotals.length} vendor{vendorTotals.length > 1 ? 's' : ''}</span><span>{totalItems} item{totalItems > 1 ? 's' : ''}</span></div>
                  <div className="cart-pro-line"><span>Subtotal</span><span>${itemSubtotal.toFixed(2)}</span></div>
                  <div className="cart-pro-line"><span>Delivery</span><span>${DELIVERY_FEE.toFixed(2)}</span></div>
                  <div className="cart-pro-total">
                    <span>Total</span>
                    <span className="cart-pro-total-amount">${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            <button className="cart-pro-checkout" onClick={checkout} disabled={vendorTotals.length === 0}>
              {vendorTotals.length > 1 ? `Checkout · ${vendorTotals.length} stores · $${grandTotal.toFixed(2)}` :
               vendorTotals.length === 1 ? `Place order · $${grandTotal.toFixed(2)}` : 'Checkout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
