import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, PageHero, getCategoryImage, getProductImage, handleImgError } from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/* ===================== Browse vendors (FR-C3) ===================== */
export function CustomerHome() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [search,  setSearch]  = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => {
    let q = '';
    const params = [];
    if (search)         params.push(`search=${encodeURIComponent(search)}`);
    if (activeCategory) params.push(`category=${encodeURIComponent(activeCategory)}`);
    if (params.length) q = '?' + params.join('&');
    api.get(`/vendors${q}`).then(setVendors).catch(() => {});
  }, [search, activeCategory]);

  const allCategories = Array.from(new Set(vendors.map(v => v.category))).filter(Boolean);

  return (
    <div>
      <PageHero
        eyebrow={user ? `Welcome, ${user.username}` : 'Discover'}
        title="What's"
        italicWord="for dinner?"
        sub="Browse local kitchens, grocers, and specialty shops near you."
      />

      <div className="hero-search">
        <svg className="hero-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          className="hero-search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search restaurants, cuisines, or specific dishes…"
        />
        {search && (
          <button className="hero-search-clear" onClick={() => setSearch('')} aria-label="Clear">×</button>
        )}
      </div>

      {allCategories.length > 0 && (
        <div className="chip-row">
          <button className={`chip ${!activeCategory ? 'chip-active' : ''}`} onClick={() => setActiveCategory('')}>All</button>
          {allCategories.map(c => (
            <button key={c} className={`chip ${activeCategory === c ? 'chip-active' : ''}`}
                    onClick={() => setActiveCategory(activeCategory === c ? '' : c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {vendors.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🍽️</div>
          <h3>No vendors found</h3>
          <p className="muted">Try a different search or category.</p>
        </div>
      )}

      <div className="grid grid-2">
        {vendors.map(v => (
          <Link key={v.vendorID} to={`/customer/vendors/${v.vendorID}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="vendor-card">
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
                  <span className="muted" style={{ fontSize: 12 }}>~25 min · Free delivery</span>
                  <span className="view-link">View menu →</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ===================== Vendor details + ordering ===================== */
export function VendorDetailPage() {
  const id = window.location.pathname.split('/').pop();
  const navigate = useNavigate();

  const [vendor,   setVendor]   = useState(null);
  const [products, setProducts] = useState([]);
  const [reviews,  setReviews]  = useState([]);
  const [cart,     setCart]     = useState({});
  const [scheduled, setScheduled] = useState('');
  const [redeemPts, setRedeemPts] = useState(0);
  const [loyalty,   setLoyalty]   = useState({ accumulated: 0 });
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [filter,   setFilter]   = useState({ search: '', maxPrice: '' });

  useEffect(() => {
    api.get(`/vendors/${id}`).then(setVendor);
    api.get(`/vendors/${id}/reviews`).then(setReviews);
    api.get('/loyalty/me').then(setLoyalty).catch(() => {});
    refreshProducts();
  }, [id]);

  function refreshProducts() {
    let q = `/products?vendorID=${id}`;
    if (filter.search)   q += `&search=${encodeURIComponent(filter.search)}`;
    if (filter.maxPrice) q += `&maxPrice=${filter.maxPrice}`;
    api.get(q).then(setProducts);
  }
  useEffect(refreshProducts, [filter]);

  function addToCart(p) {
    setCart(c => ({ ...c, [p.productID]: (c[p.productID] || 0) + 1 }));
  }
  function decFromCart(p) {
    setCart(c => {
      const next = { ...c };
      if (!next[p.productID]) return c;
      next[p.productID]--;
      if (next[p.productID] <= 0) delete next[p.productID];
      return next;
    });
  }
  function removeFromCart(productID) {
    setCart(c => {
      const next = { ...c };
      delete next[productID];
      return next;
    });
  }

  const subtotal = Object.entries(cart).reduce((s, [pid, q]) => {
    const p = products.find(p => p.productID == pid);
    return s + (p ? Number(p.price) * q : 0);
  }, 0);
  const discount = redeemPts * 0.10;
  const total    = Math.max(0, subtotal - discount);
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  async function placeOrder() {
    setError(''); setSuccess('');
    try {
      const items = Object.entries(cart).map(([productID, quantity]) =>
        ({ productID: Number(productID), quantity }));
      if (!items.length) { setError('Cart is empty'); return; }
      const data = await api.post('/orders', {
        vendorID: Number(id),
        items,
        scheduledTime: scheduled || null,
        redeemPoints: Number(redeemPts) || 0,
      });
      setSuccess(`Order #${data.orderID} placed (total $${data.total})`);
      setCart({});
      setRedeemPts(0);
      setTimeout(() => navigate('/customer/orders'), 1500);
    } catch (err) { setError(err.message); }
  }

  if (!vendor) return <p>Loading…</p>;

  return (
    <div>
      <div className="vendor-hero"
           style={{ backgroundImage: `linear-gradient(rgba(26, 20, 16, 0.55), rgba(26, 20, 16, 0.75)), url(${getCategoryImage(vendor.category)})` }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--accent-soft)' }}>{vendor.category}</span>
          <h2 style={{ color: 'var(--bg)', fontSize: '3rem' }}>{vendor.businessName}</h2>
          <p style={{ color: 'rgba(246,241,232,.85)', margin: 0 }}>
            {vendor.address} · <span className="stars">★</span> {Number(vendor.rating).toFixed(1)}
          </p>
        </div>
      </div>

      <div className="row mt-12" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <div className="filter-bar">
            <div className="form-group">
              <label>Search products</label>
              <input value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} placeholder="Margherita, salmon, salad…" />
            </div>
            <div className="form-group" style={{ maxWidth: 160 }}>
              <label>Max price ($)</label>
              <input type="number" value={filter.maxPrice} onChange={e => setFilter(f => ({ ...f, maxPrice: e.target.value }))} />
            </div>
          </div>

          {products.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🥄</div>
              <h3>No items match your filters</h3>
              <p className="muted">Try clearing your search or raising the price cap.</p>
            </div>
          )}

          <div className="grid grid-3">
            {products.map(p => (
              <div key={p.productID} className="product-card-pro">
                <div className="product-card-image">
                  <img src={getProductImage(p.name, p.category)} alt={p.name} onError={handleImgError} />
                  <span className="product-card-cat">{p.category}</span>
                </div>
                <div className="product-card-body">
                  <h4>{p.name}</h4>
                  <p className="desc">{p.description}</p>
                  <div className="price-row">
                    <span className="price">${Number(p.price).toFixed(2)}</span>
                    <span className="stock">{p.availability} left</span>
                  </div>
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => decFromCart(p)} disabled={!cart[p.productID]}>−</button>
                    <span className="qty-display">{cart[p.productID] || 0}</span>
                    <button className="qty-btn" onClick={() => addToCart(p)} disabled={(cart[p.productID] || 0) >= p.availability}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 40, marginBottom: 16 }}>What people say</h3>
          {reviews.length === 0 && <p className="muted">No reviews yet — be the first.</p>}
          {reviews.map(r => (
            <div key={r.reviewID} className="card mb-12">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{r.username}</strong>
                <span className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              </div>
              <p className="muted" style={{ margin: '6px 0 0' }}>{r.comment}</p>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 300, maxWidth: 380 }}>
          <div className="cart-pro">
            <div className="cart-pro-header">
              <h3>Your basket</h3>
              {itemCount > 0 && <span className="cart-pro-count">{itemCount} item{itemCount > 1 ? 's' : ''}</span>}
            </div>

            {error   && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {Object.keys(cart).length === 0 && (
              <div className="cart-pro-empty">
                <div style={{ fontSize: 36, marginBottom: 8 }}>🧺</div>
                <p>Your basket is empty</p>
                <span className="muted">Pick something delicious to start.</span>
              </div>
            )}

            {Object.keys(cart).length > 0 && (
              <>
                <div className="cart-pro-items">
                  {Object.entries(cart).map(([pid, q]) => {
                    const p = products.find(p => p.productID == pid);
                    if (!p) return null;
                    return (
                      <div key={pid} className="cart-pro-item">
                        <img src={getProductImage(p.name, p.category)} alt={p.name} className="cart-pro-thumb" onError={handleImgError} />
                        <div className="cart-pro-item-body">
                          <div className="cart-pro-item-name">{p.name}</div>
                          <div className="cart-pro-item-price">${Number(p.price).toFixed(2)} each</div>
                          <div className="cart-pro-qty">
                            <button onClick={() => decFromCart(p)}>−</button>
                            <span>{q}</span>
                            <button onClick={() => addToCart(p)} disabled={q >= p.availability}>+</button>
                          </div>
                        </div>
                        <div className="cart-pro-item-total">
                          <strong>${(Number(p.price) * q).toFixed(2)}</strong>
                          <button className="cart-pro-remove" onClick={() => removeFromCart(pid)} title="Remove">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="cart-pro-extras">
                  <div className="form-group">
                    <label>Schedule (optional, 9–22h)</label>
                    <input type="datetime-local" value={scheduled} onChange={e => setScheduled(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Redeem points · {loyalty.accumulated} avail.</label>
                    <input type="number" min="0" max={loyalty.accumulated} value={redeemPts} onChange={e => setRedeemPts(e.target.value)} />
                  </div>
                </div>

                <div className="cart-pro-totals">
                  <div className="cart-pro-line"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  {discount > 0 && <div className="cart-pro-line"><span>Discount</span><span>−${discount.toFixed(2)}</span></div>}
                  <div className="cart-pro-line"><span>Delivery</span><span>Free</span></div>
                  <div className="cart-pro-total">
                    <span>Total</span>
                    <span className="cart-pro-total-amount">${total.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}

            <button className="cart-pro-checkout" onClick={placeOrder} disabled={!Object.keys(cart).length}>
              {Object.keys(cart).length ? `Place order · $${total.toFixed(2)}` : 'Place order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== My orders + tracking (FR-C5) ===================== */
export function MyOrdersPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const refresh = () => api.get('/orders/me').then(setOrders).catch(() => {});
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <PageHero
        eyebrow="History"
        title="Your"
        italicWord="orders"
        sub="Live tracking refreshes every 5 seconds."
      />
      {orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>No orders yet</h3>
          <p className="muted">When you place an order, it'll show up here.</p>
          <Link to="/customer" className="btn btn-accent mt-12">Browse vendors →</Link>
        </div>
      )}
      {orders.map(o => <OrderRow key={o.orderID} order={o} />)}
    </div>
  );
}

function OrderRow({ order }) {
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');

  async function submitReview() {
    try {
      await api.post('/reviews', { orderID: order.orderID, rating, comment });
      setMsg('Review submitted!');
      setShowReview(false);
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="order-row">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="id">#{order.orderID}</span>
          <h4>{order.businessName}</h4>
          <p className="muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {order.createdAt} · ${Number(order.totalPrice).toFixed(2)}
          </p>
        </div>
        <StatusBadge status={order.orderStatus} />
      </div>
      {order.orderStatus === 'Delivered' && !showReview && (
        <button className="btn btn-sm mt-12" onClick={() => setShowReview(true)}>Rate &amp; review</button>
      )}
      {showReview && (
        <div className="mt-12">
          <div className="form-group">
            <label>Rating</label>
            <select value={rating} onChange={e => setRating(Number(e.target.value))}>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} stars</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Comment (optional)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} />
          </div>
          <button className="btn btn-sm" onClick={submitReview}>Submit</button>
          {msg && <span className="muted" style={{ marginLeft: 12 }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}

/* ===================== Loyalty (FR-C7) ===================== */
export function LoyaltyPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/loyalty/me').then(setData); }, []);
  if (!data) return <p>Loading…</p>;
  const dollarValue = (data.accumulated * 0.10).toFixed(2);

  return (
    <div>
      <PageHero
        eyebrow="Loyalty"
        title="Your"
        italicWord="rewards"
        sub="Earn 1 point per dollar. Redeem any time at checkout."
      />
      <div className="grid grid-3">
        <div className="stat-card">
          <div className="label">Available points</div>
          <div className="value">{data.accumulated}</div>
          <div className="delta">≈ ${dollarValue} of credit</div>
        </div>
        <div className="stat-card">
          <div className="label">Total redeemed</div>
          <div className="value">{data.redeemed}</div>
          <div className="delta">lifetime</div>
        </div>
        <div className="stat-card">
          <div className="label">Redemption rate</div>
          <div className="value">10:1</div>
          <div className="delta">10 pts = $1.00</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Recommendations (US-016) ===================== */
export function RecommendationsPage() {
  const [budget, setBudget] = useState('');
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState('');

  async function load() {
    setError('');
    try {
      const q = budget ? `?budget=${budget}` : '';
      setData(await api.get(`/recommendations${q}`));
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHero
        eyebrow="Personalized"
        title="Just"
        italicWord="for you"
        sub={data ? `Time-of-day context: ${data.context}.` : null}
      />
      <div className="filter-bar">
        <div className="form-group">
          <label>Budget cap ($)</label>
          <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. 15" />
        </div>
        <button className="btn btn-accent" onClick={load}>Refresh</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {data && data.items.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✨</div>
          <h3>Place an order to get recommendations</h3>
          <p className="muted">Once you have some history, we'll suggest dishes you might love.</p>
        </div>
      )}
      {data && (
        <div className="grid grid-3">
          {data.items.map(p => (
            <div key={p.productID} className="product-card-pro">
              <div className="product-card-image">
                <img src={getProductImage(p.name, p.category)} alt={p.name} onError={handleImgError} />
                <span className="product-card-cat">{p.category}</span>
              </div>
              <div className="product-card-body">
                <h4>{p.name}</h4>
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>from {p.businessName}</p>
                <p className="desc">{p.description}</p>
                <div className="price-row">
                  <span className="price">${Number(p.price).toFixed(2)}</span>
                  <span className="stock">score {p._score}</span>
                </div>
                <Link to={`/customer/vendors/${p.vendorID}`} className="btn btn-sm">View vendor →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
