import React, { useState, useEffect } from 'react';
import { KeyRound, Trash2, Plus, Copy, AlertTriangle, RefreshCw, Eye, EyeOff, Download, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const SYSTEM_USERS = ['root', 'www-data', 'nginx', 'ubuntu', 'ec2-user', 'admin', 'deploy'];

export default function SSH() {
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState('root');
  const [customUser, setCustomUser] = useState('');
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [output, setOutput] = useState('');
  const [outputType, setOutputType] = useState('info');

  // Key generation
  const [genType, setGenType] = useState('ed25519');
  const [genBits, setGenBits] = useState(4096);
  const [genComment, setGenComment] = useState('');
  const [genName, setGenName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [showPrivate, setShowPrivate] = useState(false);
  const [copied, setCopied] = useState('');

  // Stored keypairs
  const [keypairs, setKeypairs] = useState([]);
  const [keypairsLoading, setKeypairsLoading] = useState(false);
  const [authorizingKey, setAuthorizingKey] = useState(null);

  const targetUser = customUser.trim() || selectedUser;

  const fetchKeys = async () => {
    if (!targetUser) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/ssh/keys/${targetUser}`);
      setKeys(res.data.keys || []);
      setOutput('');
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Failed to load keys'}`);
      setOutputType('error');
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, [targetUser]);

  const fetchKeypairs = async () => {
    setKeypairsLoading(true);
    try {
      const res = await axios.get('/api/ssh/keypairs');
      setKeypairs(res.data.keypairs || []);
    } catch (_) {
      setKeypairs([]);
    } finally {
      setKeypairsLoading(false);
    }
  };

  useEffect(() => { fetchKeypairs(); }, []);

  const downloadKey = async (name, type) => {
    try {
      const res = await axios.get(`/api/ssh/keypairs/${encodeURIComponent(name)}/download?type=${type}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'private' ? name : `${name}.pub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Download failed'}`);
      setOutputType('error');
    }
  };

  const handleAuthorize = async (keyName) => {
    setAuthorizingKey(keyName);
    try {
      await axios.post(`/api/ssh/keypairs/${encodeURIComponent(keyName)}/authorize`, { username: targetUser });
      setOutput(`Public key "${keyName}" added to authorized_keys for ${targetUser}`);
      setOutputType('success');
      fetchKeys();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Failed to authorize key'}`);
      setOutputType('error');
    } finally {
      setAuthorizingKey(null);
    }
  };

  const handleDeleteKeypair = async (name) => {
    if (!confirm(`Delete key pair "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/ssh/keypairs/${encodeURIComponent(name)}`);
      setOutput(`Key pair "${name}" deleted.`);
      setOutputType('success');
      fetchKeypairs();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Failed to delete key pair'}`);
      setOutputType('error');
    }
  };

  const handleAddKey = async (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setAddingKey(true);
    try {
      await axios.post(`/api/ssh/keys/${targetUser}`, { key: newKey.trim() });
      setOutput('SSH key added successfully.');
      setOutputType('success');
      setNewKey('');
      setShowAddForm(false);
      fetchKeys();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Failed to add key'}`);
      setOutputType('error');
    } finally {
      setAddingKey(false);
    }
  };

  const handleDelete = async (index) => {
    try {
      await axios.delete(`/api/ssh/keys/${targetUser}/${index}`);
      setOutput('Key removed.');
      setOutputType('success');
      fetchKeys();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Failed to delete key'}`);
      setOutputType('error');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGeneratedKeys(null);
    try {
      const res = await axios.post('/api/ssh/generate', {
        type: genType,
        bits: genBits,
        comment: genComment,
        name: genName.trim(),
      });
      setGeneratedKeys(res.data);
      setGenName('');
      setOutput(`Key pair "${res.data.name}" generated and saved to server.`);
      setOutputType('success');
      fetchKeypairs();
    } catch (err) {
      setOutput(`Error: ${err.response?.data?.error || 'Key generation failed'}`);
      setOutputType('error');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch (_) {}
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="p-6">
          <Header
            title="SSH Key Manager"
            subtitle="Manage authorized SSH keys"
            onRefresh={fetchKeys}
            loading={loading}
          />

          {output && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${outputType === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {output}
              <button onClick={() => setOutput('')} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Security warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-6 flex items-start gap-2 text-sm text-yellow-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>SSH key management grants persistent access. Only add keys for trusted users. Removing a key will immediately revoke that access.</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: User selector and key list */}
            <div className="lg:col-span-2 space-y-4">
              {/* User selector */}
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Target User</h3>
                <div className="flex gap-3">
                  <select
                    value={customUser ? '__custom__' : selectedUser}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setCustomUser('');
                      } else {
                        setSelectedUser(e.target.value);
                        setCustomUser('');
                      }
                    }}
                    className="input-field flex-1"
                  >
                    {SYSTEM_USERS.map(u => <option key={u} value={u}>{u}</option>)}
                    <option value="__custom__">Custom user...</option>
                  </select>
                  {(customUser !== '' || (!SYSTEM_USERS.includes(selectedUser))) && (
                    <input
                      type="text"
                      value={customUser}
                      onChange={e => setCustomUser(e.target.value)}
                      placeholder="username"
                      className="input-field flex-1"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Viewing authorized_keys for: <span className="text-blue-400 font-mono">{targetUser}</span>
                </p>
              </div>

              {/* Keys list */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-300">
                    Authorized Keys
                    <span className="ml-2 text-xs text-gray-500">({keys.length})</span>
                  </h3>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 text-xs btn-primary py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Key
                  </button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleAddKey} className="mb-4 p-3 bg-dark-700 rounded-lg border border-dark-600">
                    <label className="block text-xs text-gray-400 mb-2">Paste Public Key</label>
                    <textarea
                      value={newKey}
                      onChange={e => setNewKey(e.target.value)}
                      placeholder="ssh-ed25519 AAAA... user@host"
                      className="input-field font-mono text-xs h-24 resize-none"
                      required
                    />
                    <div className="flex gap-2 mt-2">
                      <button type="submit" disabled={addingKey} className="btn-primary text-xs py-1.5">
                        {addingKey ? <RefreshCw className="w-3 h-3 animate-spin inline mr-1" /> : null}
                        Add Key
                      </button>
                      <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 hover:bg-dark-600 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {loading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Loading keys...</div>
                ) : keys.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No authorized keys found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {keys.map((key) => (
                      <div key={key.index} className="flex items-start gap-3 p-3 bg-dark-700 rounded-lg border border-dark-600">
                        <KeyRound className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-blue text-xs">{key.type}</span>
                            {key.comment && <span className="text-xs text-gray-400">{key.comment}</span>}
                          </div>
                          <p className="font-mono text-xs text-gray-500 mt-1 break-all">{key.truncatedKey}</p>
                          {key.fingerprint && (
                            <p className="text-xs text-gray-600 mt-0.5 font-mono">{key.fingerprint}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(key.index)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                          title="Remove key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Key generator */}
            <div className="space-y-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Generate Key Pair</h3>
                <form onSubmit={handleGenerate} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Key Type</label>
                    <select value={genType} onChange={e => setGenType(e.target.value)} className="input-field text-sm">
                      <option value="ed25519">ED25519 (recommended)</option>
                      <option value="rsa">RSA</option>
                      <option value="ecdsa">ECDSA</option>
                    </select>
                  </div>
                  {genType === 'rsa' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Bits</label>
                      <select value={genBits} onChange={e => setGenBits(parseInt(e.target.value))} className="input-field text-sm">
                        <option value={2048}>2048</option>
                        <option value={3072}>3072</option>
                        <option value={4096}>4096 (recommended)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name (optional)</label>
                    <input
                      type="text"
                      value={genName}
                      onChange={e => setGenName(e.target.value)}
                      placeholder="my-server-key"
                      className="input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Comment (optional)</label>
                    <input
                      type="text"
                      value={genComment}
                      onChange={e => setGenComment(e.target.value)}
                      placeholder="user@hostname"
                      className="input-field text-sm"
                    />
                  </div>
                  <button type="submit" disabled={generating} className="btn-primary w-full text-sm">
                    {generating ? <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> : null}
                    Generate Keys
                  </button>
                </form>
              </div>

              {generatedKeys && (
                <div className="card space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300">Generated Keys</h3>

                  {generatedKeys.fingerprint && (
                    <p className="text-xs text-gray-500 font-mono break-all">{generatedKeys.fingerprint}</p>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-400">Public Key</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyToClipboard(generatedKeys.publicKey, 'pub')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                          <Copy className="w-3 h-3" />
                          {copied === 'pub' ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={() => downloadKey(generatedKeys.name, 'public')} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                    <textarea readOnly value={generatedKeys.publicKey} className="input-field font-mono text-xs h-16 resize-none text-green-300" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-400">Private Key</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowPrivate(!showPrivate)} className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1">
                          {showPrivate ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {showPrivate ? 'Hide' : 'Show'}
                        </button>
                        <button onClick={() => copyToClipboard(generatedKeys.privateKey, 'priv')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                          <Copy className="w-3 h-3" />
                          {copied === 'priv' ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={() => downloadKey(generatedKeys.name, 'private')} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      </div>
                    </div>
                    {showPrivate ? (
                      <textarea readOnly value={generatedKeys.privateKey} className="input-field font-mono text-xs h-32 resize-none text-yellow-300" />
                    ) : (
                      <div className="input-field text-center text-gray-600 text-xs py-3">Hidden — click Show to reveal</div>
                    )}
                    <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Key pair saved to server — accessible from Stored Key Pairs below.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stored Key Pairs */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300">Stored Key Pairs</h3>
              <button onClick={fetchKeypairs} disabled={keypairsLoading} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
                {keypairsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            </div>

            {keypairsLoading ? (
              <div className="text-center py-6 text-gray-500 text-sm">Loading...</div>
            ) : keypairs.length === 0 ? (
              <div className="text-center py-6 text-gray-600 text-sm border border-dark-700 rounded-lg">
                No stored key pairs — generate one above.
              </div>
            ) : (
              <div className="space-y-2">
                {keypairs.map(kp => (
                  <div key={kp.name} className="card flex items-start gap-3">
                    <KeyRound className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm font-mono">{kp.name}</span>
                        <span className="badge badge-blue text-xs">{kp.type}</span>
                        {kp.comment && <span className="text-xs text-gray-400">{kp.comment}</span>}
                      </div>
                      {kp.fingerprint && <p className="text-xs text-gray-500 font-mono mt-0.5">{kp.fingerprint}</p>}
                      <p className="text-xs text-gray-600 mt-0.5">Created: {new Date(kp.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => downloadKey(kp.name, 'public')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-green-400 hover:bg-green-500/10 border border-green-500/20 transition-colors"
                        title="Download public key"
                      >
                        <Download className="w-3 h-3" /> Public
                      </button>
                      <button
                        onClick={() => downloadKey(kp.name, 'private')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-yellow-400 hover:bg-yellow-500/10 border border-yellow-500/20 transition-colors"
                        title="Download private key"
                      >
                        <Download className="w-3 h-3" /> Private
                      </button>
                      <button
                        onClick={() => handleAuthorize(kp.name)}
                        disabled={authorizingKey === kp.name}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 transition-colors disabled:opacity-50"
                        title={`Add to authorized_keys for ${targetUser}`}
                      >
                        {authorizingKey === kp.name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                        Authorize
                      </button>
                      <button
                        onClick={() => handleDeleteKeypair(kp.name)}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete key pair"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
