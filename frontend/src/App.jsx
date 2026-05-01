import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar, ProtectedRoute } from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';

import LoginPage    from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import MultiStoreCartPage from './pages/MultiStoreCartPage.jsx';

import {
  CustomerHome, VendorDetailPage, MyOrdersPage,
  LoyaltyPage, RecommendationsPage, FavoritesPage,
} from './pages/CustomerPages.jsx';
import { GroupOrderPage } from './pages/GroupOrderPage.jsx';

import {
  VendorDashboard, VendorProductsPage, VendorOrdersPage, VendorAnalyticsPage,
} from './pages/VendorPages.jsx';

import { DriverAvailablePage, DriverDeliveriesPage } from './pages/DriverPages.jsx';

import {
  AdminActivityPage, AdminVendorsPage, AdminUsersPage, AdminReportsPage,
} from './pages/AdminPages.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin')    return <Navigate to="/admin"    replace />;
  if (user.role === 'vendor')   return <Navigate to="/vendor"   replace />;
  if (user.role === 'driver')   return <Navigate to="/driver"   replace />;
  return <Navigate to="/customer" replace />;
}

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Customer routes */}
          <Route path="/customer" element={
            <ProtectedRoute allow={['customer']}><CustomerHome /></ProtectedRoute>
          } />
          <Route path="/customer/vendors/:id" element={
            <ProtectedRoute allow={['customer']}><VendorDetailPage /></ProtectedRoute>
          } />
          <Route path="/customer/orders" element={
            <ProtectedRoute allow={['customer']}><MyOrdersPage /></ProtectedRoute>
          } />
          <Route path="/customer/favorites" element={
            <ProtectedRoute allow={['customer']}><FavoritesPage /></ProtectedRoute>
          } />
          <Route path="/customer/multi-store" element={
            <ProtectedRoute allow={['customer']}><MultiStoreCartPage /></ProtectedRoute>
          } />
          <Route path="/customer/loyalty" element={
            <ProtectedRoute allow={['customer']}><LoyaltyPage /></ProtectedRoute>
          } />
          <Route path="/customer/recommendations" element={
            <ProtectedRoute allow={['customer']}><RecommendationsPage /></ProtectedRoute>
          } />
          <Route path="/customer/group" element={
            <ProtectedRoute allow={['customer']}><GroupOrderPage /></ProtectedRoute>
          } />

          {/* Vendor routes */}
          <Route path="/vendor" element={
            <ProtectedRoute allow={['vendor']}><VendorDashboard /></ProtectedRoute>
          } />
          <Route path="/vendor/products" element={
            <ProtectedRoute allow={['vendor']}><VendorProductsPage /></ProtectedRoute>
          } />
          <Route path="/vendor/orders" element={
            <ProtectedRoute allow={['vendor']}><VendorOrdersPage /></ProtectedRoute>
          } />
          <Route path="/vendor/analytics" element={
            <ProtectedRoute allow={['vendor']}><VendorAnalyticsPage /></ProtectedRoute>
          } />

          {/* Driver routes */}
          <Route path="/driver" element={
            <ProtectedRoute allow={['driver']}><DriverAvailablePage /></ProtectedRoute>
          } />
          <Route path="/driver/mine" element={
            <ProtectedRoute allow={['driver']}><DriverDeliveriesPage /></ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute allow={['admin']}><AdminActivityPage /></ProtectedRoute>
          } />
          <Route path="/admin/vendors" element={
            <ProtectedRoute allow={['admin']}><AdminVendorsPage /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute allow={['admin']}><AdminUsersPage /></ProtectedRoute>
          } />
          <Route path="/admin/reports" element={
            <ProtectedRoute allow={['admin']}><AdminReportsPage /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
