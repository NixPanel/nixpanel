import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, Shield,
  FileText, FolderOpen, Bot, LogOut, Menu, X,
  Server, ChevronRight, Clock, Key, Lock,
  Archive, Cpu, Globe, HardDrive, ShieldAlert,
  Terminal, Zap, Network, Crown, ArrowRight,
  Mail, Database, Code, Monitor, Settings,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { useLicense } from '../context/LicenseContext.jsx';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { type: 'separator', label: 'AI' },
  { path: '/troubleshoot', icon: Zap, label: 'AI Troubleshoot', badge: 'AI', highlight: true, pro: true, aiFeature: true },
  { path: '/ai', icon: Bot, label: 'AI Assistant', pro: true, aiFeature: true },
  { type: 'separator', label: 'System' },
  { path: '/processes', icon: Cpu, label: 'Processes', pro: true },
  { path: '/services', icon: Server, label: 'Services' },
  { path: '/packages', icon: Package, label: 'Packages' },
  { path: '/filesystem', icon: HardDrive, label: 'Filesystems', pro: true },
  { type: 'separator', label: 'Security' },
  { path: '/security', icon: ShieldAlert, label: 'Security', pro: true },
  { path: '/firewall', icon: Shield, label: 'Firewall', pro: true },
  { path: '/ssh', icon: Key, label: 'SSH Keys', pro: true },
  { path: '/ssl', icon: Lock, label: 'SSL Certs', pro: true },
  { type: 'separator', label: 'Management' },
  { path: '/users', icon: Users, label: 'Users' },
  { path: '/network', icon: Globe, label: 'Network', pro: true },
  { path: '/logs', icon: FileText, label: 'Logs' },
  { path: '/files', icon: FolderOpen, label: 'Files' },
  { path: '/cron', icon: Clock, label: 'Cron Jobs', pro: true },
  { path: '/backup', icon: Archive, label: 'Backups', pro: true },
  { path: '/automation', icon: Terminal, label: 'Automation', pro: true },
  { type: 'separator', label: 'Web Hosting' },
  { path: '/hosting', icon: Server, label: 'Hosting Overview', pro: true },
  { path: '/hosting/domains', icon: Globe, label: 'Domains', pro: true },
  { path: '/hosting/email', icon: Mail, label: 'Email', pro: true },
  { path: '/hosting/databases', icon: Database, label: 'Databases', pro: true },
  { path: '/hosting/php', icon: Code, label: 'PHP Manager', pro: true },
  { path: '/hosting/wordpress', icon: Monitor, label: 'WordPress', pro: true },
  { path: '/hosting/ftp', icon: FolderOpen, label: 'FTP Manager', pro: true },
  { path: '/hosting/dns', icon: Network, label: 'DNS Manager', pro: true },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { isPro } = useLicense();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiKeyConfigured, setAiKeyConfigured] = useState(null);

  useEffect(() => {
    if (!isPro) return;
    axios.get('/api/settings/ai-key-status')
      .then(res => setAiKeyConfigured(res.data.configured))
      .catch(() => setAiKeyConfigured(false));
  }, [isPro]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-dark-600">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
          <Server className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-white text-lg">NixPanel</span>
          <div className="text-xs text-gray-500">Linux Admin</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item, idx) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${idx}`} className="mt-4 mb-1 px-3">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{item.label}</span>
              </div>
            );
          }

          const { path, icon: Icon, label, exact, badge, highlight, pro, aiFeature } = item;
          const isLocked = pro && !isPro;
          const needsAiSetup = aiFeature && isPro && aiKeyConfigured === false;

          if (highlight) {
            if (isLocked) {
              return (
                <button
                  key={path}
                  onClick={() => { navigate('/upgrade'); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group mb-1 bg-blue-600/10 text-blue-400/60 border border-blue-600/20 hover:bg-blue-600/20 hover:text-blue-400"
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-blue-400/60" />
                  <span className="flex-1 text-left">{label}</span>
                  <Crown className="w-3 h-3 text-yellow-500/70" />
                </button>
              );
            }
            return (
              <NavLink
                key={path}
                to={path}
                end={exact}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group mb-1 ${
                    isActive
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                      : 'bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600/20'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-300' : 'text-blue-400'}`} />
                    <span className="flex-1">{label}</span>
                    {needsAiSetup && (
                      <span title="API key required" className="text-xs text-yellow-500">⚙</span>
                    )}
                    {badge && (
                      <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                        {badge}
                      </span>
                    )}
                    {isActive && !badge && <ChevronRight className="w-3 h-3 text-blue-300" />}
                  </>
                )}
              </NavLink>
            );
          }

          if (isLocked) {
            return (
              <button
                key={path}
                onClick={() => { navigate('/upgrade'); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group text-gray-600 hover:text-gray-400 hover:bg-dark-600"
              >
                <Icon className="w-4 h-4 flex-shrink-0 text-gray-700 group-hover:text-gray-500" />
                <span className="flex-1 text-left">{label}</span>
                <Crown className="w-3 h-3 text-yellow-500/50" />
              </button>
            );
          }

          return (
            <NavLink
              key={path}
              to={path}
              end={exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                  <span className="flex-1">{label}</span>
                  {needsAiSetup && (
                    <span title="API key required" className="text-xs text-yellow-500">⚙</span>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 text-blue-400" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Upgrade prompt */}
      {!isPro && user && (
        <div className="px-3 mb-2">
          <button
            onClick={() => navigate('/upgrade')}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 text-yellow-400 text-sm hover:border-yellow-500/40 transition-colors"
          >
            <Crown className="w-4 h-4" />
            <div className="text-left flex-1">
              <div className="font-medium text-xs">Upgrade to Pro</div>
              <div className="text-xs text-yellow-500/70">Unlock all features</div>
            </div>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-dark-600 px-3 py-4">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-200 truncate">{user?.username}</div>
            <div className={`text-xs capitalize ${user?.role === 'admin' ? 'text-blue-400' : 'text-gray-500'}`}>
              {user?.role}
            </div>
          </div>
        </div>
        <NavLink
          to="/settings"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 w-full text-sm rounded-lg transition-colors ${
              isActive ? 'text-blue-400 bg-blue-600/10' : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-dark-700 rounded-lg border border-dark-600"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-dark-800 border-r border-dark-600 z-40 flex flex-col transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <NavContent />
      </aside>
    </>
  );
}
