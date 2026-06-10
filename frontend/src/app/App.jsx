import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../features/public/HomePage.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import RegisterPage from '../features/auth/RegisterPage.jsx';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';
import RoleRoute from '../features/auth/RoleRoute.jsx';
import CreatorDashboard from '../features/creator/CreatorDashboard.jsx';
import CreatorEvents from '../features/creator/CreatorEvents.jsx';
import CreatorStudioRedirect from '../features/creator/CreatorStudioRedirect.jsx';
import FullStudio from '../pages/Studio.jsx';
import CreatorWallet from '../features/creator/CreatorWallet.jsx';
import CreatorSubscription from '../features/creator/CreatorSubscription.jsx';
import CompanyDashboard from '../features/company/CompanyDashboard.jsx';
import CompanyAds from '../features/company/CompanyAds.jsx';
import CompanyCreateAd from '../features/company/CompanyCreateAd.jsx';
import CompanyWallet from '../features/company/CompanyWallet.jsx';
import AdminDashboard from '../features/admin/AdminDashboard.jsx';
import AdminUsers from '../features/admin/AdminUsers.jsx';
import AdminAds from '../features/admin/AdminAds.jsx';
import AdminSettings from '../features/admin/AdminSettings.jsx';
import AdminRevenue from '../features/admin/AdminRevenue.jsx';
import AdminWalletActions from '../features/admin/AdminWalletActions.jsx';
import CameraPage from '../pages/Camera.jsx';
import WatchPage from '../pages/Watch.jsx';
import PaymentTopup from '../features/payments/PaymentTopup.jsx';
import EsewaSuccess from '../features/payments/EsewaSuccess.jsx';
import EsewaFailure from '../features/payments/EsewaFailure.jsx';
import NotFound from '../features/public/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/camera" element={<CameraPage />} />
      <Route path="/watch/:eventCode" element={<WatchPage />} />
      <Route path="/payment/esewa/success" element={<EsewaSuccess />} />
      <Route path="/payment/esewa/failure" element={<EsewaFailure />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/wallet/topup" element={<PaymentTopup />} />
        <Route element={<RoleRoute roles={["creator"]} />}>
          <Route path="/creator" element={<Navigate to="/creator/dashboard" replace />} />
          <Route path="/creator/dashboard" element={<CreatorDashboard />} />
          <Route path="/creator/events" element={<CreatorEvents />} />
          <Route path="/creator/events/:eventId/studio" element={<CreatorStudioRedirect />} />
          <Route path="/creator/studio/:eventCode" element={<FullStudio />} />
          <Route path="/creator/wallet" element={<CreatorWallet />} />
          <Route path="/creator/subscription" element={<CreatorSubscription />} />
        </Route>

        <Route element={<RoleRoute roles={["company"]} />}>
          <Route path="/company" element={<Navigate to="/company/dashboard" replace />} />
          <Route path="/company/dashboard" element={<CompanyDashboard />} />
          <Route path="/company/ads" element={<CompanyAds />} />
          <Route path="/company/ads/create" element={<CompanyCreateAd />} />
          <Route path="/company/wallet" element={<CompanyWallet />} />
        </Route>

        <Route element={<RoleRoute roles={["admin"]} />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/ads" element={<AdminAds />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/revenue" element={<AdminRevenue />} />
          <Route path="/admin/wallet-actions" element={<AdminWalletActions />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
