import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle, RefreshCw, Search, Shield, Eye, Wrench } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

function ScoreGauge({ score }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'border-green-500/30 bg-green-500/5' : score >= 60 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-red-500/30 bg-red-500/5';
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';

  return (
    <div className={`card border ${bgColor} flex items-center gap-6`}>
      <div className="text-center">
        <div className={`text-6xl font-bold ${color}`}>{score}</div>
        <div className="text-gray-400 text-sm mt-1">/ 100</div>
        <div className={`text-sm font-semibold mt-1 ${color}`}>{label}</div>
      </div>
      <div className="flex-1">
        <h2 className="text-white font-semibold text-lg mb-1">Security Score</h2>
        <p className="text-gray-400 text-sm">Based on SSH configuration, fail2ban status, available updates, and open ports.</p>
        <div className="mt-3 bg-dark-600 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function FindingsList({ findings, onFix, fixing }) {
  if (!findings || findings.length === 0) return null;

  const severityIcon = {
    ok: <CheckCircle className="w-4 h-4 text-green-400" />,
    high: <XCircle className="w-4 h-4 text-red-400" />,
    medium: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    info: <Eye className="w-4 h-4 text-blue-400" />,
    low: <AlertTriangle className="w-4 h-4 text-gray-400" />,
  };

  const severityOrder = { high: 0, medium: 1, low: 2, info: 3, ok: 4 };
  const sorted = [...findings].sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));

  return (
    <div className="space-y-2">
      {sorted.map((f, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
          f.severity === 'ok' ? 'bg-green-500/5 border-green-500/20' :
          f.severity === 'high' ? 'bg-red-500/5 border-red-500/20' :
          f.severity === 'medium' ? 'bg-yellow-500/5 border-yellow-500/20' :
          'bg-dark-700 border-dark-600'
        }`}>
          <div className="mt-0.5">{severityIcon[f.severity] || <Eye className="w-4 h-4 text-gray-400" />}</div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{f.category}</span>
            <p className="text-sm text-gray-200 mt-0.5">{f.message}</p>
          </div>
          {f.fixId && f.severity !== 'ok' && onFix && (
            <button
              onClick={() => onFix(f.fixId)}
              disabled={fixing === f.fixId}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {fixing === f.fixId
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Wrench className="w-3 h-3" />}
              {fixing === f.fixId ? 'Fixing...' : 'Fix'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Security() {
  const [activeTab, setActiveTab] = useState('overview');
  const [score, setScore] = useState(null);
  const [findings, setFindings] = useState([]);
  const [fail2ban, setFail2ban] = useState(null);
  const [logins, setLogins] = useState(null);
  const [sshConfig, setSshConfig] = useState(null);
  const [openPorts, setOpenPorts] = useState([]);
  const [suidFiles, setSuidFiles] = useState(null);
  const [worldWritable, setWorldWritable] = useState(null);
  const [loading, setLoading] = useState({});
  const [fixing, setFixing] = useState(null);
  const [unbanInput, setUnbanInput] = useState({ jail: '', ip: '' });
  const [actionResult, setActionResult] = useState('');
  const actionResultRef = useRef(null);
  const [sslCerts, setSslCerts] = useState(null);
  const [certbotDomain, setCertbotDomain] = useState('');
  const [certbotEmail, setCertbotEmail] = useState('');
  const [certbotRunning, setCertbotRunning] = useState(false);
  const [renewRunning, setRenewRunning] = useState(false);

  const setLoad = (key, val) => setLoading(prev => ({ ...prev, [key]: val }));

  const fetchScore = useCallback(async (silent = false) => {
    if (!silent) setLoad('score', true);
    try {
      const res = await axios.get('/api/security/score');
      setScore(res.data.score);
      setFindings(res.data.findings || []);
    } catch (err) {
      console.error('Failed to fetch security score:', err);
    } finally {
      setLoad('score', false);
    }
  }, []);

  const fetchFail2ban = useCallback(async () => {
    setLoad('fail2ban', true);
    try {
      const res = await axios.get('/api/security/fail2ban');
      setFail2ban(res.data);
    } catch (err) {
      console.error('Failed to fetch fail2ban:', err);
    } finally {
      setLoad('fail2ban', false);
    }
  }, []);

  const fetchLogins = useCallback(async () => {
    setLoad('logins', true);
    try {
      const res = await axios.get('/api/security/logins');
      setLogins(res.data);
    } catch (err) {
      console.error('Failed to fetch logins:', err);
    } finally {
      setLoad('logins', false);
    }
  }, []);

  const fetchSshConfig = useCallback(async () => {
    setLoad('ssh', true);
    try {
      const res = await axios.get('/api/security/ssh-config');
      setSshConfig(res.data);
    } catch (err) {
      console.error('Failed to fetch SSH config:', err);
    } finally {
      setLoad('ssh', false);
    }
  }, []);

  const fetchOpenPorts = useCallback(async () => {
    setLoad('ports', true);
    try {
      const res = await axios.get('/api/security/open-ports');
      setOpenPorts(res.data.ports || []);
    } catch (err) {
      console.error('Failed to fetch open ports:', err);
    } finally {
      setLoad('ports', false);
    }
  }, []);

  const fetchSslCerts = useCallback(async () => {
    setLoad('ssl', true);
    try {
      const res = await axios.get('/api/ssl/certs');
      setSslCerts(res.data.certs || []);
    } catch (_) {
      setSslCerts([]);
    } finally {
      setLoad('ssl', false);
    }
  }, []);

  useEffect(() => {
    fetchScore();
  }, []);

  useEffect(() => {
    if (activeTab === 'fail2ban' && !fail2ban) fetchFail2ban();
    else if (activeTab === 'logins' && !logins) fetchLogins();
    else if (activeTab === 'ssh' && !sshConfig) fetchSshConfig();
    else if (activeTab === 'ports' && openPorts.length === 0) fetchOpenPorts();
    else if (activeTab === 'ssl' && !sslCerts) fetchSslCerts();
  }, [activeTab]);

  const handleFix = async (fixId) => {
    setFixing(fixId);
    setActionResult('');
    try {
      const res = await axios.post('/api/security/fix', { fixId });
      setActionResult(res.data.message || 'Fix applied successfully');
      fetchScore(true); // silent — don't replace findings list with loading spinner
      if (activeTab === 'ssh') fetchSshConfig();
    } catch (err) {
      setActionResult(`Error: ${err.response?.data?.error || 'Fix failed'}`);
    } finally {
      setFixing(null);
      setTimeout(() => actionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  };

  const handleUnban = async (e) => {
    e.preventDefault();
    setActionResult('');
    try {
      const res = await axios.post('/api/security/fail2ban/unban', {
        jail: unbanInput.jail,
        ip: unbanInput.ip,
      });
      setActionResult(`Unbanned ${unbanInput.ip} from ${unbanInput.jail}`);
      setUnbanInput({ jail: '', ip: '' });
      fetchFail2ban();
    } catch (err) {
      setActionResult(`Error: ${err.response?.data?.error || 'Unban failed'}`);
    }
  };

  const handleScanSuid = async () => {
    setLoad('suid', true);
    try {
      const res = await axios.get('/api/security/suid-files');
      setSuidFiles(res.data.files || []);
    } catch (err) {
      setSuidFiles([]);
    } finally {
      setLoad('suid', false);
    }
  };

  const handleScanWorldWritable = async () => {
    setLoad('ww', true);
    try {
      const res = await axios.get('/api/security/world-writable');
      setWorldWritable(res.data.files || []);
    } catch (err) {
      setWorldWritable([]);
    } finally {
      setLoad('ww', false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'fail2ban', label: 'Fail2Ban' },
    { id: 'logins', label: 'Login History' },
    { id: 'ssh', label: 'SSH Config' },
    { id: 'ports', label: 'Open Ports' },
    { id: 'audit', label: 'File Audit' },
    { id: 'ssl', label: 'SSL' },
  ];

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Security"
            subtitle="Security posture, fail2ban, logins, and audits"
            onRefresh={fetchScore}
            loading={loading.score}
          />

          {actionResult && (
            <div
              ref={actionResultRef}
              className={`mb-4 p-4 rounded-lg text-sm font-medium border flex items-center justify-between gap-3 ${actionResult.startsWith('Error') ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-green-500/15 border-green-500/40 text-green-300'}`}
            >
              <span>{actionResult}</span>
              <button onClick={() => setActionResult('')} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
            </div>
          )}

          {/* Score always visible at top */}
          {score !== null && (
            <div className="mb-6">
              <ScoreGauge score={score} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {loading.score ? (
                <div className="text-center py-8 text-gray-500">Computing security score...</div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-gray-300">Security Findings</h3>
                  <FindingsList findings={findings} onFix={handleFix} fixing={fixing} />
                  {findings.length === 0 && (
                    <div className="text-center py-8 text-gray-500">Click refresh to run a security check</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Fail2Ban Tab */}
          {activeTab === 'fail2ban' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchFail2ban} disabled={loading.fail2ban} className="btn-primary text-sm py-2 flex items-center gap-2">
                  {loading.fail2ban && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Refresh
                </button>
              </div>

              {loading.fail2ban ? (
                <div className="text-center py-8 text-gray-500">Loading fail2ban status...</div>
              ) : fail2ban ? (
                <>
                  <div className={`card border ${fail2ban.active ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center gap-3">
                      {fail2ban.active ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                      <div>
                        <span className="font-semibold text-white">fail2ban</span>
                        <span className={`ml-2 text-sm ${fail2ban.active ? 'text-green-400' : 'text-red-400'}`}>
                          {fail2ban.active ? 'Active' : 'Inactive'}
                        </span>
                        {fail2ban.error && <p className="text-sm text-gray-400 mt-1">{fail2ban.error}</p>}
                      </div>
                    </div>
                  </div>

                  {fail2ban.active && fail2ban.jails && (
                    <div className="space-y-4">
                      {fail2ban.jails.map(jail => (
                        <div key={jail.name} className="card">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-white">{jail.name}</h3>
                            <div className="flex gap-4 text-sm">
                              <span className="text-gray-400">Failed: <span className="text-yellow-400">{jail.currentlyFailed}</span></span>
                              <span className="text-gray-400">Banned: <span className="text-red-400">{jail.currentlyBanned}</span></span>
                              <span className="text-gray-400">Total: <span className="text-gray-300">{jail.totalBanned}</span></span>
                            </div>
                          </div>
                          {jail.bannedIPs && jail.bannedIPs.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-400 mb-2">Banned IPs:</div>
                              {jail.bannedIPs.map(ip => (
                                <div key={ip} className="flex items-center justify-between px-3 py-2 bg-dark-800 rounded-lg">
                                  <span className="font-mono text-sm text-red-300">{ip}</span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await axios.post('/api/security/fail2ban/unban', { jail: jail.name, ip });
                                        setActionResult(`Unbanned ${ip} from ${jail.name}`);
                                        fetchFail2ban();
                                      } catch (err) {
                                        setActionResult(`Error: ${err.response?.data?.error || 'Failed'}`);
                                      }
                                    }}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                  >
                                    Unban
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="card">
                        <h3 className="text-sm font-semibold text-white mb-3">Manual Unban</h3>
                        <form onSubmit={handleUnban} className="flex gap-3">
                          <input
                            type="text"
                            value={unbanInput.jail}
                            onChange={e => setUnbanInput(prev => ({ ...prev, jail: e.target.value }))}
                            placeholder="Jail name"
                            className="input-field flex-1"
                            required
                          />
                          <input
                            type="text"
                            value={unbanInput.ip}
                            onChange={e => setUnbanInput(prev => ({ ...prev, ip: e.target.value }))}
                            placeholder="IP address"
                            className="input-field flex-1"
                            required
                          />
                          <button type="submit" className="btn-primary text-sm">Unban</button>
                        </form>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">Click Refresh to load fail2ban status</div>
              )}
            </div>
          )}

          {/* Login History Tab */}
          {activeTab === 'logins' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchLogins} disabled={loading.logins} className="btn-primary text-sm py-2 flex items-center gap-2">
                  {loading.logins && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Refresh
                </button>
              </div>

              {loading.logins ? (
                <div className="text-center py-8 text-gray-500">Loading login history...</div>
              ) : logins ? (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Logins</h3>
                    <div className="card overflow-hidden p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-dark-600">
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">User</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Terminal</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">IP / Host</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logins.recentLogins?.slice(0, 20).map((l, i) => (
                            <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                              <td className="px-4 py-2.5 font-mono text-sm text-white">{l.user}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{l.terminal}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{l.ip || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{l.date}</td>
                            </tr>
                          ))}
                          {(!logins.recentLogins || logins.recentLogins.length === 0) && (
                            <tr><td colSpan={4} className="text-center py-6 text-gray-500 text-sm">No recent logins</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-3">Failed Login Attempts</h3>
                    <div className="card overflow-hidden p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-dark-600">
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">User</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Terminal</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">IP / Host</th>
                            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logins.failedLogins?.slice(0, 20).map((l, i) => (
                            <tr key={i} className="border-b border-dark-700/50 hover:bg-red-900/10">
                              <td className="px-4 py-2.5 font-mono text-sm text-red-300">{l.user}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{l.terminal}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{l.ip || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{l.date}</td>
                            </tr>
                          ))}
                          {(!logins.failedLogins || logins.failedLogins.length === 0) && (
                            <tr><td colSpan={4} className="text-center py-6 text-gray-500 text-sm">No failed logins found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">Click Refresh to load login history</div>
              )}
            </div>
          )}

          {/* SSH Config Tab */}
          {activeTab === 'ssh' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchSshConfig} disabled={loading.ssh} className="btn-primary text-sm py-2 flex items-center gap-2">
                  {loading.ssh && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Refresh
                </button>
              </div>

              {loading.ssh ? (
                <div className="text-center py-8 text-gray-500">Loading SSH config...</div>
              ) : sshConfig ? (
                <div className="space-y-4">
                  {sshConfig.error && (
                    <div className="card border border-red-500/30 bg-red-500/5 text-red-400 text-sm">{sshConfig.error}</div>
                  )}

                  {/* Warning banner */}
                  {sshConfig.checks?.some(c => !c.pass && (c.key === 'PermitRootLogin' || c.key === 'PasswordAuthentication')) && (
                    <div className="card border border-yellow-500/30 bg-yellow-500/5">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
                        <div>
                          <div className="text-yellow-400 font-semibold">Security Warning</div>
                          <p className="text-sm text-gray-300 mt-1">
                            {sshConfig.checks.find(c => c.key === 'PermitRootLogin' && !c.pass) && 'Root SSH login is enabled. '}
                            {sshConfig.checks.find(c => c.key === 'PasswordAuthentication' && !c.pass) && 'Password authentication is enabled - key-based auth is more secure.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="card overflow-hidden p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs w-12"></th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Setting</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Value</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Recommendation</th>
                          <th className="px-4 py-3 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sshConfig.checks?.map((check, i) => (
                          <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                            <td className="px-4 py-3">
                              {check.pass
                                ? <CheckCircle className="w-4 h-4 text-green-400" />
                                : <XCircle className="w-4 h-4 text-red-400" />}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-white">{check.key}</td>
                            <td className="px-4 py-3 font-mono text-sm text-gray-300">{check.value}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{check.recommendation}</td>
                            <td className="px-4 py-3">
                              {!check.pass && check.fixId && (
                                <button
                                  onClick={() => handleFix(check.fixId)}
                                  disabled={fixing === check.fixId}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap"
                                >
                                  {fixing === check.fixId
                                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                                    : <Wrench className="w-3 h-3" />}
                                  {fixing === check.fixId ? 'Fixing...' : 'Fix'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Click Refresh to load SSH configuration</div>
              )}
            </div>
          )}

          {/* Open Ports Tab */}
          {activeTab === 'ports' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchOpenPorts} disabled={loading.ports} className="btn-primary text-sm py-2 flex items-center gap-2">
                  {loading.ports && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Refresh
                </button>
              </div>

              {loading.ports ? (
                <div className="text-center py-8 text-gray-500">Loading open ports...</div>
              ) : openPorts.length > 0 ? (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Protocol</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Port</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Address</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Process</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">PID</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPorts.sort((a, b) => a.port - b.port).map((port, i) => (
                          <tr key={i} className={`border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors ${port.unexpected ? 'bg-yellow-500/3' : ''}`}>
                            <td className="px-4 py-2.5">
                              <span className={`badge ${port.proto === 'tcp' ? 'badge-blue' : 'badge-green'}`}>
                                {port.proto?.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-white text-sm">{port.port}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{port.localAddr}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-300">{port.process || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{port.pid || '—'}</td>
                            <td className="px-4 py-2.5">
                              {port.unexpected && (
                                <span className="badge badge-yellow text-xs">Unexpected</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-dark-600 text-xs text-gray-600">
                    {openPorts.filter(p => p.unexpected).length} unexpected ports
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Click Refresh to load open ports</div>
              )}
            </div>
          )}

          {/* SSL Tab */}
          {activeTab === 'ssl' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cert list */}
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-300">Installed Certificates</h3>
                    <button onClick={fetchSslCerts} disabled={loading.ssl} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
                      {loading.ssl ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Refresh
                    </button>
                  </div>
                  {loading.ssl ? (
                    <div className="text-center py-8 text-gray-500">Loading certificates...</div>
                  ) : sslCerts === null ? (
                    <div className="text-center py-8 text-gray-500">Click Refresh to load certificates</div>
                  ) : sslCerts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No certificates found</div>
                  ) : (
                    sslCerts.map((cert, i) => {
                      const color = cert.status === 'valid' ? 'border-green-500/20 bg-green-500/5' : cert.status === 'warning' ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5';
                      const textColor = cert.status === 'valid' ? 'text-green-400' : cert.status === 'warning' ? 'text-yellow-400' : 'text-red-400';
                      return (
                        <div key={i} className={`card border ${color}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-white text-sm">{cert.cn || cert.name}</span>
                                <span className={`text-xs ${textColor}`}>
                                  {cert.status === 'valid' ? 'Valid' : cert.status === 'warning' ? 'Expiring Soon' : 'Expired'}
                                </span>
                                {cert.daysLeft !== undefined && (
                                  <span className="text-xs text-gray-500">{cert.daysLeft >= 0 ? `${cert.daysLeft}d left` : `Expired ${Math.abs(cert.daysLeft)}d ago`}</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-1 font-mono truncate">{cert.path}</p>
                              {cert.notAfter && (
                                <p className="text-xs text-gray-500 mt-0.5">Expires: {new Date(cert.notAfter).toLocaleDateString()}</p>
                              )}
                            </div>
                            {(cert.status === 'warning' || cert.status === 'expired') && (
                              <button
                                onClick={async () => {
                                  setRenewRunning(true);
                                  setActionResult('');
                                  try {
                                    const res = await axios.post('/api/ssl/renew');
                                    setActionResult('Certificates renewed successfully');
                                    fetchSslCerts();
                                  } catch (err) {
                                    setActionResult(`Error: ${err.response?.data?.error || 'Renewal failed'}`);
                                  } finally {
                                    setRenewRunning(false);
                                    setTimeout(() => actionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                                  }
                                }}
                                disabled={renewRunning}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white transition-colors"
                              >
                                {renewRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Renew
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Right panel: Issue + Renew all */}
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-300 mb-4">Issue Certificate</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setCertbotRunning(true);
                      setActionResult('');
                      try {
                        const res = await axios.post('/api/ssl/certbot', { domain: certbotDomain, email: certbotEmail });
                        setActionResult(`Certificate issued for ${certbotDomain}`);
                        setCertbotDomain('');
                        fetchSslCerts();
                      } catch (err) {
                        setActionResult(`Error: ${err.response?.data?.error || 'Certbot failed'}`);
                      } finally {
                        setCertbotRunning(false);
                        setTimeout(() => actionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                      }
                    }} className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Domain</label>
                        <input type="text" value={certbotDomain} onChange={e => setCertbotDomain(e.target.value)} placeholder="example.com" className="input-field text-sm" required />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Email</label>
                        <input type="email" value={certbotEmail} onChange={e => setCertbotEmail(e.target.value)} placeholder="admin@example.com" className="input-field text-sm" required />
                      </div>
                      <p className="text-xs text-gray-500">Requires port 80 to be publicly accessible.</p>
                      <button type="submit" disabled={certbotRunning} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                        {certbotRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {certbotRunning ? 'Issuing...' : 'Issue Certificate'}
                      </button>
                    </form>
                  </div>

                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">Renew All</h3>
                    <p className="text-xs text-gray-500 mb-3">Renew all certificates expiring within 30 days.</p>
                    <button
                      onClick={async () => {
                        setRenewRunning(true);
                        setActionResult('');
                        try {
                          await axios.post('/api/ssl/renew');
                          setActionResult('All certificates renewed');
                          fetchSslCerts();
                        } catch (err) {
                          setActionResult(`Error: ${err.response?.data?.error || 'Renewal failed'}`);
                        } finally {
                          setRenewRunning(false);
                          setTimeout(() => actionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                        }
                      }}
                      disabled={renewRunning}
                      className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                    >
                      {renewRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {renewRunning ? 'Renewing...' : 'Renew All Certificates'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* File Audit Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SUID Files */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-300">SUID / SGID Files</h3>
                    <button
                      onClick={handleScanSuid}
                      disabled={loading.suid}
                      className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                    >
                      {loading.suid ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      {loading.suid ? 'Scanning...' : 'Scan'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Files with SUID bit set can run with elevated privileges. Scan may take 15-30 seconds.</p>

                  {suidFiles === null ? (
                    <div className="text-center py-8 text-gray-600 text-sm bg-dark-700 rounded-lg">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Click "Scan" to find SUID files
                    </div>
                  ) : (
                    <div className="bg-dark-700 border border-dark-600 rounded-lg overflow-hidden">
                      {suidFiles.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">No SUID files found</div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {suidFiles.map((f, i) => (
                            <div key={i} className="px-3 py-1.5 border-b border-dark-600 font-mono text-xs text-gray-300 hover:bg-dark-600">
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-3 py-2 border-t border-dark-600 text-xs text-gray-600">
                        {suidFiles.length} files found
                      </div>
                    </div>
                  )}
                </div>

                {/* World-Writable Files */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-300">World-Writable Files</h3>
                    <button
                      onClick={handleScanWorldWritable}
                      disabled={loading.ww}
                      className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                    >
                      {loading.ww ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      {loading.ww ? 'Scanning...' : 'Scan'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Files writable by any user are a security risk. Scan may take 15-30 seconds.</p>

                  {worldWritable === null ? (
                    <div className="text-center py-8 text-gray-600 text-sm bg-dark-700 rounded-lg">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Click "Scan" to find world-writable files
                    </div>
                  ) : (
                    <div className="bg-dark-700 border border-dark-600 rounded-lg overflow-hidden">
                      {worldWritable.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">No world-writable files found</div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {worldWritable.map((f, i) => (
                            <div key={i} className="px-3 py-1.5 border-b border-dark-600 font-mono text-xs text-yellow-300 hover:bg-dark-600">
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-3 py-2 border-t border-dark-600 text-xs text-gray-600">
                        {worldWritable.length} files found
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
