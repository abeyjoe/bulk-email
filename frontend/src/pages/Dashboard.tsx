import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  Users,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  UserX,
  ShieldAlert,
  Flame,
  Clock,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/analytics/dashboard');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000); // Polling dashboard every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <p className="font-semibold">Unable to load metrics</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const { recipients, campaigns, emails, rates, providerQuota, recentEvents, recentCampaigns } = data || {};

  const funnelChartData = [
    { name: 'Queued', value: emails?.queued || 0, color: '#94a3b8' },
    { name: 'Accepted', value: emails?.accepted || 0, color: '#3b82f6' },
    { name: 'Delivered', value: emails?.delivered || 0, color: '#10b981' },
    { name: 'Bounced', value: emails?.bounced || 0, color: '#f59e0b' },
    { name: 'Complaints', value: emails?.complaints || 0, color: '#ef4444' },
    { name: 'Unsubscribed', value: emails?.unsubscribes || 0, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Operations Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time delivery pipeline, provider quotas, and campaign reputation safeguards.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchOverview}
            className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Refresh Metrics
          </button>
        </div>
      </div>

      {/* Provider Quota Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-xs uppercase tracking-wider font-bold text-indigo-300">
              Amazon SES Infrastructure Status
            </span>
          </div>
          <h2 className="text-xl font-bold mt-1">
            {providerQuota?.isProduction ? 'SES Production Mode (Verified)' : 'SES Sandbox Mode (Simulator Enabled)'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Decoupled asynchronous worker pool with token-bucket shared rate limiting.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6 text-sm">
          <div>
            <p className="text-xs text-slate-400">Daily Quota</p>
            <p className="text-lg font-bold text-white">{providerQuota?.dailyQuota?.toLocaleString()} emails</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">24-Hour Dispatched</p>
            <p className="text-lg font-bold text-emerald-400">{providerQuota?.sentLast24Hours?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Global Rate Limit</p>
            <p className="text-lg font-bold text-indigo-400">{providerQuota?.maxSendRate} msg/sec</p>
          </div>
        </div>
      </div>

      {/* Core Top Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Recipients</p>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">{recipients?.total?.toLocaleString()}</p>
          <div className="flex items-center space-x-2 mt-2 text-xs">
            <span className="text-emerald-600 font-semibold">{recipients?.subscribed?.toLocaleString()} valid</span>
            <span className="text-slate-300">•</span>
            <span className="text-rose-600 font-semibold">{recipients?.suppressed?.toLocaleString()} suppressed</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaigns</p>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-3">{campaigns?.total?.toLocaleString()}</p>
          <div className="flex items-center space-x-2 mt-2 text-xs">
            <span className="text-blue-600 font-semibold">{campaigns?.active || 0} active</span>
            <span className="text-slate-300">•</span>
            <span className="text-emerald-600 font-semibold">{campaigns?.completed || 0} completed</span>
            <span className="text-slate-300">•</span>
            <span className="text-amber-600 font-semibold">{campaigns?.paused || 0} paused</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirmed Delivered</p>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-3">{emails?.delivered?.toLocaleString()}</p>
          <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
            <span>Accepted by SES: <strong className="text-slate-700">{emails?.accepted?.toLocaleString()}</strong></span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reputation Health</p>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-3">
            <p className="text-2xl font-bold text-slate-900">{rates?.bounceRatePercent}%</p>
            <span className="text-xs text-slate-500">Bounce rate</span>
          </div>
          <div className="flex items-center space-x-2 mt-2 text-xs">
            <span className="text-rose-600 font-semibold">Complaints: {rates?.complaintRatePercent}%</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">Safe: &lt; 5% / 0.1%</span>
          </div>
        </div>
      </div>

      {/* Visual Analytics & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery Funnel Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-base mb-1">Global Delivery & Safety Breakdown</h3>
          <p className="text-xs text-slate-500 mb-6">
            Distinct tracking of queued jobs, provider acceptance, confirmed delivery, and suppressed anomalies.
          </p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: any) => [val.toLocaleString(), 'Count']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {funnelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Safety & Compliance Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 mb-2">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-slate-900 text-base">Anti-Abuse Protection</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Automated circuit breakers continuously monitor SES delivery feedback. Campaigns exceeding safe thresholds are paused immediately.
            </p>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Bounce Safety Circuit Breaker</span>
                  <span className="text-slate-900">&le; 5.0%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (rates?.bounceRatePercent / 5.0) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-600">Spam Complaint Circuit Breaker</span>
                  <span className="text-slate-900">&le; 0.10%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (rates?.complaintRatePercent / 0.1) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">Permanent Suppression Active</span>
                <p className="text-slate-500 mt-1">
                  <strong>{recipients?.suppressed?.toLocaleString()}</strong> bounced, complained, or unsubscribed addresses blocked before sending.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Campaigns & Live Delivery Events Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Campaigns */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-base mb-4">Recent Campaigns</h3>
          <div className="divide-y divide-slate-100">
            {recentCampaigns && recentCampaigns.length > 0 ? (
              recentCampaigns.map((c: any) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.subject}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                        c.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.status === 'RUNNING'
                          ? 'bg-blue-50 text-blue-700 animate-pulse'
                          : c.status === 'PAUSED'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.status}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">{c.acceptedCount} accepted</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No campaigns created yet.</p>
            )}
          </div>
        </div>

        {/* Live Delivery Events Feed */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-base mb-4">Live Provider Events</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {recentEvents && recentEvents.length > 0 ? (
              recentEvents.map((evt: any) => (
                <div key={evt.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        evt.eventType === 'DELIVERED'
                          ? 'bg-emerald-500'
                          : evt.eventType === 'ACCEPTED'
                          ? 'bg-blue-500'
                          : evt.eventType === 'HARD_BOUNCE'
                          ? 'bg-rose-500'
                          : evt.eventType === 'COMPLAINT'
                          ? 'bg-purple-500'
                          : 'bg-slate-400'
                      }`}
                    ></span>
                    <span className="font-medium text-slate-700">{evt.email}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-600 uppercase text-[10px]">{evt.eventType}</span>
                    <span className="text-slate-400">{new Date(evt.occurredAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No delivery events recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
