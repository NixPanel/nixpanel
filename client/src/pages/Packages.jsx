import React, { useState, useEffect } from 'react';
import { Package, Search, Trash2, Download, RefreshCw, Plus, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [installPkg, setInstallPkg] = useState('');
  const [installing, setInstalling] = useState(false);
  const [output, setOutput] = useState('');
  const [activeTab, setActiveTab] = useState('installed');
  const [filter, setFilter] = useState('');

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const [pkgRes, updateRes] = await Promise.all([
        axios.get('/api/packages/installed'),
        axios.get('/api/packages/updates'),
      ]);
      setPackages(pkgRes.data.packages || []);
      setUpdates(updateRes.data.updates || []);
      setManager(pkgRes.data.manager);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPackages(); }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`/api/packages/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data.results || []);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Search failed'}`);
    } finally {
      setSearching(false);
    }
  };

  const handleInstall = async (e) => {
    e.preventDefault();
    const pkg = installPkg.trim();
    if (!pkg) return;
    if (!confirm(`Install package: ${pkg}?`)) return;

    setInstalling(true);
    setOutput('');
    try {
      const res = await axios.post('/api/packages/install', { packageName: pkg });
      setOutput(res.data.output);
      setInstallPkg('');
      fetchPackages();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Installation failed'}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleRemove = async (pkgName) => {
    if (!confirm(`Remove package: ${pkgName}? This may break other packages.`)) return;
    try {
      const res = await axios.delete(`/api/packages/${pkgName}`);
      setOutput(res.data.output);
      fetchPackages();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Removal failed'}`);
    }
  };

  const filtered = packages.filter(p =>
    !filter || p.name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="Package Manager"
            subtitle={manager ? `Using: ${manager} · ${packages.length} packages installed` : 'Package management'}
            onRefresh={fetchPackages}
            loading={loading}
          />

          {/* Tabs */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 mb-6 w-fit">
            {[
              { id: 'installed', label: `Installed (${packages.length})` },
              { id: 'updates', label: `Updates (${updates.length})` },
              { id: 'search', label: 'Search & Install' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Output terminal */}
          {output && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Command output</span>
                <button onClick={() => setOutput('')} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              </div>
              <pre className="terminal max-h-48 overflow-y-auto">{output}</pre>
            </div>
          )}

          {/* Installed packages */}
          {activeTab === 'installed' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter packages..."
                    className="input-field pl-9"
                  />
                </div>
              </div>
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading packages...</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-600">
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Package</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Version</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium hidden md:table-cell">Description</th>
                        <th className="py-2 px-3 text-gray-500 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 200).map((pkg, i) => (
                        <tr key={i} className="border-b border-dark-800 hover:bg-dark-600/30 transition-colors">
                          <td className="py-2 px-3 font-mono text-blue-400 font-medium">{pkg.name}</td>
                          <td className="py-2 px-3 font-mono text-gray-400 text-xs">{pkg.version}</td>
                          <td className="py-2 px-3 text-gray-500 text-xs truncate max-w-xs hidden md:table-cell">{pkg.description}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleRemove(pkg.name)}
                              className="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1 rounded transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length > 200 && (
                    <p className="text-center py-3 text-gray-500 text-sm">Showing 200 of {filtered.length}. Use filter to narrow down.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Updates */}
          {activeTab === 'updates' && (
            <div className="card">
              {updates.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-emerald-400 font-medium">System is up to date</p>
                  <p className="text-gray-500 text-sm mt-1">No pending updates found</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-yellow-400">{updates.length} package(s) available for update</span>
                  </div>
                  <div className="space-y-1">
                    {updates.map((u, i) => (
                      <div key={i} className="px-3 py-2 font-mono text-sm text-gray-300 hover:bg-dark-600 rounded">
                        {u.package}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search & Install */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="card">
                <div className="card-header">Install Package</div>
                <form onSubmit={handleInstall} className="flex gap-3">
                  <input
                    type="text"
                    value={installPkg}
                    onChange={e => setInstallPkg(e.target.value)}
                    placeholder="Package name (e.g. htop, vim, nginx)"
                    className="input-field flex-1"
                  />
                  <button type="submit" disabled={installing} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                    {installing ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Installing...</>
                    ) : (
                      <><Download className="w-4 h-4" />Install</>
                    )}
                  </button>
                </form>
              </div>

              <div className="card">
                <div className="card-header">Search Packages</div>
                <form onSubmit={handleSearch} className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search for packages..."
                    className="input-field flex-1"
                  />
                  <button type="submit" disabled={searching} className="btn-ghost flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </form>
                {searchResults.length > 0 && (
                  <div className="space-y-1">
                    {searchResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-2 hover:bg-dark-600 rounded-lg">
                        <span className="font-mono text-sm text-gray-300">{r.name}</span>
                        <button
                          onClick={() => { setInstallPkg(r.name.split(' ')[0]); setActiveTab('search'); }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          + Install
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
