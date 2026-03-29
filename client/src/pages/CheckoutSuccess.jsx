import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Key, ArrowRight, Mail, Settings } from 'lucide-react';

// Lightweight confetti without an extra dependency
function Confetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 3 + 1.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      drift: (Math.random() - 0.5) * 1.2,
    }));

    let raf;
    let done = false;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = 0;
      for (const p of pieces) {
        p.y += p.speed;
        p.x += p.drift;
        p.angle += p.spin;
        if (p.y < canvas.height + 20) active++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
      }
      if (active > 0 && !done) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    const timer = setTimeout(() => { done = true; }, 4000);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const steps = [
    { icon: Mail,     label: 'Check your email', desc: 'Your license key was sent to the email you used at checkout.' },
    { icon: Settings, label: 'Go to Settings → Upgrade', desc: 'Open NixPanel and click Upgrade in the left sidebar.' },
    { icon: Key,      label: 'Enter your license key', desc: 'Paste the key from your email and click Activate License.' },
  ];

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 py-16">
        <div className="max-w-xl w-full text-center">

          {/* Success icon */}
          <div className="relative inline-flex mb-8">
            <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-400" strokeWidth={1.5} />
            </div>
            <div className="absolute inset-0 rounded-full bg-green-500/5 animate-ping" style={{ animationDuration: '2s' }} />
          </div>

          <h1 className="text-4xl font-bold text-white mb-3">
            You're all set!
          </h1>
          <p className="text-lg text-gray-400 mb-2">
            Payment successful. Welcome to NixPanel Pro.
          </p>
          <p className="text-sm text-gray-500 mb-10">
            {sessionId && <span className="font-mono text-gray-600">Ref: {sessionId.slice(0, 20)}...</span>}
          </p>

          {/* Email notice */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 mb-10 flex items-start gap-4 text-left">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-blue-300 mb-1">Check your inbox</div>
              <div className="text-sm text-gray-400">
                Your license key has been sent to the email address you provided. It should arrive within a minute. Check your spam folder if you don't see it.
              </div>
            </div>
          </div>

          {/* Activation steps */}
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 mb-8 text-left">
            <h2 className="font-semibold text-white mb-5 text-center">Activate your license in 3 steps</h2>
            <div className="space-y-5">
              {steps.map(({ icon: Icon, label, desc }, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-400">
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Icon className="w-4 h-4 text-blue-400" />
                      {label}
                    </div>
                    <div className="text-sm text-gray-400 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/upgrade')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Key className="w-4 h-4" />
              Activate License
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-dark-700 hover:bg-dark-600 border border-dark-500 text-gray-300 rounded-xl font-semibold text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </div>

          <p className="mt-8 text-xs text-gray-600">
            Need help? Email us at{' '}
            <a href="mailto:support@nixpanel.io" className="text-gray-500 hover:text-gray-400">
              support@nixpanel.io
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
