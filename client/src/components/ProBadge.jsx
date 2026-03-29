import React from 'react';
import { Crown } from 'lucide-react';

export default function ProBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-yellow-400 ${className}`}>
      <Crown className="w-2.5 h-2.5" />
      PRO
    </span>
  );
}
