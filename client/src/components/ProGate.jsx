import React from 'react';
import { Crown, Check, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLicense } from '../context/LicenseContext.jsx';

const PRO_BENEFITS = [
  'AI-powered troubleshooting and diagnostics',
  'Security hardening center with scoring',
  'Automated backup and restore system',
  'Network diagnostics and monitoring',
  'Automation center with script library',
  'Firewall, SSH, and SSL management',
  'Real-time process manager',
  'Unlimited log viewer with search',
];

export default function ProGate({ children, feature = 'This feature' }) {
  const { isPro } = useLicense();
  const navigate = useNavigate();

  if (isPro) return children;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-dark-800 border border-yellow-500/30 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
            <Crown className="w-7 h-7 text-yellow-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">{feature}</h3>
          <p className="text-sm text-gray-400 mb-5">Upgrade to NixPanel Pro to unlock this feature and much more.</p>
          <div className="space-y-2 mb-5 text-left">
            {PRO_BENEFITS.slice(0, 3).map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                {b}
              </div>
            ))}
            <div className="text-xs text-gray-500 pl-5">+ {PRO_BENEFITS.length - 3} more features</div>
          </div>
          <button
            onClick={() => navigate('/upgrade')}
            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 mb-2"
          >
            <Crown className="w-4 h-4" />
            Upgrade to Pro
          </button>
          <button
            onClick={() => navigate('/upgrade')}
            className="w-full text-sm text-gray-400 hover:text-gray-200 py-1.5"
          >
            Enter license key →
          </button>
        </div>
      </div>
    </div>
  );
}
