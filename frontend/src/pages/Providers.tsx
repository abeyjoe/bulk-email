import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
  Zap,
  Sliders,
  DollarSign,
  ShieldCheck,
  Power,
  Trash2,
} from 'lucide-react';

interface ProviderData {
  id: string;
  name: string;
  providerType: string;
  isDefault: boolean;
  isSandbox: boolean;
  isEnabled: boolean;
  priority: number;
  routingWeight: number;
  region: string;
  accessKeyMasked: string;
  dailyQuota: number;
  dailyUsed: number;
  dailyRemaining: number;
  monthlyQuota: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  reservedQuota: number;
  perSecondRateLimit: number;
  costPerThousand: number;
  status: string;
  healthStatus: string;
  consecutiveFailures: number;
  lastHealthCheckAt: string;
  lastQuotaSyncAt: string;
  isCoolingDown: boolean;
  currentRateTokens: number;
}

export const Providers: React.FC = () => {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [globalRate, setGlobalRate] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<ProviderData | null>(null);
  const [editCreds, setEditCreds] = useState({
    apiKey: '',
    accessKeyId: '',
    secretAccessKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    dkimDomain: '',
    dkimKeySelector: '',
    dkimPrivateKey: '',
  });
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form states for adding
  const [newForm, setNewForm] = useState({
    name: '',
    providerType: 'SMTP',
    region: 'us-east-1',
    dailyQuota: 100000,
    perSecondRateLimit: 20.0,
    costPerThousand: 0.0,
    priority: 1,
    apiKey: '',
    accessKeyId: '',
    secretAccessKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    dkimDomain: '',
    dkimKeySelector: 'default',
    dkimPrivateKey: '',
  });

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ providers: ProviderData[]; globalRate: number }>('/providers');
      setProviders(res.providers || []);
      setGlobalRate(res.globalRate || 50);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load email providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleTestConnection = async (id: string) => {
    try {
      setTestingId(id);
      setActionMessage(null);
      setError(null);
      const res = await apiRequest<{ health: { healthStatus: string; status: string; message?: string } }>(`/providers/${id}/test`, {
        method: 'POST',
      });
      if (res.health.healthStatus === 'HEALTHY') {
        setActionMessage(`✅ Health check passed: Provider is HEALTHY & active.`);
      } else {
        setError(`⚠️ Health check result: ${res.health.healthStatus} - ${res.health.message || 'Check credentials'}`);
      }
      fetchProviders();
    } catch (err: any) {
      setError(`Test failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSyncQuota = async (id: string) => {
    try {
      setActionMessage(null);
      await apiRequest(`/providers/${id}/sync-quota`, { method: 'POST' });
      setActionMessage('Quota telemetry reconciled successfully with upstream provider API.');
      fetchProviders();
    } catch (err: any) {
      setError(`Sync failed: ${err.message}`);
    }
  };

  const handleToggleEnabled = async (provider: ProviderData) => {
    try {
      await apiRequest(`/providers/${provider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: !provider.isEnabled }),
      });
      fetchProviders();
    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    }
  };

  const handleDeleteProvider = async (provider: ProviderData) => {
    if (!window.confirm(`Are you sure you want to remove "${provider.name}"?`)) return;
    try {
      await apiRequest(`/providers/${provider.id}`, {
        method: 'DELETE',
      });
      setActionMessage(`Removed provider "${provider.name}".`);
      fetchProviders();
    } catch (err: any) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/providers', {
        method: 'POST',
        body: JSON.stringify(newForm),
      });
      setShowAddModal(false);
      setActionMessage('New provider connected successfully!');
      fetchProviders();
    } catch (err: any) {
      setError(`Failed to create provider: ${err.message}`);
    }
  };

  const handleUpdateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    try {
      const payload: Record<string, any> = {
        name: editingProvider.name,
        region: editingProvider.region,
        priority: editingProvider.priority,
        routingWeight: editingProvider.routingWeight,
        dailyQuota: editingProvider.dailyQuota,
        perSecondRateLimit: editingProvider.perSecondRateLimit,
        costPerThousand: editingProvider.costPerThousand,
      };
      if (editCreds.apiKey.trim()) {
        payload.apiKey = editCreds.apiKey.trim();
      }
      if (editCreds.accessKeyId.trim()) {
        payload.accessKeyId = editCreds.accessKeyId.trim();
        payload.secretAccessKey = editCreds.secretAccessKey.trim();
      }
      if (editCreds.smtpHost.trim()) {
        payload.smtpHost = editCreds.smtpHost.trim();
        payload.smtpPort = Number(editCreds.smtpPort) || 587;
      }
      if (editCreds.smtpUser.trim()) {
        payload.smtpUser = editCreds.smtpUser.trim();
      }
      if (editCreds.smtpPass) {
        payload.smtpPass = editCreds.smtpPass;
      }
      if (editCreds.dkimPrivateKey.trim()) {
        payload.dkimDomain = editCreds.dkimDomain.trim();
        payload.dkimKeySelector = editCreds.dkimKeySelector.trim() || 'default';
        payload.dkimPrivateKey = editCreds.dkimPrivateKey.trim();
      }

      await apiRequest(`/providers/${editingProvider.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingProvider(null);
      setEditCreds({
        apiKey: '',
        accessKeyId: '',
        secretAccessKey: '',
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        dkimDomain: '',
        dkimKeySelector: '',
        dkimPrivateKey: '',
      });
      setActionMessage('✅ Provider credentials & settings updated successfully!');
      fetchProviders();
    } catch (err: any) {
      setError(`Update failed: ${err.message}`);
    }
  };

  // Aggregated totals
  const totalDailyQuota = providers.reduce((acc, p) => acc + (p.isEnabled ? p.dailyQuota : 0), 0);
  const totalDailyUsed = providers.reduce((acc, p) => acc + (p.isEnabled ? p.dailyUsed : 0), 0);
  const totalDailyRemaining = Math.max(0, totalDailyQuota - totalDailyUsed);
  const activeProvidersCount = providers.filter((p) => p.isEnabled && p.status === 'ACTIVE').length;

  const getProviderBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SMTP':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">Custom SMTP / MTA</span>;
      case 'SES':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Amazon SES</span>;
      case 'BREVO':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Brevo API</span>;
      case 'MAILCHIMP':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Mailchimp</span>;
      case 'MOCK':
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">Mock Simulator</span>;
    }
  };

  const getHealthBadge = (health: string) => {
    if (health === 'HEALTHY') {
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-medium text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Healthy</span>
        </span>
      );
    }
    if (health === 'DEGRADED') {
      return (
        <span className="inline-flex items-center space-x-1 text-xs font-medium text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Degraded</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 text-xs font-medium text-rose-600">
        <XCircle className="w-3.5 h-3.5" />
        <span>Offline</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Delivery Providers & Quota Engine</h1>
          <p className="text-sm text-slate-500 mt-1">
            Intelligent multi-provider distribution, atomic quota management, and automatic failover circuits.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchProviders}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Provider</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {actionMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold ml-4">✕</button>
        </div>
      )}

      {/* Aggregate Engine Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Providers</span>
            <Server className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">{activeProvidersCount}</span>
            <span className="text-xs text-slate-500">of {providers.length} connected</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Combined Daily Quota</span>
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">{totalDailyQuota.toLocaleString()}</span>
            <span className="text-xs text-slate-500">emails/day</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent Today</span>
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">{totalDailyUsed.toLocaleString()}</span>
            <span className="text-xs text-emerald-600 font-medium">({totalDailyRemaining.toLocaleString()} left)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Global Ceiling</span>
            <Zap className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900">{globalRate}</span>
            <span className="text-xs text-slate-500">messages/sec max</span>
          </div>
        </div>
      </div>

      {/* Provider Accounts List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Connected Delivery Providers</h2>
          <span className="text-xs text-slate-500">Auto-failover enabled across healthy priority nodes</span>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading delivery providers...</div>
          ) : providers.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="text-slate-600 font-medium">No email delivery providers configured yet.</div>
              <p className="text-xs text-slate-400">
                Click the button below to connect your own Brevo, Amazon SES, or Mailchimp account with your API key.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Connect Your First Provider</span>
              </button>
            </div>
          ) : (
            providers.map((p) => {
              const quotaPercentage = Math.min(100, Math.round((p.dailyUsed / (p.dailyQuota || 1)) * 100));

              return (
                <div key={p.id} className="p-6 hover:bg-slate-50/50 transition">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                        <Server className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-slate-900 text-base">{p.name}</h3>
                          {getProviderBadge(p.providerType)}
                          {p.isDefault && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Default
                            </span>
                          )}
                          {p.isSandbox && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                              Sandbox
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center space-x-4 text-xs text-slate-500">
                          <span>Priority: <strong className="text-slate-700">#{p.priority}</strong></span>
                          <span>Weight: <strong className="text-slate-700">{p.routingWeight}x</strong></span>
                          <span>Cost: <strong className="text-slate-700">${p.costPerThousand.toFixed(3)}/1k</strong></span>
                          <span>Region: <strong className="text-slate-700">{p.region || 'global'}</strong></span>
                          <span>Key: <code className="text-slate-600">{p.accessKeyMasked || 'configured'}</code></span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Quota & Token Health */}
                    <div className="w-full lg:w-72 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Daily Quota Lease</span>
                        <span className="font-medium text-slate-700">
                          {p.dailyUsed.toLocaleString()} / {p.dailyQuota.toLocaleString()} ({quotaPercentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quotaPercentage > 90 ? 'bg-rose-500' : quotaPercentage > 70 ? 'bg-amber-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${quotaPercentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Speed: <strong>{p.perSecondRateLimit} msg/s</strong></span>
                        {getHealthBadge(p.healthStatus)}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleToggleEnabled(p)}
                        title={p.isEnabled ? 'Disable Provider' : 'Enable Provider'}
                        className={`p-2 rounded-lg border text-sm font-medium transition ${
                          p.isEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleTestConnection(p.id)}
                        disabled={testingId === p.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium shadow-sm transition disabled:opacity-50"
                      >
                        {testingId === p.id ? 'Testing...' : 'Test Connection'}
                      </button>

                      <button
                        onClick={() => handleSyncQuota(p.id)}
                        title="Reconcile Quota Telemetry"
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          setEditingProvider(p);
                          setEditCreds({
                            apiKey: '',
                            accessKeyId: '',
                            secretAccessKey: '',
                            smtpHost: '',
                            smtpPort: 587,
                            smtpUser: '',
                            smtpPass: '',
                            dkimDomain: '',
                            dkimKeySelector: '',
                            dkimPrivateKey: '',
                          });
                        }}
                        title="Add API Key or Configure Provider Settings"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium shadow-sm transition"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Configure / API Key</span>
                      </button>

                      <button
                        onClick={() => handleDeleteProvider(p)}
                        title="Remove Provider"
                        className="p-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-sm transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Provider Modal */}
      {editingProvider && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 my-8">
            <h2 className="text-lg font-bold text-slate-900">Configure {editingProvider.name}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your API Key, SMTP credentials, or AWS keys below to enable real email delivery.
            </p>
            <form onSubmit={handleUpdateProvider} className="mt-4 space-y-4">
              {/* Credentials Section */}
              {editingProvider.providerType.toUpperCase() === 'SMTP' && (
                <div className="space-y-3 p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                  <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    Custom SMTP / Self-Hosted Server ({editingProvider.accessKeyMasked || 'not set'})
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700">SMTP Host</label>
                      <input
                        type="text"
                        value={editCreds.smtpHost}
                        onChange={(e) => setEditCreds({ ...editCreds, smtpHost: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="e.g. smtp.elasticemail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Port</label>
                      <input
                        type="number"
                        value={editCreds.smtpPort}
                        onChange={(e) => setEditCreds({ ...editCreds, smtpPort: parseInt(e.target.value, 10) || 587 })}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="587"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">SMTP Username</label>
                    <input
                      type="text"
                      value={editCreds.smtpUser}
                      onChange={(e) => setEditCreds({ ...editCreds, smtpUser: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                      placeholder="SMTP Username / Email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">SMTP Password / Key</label>
                    <input
                      type="password"
                      value={editCreds.smtpPass}
                      onChange={(e) => setEditCreds({ ...editCreds, smtpPass: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                      placeholder="Paste new SMTP Password"
                    />
                  </div>
                </div>
              )}

              {editingProvider.providerType.toUpperCase() === 'SES' && (
                <div className="space-y-3 p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                  <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    Amazon SES Credentials
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AWS Region</label>
                    <input
                      type="text"
                      value={editingProvider.region || 'us-east-1'}
                      onChange={(e) => setEditingProvider({ ...editingProvider, region: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      placeholder="e.g. eu-north-1 or us-east-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      AWS Access Key ID <span className="text-slate-400 font-normal">(Current: {editingProvider.accessKeyMasked || 'not set'})</span>
                    </label>
                    <input
                      type="text"
                      value={editCreds.accessKeyId}
                      onChange={(e) => setEditCreds({ ...editCreds, accessKeyId: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                      placeholder="Paste new AKIA... Access Key ID"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AWS Secret Access Key</label>
                    <input
                      type="password"
                      value={editCreds.secretAccessKey}
                      onChange={(e) => setEditCreds({ ...editCreds, secretAccessKey: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                      placeholder="Paste new Secret Access Key"
                    />
                  </div>
                </div>
              )}

              {(editingProvider.providerType.toUpperCase() === 'BREVO' ||
                editingProvider.providerType.toUpperCase() === 'MAILCHIMP') && (
                <div className="space-y-2 p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                  <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                    {editingProvider.providerType.toUpperCase() === 'BREVO' ? 'Brevo API Key' : 'Mailchimp API Key'}
                  </div>
                  <label className="block text-xs font-medium text-slate-700">
                    API Key <span className="text-slate-400 font-normal">(Current: {editingProvider.accessKeyMasked || 'not set'})</span>
                  </label>
                  <input
                    type="password"
                    value={editCreds.apiKey}
                    onChange={(e) => setEditCreds({ ...editCreds, apiKey: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                    placeholder={
                      editingProvider.providerType.toUpperCase() === 'BREVO'
                        ? 'Paste xkeysib-... API Key here'
                        : 'Paste Mailchimp API Key here'
                    }
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">Display Name</label>
                <input
                  type="text"
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Routing Priority (1=Top)</label>
                  <input
                    type="number"
                    value={editingProvider.priority}
                    onChange={(e) => setEditingProvider({ ...editingProvider, priority: parseInt(e.target.value, 10) || 1 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Routing Weight</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingProvider.routingWeight}
                    onChange={(e) => setEditingProvider({ ...editingProvider, routingWeight: parseFloat(e.target.value) || 1 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    min="0.1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Daily Quota</label>
                  <input
                    type="number"
                    value={editingProvider.dailyQuota}
                    onChange={(e) => setEditingProvider({ ...editingProvider, dailyQuota: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Rate Limit (msg/sec)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingProvider.perSecondRateLimit}
                    onChange={(e) => setEditingProvider({ ...editingProvider, perSecondRateLimit: parseFloat(e.target.value) || 1 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Cost per 1,000 Emails (USD)</label>
                <input
                  type="number"
                  step="0.001"
                  value={editingProvider.costPerThousand}
                  onChange={(e) => setEditingProvider({ ...editingProvider, costPerThousand: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 my-8">
            <h2 className="text-lg font-bold text-slate-900">Connect New Delivery Provider</h2>
            <p className="text-xs text-slate-500 mt-1">
              Connect any Self-Hosted Mail Server / Custom SMTP Relay, Amazon SES, Brevo, or Mailchimp.
            </p>

            <form onSubmit={handleCreateProvider} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Provider Service</label>
                <select
                  value={newForm.providerType}
                  onChange={(e) => {
                    const t = e.target.value;
                    let defaultQuota = 100000;
                    let defaultRate = 20.0;
                    let defaultCost = 0.00;
                    if (t === 'SES') { defaultQuota = 50000; defaultRate = 14.0; defaultCost = 0.10; }
                    if (t === 'BREVO') { defaultQuota = 40000; defaultRate = 5.0; defaultCost = 0.25; }
                    if (t === 'MAILCHIMP') { defaultQuota = 10000; defaultRate = 4.0; defaultCost = 1.00; }
                    if (t === 'MOCK') { defaultQuota = 200000; defaultRate = 50.0; defaultCost = 0.00; }

                    setNewForm({
                      ...newForm,
                      providerType: t,
                      dailyQuota: defaultQuota,
                      perSecondRateLimit: defaultRate,
                      costPerThousand: defaultCost,
                    });
                  }}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="SMTP">Universal Custom SMTP / Self-Hosted Mail Server</option>
                  <option value="SES">Amazon SES (API-based)</option>
                  <option value="BREVO">Brevo (Sendinblue API v3)</option>
                  <option value="MAILCHIMP">Mailchimp (Marketing & Transactional)</option>
                  <option value="MOCK">Mock High-Volume Simulator (Local Test)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Self-Hosted Mail Server or Elastic Email SMTP"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              {/* Dynamic Credentials Inputs */}
              {newForm.providerType === 'SMTP' && (
                <div className="space-y-3 p-3.5 bg-indigo-50/50 border border-indigo-200 rounded-lg">
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    <span className="text-[11px] font-semibold text-indigo-900 mr-1">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewForm({
                          ...newForm,
                          name: newForm.name || 'Self-Hosted Postfix / Postal Server',
                          smtpHost: 'mail.yourdomain.com',
                          smtpPort: 587,
                          smtpSecure: false,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100"
                    >
                      Self-Hosted VPS
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewForm({
                          ...newForm,
                          name: newForm.name || 'Elastic Email SMTP',
                          smtpHost: 'smtp.elasticemail.com',
                          smtpPort: 2525,
                          smtpSecure: false,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100"
                    >
                      Elastic Email
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewForm({
                          ...newForm,
                          name: newForm.name || 'Mailgun SMTP',
                          smtpHost: 'smtp.mailgun.org',
                          smtpPort: 587,
                          smtpSecure: false,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100"
                    >
                      Mailgun
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewForm({
                          ...newForm,
                          name: newForm.name || 'Namecheap PrivateEmail',
                          smtpHost: 'mail.privateemail.com',
                          smtpPort: 587,
                          smtpSecure: false,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100"
                    >
                      Namecheap Email
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700">SMTP Host</label>
                      <input
                        type="text"
                        value={newForm.smtpHost}
                        onChange={(e) => setNewForm({ ...newForm, smtpHost: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="smtp.yourdomain.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">SMTP Port</label>
                      <input
                        type="number"
                        value={newForm.smtpPort}
                        onChange={(e) => {
                          const p = parseInt(e.target.value, 10) || 587;
                          setNewForm({ ...newForm, smtpPort: p, smtpSecure: p === 465 });
                        }}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="587"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">SMTP Username</label>
                      <input
                        type="text"
                        value={newForm.smtpUser}
                        onChange={(e) => setNewForm({ ...newForm, smtpUser: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="user@yourdomain.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">SMTP Password / Key</label>
                      <input
                        type="password"
                        value={newForm.smtpPass}
                        onChange={(e) => setNewForm({ ...newForm, smtpPass: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white"
                        placeholder="Password or API Token"
                      />
                    </div>
                  </div>

                  <details className="text-xs text-slate-600 pt-1">
                    <summary className="cursor-pointer font-semibold text-indigo-700 hover:underline">
                      + Optional: Custom DKIM Private Key Signing (For Self-Hosted Servers)
                    </summary>
                    <div className="mt-2 space-y-2 pl-2 border-l-2 border-indigo-200">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700">DKIM Domain</label>
                          <input
                            type="text"
                            value={newForm.dkimDomain}
                            onChange={(e) => setNewForm({ ...newForm, dkimDomain: e.target.value })}
                            className="mt-0.5 w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                            placeholder="yourdomain.com"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700">DKIM Selector</label>
                          <input
                            type="text"
                            value={newForm.dkimKeySelector}
                            onChange={(e) => setNewForm({ ...newForm, dkimKeySelector: e.target.value })}
                            className="mt-0.5 w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                            placeholder="default"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">DKIM RSA Private Key (PEM)</label>
                        <textarea
                          rows={2}
                          value={newForm.dkimPrivateKey}
                          onChange={(e) => setNewForm({ ...newForm, dkimPrivateKey: e.target.value })}
                          className="mt-0.5 w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                          placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                        />
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {newForm.providerType === 'SES' && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AWS Region</label>
                    <input
                      type="text"
                      value={newForm.region}
                      onChange={(e) => setNewForm({ ...newForm, region: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="us-east-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AWS Access Key ID</label>
                    <input
                      type="text"
                      value={newForm.accessKeyId}
                      onChange={(e) => setNewForm({ ...newForm, accessKeyId: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                      placeholder="AKIA..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">AWS Secret Access Key</label>
                    <input
                      type="password"
                      value={newForm.secretAccessKey}
                      onChange={(e) => setNewForm({ ...newForm, secretAccessKey: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              {(newForm.providerType === 'BREVO' || newForm.providerType === 'MAILCHIMP') && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="block text-xs font-medium text-slate-700">
                    {newForm.providerType === 'BREVO' ? 'Brevo API Key (v3)' : 'Mailchimp API Key (e.g. xxxx-us19)'}
                  </label>
                  <input
                    type="password"
                    value={newForm.apiKey}
                    onChange={(e) => setNewForm({ ...newForm, apiKey: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Daily Quota</label>
                  <input
                    type="number"
                    value={newForm.dailyQuota}
                    onChange={(e) => setNewForm({ ...newForm, dailyQuota: parseInt(e.target.value, 10) || 1000 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Max Send Rate (msg/s)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newForm.perSecondRateLimit}
                    onChange={(e) => setNewForm({ ...newForm, perSecondRateLimit: parseFloat(e.target.value) || 1 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm"
                >
                  Connect & Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
