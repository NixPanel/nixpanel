import React from 'react';

function getColorClass(value, thresholds = { warn: 70, danger: 90 }) {
  if (value >= thresholds.danger) return { bar: 'bg-red-500', text: 'text-red-400', glow: 'glow-red' };
  if (value >= thresholds.warn) return { bar: 'bg-yellow-500', text: 'text-yellow-400', glow: '' };
  return { bar: 'bg-blue-500', text: 'text-blue-400', glow: 'glow-blue' };
}

export default function StatCard({ title, value, unit, percent, icon: Icon, color, subtitle }) {
  const colors = percent !== undefined ? getColorClass(percent) : null;

  return (
    <div className="card group hover:border-dark-500 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={`p-2 rounded-lg ${color || 'bg-blue-500/10'}`}>
              <Icon className={`w-4 h-4 ${colors?.text || 'text-blue-400'}`} />
            </div>
          )}
          <span className="text-sm text-gray-400 font-medium">{title}</span>
        </div>
        {percent !== undefined && (
          <span className={`text-xs font-mono font-semibold ${colors?.text}`}>
            {percent.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="mb-3">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
        {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
      </div>

      {percent !== undefined && (
        <div className="progress-bar">
          <div
            className={`progress-bar-fill ${colors?.bar}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
