import React, { useState, useEffect } from 'react';
import { Globe, Database, Mail, FolderOpen, Server, Activity, HardDrive, ExternalLink, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../../components/Sidebar.jsx';
import Header from '../../components/Header.jsx';

export default function HostingDashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/hosting/status');
      setStatus(res.data);
    } catch (err) {
      if (err.response?.data?.code === 'PRO_REQUIRED') {
        setError('Pro license required to access Web Hosting features.');
      } else {
        setError(err.response?.data?.error || 'Failed to load hosting status');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const getServiceColor = (state) => {
    if (state === 'active') return 'badge-green';
    if (state === 'inactive') return 'badge-red';
    return 'badge-gray';
  };

  const ServiceBadge = ({ name, state }) => (
    <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
      <span className="text-sm font-mono text-gray-300">{name}</span>
      <span className={`badge ${getServiceColor(state)}`}>{state || 'unknown'}</span>
    </div>
  );

  const quickActions = [
    { label: 'Add Domain', icon: Globe, href: '/hosting/domains' },
    { label: 'Create Email Account', icon: Mail, href: '/hosting/email' },
    { label: 'Create Database', icon: Database, href: '/hosting/databases' },
    { label: 'Install WordPress', icon: Server, href: '/hosting/wordpress' },
    { label: 'Add FTP Account', icon: FolderOpen, href: '/hosting/ftp' },
    { label: 'Manage DNS', icon: Globe, href: '/hosting/dns' },
  ];

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header title="Web Hosting" subtitle="cPanel-style hosting management" onRefresh={fetchStatus} loading={loading} />

          {error && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading hosting status...</div>
          ) : status ? (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Domains', value: status.domainCount ?? '—', icon: Globe, color: 'text-blue-400' },
                  { label: 'WordPress Sites', value: status.wpCount ?? '—', icon: Server, color: 'text-green-400' },
                  { label: 'Disk Used (/var/www)', value: status.wwwUsage || '—', icon: HardDrive, color: 'text-purple-400' },
                  { label: 'Web Server', value: status.webServer || 'None', icon: Activity, color: 'text-cyan-400' },
                ].map((s, i) => (
                  <div key={i} className="card">
                    <div className="flex items-center gap-3 mb-2">
                      <s.icon className={`w-5 h-5 ${s.color}`} />
                      <span className="text-sm text-gray-400">{s.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Services status */}
                <div className="card">
                  <div className="card-header mb-3">Service Status</div>
                  <div className="space-y-2">
                    {Object.entries(status.services || {}).map(([name, state]) => (
                      <ServiceBadge key={name} name={name} state={state} />
                    ))}
                    {Object.keys(status.services || {}).length === 0 && (
                      <p className="text-gray-500 text-sm">No services detected</p>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="card">
                  <div className="card-header mb-3">Quick Actions</div>
                  <div className="space-y-2">
                    {quickActions.map((a, i) => (
                      <Link
                        key={i}
                        to={a.href}
                        className="flex items-center gap-3 p-3 bg-dark-800 hover:bg-dark-600 rounded-lg transition-colors"
                      >
                        <a.icon className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-gray-300 flex-1">{a.label}</span>
                        <ExternalLink className="w-3 h-3 text-gray-600" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : !error ? (
            <div className="card text-center py-12">
              <Server className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No hosting services detected</p>
              <p className="text-gray-600 text-sm">Install nginx/apache2, MySQL, and Postfix to get started</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
