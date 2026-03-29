import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Zap, AlertCircle, ChevronDown, ChevronRight, Copy, Play, RefreshCw, Flame, Globe, HardDrive, Server, Shield, Terminal, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import Sidebar from '../components/Sidebar.jsx';

const QUICK_ACTIONS = [
  { id: 'slow', icon: Flame, label: 'Why is it slow?', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20', desc: 'Diagnose CPU, memory and I/O bottlenecks' },
  { id: 'network', icon: Globe, label: "Why won't it connect?", color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20', desc: 'Check networking, ports and routes' },
  { id: 'disk', icon: HardDrive, label: 'Why is disk full?', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20', desc: 'Find large files and directories' },
  { id: 'service', icon: Server, label: 'Why is service down?', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20', desc: 'Check failed units and recent logs' },
  { id: 'security', icon: Shield, label: 'Security check', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20', desc: 'Audit logins, ports and security posture' },
];

// Simple markdown renderer
function MarkdownText({ text, onRunCommand }) {
  if (!text) return null;

  // Split on code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before this code block
    if (match.index > lastIdx) {
      parts.push({ type: 'text', content: text.slice(lastIdx, match.index) });
    }
    parts.push({ type: 'code', lang: match[1], content: match[2].trim() });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIdx) });
  }

  return (
    <div className="prose-dark">
      {parts.map((part, i) => {
        if (part.type === 'code') {
          return (
            <div key={i} className="relative my-3 group">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 rounded-t-lg border-b border-dark-500">
                <span className="text-xs text-gray-500 font-mono">{part.lang || 'bash'}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(part.content)}
                    className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  {onRunCommand && (
                    <button
                      onClick={() => onRunCommand(part.content)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3 h-3" /> Run
                    </button>
                  )}
                </div>
              </div>
              <pre className="bg-gray-950 rounded-b-lg p-4 overflow-x-auto text-xs font-mono text-green-300 leading-relaxed">{part.content}</pre>
            </div>
          );
        }

        // Render text with inline formatting
        return (
          <div key={i} className="space-y-1">
            {part.content.split('\n').map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-2" />;

              // Headers
              if (line.startsWith('### ')) return <h4 key={j} className="text-sm font-bold text-white mt-3 mb-1">{renderInline(line.slice(4))}</h4>;
              if (line.startsWith('## ')) return <h3 key={j} className="text-base font-bold text-white mt-4 mb-1.5">{renderInline(line.slice(3))}</h3>;
              if (line.startsWith('# ')) return <h2 key={j} className="text-lg font-bold text-white mt-4 mb-2">{renderInline(line.slice(2))}</h2>;

              // Bullet points
              if (line.match(/^\s*[-*]\s/)) {
                return (
                  <div key={j} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-blue-400 mt-1.5 flex-shrink-0">•</span>
                    <span>{renderInline(line.replace(/^\s*[-*]\s/, ''))}</span>
                  </div>
                );
              }

              // Numbered list
              if (line.match(/^\s*\d+\.\s/)) {
                const numMatch = line.match(/^(\s*\d+)\.\s(.+)/);
                return (
                  <div key={j} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-blue-400 flex-shrink-0 font-mono">{numMatch?.[1]}.</span>
                    <span>{renderInline(numMatch?.[2] || line)}</span>
                  </div>
                );
              }

              // Bold lines (##-like)
              if (line.startsWith('**') && line.endsWith('**')) {
                return <p key={j} className="text-sm font-bold text-white mt-2">{line.slice(2, -2)}</p>;
              }

              return <p key={j} className="text-sm text-gray-300 leading-relaxed">{renderInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text) {
  if (!text) return text;
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-dark-800 px-1.5 py-0.5 rounded text-xs font-mono text-blue-300">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="italic text-gray-200">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function SystemContextPanel({ context }) {
  const [expanded, setExpanded] = useState(false);
  if (!context) return null;

  const labels = {
    uptime: 'Uptime',
    loadAverage: 'Load Average',
    memory: 'Memory',
    disk: 'Disk',
    topCpuProcesses: 'Top CPU Processes',
    ioStats: 'I/O Stats',
    openPorts: 'Open Ports',
    routes: 'Routes',
    networkingStatus: 'Networking Status',
    largestDirectories: 'Largest Directories',
    largeLogs: 'Large Log Files',
    failedUnits: 'Failed Units',
    recentLogs: 'Recent Logs',
    recentLogins: 'Recent Logins',
    failedLogins: 'Failed Logins',
  };

  const entries = Object.entries(context).filter(([, v]) => v);

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700 transition-colors"
      >
        <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          System Context ({entries.length} data points gathered)
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      {expanded && (
        <div className="border-t border-dark-600 divide-y divide-dark-700">
          {entries.map(([key, value]) => (
            <div key={key} className="px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{labels[key] || key}</div>
              <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">{value}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandResult({ command, output, onClose }) {
  return (
    <div className="bg-gray-950 border border-dark-600 rounded-xl overflow-hidden mt-2">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700">
        <code className="text-xs font-mono text-green-400">$ {command}</code>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-sm">×</button>
      </div>
      <pre className="p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">{output}</pre>
    </div>
  );
}

function DiagnosisCard({ session, onRunCommand }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-dark-700 border border-dark-600 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${session.streaming ? 'bg-blue-400 animate-pulse' : session.error ? 'bg-red-400' : 'bg-green-400'}`} />
          <span className="text-sm font-medium text-white truncate max-w-sm">
            {session.label}
          </span>
          <span className="text-xs text-gray-500">{session.timestamp}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="border-t border-dark-600 p-4">
          {session.context && <SystemContextPanel context={session.context} />}

          {session.status && session.streaming && (
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-3">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {session.status}
            </div>
          )}

          {session.error ? (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {session.error}
            </div>
          ) : (
            <div>
              <MarkdownText text={session.response} onRunCommand={onRunCommand} />
              {session.streaming && !session.response && (
                <div className="text-gray-500 text-sm animate-pulse">Analyzing...</div>
              )}
              {session.streaming && session.response && (
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Troubleshoot() {
  const [problem, setProblem] = useState('');
  const [sessions, setSessions] = useState([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [commandResults, setCommandResults] = useState([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const sessionsEndRef = useRef(null);

  useEffect(() => {
    sessionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions]);

  const startDiagnosis = useCallback(async (problemText, quickAction) => {
    if (diagnosing) return;

    const label = quickAction
      ? QUICK_ACTIONS.find(a => a.id === quickAction)?.label || quickAction
      : problemText;

    const sessionId = Date.now();
    const newSession = {
      id: sessionId,
      label,
      timestamp: new Date().toLocaleTimeString(),
      problem: problemText,
      quickAction,
      status: 'Gathering system data...',
      context: null,
      response: '',
      streaming: true,
      error: null,
    };

    setSessions(prev => [...prev.slice(-4), newSession]);
    setDiagnosing(true);
    setProblem('');

    const updateSession = (updates) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s));
    };

    try {
      const response = await fetch('/api/troubleshoot/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nixpanel_token')}`,
        },
        body: JSON.stringify({ problem: problemText, quickAction }),
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.error?.includes('ANTHROPIC_API_KEY')) {
          setApiKeyMissing(true);
        }
        throw new Error(err.error || 'Request failed');
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

              if (data.type === 'status') {
                updateSession({ status: data.text });
              } else if (data.type === 'context') {
                updateSession({ context: data.data });
              } else if (data.type === 'text') {
                setSessions(prev => prev.map(s => s.id === sessionId
                  ? { ...s, response: s.response + data.text, status: 'Streaming response...' }
                  : s
                ));
              } else if (data.type === 'done') {
                updateSession({ streaming: false, status: '' });
              } else if (data.type === 'error') {
                updateSession({ error: data.text, streaming: false });
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      updateSession({ error: err.message, streaming: false });
    } finally {
      setDiagnosing(false);
    }
  }, [diagnosing]);

  const handleQuickAction = (actionId) => {
    startDiagnosis('', actionId);
  };

  const handleDiagnose = (e) => {
    e.preventDefault();
    if (problem.trim()) {
      startDiagnosis(problem.trim(), null);
    }
  };

  const runCommand = async (command) => {
    try {
      const res = await axios.post('/api/troubleshoot/execute', { command });
      setCommandResults(prev => [...prev, {
        id: Date.now(),
        command,
        output: res.data.output,
      }]);
    } catch (err) {
      setCommandResults(prev => [...prev, {
        id: Date.now(),
        command,
        output: `Error: ${err.response?.data?.error || err.message}`,
        isError: true,
      }]);
    }
  };

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:ml-64 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                AI Troubleshoot
                <span className="text-xs bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded-full font-normal">Powered by Claude</span>
              </h1>
              <p className="text-xs text-gray-400">Diagnose Linux issues with live system data + AI analysis</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

            {/* API Key Banner */}
            {apiKeyMissing && (
              <div className="card border border-yellow-500/30 bg-yellow-500/5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-yellow-400 font-semibold mb-1">ANTHROPIC_API_KEY not configured</div>
                    <p className="text-sm text-gray-300">To enable AI Troubleshoot, add your API key to the <code className="text-blue-300 bg-dark-800 px-1.5 py-0.5 rounded text-xs">.env</code> file:</p>
                    <pre className="mt-2 bg-gray-950 rounded-lg p-3 text-xs font-mono text-green-300">ANTHROPIC_API_KEY=sk-ant-...</pre>
                    <p className="text-xs text-gray-500 mt-2">Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">console.anthropic.com</a></p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Action buttons */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Diagnosis</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {QUICK_ACTIONS.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      disabled={diagnosing}
                      className={`p-3 rounded-xl border text-left transition-all group ${action.bg} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Icon className={`w-5 h-5 ${action.color} mb-2`} />
                      <div className={`text-xs font-semibold ${action.color}`}>{action.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5 leading-tight hidden md:block">{action.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Problem input */}
            <div className="card">
              <form onSubmit={handleDiagnose} className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">Describe your problem</label>
                <textarea
                  value={problem}
                  onChange={e => setProblem(e.target.value)}
                  placeholder="e.g. The web server is returning 502 errors intermittently, started about 2 hours ago..."
                  rows={3}
                  className="w-full bg-dark-800 border border-dark-500 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={diagnosing}
                />
                <button
                  type="submit"
                  disabled={!problem.trim() || diagnosing}
                  className="btn-primary flex items-center gap-2"
                >
                  {diagnosing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {diagnosing ? 'Diagnosing...' : 'Diagnose'}
                </button>
              </form>
            </div>

            {/* Command execution results */}
            {commandResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Command Results</h2>
                  <button onClick={() => setCommandResults([])} className="text-xs text-gray-600 hover:text-gray-400">Clear all</button>
                </div>
                {commandResults.map(result => (
                  <CommandResult
                    key={result.id}
                    command={result.command}
                    output={result.output}
                    onClose={() => setCommandResults(prev => prev.filter(r => r.id !== result.id))}
                  />
                ))}
              </div>
            )}

            {/* Diagnosis sessions */}
            {sessions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Diagnoses ({sessions.length})
                  </h2>
                  <button
                    onClick={() => setSessions([])}
                    className="text-xs text-gray-600 hover:text-gray-400"
                  >
                    Clear history
                  </button>
                </div>
                {[...sessions].reverse().map(session => (
                  <DiagnosisCard
                    key={session.id}
                    session={session}
                    onRunCommand={runCommand}
                  />
                ))}
              </div>
            )}

            {sessions.length === 0 && !diagnosing && (
              <div className="text-center py-16 text-gray-600">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Click a Quick Diagnosis button or describe your problem above</p>
                <p className="text-xs mt-1">AI will gather live system data and provide targeted analysis</p>
              </div>
            )}

            <div ref={sessionsEndRef} />
          </div>
        </div>
      </main>
    </div>
  );
}
