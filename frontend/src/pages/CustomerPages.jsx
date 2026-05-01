import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { StatusBadge, PageHero, getCategoryImage, getProductImage, handleImgError, validateCard, formatCardNumber, formatExpiry } from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/* ===================== Browse vendors (FR-C3) ===================== */
export function CustomerHome() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [favorites, setFavorites] = useState([]); // array of vendorIDs
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

  useEffect(() => {
    api.get('/favorites').then(rows => setFavorites(rows.map(r => r.vendorID))).catch(() => {});
  }, []);

  function isFav(id) { return favorites.includes(id); }

  async function toggleFav(e, vendorID) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (isFav(vendorID)) {
        await api.del(`/favorites/${vendorID}`);
        setFavorites(f => f.filter(id => id !== vendorID));
      } else {
        await api.post('/favorites', { vendorID });
        setFavorites(f => [...f, vendorID]);
      }
    } catch (err) { /* silent */ }
  }

  const allCategories = Array.from(new Set(vendors.map(v => v.category))).filter(Boolean);

  // Sort: favorites first, then by rating
  const sortedVendors = [...vendors].sort((a, b) => {
    const aFav = isFav(a.vendorID) ? 1 : 0;
    const bFav = isFav(b.vendorID) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    return Number(b.rating) - Number(a.rating);
  });

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
        {sortedVendors.map(v => (
          <Link key={v.vendorID} to={`/customer/vendors/${v.vendorID}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className={`vendor-card ${isFav(v.vendorID) ? 'vendor-card-fav' : ''}`}>
              <div className="vendor-card-image vendor-card-image-photo">
                <img src={getCategoryImage(v.category)} alt={v.businessName} onError={handleImgError} />
                <button
                  className={`vendor-card-fav-btn ${isFav(v.vendorID) ? 'on' : ''}`}
                  onClick={(e) => toggleFav(e, v.vendorID)}
                  title={isFav(v.vendorID) ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label="Toggle favorite"
                >
                  {isFav(v.vendorID) ? '♥' : '♡'}
                </button>
                <div className="vendor-card-rating">
                  <span className="stars" style={{ fontSize: 12 }}>★</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{Number(v.rating).toFixed(1)}</span>
                </div>
              </div>
              <div className="vendor-card-body">
                <h3>{v.businessName}{isFav(v.vendorID) && <span style={{ color: 'var(--accent)', marginLeft: 8, fontSize: '0.85em' }}>♥</span>}</h3>
                <div className="meta">{v.category} · {v.address}</div>
                <div className="footer">
                  <span className="muted" style={{ fontSize: 12 }}>~25 min · $2.00 delivery</span>
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
  const [isFavorite, setIsFavorite] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [specialInstructions, setSpecialInstructions] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardErrors, setCardErrors] = useState([]);

  useEffect(() => {
    api.get(`/vendors/${id}`).then(setVendor);
    api.get(`/vendors/${id}/reviews`).then(setReviews);
    api.get('/loyalty/me').then(setLoyalty).catch(() => {});
    api.get('/favorites').then(rows => setIsFavorite(rows.some(r => String(r.vendorID) === String(id)))).catch(() => {});
    refreshProducts();
  }, [id]);

  async function toggleFavorite() {
    try {
      if (isFavorite) {
        await api.del(`/favorites/${id}`);
        setIsFavorite(false);
      } else {
        await api.post('/favorites', { vendorID: Number(id) });
        setIsFavorite(true);
      }
    } catch (err) { /* silent */ }
  }

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

  function openDetail(p) { setDetailProduct(p); }
  function closeDetail() { setDetailProduct(null); }

  const DELIVERY_FEE = 2.00;
  const subtotal = Object.entries(cart).reduce((s, [pid, q]) => {
    const p = products.find(p => p.productID == pid);
    return s + (p ? Number(p.price) * q : 0);
  }, 0);
  const discount = redeemPts * 0.10;
  const total    = Math.max(0, subtotal - discount + DELIVERY_FEE);
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  async function placeOrder() {
    setError(''); setSuccess(''); setCardErrors([]);
    if (paymentMethod === 'card') {
      const errs = validateCard(cardNumber, cardExpiry, cardCvv);
      if (errs.length) { setCardErrors(errs); return; }
    }
    try {
      const items = Object.entries(cart).map(([productID, quantity]) =>
        ({ productID: Number(productID), quantity, specialInstructions: specialInstructions[productID] || null }));
      if (!items.length) { setError('Cart is empty'); return; }
      const data = await api.post('/orders', {
        vendorID: Number(id),
        items,
        scheduledTime: scheduled || null,
        redeemPoints: Number(redeemPts) || 0,
        paymentMethod,
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
        <div style={{ flex: 1 }}>
          <span className="eyebrow" style={{ color: 'var(--accent-soft)' }}>{vendor.category}</span>
          <h2 style={{ color: 'var(--bg)', fontSize: '3rem' }}>{vendor.businessName}</h2>
          <p style={{ color: 'rgba(246,241,232,.85)', margin: 0 }}>
            {vendor.address} · <span className="stars">★</span> {Number(vendor.rating).toFixed(1)}
          </p>
        </div>
        <button
          className={`vendor-hero-fav ${isFavorite ? 'on' : ''}`}
          onClick={toggleFavorite}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '♥' : '♡'} <span>{isFavorite ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      <div className="row mt-12" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <div className="store-search-bar">
            <svg className="store-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              className="store-search-input"
              value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
              placeholder="Search this menu…"
            />
            {filter.search && (
              <button className="store-search-clear" onClick={() => setFilter(f => ({ ...f, search: '' }))} aria-label="Clear">×</button>
            )}
            <div className="store-search-divider" />
            <span className="store-search-price-label">Max $</span>
            <input
              type="number"
              className="store-search-price"
              value={filter.maxPrice}
              onChange={e => setFilter(f => ({ ...f, maxPrice: e.target.value }))}
              placeholder="—"
            />
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
              <div key={p.productID} className="product-card-pro" onClick={() => openDetail(p)} style={{ cursor: 'pointer' }}>
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
                  <div className="qty-control" onClick={e => e.stopPropagation()}>
                    <button className="qty-btn" onClick={() => decFromCart(p)} disabled={!cart[p.productID]}>−</button>
                    <span className="qty-display">{cart[p.productID] || 0}</span>
                    <button className="qty-btn" onClick={() => addToCart(p)}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Product detail modal */}
          {detailProduct && (
            <div className="modal-overlay" onClick={closeDetail}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={closeDetail}>×</button>
                <div className="modal-image">
                  <img src={getProductImage(detailProduct.name, detailProduct.category, detailProduct.imageUrl)} alt={detailProduct.name} onError={handleImgError} />
                </div>
                <div className="modal-body">
                  <span className="product-card-cat" style={{ position: 'static', marginBottom: 8, display: 'inline-block' }}>{detailProduct.category}</span>
                  <h3 style={{ marginBottom: 8 }}>{detailProduct.name}</h3>
                  <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{detailProduct.description || 'No description available.'}</p>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--ink)', marginBottom: 20 }}>
                    ${Number(detailProduct.price).toFixed(2)}
                  </div>
                  <div className="form-group">
                    <label>Special instructions (optional)</label>
                    <textarea
                      rows={3}
                      value={specialInstructions[detailProduct.productID] || ''}
                      onChange={e => setSpecialInstructions(s => ({ ...s, [detailProduct.productID]: e.target.value }))}
                      placeholder="e.g. No onions, extra sauce, well done..."
                    />
                  </div>
                  <div className="qty-control" style={{ marginBottom: 16 }}>
                    <button className="qty-btn" onClick={() => decFromCart(detailProduct)} disabled={!cart[detailProduct.productID]}>−</button>
                    <span className="qty-display">{cart[detailProduct.productID] || 0}</span>
                    <button className="qty-btn" onClick={() => addToCart(detailProduct)}>+</button>
                  </div>
                  <button className="btn btn-accent" style={{ width: '100%' }} onClick={() => { if (!cart[detailProduct.productID]) addToCart(detailProduct); closeDetail(); }}>
                    {cart[detailProduct.productID] ? 'Done' : 'Add to basket'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                        <img src={getProductImage(p.name, p.category, p.imageUrl)} alt={p.name} className="cart-pro-thumb" onError={handleImgError} />
                        <div className="cart-pro-item-body">
                          <div className="cart-pro-item-name">{p.name}</div>
                          <div className="cart-pro-item-price">${Number(p.price).toFixed(2)} each</div>
                          <div className="cart-pro-qty">
                            <button onClick={() => decFromCart(p)}>−</button>
                            <span>{q}</span>
                            <button onClick={() => addToCart(p)}>+</button>
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
                  <div className="cart-pro-line"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  {discount > 0 && <div className="cart-pro-line"><span>Discount</span><span>−${discount.toFixed(2)}</span></div>}
                  <div className="cart-pro-line"><span>Delivery</span><span>${DELIVERY_FEE.toFixed(2)}</span></div>
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
      {orders.map(o => o.isGroup
        ? <GroupOrderRow key={`group-${o.groupID}`} group={o} onRefresh={() => api.get('/orders/me').then(setOrders)} />
        : <OrderRow key={o.orderID} order={o} onRefresh={() => api.get('/orders/me').then(setOrders)} />
      )}
    </div>
  );
}

function OrderRow({ order, onRefresh }) {
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

  async function cancelOrder() {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await api.post(`/orders/${order.orderID}/cancel`);
      setMsg('Order cancelled');
      if (onRefresh) onRefresh();
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
            {order.paymentMethod && <span> · {order.paymentMethod === 'card' ? '💳 Card' : '💵 Cash'}</span>}
          </p>
        </div>
        <StatusBadge status={order.orderStatus} />
      </div>
      {order.orderStatus === 'Pending' && (
        <button className="btn-cancel-order mt-12" onClick={cancelOrder}>Cancel order</button>
      )}
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

function GroupOrderRow({ group, onRefresh }) {
  const allStatuses = group.subOrders.map(o => o.orderStatus);
  const allPending = allStatuses.every(s => s === 'Pending');

  const statusLabel =
    group.groupStatus === 'pending_vendors' ? 'Waiting for vendors' :
    group.groupStatus === 'ready_for_driver' ? 'Ready for pickup' :
    group.groupStatus === 'assigned' ? 'Driver assigned' :
    group.groupStatus === 'delivered' ? 'Delivered' :
    group.groupStatus === 'cancelled' ? 'Cancelled' :
    allStatuses.includes('OnTheWay') ? 'On the way' :
    allStatuses.includes('Delivered') ? 'Delivered' : 'Processing';

  const statusBadgeMap = {
    'Waiting for vendors': 'badge-pending',
    'Ready for pickup': 'badge-ready',
    'Driver assigned': 'badge-confirmed',
    'On the way': 'badge-onway',
    'Delivered': 'badge-delivered',
    'Cancelled': 'badge-cancelled',
    'Processing': 'badge-preparing',
  };

  async function cancelGroup() {
    if (!confirm('Cancel all orders in this multi-store order?')) return;
    try {
      for (const o of group.subOrders) {
        if (o.orderStatus === 'Pending') {
          await api.post(`/orders/${o.orderID}/cancel`);
        }
      }
      if (onRefresh) onRefresh();
    } catch (err) { /* silent */ }
  }

  return (
    <div className="order-row" style={{ borderLeft: '3px solid var(--accent)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="id" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Multi-store order
            <span style={{ background: 'var(--accent)', color: 'var(--bg)', padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600 }}>
              {group.subOrders.length} vendors
            </span>
          </span>
          <h4 style={{ marginTop: 6 }}>{group.subOrders.map(o => o.businessName).join(' + ')}</h4>
          <p className="muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {group.createdAt} · Total ${Number(group.totalPrice).toFixed(2)}
          </p>
        </div>
        <span className={`badge ${statusBadgeMap[statusLabel] || 'badge-pending'}`}>{statusLabel}</span>
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.subOrders.map(o => (
          <div key={o.orderID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-alt)', borderRadius: 6, fontSize: 13 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>#{o.orderID}</span>{' '}
              <strong style={{ fontFamily: 'var(--font-display)' }}>{o.businessName}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>${Number(o.totalPrice).toFixed(2)}</span>
            </div>
            <StatusBadge status={o.orderStatus} />
          </div>
        ))}
      </div>
      {allPending && (
        <button className="btn-cancel-order mt-12" onClick={cancelGroup}>Cancel entire order</button>
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

/* ===================== Recommendations + Meal Combos ===================== */
export function RecommendationsPage() {
  const [budget, setBudget] = useState('');
  const [mood,   setMood]   = useState('');
  const [data,   setData]   = useState(null);
  const [combos, setCombos] = useState(null);
  const [error,  setError]  = useState('');
  const [loadingCombos, setLoadingCombos] = useState(false);

  async function load() {
    setError('');
    try {
      const params = [];
      if (budget) params.push(`budget=${budget}`);
      if (mood)   params.push(`mood=${mood}`);
      const q = params.length ? '?' + params.join('&') : '';
      setData(await api.get(`/recommendations${q}`));
    } catch (err) { setError(err.message); }
  }

  async function loadCombos() {
    setError('');
    if (!budget) { setError('Enter a budget to see meal combinations'); return; }
    setLoadingCombos(true);
    try {
      const data = await api.get(`/meal-combos?budget=${budget}`);
      setCombos(data);
    } catch (err) {
      setError(err.message);
    } finally { setLoadingCombos(false); }
  }

  useEffect(() => { load(); }, []);

  const moods = [
    { id: '',         label: 'Anything',  icon: '✨' },
    { id: 'comfort',  label: 'Comfort',   icon: '🍕' },
    { id: 'healthy',  label: 'Healthy',   icon: '🥗' },
    { id: 'quick',    label: 'Quick bite', icon: '⚡' },
  ];

  return (
    <div>
      <PageHero
        eyebrow="Personalized"
        title="Just"
        italicWord="for you"
        sub={data ? `Time-of-day context: ${data.context}${data.mood ? ` · mood: ${data.mood}` : ''}.` : null}
      />

      {/* Mood selector */}
      <div className="mood-row">
        {moods.map(m => (
          <button
            key={m.id || 'any'}
            className={`mood-chip ${mood === m.id ? 'mood-active' : ''}`}
            onClick={() => { setMood(m.id); setTimeout(load, 0); }}
          >
            <span className="mood-icon">{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="budget-bar">
        <div className="budget-bar-input">
          <span className="budget-bar-symbol">$</span>
          <input
            type="number"
            value={budget}
            onChange={e => setBudget(e.target.value)}
            placeholder="15"
            className="budget-bar-field"
          />
          <span className="budget-bar-label">Budget</span>
        </div>
        <div className="budget-bar-actions">
          <button className="btn btn-accent" onClick={load}>Refresh</button>
          <button className="btn btn-secondary" onClick={loadCombos} disabled={!budget || loadingCombos}>
            {loadingCombos ? 'Building…' : 'What can I eat?'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Meal combinations panel */}
      {combos && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ marginTop: 24 }}>What you can eat with <span style={{ color: 'var(--accent)' }}>${combos.budget}</span></h3>
          {combos.combos.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">💸</div>
              <h3>No combos within ${combos.budget}</h3>
              <p className="muted">Try raising the budget a bit.</p>
            </div>
          )}
          <div className="grid grid-2">
            {combos.combos.map((c, i) => (
              <div key={i} className="combo-card">
                <div className="combo-card-header">
                  <span className="combo-card-vendor">{c.vendor.businessName}</span>
                  <span className="combo-card-total">${c.total.toFixed(2)}</span>
                </div>
                <div className="combo-card-items">
                  {c.items.map((it, j) => (
                    <div key={j} className="combo-card-item">
                      <img src={getProductImage(it.name, it.category, it.imageUrl)} alt={it.name} onError={handleImgError} />
                      <div>
                        <div className="combo-item-name">{it.name}</div>
                        <div className="combo-item-price">${Number(it.price).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="combo-card-footer">
                  <span className="muted" style={{ fontSize: 11 }}>{Math.round(c.fit * 100)}% of budget</span>
                  <Link to={`/customer/vendors/${c.vendor.vendorID}`} className="btn btn-sm btn-accent">Order →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personalized item suggestions */}
      {data && data.items.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✨</div>
          <h3>Place an order to get recommendations</h3>
          <p className="muted">Once you have some history, we'll suggest dishes you might love.</p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Suggested for you</h3>
          <div className="grid grid-3">
            {data.items.map(p => (
              <div key={p.productID} className="product-card-pro">
                <div className="product-card-image">
                  <img src={getProductImage(p.name, p.category, p.imageUrl)} alt={p.name} onError={handleImgError} />
                  <span className="product-card-cat">{p.category}</span>
                </div>
                <div className="product-card-body">
                  <h4>{p.name}</h4>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>from {p.businessName}</p>
                  <p className="desc">{p.description}</p>
                  <div className="price-row">
                    <span className="price">${Number(p.price).toFixed(2)}</span>
                  </div>
                  <Link to={`/customer/vendors/${p.vendorID}`} className="btn btn-sm">View vendor →</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ===================== Favorites page ===================== */
export function FavoritesPage() {
  const [favs, setFavs] = useState([]);
  const [error, setError] = useState('');

  function refresh() { api.get('/favorites').then(setFavs).catch(() => {}); }
  useEffect(refresh, []);

  async function unfav(vendorID) {
    try {
      await api.del(`/favorites/${vendorID}`);
      refresh();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHero
        eyebrow="Saved"
        title="Your"
        italicWord="favorites"
        sub="The vendors you've heart-tagged. Reorder in one tap."
      />
      {error && <div className="alert alert-error">{error}</div>}
      {favs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">♥</div>
          <h3>No favorites yet</h3>
          <p className="muted">Tap the heart on any vendor card to save them here.</p>
          <Link to="/customer" className="btn btn-accent mt-12">Browse vendors →</Link>
        </div>
      )}
      <div className="grid grid-2">
        {favs.map(v => (
          <div key={v.vendorID} className="vendor-card vendor-card-fav">
            <Link to={`/customer/vendors/${v.vendorID}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="vendor-card-image vendor-card-image-photo">
                <img src={getCategoryImage(v.category)} alt={v.businessName} onError={handleImgError} />
                <button className="vendor-card-fav-btn on"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfav(v.vendorID); }}>♥</button>
                <div className="vendor-card-rating">
                  <span className="stars" style={{ fontSize: 12 }}>★</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{Number(v.rating).toFixed(1)}</span>
                </div>
              </div>
              <div className="vendor-card-body">
                <h3>{v.businessName} <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: '0.85em' }}>♥</span></h3>
                <div className="meta">{v.category} · {v.address}</div>
                <div className="footer">
                  <span className="muted" style={{ fontSize: 12 }}>~25 min</span>
                  <span className="view-link">Reorder →</span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
