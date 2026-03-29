import React, { useState } from 'react';
import { Crown, Check, X, ExternalLink, ShieldCheck, Zap } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import { useLicense } from '../context/LicenseContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PLANS = [
  {
    name: 'Solo',
    price: '$9',
    period: '/mo',
    description: 'Perfect for a single server',
    features: ['1 server', 'All Pro features', 'Community support', 'License key activation'],
    cta: 'Subscribe',
  },
  {
    name: 'Team',
    price: '$29',
    period: '/mo',
    description: 'For teams managing multiple servers',
    features: ['5 servers', 'All Pro features', 'Priority email support', 'License key activation'],
    cta: 'Subscribe',
    highlight: true,
  },
  {
    name: 'Agency',
    price: '$79',
    period: '/mo',
    description: 'Unlimited scale for agencies',
    features: ['Unlimited servers', 'All Pro features', 'White-label support', 'API access', 'Priority support'],
    cta: 'Subscribe',
  },
];

const FEATURE_TABLE = [
  { feature: 'Dashboard & System Overview', free: true, pro: true },
  { feature: 'Package Management', free: true, pro: true },
  { feature: 'User Management', free: true, pro: true },
  { feature: 'Service Manager', free: true, pro: true },
  { feature: 'Log Viewer', free: true, pro: true },
  { feature: 'File Browser', free: true, pro: true },
  { feature: 'AI Assistant (Chat)', free: false, pro: true },
  { feature: 'AI Troubleshoot & Diagnostics', free: false, pro: true },
  { feature: 'Firewall Management (UFW/iptables)', free: false, pro: true },
  { feature: 'SSH Key Management', free: false, pro: true },
  { feature: 'SSL Certificate Manager', free: false, pro: true },
  { feature: 'Backup & Restore', free: false, pro: true },
  { feature: 'Process Manager', free: false, pro: true },
  { feature: 'Network Diagnostics', free: false, pro: true },
  { feature: 'Filesystem Inspector', free: false, pro: true },
  { feature: 'Security Hardening Center', free: false, pro: true },
  { feature: 'Automation Center', free: false, pro: true },
  { feature: 'Cron Job Manager', free: false, pro: true },
];

export default function Upgrade() {
  const { license, isPro, activate, deactivate } = useLicense();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [licenseKey, setLicenseKey] = useState('');
  const [email, setEmail] = useState('');
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    setActivating(true);
    setError('');
    setSuccess('');
    try {
      const result = await activate(licenseKey.trim(), email.trim());
      setSuccess(result.offline
        ? 'License activated (offline mode). Features are now unlocked.'
        : `License activated! Plan: ${result.plan || 'Pro'}${result.expires ? ` · Expires: ${new Date(result.expires).toLocaleDateString()}` : ''}`
      );
      setLicenseKey('');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Deactivate your Pro license? Pro features will be locked.')) return;
    setDeactivating(true);
    setError('');
    setSuccess('');
    try {
      await deactivate();
      setSuccess('License deactivated.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Deactivation failed');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 flex items-center justify-center">
              <Crown className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">NixPanel Pro</h1>
              <p className="text-gray-400 text-sm">Unlock advanced Linux administration features</p>
            </div>
          </div>

          {/* Current Status Banner */}
          {isPro ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-8">
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-emerald-300">Pro License Active</div>
                <div className="text-xs text-emerald-400/70 mt-0.5">
                  {license.plan && <span className="capitalize mr-3">Plan: {license.plan}</span>}
                  {license.email && <span className="mr-3">Email: {license.email}</span>}
                  {license.expires && <span>Expires: {new Date(license.expires).toLocaleDateString()}</span>}
                  {!license.expires && <span>Lifetime license</span>}
                </div>
              </div>
              {license.maskedKey && (
                <div className="text-xs text-emerald-500/60 font-mono hidden sm:block">{license.maskedKey}</div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-dark-700 border border-dark-500 rounded-xl mb-8">
              <Zap className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-gray-300">Free Plan</div>
                <div className="text-xs text-gray-500 mt-0.5">Basic features only. Upgrade to unlock the full suite.</div>
              </div>
            </div>
          )}

          {/* License Activation Form */}
          {isAdmin && (
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 mb-8">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                {isPro ? 'Manage License' : 'Activate License Key'}
              </h2>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
                  <X className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm mb-4">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  {success}
                </div>
              )}

              {!isPro && (
                <form onSubmit={handleActivate} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">License Key</label>
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                      placeholder="NIXP-XXXX-XXXX-XXXX-XXXX"
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Email (optional, for key recovery)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={activating || !licenseKey.trim()}
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-2.5 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {activating ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <Crown className="w-4 h-4" />
                    )}
                    {activating ? 'Activating...' : 'Activate License'}
                  </button>
                </form>
              )}

              {isPro && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDeactivate}
                    disabled={deactivating}
                    className="text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deactivating ? 'Deactivating...' : 'Deactivate License'}
                  </button>
                  <span className="text-xs text-gray-600">This will lock Pro features on this server.</span>
                </div>
              )}
            </div>
          )}

          {/* Pricing Table */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-white mb-2">Pricing</h2>
            <p className="text-gray-400 text-sm mb-5">All plans include every Pro feature. Pick a plan based on how many servers you manage.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-xl p-5 border ${
                    plan.highlight
                      ? 'bg-gradient-to-b from-yellow-500/10 to-orange-500/5 border-yellow-500/40'
                      : 'bg-dark-800 border-dark-600'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <div className="mb-4">
                    <div className="text-base font-bold text-white">{plan.name}</div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-white">{plan.price}</span>
                      <span className="text-gray-500 text-sm">{plan.period}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{plan.description}</div>
                  </div>
                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="https://nixpanel.io/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      plan.highlight
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black'
                        : 'bg-dark-700 border border-dark-500 text-gray-200 hover:border-dark-400 hover:bg-dark-600'
                    }`}
                  >
                    {plan.cta}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Comparison Table */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600">
              <h2 className="text-base font-bold text-white">Feature Comparison</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-full">Feature</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Free</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-yellow-400 uppercase tracking-wider whitespace-nowrap">
                      <span className="flex items-center gap-1 justify-center">
                        <Crown className="w-3.5 h-3.5" />
                        Pro
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_TABLE.map((row, i) => (
                    <tr key={i} className={`border-b border-dark-700 last:border-0 ${i % 2 === 0 ? 'bg-dark-800' : 'bg-dark-800/50'}`}>
                      <td className="px-5 py-3 text-sm text-gray-300">{row.feature}</td>
                      <td className="px-6 py-3 text-center">
                        {row.free
                          ? <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                          : <span className="text-gray-700 text-lg leading-none">—</span>
                        }
                      </td>
                      <td className="px-6 py-3 text-center">
                        {row.pro
                          ? <Check className="w-4 h-4 text-yellow-400 mx-auto" />
                          : <span className="text-gray-700 text-lg leading-none">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-xs text-gray-600 mt-6 pb-4">
            Questions? Email <a href="mailto:support@nixpanel.io" className="text-gray-400 hover:text-gray-200">support@nixpanel.io</a> or visit{' '}
            <a href="https://nixpanel.io" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-200">nixpanel.io</a>
          </p>

        </div>
      </main>
    </div>
  );
}
