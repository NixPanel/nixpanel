import React, { useState, useEffect, useCallback } from 'react';
import { HardDrive, RefreshCw, Search, AlertTriangle, CheckCircle, XCircle, Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

function UsageBar({ percent }) {
  const pct = parseInt(percent) || 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-dark-600 rounded-full h-1.5 min-w-16">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono w-10 text-right ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-gray-400'}`}>
        {percent}
      </span>
    </div>
  );
}

const SYSTEM_MOUNTS = new Set(['/', '/boot', '/boot/efi', '/proc', '/sys', '/dev', '/run', '/dev/pts', '/dev/shm', '/sys/kernel/security', '/sys/fs/cgroup', '/sys/fs/pstore', '/sys/fs/bpf']);

function DeviceTree({ devices, indent = 0 }) {
  const [expanded, setExpanded] = useState({});
  if (!devices || devices.length === 0) return null;

  return (
    <div>
      {devices.map((dev, i) => (
        <div key={`${dev.name}-${i}`}>
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-700/50 hover:bg-dark-700/30 text-sm"
            style={{ paddingLeft: `${16 + indent * 20}px` }}
          >
            {dev.children && dev.children.length > 0 ? (
              <button onClick={() => setExpanded(prev => ({ ...prev, [dev.name]: !prev[dev.name] }))} className="text-gray-500 hover:text-gray-300">
                {expanded[dev.name] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5" />
            )}
            <span className="font-mono text-white w-24 flex-shrink-0">{dev.name}</span>
            <span className="text-gray-400 w-16 flex-shrink-0">{dev.size || '—'}</span>
            <span className="text-gray-500 w-16 flex-shrink-0 text-xs">{dev.type || '—'}</span>
            <span className="text-gray-500 w-24 flex-shrink-0 text-xs">{dev.fstype || '—'}</span>
            <span className="text-gray-400 text-xs flex-1">{dev.mountpoint || '—'}</span>
            <span className="text-gray-600 text-xs max-w-32 truncate">{dev.model || dev.vendor || ''}</span>
          </div>
          {expanded[dev.name] && dev.children && (
            <DeviceTree devices={dev.children} indent={indent + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function FileSystem() {
  const [activeTab, setActiveTab] = useState('mounts');
  const [mounts, setMounts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [largestFiles, setLargestFiles] = useState([]);
  const [largestPath, setLargestPath] = useState('/');
  const [largestLoading, setLargestLoading] = useState(false);
  const [smartDevice, setSmartDevice] = useState('');
  const [smartData, setSmartData] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mountForm, setMountForm] = useState({ visible: false, device: '', mountPoint: '', fsType: 'auto' });
  const [actionResult, setActionResult] = useState('');
  const [error, setError] = useState('');

  const fetchMounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/filesystem/mounts');
      setMounts(res.data.mounts || []);
    } catch (err) {
      setError('Failed to load mounts');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/filesystem/devices');
      setDevices(res.data.devices || []);
    } catch (err) {
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'mounts') fetchMounts();
    else if (activeTab === 'devices') fetchDevices();
  }, [activeTab]);

  const handleUnmount = async (mountPoint) => {
    if (!confirm(`Unmount ${mountPoint}?`)) return;
    setActionResult('');
    try {
      const res = await axios.post('/api/filesystem/unmount', { mountPoint });
      setActionResult(`Unmounted ${mountPoint} successfully`);
      fetchMounts();
    } catch (err) {
      setActionResult(`Error: ${err.response?.data?.error || 'Unmount failed'}`);
    }
  };

  const handleMount = async (e) => {
    e.preventDefault();
    setActionResult('');
    try {
      const res = await axios.post('/api/filesystem/mount', {
        device: mountForm.device,
        mountPoint: mountForm.mountPoint,
        fsType: mountForm.fsType,
      });
      setActionResult(`Mounted ${mountForm.device} at ${mountForm.mountPoint}`);
      setMountForm({ visible: false, device: '', mountPoint: '', fsType: 'auto' });
      fetchMounts();
    } catch (err) {
      setActionResult(`Error: ${err.response?.data?.error || 'Mount failed'}`);
    }
  };

  const findLargestFiles = async () => {
    setLargestLoading(true);
    setLargestFiles([]);
    try {
      const res = await axios.get(`/api/filesystem/largest?path=${encodeURIComponent(largestPath)}`);
      setLargestFiles(res.data.files || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to find largest files');
    } finally {
      setLargestLoading(false);
    }
  };

  const fetchSmart = async () => {
    if (!smartDevice) return;
    setSmartLoading(true);
    setSmartData(null);
    try {
      // Extract just the device name (e.g. "sda" from "/dev/sda")
      const devName = smartDevice.replace('/dev/', '');
      const res = await axios.get(`/api/filesystem/smart/${devName}`);
      setSmartData(res.data);
    } catch (err) {
      setSmartData({ error: err.response?.data?.error || 'SMART query failed' });
    } finally {
      setSmartLoading(false);
    }
  };

  // Get block device names for SMART selector
  const blockDeviceNames = [];
  const flattenDevices = (devs) => {
    for (const d of devs) {
      if (d.type === 'disk') blockDeviceNames.push(d.name);
      if (d.children) flattenDevices(d.children);
    }
  };
  flattenDevices(devices);

  const tabs = [
    { id: 'mounts', label: 'Mounted Filesystems' },
    { id: 'devices', label: 'Block Devices' },
    { id: 'largest', label: 'Largest Files' },
    { id: 'smart', label: 'Disk Health' },
  ];

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Filesystems"
            subtitle="Mounts, devices, disk usage and health"
            onRefresh={activeTab === 'mounts' ? fetchMounts : activeTab === 'devices' ? fetchDevices : undefined}
            loading={loading}
          />

          {actionResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm border ${actionResult.startsWith('Error') ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
              {actionResult}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit flex-wrap">
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

          {/* Mounted Filesystems Tab */}
          {activeTab === 'mounts' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setMountForm(prev => ({ ...prev, visible: !prev.visible }))}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Mount Device
                </button>
              </div>

              {mountForm.visible && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-white mb-3">Mount a Device</h3>
                  <form onSubmit={handleMount} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={mountForm.device}
                      onChange={e => setMountForm(prev => ({ ...prev, device: e.target.value }))}
                      placeholder="/dev/sdb1"
                      className="input-field"
                      required
                    />
                    <input
                      type="text"
                      value={mountForm.mountPoint}
                      onChange={e => setMountForm(prev => ({ ...prev, mountPoint: e.target.value }))}
                      placeholder="/mnt/data"
                      className="input-field"
                      required
                    />
                    <select
                      value={mountForm.fsType}
                      onChange={e => setMountForm(prev => ({ ...prev, fsType: e.target.value }))}
                      className="input-field"
                    >
                      {['auto', 'ext4', 'xfs', 'ntfs', 'vfat', 'btrfs', 'exfat'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" className="btn-primary flex-1 text-sm">Mount</button>
                      <button type="button" onClick={() => setMountForm({ visible: false, device: '', mountPoint: '', fsType: 'auto' })} className="btn-ghost text-sm px-3">Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading mounts...</div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Filesystem</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Mount Point</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Type</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Size</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Used</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Available</th>
                          <th className="px-4 py-3 text-gray-400 font-medium text-xs w-40">Usage</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Inodes</th>
                          <th className="px-4 py-3 text-gray-400 font-medium text-xs w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mounts.map((m, i) => {
                          const isSystem = SYSTEM_MOUNTS.has(m.mountPoint) || m.mountPoint.startsWith('/proc') || m.mountPoint.startsWith('/sys') || m.mountPoint.startsWith('/dev');
                          return (
                            <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{m.filesystem}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-white font-medium">{m.mountPoint}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">{m.type}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-300">{m.size}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-300">{m.used}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-300">{m.available}</td>
                              <td className="px-4 py-2.5 w-40">
                                <UsageBar percent={m.usePercent} />
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">
                                {m.inodePercent || '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {!isSystem && (
                                  <button
                                    onClick={() => handleUnmount(m.mountPoint)}
                                    className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                    title="Unmount"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {mounts.length === 0 && !loading && (
                      <div className="text-center py-12 text-gray-500">
                        <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        No mounts found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Block Devices Tab */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={fetchDevices} disabled={loading} className="btn-primary text-sm py-2 flex items-center gap-2">
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Refresh
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading devices...</div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <div className="px-4 py-3 border-b border-dark-600 grid grid-cols-6 gap-2 text-xs text-gray-400 font-medium">
                    <span className="pl-5">Name</span>
                    <span>Size</span>
                    <span>Type</span>
                    <span>FS Type</span>
                    <span>Mount Point</span>
                    <span>Model</span>
                  </div>
                  <DeviceTree devices={devices} />
                  {devices.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      No block devices found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Largest Files Tab */}
          {activeTab === 'largest' && (
            <div className="space-y-4">
              <div className="card">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Search Path</label>
                    <input
                      type="text"
                      value={largestPath}
                      onChange={e => setLargestPath(e.target.value)}
                      placeholder="/"
                      className="input-field"
                    />
                  </div>
                  <button
                    onClick={findLargestFiles}
                    disabled={largestLoading}
                    className="btn-primary flex items-center gap-2"
                  >
                    {largestLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {largestLoading ? 'Scanning...' : 'Find Largest'}
                  </button>
                </div>
              </div>

              {largestFiles.length > 0 && (
                <div className="card overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs w-24">Size</th>
                          <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Path</th>
                        </tr>
                      </thead>
                      <tbody>
                        {largestFiles.map((f, i) => (
                          <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-sm text-yellow-400 font-bold w-24">{f.size}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{f.path}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-dark-600 text-xs text-gray-600">
                    {largestFiles.length} entries
                  </div>
                </div>
              )}

              {largestFiles.length === 0 && !largestLoading && (
                <div className="text-center py-12 text-gray-500">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Enter a path and click "Find Largest" to scan
                </div>
              )}
            </div>
          )}

          {/* Disk Health (SMART) Tab */}
          {activeTab === 'smart' && (
            <div className="space-y-4">
              <div className="card">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Device</label>
                    {devices.length > 0 ? (
                      <select
                        value={smartDevice}
                        onChange={e => setSmartDevice(e.target.value)}
                        className="input-field"
                      >
                        <option value="">Select a device...</option>
                        {blockDeviceNames.map(d => (
                          <option key={d} value={d}>/dev/{d}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={smartDevice}
                        onChange={e => setSmartDevice(e.target.value.replace('/dev/', ''))}
                        placeholder="sda (without /dev/)"
                        className="input-field"
                      />
                    )}
                  </div>
                  <button
                    onClick={fetchSmart}
                    disabled={smartLoading || !smartDevice}
                    className="btn-primary flex items-center gap-2"
                  >
                    {smartLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                    {smartLoading ? 'Checking...' : 'Check SMART'}
                  </button>
                </div>
                {devices.length === 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Load Block Devices tab first to populate the device list, or type the device name manually.
                  </p>
                )}
              </div>

              {smartData && (
                <div className="space-y-4">
                  {smartData.error ? (
                    <div className="card border border-red-500/30 bg-red-500/5">
                      <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-medium">{smartData.error}</span>
                      </div>
                      {smartData.raw && (
                        <pre className="mt-3 text-xs text-gray-500 font-mono overflow-x-auto">{smartData.raw}</pre>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={`card border ${smartData.health === 'PASSED' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                        <div className="flex items-center gap-3">
                          {smartData.health === 'PASSED' ? (
                            <CheckCircle className="w-6 h-6 text-green-400" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-400" />
                          )}
                          <div>
                            <div className="font-semibold text-white">{smartData.device}</div>
                            <div className={`text-lg font-bold ${smartData.health === 'PASSED' ? 'text-green-400' : 'text-red-400'}`}>
                              {smartData.health}
                            </div>
                          </div>
                        </div>
                      </div>

                      {smartData.attributes && smartData.attributes.length > 0 && (
                        <div className="card overflow-hidden p-0">
                          <div className="px-4 py-3 border-b border-dark-600">
                            <h3 className="text-sm font-semibold text-white">SMART Attributes</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-dark-600">
                                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium">ID</th>
                                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Name</th>
                                  <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Value</th>
                                  <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Worst</th>
                                  <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Threshold</th>
                                  <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Raw</th>
                                </tr>
                              </thead>
                              <tbody>
                                {smartData.attributes.map((attr, i) => (
                                  <tr key={i} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                                    <td className="px-4 py-2 font-mono text-gray-500">{attr.id}</td>
                                    <td className="px-4 py-2 text-gray-300">{attr.name}</td>
                                    <td className="px-4 py-2 text-right font-mono text-white">{attr.value}</td>
                                    <td className="px-4 py-2 text-right font-mono text-gray-400">{attr.worst}</td>
                                    <td className="px-4 py-2 text-right font-mono text-gray-500">{attr.threshold}</td>
                                    <td className="px-4 py-2 text-right font-mono text-gray-300">{attr.rawValue}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="card">
                        <h3 className="text-xs font-semibold text-gray-400 mb-2">Raw SMART Output</h3>
                        <pre className="text-xs font-mono text-gray-500 overflow-x-auto whitespace-pre-wrap">{smartData.raw}</pre>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!smartData && !smartLoading && (
                <div className="text-center py-12 text-gray-500">
                  <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Select a device and click "Check SMART" to view disk health
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
