import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/* Talabna logo */
function TalabnaLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="30" fill="#c75d2c"/>
      <circle cx="32" cy="32" r="22" fill="none" stroke="#f6f1e8" strokeWidth="1.5" opacity="0.4"/>
      <g fill="#f6f1e8">
        <rect x="18" y="20" width="28" height="4" rx="1"/>
        <path d="M 30 24 L 28 46 L 34 46 L 36 24 Z"/>
        <circle cx="22" cy="14" r="1.5" opacity="0.6"/>
        <circle cx="32" cy="12" r="1.8" opacity="0.85"/>
        <circle cx="42" cy="14" r="1.5" opacity="0.6"/>
      </g>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand" style={{ textDecoration: 'none' }}>
        <TalabnaLogo />
        <span>talabna<span style={{ color: 'var(--accent)', fontStyle: 'normal', fontWeight: 400, marginLeft: 4 }}>.</span></span>
      </Link>
      <div className="right">
        {!user && (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create account</Link>
          </>
        )}
        {user && user.role === 'customer' && (
          <>
            <Link to="/customer">Browse</Link>
            <Link to="/customer/orders">Orders</Link>
            <Link to="/customer/loyalty">Rewards</Link>
            <Link to="/customer/recommendations">For you</Link>
            <Link to="/customer/group">Group</Link>
          </>
        )}
        {user && user.role === 'vendor' && (
          <>
            <Link to="/vendor">Overview</Link>
            <Link to="/vendor/products">Menu</Link>
            <Link to="/vendor/orders">Orders</Link>
            <Link to="/vendor/analytics">Analytics</Link>
          </>
        )}
        {user && user.role === 'driver' && (
          <>
            <Link to="/driver">Available</Link>
            <Link to="/driver/mine">My runs</Link>
          </>
        )}
        {user && user.role === 'admin' && (
          <>
            <Link to="/admin">Activity</Link>
            <Link to="/admin/vendors">Vendors</Link>
            <Link to="/admin/users">Users</Link>
            <Link to="/admin/reports">Reports</Link>
          </>
        )}
        {user && (
          <>
            <span className="user-tag">{user.username} · {user.role}</span>
            <button className="btn-logout" onClick={handleLogout} title="Sign out">
              <LogoutIcon /> Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

export function ProtectedRoute({ allow, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export function StatusBadge({ status }) {
  const map = {
    Pending:        'badge-pending',
    Confirmed:      'badge-confirmed',
    InPreparation:  'badge-preparing',
    ReadyForPickup: 'badge-ready',
    OnTheWay:       'badge-onway',
    Delivered:      'badge-delivered',
    Cancelled:      'badge-cancelled',
    DeliveryFailed: 'badge-failed',
    Unassigned:     'badge-pending',
    Assigned:       'badge-confirmed',
    PickedUp:       'badge-onway',
    Failed:         'badge-failed',
  };
  return <span className={`badge ${map[status] || ''}`}>{status}</span>;
}

export function PageHero({ eyebrow, title, italicWord, sub, right }) {
  return (
    <div className="page-hero">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>
          {title}
          {italicWord && <> <span className="italic">{italicWord}</span></>}
        </h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

/* ---------- Image lookups ---------- */

// Generic food fallback used when an image fails to load
export const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80';

const CATEGORY_IMAGES = {
  italian:  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  pizza:    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  japanese: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
  sushi:    'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
  grocery:  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80',
  bakery:   'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80',
  burger:   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
  coffee:   'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  dessert:  'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=80',
  salad:    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80',
  asian:    'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80',
  mexican:  'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80',
  indian:   'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80',
  chinese:  'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80',
  lebanese: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
  soup:     'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80',
  starter:  'https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&q=80',
  default:  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
};

const PRODUCT_IMAGES = {
  'margherita pizza':  'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=600&q=80',
  'pepperoni pizza':   'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&q=80',
  'caesar salad':      'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?w=600&q=80',
  'tiramisu':          'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&q=80',
  'salmon roll':       'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=600&q=80',
  'california roll':   'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&q=80',
  'miso soup':         'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80',
};

export function getCategoryImage(category) {
  if (!category) return CATEGORY_IMAGES.default;
  const key = category.toLowerCase().trim();
  if (CATEGORY_IMAGES[key]) return CATEGORY_IMAGES[key];
  for (const k of Object.keys(CATEGORY_IMAGES)) {
    if (key.includes(k)) return CATEGORY_IMAGES[k];
  }
  return CATEGORY_IMAGES.default;
}

export function getProductImage(name, category) {
  if (name) {
    const key = name.toLowerCase().trim();
    if (PRODUCT_IMAGES[key]) return PRODUCT_IMAGES[key];
    for (const k of Object.keys(PRODUCT_IMAGES)) {
      if (key.includes(k) || k.includes(key)) return PRODUCT_IMAGES[k];
    }
  }
  return getCategoryImage(category);
}

/* Graceful fallback: if any image fails, swap to the generic food shot */
export function handleImgError(e) {
  if (e.target.src !== FALLBACK_IMAGE) {
    e.target.src = FALLBACK_IMAGE;
  }
}
