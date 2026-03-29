import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crown, Zap, Globe, Building2, ArrowRight, Shield, Bot, Server } from 'lucide-react';
import axios from 'axios';

const PRICE_IDS = {
  solo:   { monthly: import.meta.env.VITE_STRIPE_PRICE_SOLO_MONTHLY,   annual: import.meta.env.VITE_STRIPE_PRICE_SOLO_ANNUAL },
  host:   { monthly: import.meta.env.VITE_STRIPE_PRICE_HOST_MONTHLY,   annual: import.meta.env.VITE_STRIPE_PRICE_HOST_ANNUAL },
  agency: { monthly: import.meta.env.VITE_STRIPE_PRICE_AGENCY_MONTHLY, annual: import.meta.env.VITE_STRIPE_PRICE_AGENCY_ANNUAL },
};

const plans = [
  {
    id: 'solo',
    name: 'Solo',
    icon: Zap,
    description: 'For developers managing a single server',
    monthlyPrice: 9,
    annualPrice: 7,
    color: 'blue',
    features: [
      '1 server',
      'All Pro features',
      'AI Assistant & Troubleshooting',
      'Firewall & SSH Management',
      'SSL Certificate Manager',
      'Backup & Restore',
      'Process Manager',
      'Security Hardening Center',
      'Automation Center',
      'Email support',
    ],
  },
  {
    id: 'host',
    name: 'Host',
    icon: Globe,
    description: 'For hosting providers and agencies',
    monthlyPrice: 19,
    annualPrice: 15,
    popular: true,
    color: 'purple',
    features: [
      '5 servers',
      'Everything in Solo',
      'Web Hosting Module',
      'Domain & Virtual Host Manager',
      'Email Server Management',
      'MySQL Database Manager',
      'PHP Version Manager',
      'WordPress One-Click Install',
      'FTP Account Manager',
      'DNS Zone Manager',
      'Priority support',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    icon: Building2,
    description: 'For large teams and MSPs',
    monthlyPrice: 49,
    annualPrice: 39,
    color: 'yellow',
    features: [
      'Unlimited servers',
      'Everything in Host',
      'White-label option',
      'Team access (up to 10 users)',
      'API access',
      'Custom branding',
      'SLA support',
      'Dedicated onboarding',
    ],
  },
];

const comparisonFeatures = [
  { label: 'Dashboard & System Overview', free: true, solo: true, host: true, agency: true },
  { label: 'Package Management', free: true, solo: true, host: true, agency: true },
  { label: 'User Management', free: true, solo: true, host: true, agency: true },
  { label: 'Service Manager', free: true, solo: true, host: true, agency: true },
  { label: 'Log Viewer', free: true, solo: true, host: true, agency: true },
  { label: 'File Browser', free: true, solo: true, host: true, agency: true },
  { label: 'AI Assistant', free: false, solo: true, host: true, agency: true },
  { label: 'AI Troubleshooting', free: false, solo: true, host: true, agency: true },
  { label: 'Firewall Management', free: false, solo: true, host: true, agency: true },
  { label: 'SSH Key Management', free: false, solo: true, host: true, agency: true },
  { label: 'SSL Certificate Manager', free: false, solo: true, host: true, agency: true },
  { label: 'Backup & Restore', free: false, solo: true, host: true, agency: true },
  { label: 'Process Manager', free: false, solo: true, host: true, agency: true },
  { label: 'Security Hardening', free: false, solo: true, host: true, agency: true },
  { label: 'Automation Center', free: false, solo: true, host: true, agency: true },
  { label: 'Web Hosting Module', free: false, solo: false, host: true, agency: true },
  { label: 'WordPress Manager', free: false, solo: false, host: true, agency: true },
  { label: 'DNS Zone Manager', free: false, solo: false, host: true, agency: true },
  { label: 'Unlimited Servers', free: false, solo: false, host: false, agency: true },
  { label: 'White-label', free: false, solo: false, host: false, agency: true },
];

function CheckIcon({ value }) {
  if (value === true) return <Check className="w-4 h-4 text-green-400 mx-auto" />;
  if (value === false) return <span className="text-gray-700 mx-auto block text-center">—</span>;
  return <span className="text-xs text-gray-400 text-center block">{value}</span>;
}

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState(null);
  const navigate = useNavigate();

  async function handleSubscribe(planId) {
    const priceId = PRICE_IDS[planId]?.[annual ? 'annual' : 'monthly'];

    if (!priceId) {
      // If price IDs not configured, go to upgrade page
      navigate('/upgrade');
      return;
    }

    setLoading(planId);
    try {
      const { data } = await axios.post('/api/stripe/create-checkout-session', { priceId });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  const colorMap = {
    blue:   { badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-500', border: 'border-blue-500/30', glow: 'shadow-blue-500/10' },
    purple: { badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30', btn: 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500', border: 'border-purple-500/40', glow: 'shadow-purple-500/20' },
    yellow: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', btn: 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500', border: 'border-yellow-500/30', glow: 'shadow-yellow-500/10' },
  };

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Header */}
      <div className="text-center pt-16 pb-12 px-4">
        <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-1.5 text-yellow-400 text-sm font-medium mb-6">
          <Crown className="w-4 h-4" />
          NixPanel Pro
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
          Choose the plan that fits your infrastructure. All plans include a 14-day free trial. Cancel anytime.
        </p>

        {/* Monthly / Annual toggle */}
        <div className="inline-flex items-center gap-3 bg-dark-700 border border-dark-600 rounded-xl p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!annual ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${annual ? 'bg-dark-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Annual
            <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {plans.map((plan) => {
            const colors = colorMap[plan.color];
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={`relative bg-dark-800 rounded-2xl border ${colors.border} p-8 flex flex-col ${plan.popular ? `shadow-2xl ${colors.glow}` : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 w-fit mb-4 ${colors.badge}`}>
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{plan.name}</span>
                </div>

                <p className="text-gray-400 text-sm mb-6">{plan.description}</p>

                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-white">${price}</span>
                    <span className="text-gray-500 mb-1">/mo</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-green-400 mt-1">
                      Billed annually (${price * 12}/yr) — save ${(plan.monthlyPrice - plan.annualPrice) * 12}/yr
                    </p>
                  )}
                  {!annual && (
                    <p className="text-xs text-gray-500 mt-1">
                      Or ${plan.annualPrice}/mo billed annually
                    </p>
                  )}
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id}
                  className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 ${colors.btn} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {loading === plan.id ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Subscribe to {plan.name}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Free tier note */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 mb-16 flex items-start gap-4">
          <div className="w-10 h-10 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Server className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">NixPanel Free</h3>
            <p className="text-sm text-gray-400">
              NixPanel is open source and free for core features: Dashboard, Services, Packages, Users, Logs, and File Browser.
              No account required. <a href="https://github.com/nixpanel/nixpanel" className="text-blue-400 hover:underline">Download on GitHub</a>.
            </p>
          </div>
        </div>

        {/* Feature comparison table */}
        <div>
          <h2 className="text-2xl font-bold text-white text-center mb-8">Full Feature Comparison</h2>
          <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400 w-1/2">Feature</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-gray-400">Free</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-blue-400">Solo</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-purple-400">Host</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-yellow-400">Agency</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature, i) => (
                    <tr
                      key={feature.label}
                      className={`border-b border-dark-700/50 ${i % 2 === 0 ? 'bg-dark-800' : 'bg-dark-750'}`}
                    >
                      <td className="px-6 py-3 text-sm text-gray-300">{feature.label}</td>
                      <td className="px-4 py-3"><CheckIcon value={feature.free} /></td>
                      <td className="px-4 py-3"><CheckIcon value={feature.solo} /></td>
                      <td className="px-4 py-3"><CheckIcon value={feature.host} /></td>
                      <td className="px-4 py-3"><CheckIcon value={feature.agency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Shield, title: '14-day free trial', desc: 'No credit card required to start. Cancel before day 14 and pay nothing.' },
            { icon: Bot, title: 'Instant activation', desc: 'Your license key arrives by email within seconds of completing checkout.' },
            { icon: Crown, title: 'Cancel anytime', desc: 'No contracts, no lock-in. Cancel from your billing portal at any time.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 bg-dark-800 border border-dark-600 rounded-xl p-5">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="font-semibold text-white text-sm mb-1">{title}</div>
                <div className="text-sm text-gray-400">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
