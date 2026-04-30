import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { PageHero, getProductImage, handleImgError } from '../components/Layout.jsx';

export function GroupOrderPage() {
  const [vendors, setVendors] = useState([]);
  const [vendorID, setVendorID] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [activeCart, setActiveCart] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { api.get('/vendors').then(setVendors); }, []);

  async function createCart() {
    setError(''); setSuccess('');
    try {
      const data = await api.post('/carts', { vendorID: Number(vendorID) });
      setSuccess(`Cart created. Share invite code: ${data.inviteCode}`);
      loadCart(data.cartID);
      const ps = await api.get(`/products?vendorID=${vendorID}`);
      setProducts(ps);
    } catch (err) { setError(err.message); }
  }

  async function joinCart() {
    setError(''); setSuccess('');
    try {
      const data = await api.post('/carts/join', { inviteCode });
      setSuccess('Joined cart');
      loadCart(data.cartID);
    } catch (err) { setError(err.message); }
  }

  async function loadCart(cartID) {
    try {
      const cart = await api.get(`/carts/${cartID}`);
      setActiveCart(cart);
      const ps = await api.get(`/products?vendorID=${cart.cart.vendorID}`);
      setProducts(ps);
    } catch (err) { setError(err.message); }
  }

  async function addItem(productID) {
    try {
      await api.post(`/carts/${activeCart.cart.cartID}/items`, { productID, quantity: 1 });
      loadCart(activeCart.cart.cartID);
    } catch (err) { setError(err.message); }
  }

  async function removeItem(itemID) {
    try {
      await api.del(`/carts/${activeCart.cart.cartID}/items/${itemID}`);
      loadCart(activeCart.cart.cartID);
    } catch (err) { setError(err.message); }
  }

  async function checkout() {
    setError(''); setSuccess('');
    try {
      const data = await api.post(`/carts/${activeCart.cart.cartID}/checkout`, {});
      setSuccess(`Group order #${data.orderID} placed (total $${data.total})`);
      setActiveCart(null);
    } catch (err) { setError(err.message); }
  }

  // Build a quick lookup of products in the cart for thumbnails
  const productMap = {};
  products.forEach(p => { productMap[p.productID] = p; });

  return (
    <div>
      <PageHero
        eyebrow="Together"
        title="Group"
        italicWord="ordering"
        sub="Create a shared cart and let friends add their items. The owner checks out for everyone."
      />
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {!activeCart && (
        <div className="row">
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3>Start a group order</h3>
            <p className="muted">Pick a vendor and we'll generate an invite code.</p>
            <div className="form-group">
              <label>Vendor</label>
              <select value={vendorID} onChange={e => setVendorID(e.target.value)}>
                <option value="">— choose vendor —</option>
                {vendors.map(v => <option key={v.vendorID} value={v.vendorID}>{v.businessName}</option>)}
              </select>
            </div>
            <button className="btn btn-accent" onClick={createCart} disabled={!vendorID}>Create cart</button>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 280 }}>
            <h3>Join existing cart</h3>
            <p className="muted">Got an invite code from a friend? Enter it here.</p>
            <div className="form-group">
              <label>Invite code</label>
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="A1B2C3D4" />
            </div>
            <button className="btn" onClick={joinCart} disabled={!inviteCode}>Join cart</button>
          </div>
        </div>
      )}

      {activeCart && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 2, minWidth: 320 }}>
            <div className="card mb-12">
              <h3>{activeCart.cart.businessName}</h3>
              <p>Invite code: <strong style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-alt)', padding: '4px 10px', borderRadius: 4 }}>{activeCart.cart.inviteCode}</strong></p>
              <p className="muted">Share this with friends so they can join.</p>
            </div>
            <h3>Add items</h3>
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
                    </div>
                    <button className="btn btn-sm btn-accent" onClick={() => addItem(p.productID)}>+ Add to basket</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 300, maxWidth: 380 }}>
            <div className="cart-pro">
              <div className="cart-pro-header">
                <h3>Shared basket</h3>
                {activeCart.items.length > 0 && (
                  <span className="cart-pro-count">{activeCart.items.length} item{activeCart.items.length > 1 ? 's' : ''}</span>
                )}
              </div>

              {activeCart.items.length === 0 && (
                <div className="cart-pro-empty">
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🤝</div>
                  <p>Nothing added yet</p>
                  <span className="muted">Friends can add items once they join.</span>
                </div>
              )}

              {activeCart.items.length > 0 && (
                <>
                  <div className="cart-pro-items">
                    {activeCart.items.map(it => {
                      const product = productMap[it.productID];
                      return (
                        <div key={it.cartItemID} className="cart-pro-item">
                          {product && <img src={getProductImage(product.name, product.category)} alt={it.name} className="cart-pro-thumb" onError={handleImgError} />}
                          <div className="cart-pro-item-body">
                            <div className="cart-pro-item-name">{it.name}</div>
                            <div className="cart-pro-item-price">× {it.quantity} · added by {it.contributor}</div>
                          </div>
                          <div className="cart-pro-item-total">
                            <strong>${product ? (Number(product.price) * it.quantity).toFixed(2) : '—'}</strong>
                            <button className="cart-pro-remove" onClick={() => removeItem(it.cartItemID)} title="Remove">×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cart-pro-totals">
                    <div style={{ fontSize: 11, color: 'rgba(246,241,232,.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 600 }}>Contributions</div>
                    {activeCart.contributions.map(c => (
                      <div key={c.userID} className="cart-pro-line">
                        <span>{c.username}</span>
                        <span>${Number(c.total).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button className="cart-pro-checkout" onClick={checkout}
                      disabled={activeCart.cart.status !== 'open' || activeCart.items.length === 0}>
                Checkout (owner only)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
