import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Play, Save, Trash2, Plus, RefreshCw, CheckCircle, XCircle, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';
import Header from '../components/Header.jsx';

// Strip ANSI escape codes
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function RunHistoryModal({ run, onClose }) {
  if (!run) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
          <div>
            <h3 className="text-sm font-semibold text-white">{run.script_name}</h3>
            <p className="text-xs text-gray-500">{run.started_at}</p>
          </div>
          <div className="flex items-center gap-3">
            {run.exit_code === 0
              ? <span className="badge badge-green">Exit: 0</span>
              : <span className="badge badge-red">Exit: {run.exit_code ?? '?'}</span>}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
          <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap leading-relaxed">
            {run.output || '(no output)'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function Automation() {
  const [activeView, setActiveView] = useState('editor'); // 'editor' | 'runs'
  const [scripts, setScripts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedScript, setSelectedScript] = useState(null);
  const [editorForm, setEditorForm] = useState({ name: '', description: '', content: '' });
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [exitCode, setExitCode] = useState(null);
  const [viewRun, setViewRun] = useState(null);
  const [viewRunData, setViewRunData] = useState(null);
  const terminalRef = useRef(null);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/automation/scripts');
      setScripts(res.data.scripts || []);
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await axios.get('/api/automation/runs');
      setRuns(res.data.runs || []);
    } catch (err) {
      console.error('Failed to fetch runs:', err);
    }
  }, []);

  useEffect(() => {
    fetchScripts();
    fetchRuns();
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const selectScript = (script) => {
    setSelectedScript(script);
    setEditorForm({ name: script.name, description: script.description || '', content: script.content });
    setIsNew(false);
    setTerminalOutput('');
    setExitCode(null);
  };

  const newScript = () => {
    setSelectedScript(null);
    setEditorForm({ name: '', description: '', content: '#!/bin/bash\n\n' });
    setIsNew(true);
    setTerminalOutput('');
    setExitCode(null);
  };

  const saveScript = async () => {
    if (!editorForm.name.trim() || !editorForm.content.trim()) return;
    try {
      if (isNew) {
        const res = await axios.post('/api/automation/scripts', editorForm);
        setScripts(prev => [...prev, res.data.script]);
        setSelectedScript(res.data.script);
        setIsNew(false);
      } else if (selectedScript) {
        const res = await axios.put(`/api/automation/scripts/${selectedScript.id}`, editorForm);
        setScripts(prev => prev.map(s => s.id === selectedScript.id ? res.data.script : s));
        setSelectedScript(res.data.script);
      }
    } catch (err) {
      console.error('Failed to save script:', err);
    }
  };

  const deleteScript = async () => {
    if (!selectedScript || !confirm(`Delete "${selectedScript.name}"?`)) return;
    try {
      await axios.delete(`/api/automation/scripts/${selectedScript.id}`);
      setScripts(prev => prev.filter(s => s.id !== selectedScript.id));
      setSelectedScript(null);
      setEditorForm({ name: '', description: '', content: '' });
      setIsNew(false);
    } catch (err) {
      console.error('Failed to delete script:', err);
    }
  };

  const runScript = async () => {
    if (!selectedScript || running) return;

    setRunning(true);
    setTerminalOutput('');
    setExitCode(null);

    try {
      const response = await fetch(`/api/automation/scripts/${selectedScript.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nixpanel_token')}`,
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to run script');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'output') {
                setTerminalOutput(prev => prev + stripAnsi(data.text));
              } else if (data.type === 'done') {
                setExitCode(data.exitCode);
                fetchRuns();
              } else if (data.type === 'error') {
                setTerminalOutput(prev => prev + `\n[ERROR] ${data.text}\n`);
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      setTerminalOutput(prev => prev + `\n[Error] ${err.message}\n`);
    } finally {
      setRunning(false);
    }
  };

  const viewRunOutput = async (run) => {
    setViewRun(run);
    try {
      const res = await axios.get(`/api/automation/runs/${run.id}/output`);
      setViewRunData(res.data.run);
    } catch (err) {
      setViewRunData({ ...run, output: 'Failed to load output' });
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-0">
          <Header
            title="Automation"
            subtitle={`${scripts.length} scripts`}
            onRefresh={fetchScripts}
            loading={loading}
          />

          {/* View toggle */}
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 w-fit mb-4">
            <button
              onClick={() => setActiveView('editor')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeView === 'editor' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Script Editor
            </button>
            <button
              onClick={() => { setActiveView('runs'); fetchRuns(); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeView === 'runs' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Run History
            </button>
          </div>
        </div>

        {activeView === 'editor' && (
          <div className="flex-1 overflow-hidden flex gap-0 px-6 pb-6 min-h-0">
            {/* Scripts list */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-2 mr-4">
              <button onClick={newScript} className="btn-primary flex items-center gap-2 text-sm w-full justify-center">
                <Plus className="w-4 h-4" />
                New Script
              </button>

              <div className="flex-1 overflow-y-auto space-y-1">
                {scripts.map(script => (
                  <button
                    key={script.id}
                    onClick={() => selectScript(script)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm ${
                      selectedScript?.id === script.id
                        ? 'bg-blue-600/20 border-blue-600/30 text-blue-300'
                        : 'bg-dark-700 border-dark-600 text-gray-300 hover:border-dark-500 hover:text-white'
                    }`}
                  >
                    <div className="font-medium truncate">{script.name}</div>
                    {script.description && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">{script.description}</div>
                    )}
                    {script.last_run && (
                      <div className="text-xs text-gray-600 mt-1">
                        Last run: {new Date(script.last_run).toLocaleDateString()}
                        {script.last_exit_code !== null && (
                          <span className={`ml-1 ${script.last_exit_code === 0 ? 'text-green-400' : 'text-red-400'}`}>
                            (exit {script.last_exit_code})
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
                {scripts.length === 0 && !loading && (
                  <div className="text-center py-8 text-gray-600 text-xs">
                    No scripts yet
                  </div>
                )}
              </div>
            </div>

            {/* Editor panel */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {(selectedScript || isNew) ? (
                <>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={editorForm.name}
                      onChange={e => setEditorForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Script name"
                      className="input-field flex-1"
                    />
                    <input
                      type="text"
                      value={editorForm.description}
                      onChange={e => setEditorForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Description (optional)"
                      className="input-field flex-1"
                    />
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col gap-2">
                    <textarea
                      value={editorForm.content}
                      onChange={e => setEditorForm(prev => ({ ...prev, content: e.target.value }))}
                      className="flex-1 bg-dark-800 border border-dark-600 rounded-xl p-4 font-mono text-sm text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent leading-relaxed min-h-48"
                      placeholder="#!/bin/bash&#10;&#10;# Your script here..."
                      spellCheck={false}
                    />

                    <div className="flex gap-2">
                      <button onClick={saveScript} className="btn-primary text-sm flex items-center gap-2">
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                      <button
                        onClick={runScript}
                        disabled={running || isNew}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {running ? 'Running...' : 'Run'}
                      </button>
                      {!isNew && (
                        <button onClick={deleteScript} className="btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm flex items-center gap-2">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                      {isNew && <span className="text-xs text-gray-500 self-center">Save first before running</span>}
                    </div>

                    {/* Terminal output */}
                    {(terminalOutput || running) && (
                      <div className="bg-gray-950 border border-dark-600 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs text-gray-500 font-mono">output</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {running && <span className="text-xs text-yellow-400 animate-pulse">Running...</span>}
                            {exitCode !== null && !running && (
                              exitCode === 0
                                ? <span className="badge badge-green text-xs">Exit: 0</span>
                                : <span className="badge badge-red text-xs">Exit: {exitCode}</span>
                            )}
                          </div>
                        </div>
                        <pre
                          ref={terminalRef}
                          className="p-4 text-xs font-mono text-green-300 overflow-y-auto leading-relaxed whitespace-pre-wrap"
                          style={{ maxHeight: '240px', minHeight: '80px' }}
                        >
                          {terminalOutput}
                          {running && <span className="inline-block w-2 h-3 bg-green-400 animate-pulse ml-1" />}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Terminal className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Select a script to edit, or create a new one</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'runs' && (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex justify-end mb-4">
              <button onClick={fetchRuns} className="btn-primary text-sm py-2 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Script</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Started</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Duration</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Exit Code</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Run By</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(run => (
                      <tr key={run.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-white">{run.script_name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{formatDuration(run.duration_seconds)}</td>
                        <td className="px-4 py-2.5">
                          {run.exit_code === null ? (
                            <span className="text-xs text-gray-500">—</span>
                          ) : run.exit_code === 0 ? (
                            <span className="badge badge-green">0</span>
                          ) : (
                            <span className="badge badge-red">{run.exit_code}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{run.run_by || '—'}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => viewRunOutput(run)}
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="View output"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {runs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-500">
                          <Play className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          No runs yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Run output modal */}
      {viewRun && (
        <RunHistoryModal run={viewRunData || viewRun} onClose={() => { setViewRun(null); setViewRunData(null); }} />
      )}
    </div>
  );
}
