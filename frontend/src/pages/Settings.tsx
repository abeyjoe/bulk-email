import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Sliders, ShieldCheck, Cpu, HardDrive, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [quota, setQuota] = useState<any>(null);
  const [rateLimitInput, setRateLimitInput] = useState(5.0);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [statusRes, quotaRes] = await Promise.all([
        apiRequest('/system/status'),
        apiRequest('/analytics/quota'),
      ]);
      setSystemStatus(statusRes);
      setQuota(quotaRes.quota);
      setRateLimitInput(statusRes.globalRateLimitPerSec || 5.0);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateRateLimit = async () => {
    try {
      setSaving(true);
      await apiRequest('/system/rate-limit', {
        method: 'POST',
        body: JSON.stringify({ ratePerSecond: parseFloat(String(rateLimitInput)) }),
      });
      alert('Global sending rate updated successfully across all worker processes!');
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System & Engine Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure persistent message queue dynamics, global sending quotas, and worker throttling.
        </p>
      </div>

      {/* Engine Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Cpu className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Queue Engine</h3>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <p>Active Engine: <strong className="text-slate-900">{systemStatus?.queueEngine}</strong></p>
            <p>Pending Jobs in Queue: <strong>{systemStatus?.queueStats?.pending || 0}</strong></p>
            <p>Currently In Processing: <strong>{systemStatus?.queueStats?.processing || 0}</strong></p>
            <p>Total Completed Jobs: <strong>{systemStatus?.queueStats?.sent || 0}</strong></p>
            <p>Dead-Letter Queue (DLQ): <strong>{systemStatus?.queueStats?.deadLetter || 0}</strong></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-emerald-600">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Provider Quota & Mode</h3>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <p>Environment: <strong className="text-slate-900">{quota?.isProduction ? 'SES Production' : 'Sandbox / Simulator'}</strong></p>
            <p>24-Hour Max Quota: <strong>{quota?.dailyQuota?.toLocaleString()} emails</strong></p>
            <p>Sent Past 24 Hours: <strong>{quota?.sentLast24Hours?.toLocaleString()}</strong></p>
            <p>Provider Max Allowed Rate: <strong>{quota?.maxSendRate} msgs/sec</strong></p>
          </div>
        </div>
      </div>

      {/* Global Rate Limiter Dynamic Control */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 text-indigo-600">
          <Sliders className="w-5 h-5" />
          <h3 className="font-bold text-slate-900 text-base">Shared Global Sending Rate Limiter</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          This controls the token-bucket rate limiter enforced across all independent background workers.
          Ensures your infrastructure never exceeds Amazon SES account limits or generates excessive concurrent connections.
        </p>

        <div className="space-y-3 max-w-md">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span>Global Rate:</span>
            <span className="text-indigo-600 text-lg font-bold">{rateLimitInput} messages / second</span>
          </div>

          <input
            type="range"
            min="1"
            max="14"
            step="0.5"
            disabled={user?.role !== 'ADMIN'}
            value={rateLimitInput}
            onChange={(e) => setRateLimitInput(parseFloat(e.target.value))}
            className="w-full accent-indigo-600"
          />

          <div className="flex justify-between text-[11px] text-slate-400">
            <span>1 msg/sec (Safe test)</span>
            <span>5 msg/sec (Recommended start)</span>
            <span>14 msg/sec (SES standard max)</span>
          </div>

          {user?.role === 'ADMIN' ? (
            <button
              onClick={handleUpdateRateLimit}
              disabled={saving}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Applying...' : 'Apply New Rate Limit'}
            </button>
          ) : (
            <p className="text-xs text-slate-400 italic">Only Administrators can modify global sending limits.</p>
          )}
        </div>
      </div>
    </div>
  );
};
