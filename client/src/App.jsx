import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LicenseProvider } from './context/LicenseContext.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Packages from './pages/Packages.jsx';
import Users from './pages/Users.jsx';
import Services from './pages/Services.jsx';
import Firewall from './pages/Firewall.jsx';
import Logs from './pages/Logs.jsx';
import Files from './pages/Files.jsx';
import AI from './pages/AI.jsx';
import Cron from './pages/Cron.jsx';
import SSH from './pages/SSH.jsx';
import SSL from './pages/SSL.jsx';
import Backup from './pages/Backup.jsx';
import Processes from './pages/Processes.jsx';
import Network from './pages/Network.jsx';
import FileSystem from './pages/FileSystem.jsx';
import Security from './pages/Security.jsx';
import Automation from './pages/Automation.jsx';
import Troubleshoot from './pages/Troubleshoot.jsx';
import Upgrade from './pages/Upgrade.jsx';
import Pricing from './pages/Pricing.jsx';
import CheckoutSuccess from './pages/CheckoutSuccess.jsx';
import HostingDashboard from './pages/hosting/HostingDashboard.jsx';
import Domains from './pages/hosting/Domains.jsx';
import Email from './pages/hosting/Email.jsx';
import Databases from './pages/hosting/Databases.jsx';
import PHPManager from './pages/hosting/PHP.jsx';
import WordPress from './pages/hosting/WordPress.jsx';
import FTPManager from './pages/hosting/FTP.jsx';
import DNS from './pages/hosting/DNS.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading NixPanel...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <LicenseProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/packages" element={<ProtectedRoute><Packages /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
          <Route path="/firewall" element={<ProtectedRoute><Firewall /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute><Files /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AI /></ProtectedRoute>} />
          <Route path="/cron" element={<ProtectedRoute><Cron /></ProtectedRoute>} />
          <Route path="/ssh" element={<ProtectedRoute><SSH /></ProtectedRoute>} />
          <Route path="/ssl" element={<ProtectedRoute><SSL /></ProtectedRoute>} />
          <Route path="/backup" element={<ProtectedRoute><Backup /></ProtectedRoute>} />
          <Route path="/processes" element={<ProtectedRoute><Processes /></ProtectedRoute>} />
          <Route path="/network" element={<ProtectedRoute><Network /></ProtectedRoute>} />
          <Route path="/filesystem" element={<ProtectedRoute><FileSystem /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
          <Route path="/automation" element={<ProtectedRoute><Automation /></ProtectedRoute>} />
          <Route path="/troubleshoot" element={<ProtectedRoute><Troubleshoot /></ProtectedRoute>} />
          <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/hosting" element={<ProtectedRoute><HostingDashboard /></ProtectedRoute>} />
          <Route path="/hosting/domains" element={<ProtectedRoute><Domains /></ProtectedRoute>} />
          <Route path="/hosting/email" element={<ProtectedRoute><Email /></ProtectedRoute>} />
          <Route path="/hosting/databases" element={<ProtectedRoute><Databases /></ProtectedRoute>} />
          <Route path="/hosting/php" element={<ProtectedRoute><PHPManager /></ProtectedRoute>} />
          <Route path="/hosting/wordpress" element={<ProtectedRoute><WordPress /></ProtectedRoute>} />
          <Route path="/hosting/ftp" element={<ProtectedRoute><FTPManager /></ProtectedRoute>} />
          <Route path="/hosting/dns" element={<ProtectedRoute><DNS /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </LicenseProvider>
    </AuthProvider>
  );
}
