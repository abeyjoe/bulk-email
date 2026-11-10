import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import {
  Mail,
  Plus,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Eye,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BarChart2,
} from 'lucide-react';

export const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Preflight Review Modal
  const [preflightData, setPreflightData] = useState<any>(null);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);
  const [launchLoading, setLaunchLoading] = useState(false);

  // Test Send Modal
  const [testSendCampaignId, setTestSendCampaignId] = useState<string | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testSendLoading, setTestSendLoading] = useState(false);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/campaigns');
      setCampaigns(res.campaigns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
    const interval = setInterval(loadCampaigns, 8000);
    return () => clearInterval(interval);
  }, []);

  const openPreflight = async (campaignId: string) => {
    try {
      const res = await apiRequest(`/campaigns/${campaignId}/preflight`);
      setPreflightData(res.review);
      setIsPreflightOpen(true);
    } catch (err: any) {
      alert(`Preflight check failed: ${err.message}`);
    }
  };

  const handleLaunchConfirmed = async () => {
    if (!preflightData) return;
    try {
      setLaunchLoading(true);
      await apiRequest(`/campaigns/${preflightData.campaignId}/launch`, { method: 'POST' });
      setIsPreflightOpen(false);
      loadCampaigns();
    } catch (err: any) {
      alert(`Failed to launch campaign: ${err.message}`);
    } finally {
      setLaunchLoading(false);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await apiRequest(`/campaigns/${id}/pause`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Paused via management dashboard' }),
      });
      loadCampaigns();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await apiRequest(`/campaigns/${id}/resume`, { method: 'POST' });
      loadCampaigns();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this campaign? Pending queue jobs will be purged.')) return;
    try {
      await apiRequest(`/campaigns/${id}/cancel`, { method: 'POST' });
      loadCampaigns();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSendCampaignId || !testEmailAddress) return;

    try {
      setTestSendLoading(true);
      await apiRequest(`/campaigns/${testSendCampaignId}/test-send`, {
        method: 'POST',
        body: JSON.stringify({ testEmail: testEmailAddress }),
      });
      alert(`Test email sent successfully to ${testEmailAddress}!`);
      setTestSendCampaignId(null);
      setTestEmailAddress('');
    } catch (err: any) {
      alert(`Test send failed: ${err.message}`);
    } finally {
      setTestSendLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">
            Asynchronous queue-backed bulk delivery with automated safety circuit breakers.
          </p>
        </div>
        <Link
          to="/campaigns/new"
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Campaign</span>
        </Link>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Campaign Name & Subject</th>
                <th className="py-3 px-4">Audience</th>
                <th className="py-3 px-4">Delivery Status</th>
                <th className="py-3 px-4">Accepted / Total</th>
                <th className="py-3 px-4">Bounces / Complaints</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">Loading campaigns...</td>
                </tr>
              ) : campaigns.length > 0 ? (
                campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link to={`/campaigns/${c.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                        {c.name}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{c.subject}</p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {c.targetList ? c.targetList.name : 'All Recipients'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          c.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.status === 'RUNNING'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                            : c.status === 'QUEUING'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : c.status === 'PAUSED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : c.status === 'CANCELLED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {c.status}
                      </span>
                      {c.safetyPausedReason && (
                        <p className="text-[11px] text-amber-600 mt-1 max-w-xs truncate" title={c.safetyPausedReason}>
                          {c.safetyPausedReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700">
                      <strong>{c.acceptedCount?.toLocaleString()}</strong> / {c.totalRecipients?.toLocaleString() || '0'}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="text-amber-600 font-semibold">{c.bouncedCount || 0} bounces</span>
                      <span className="text-slate-300 mx-1.5">•</span>
                      <span className="text-rose-600 font-semibold">{c.complaintCount || 0} complaints</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <Link
                          to={`/campaigns/${c.id}`}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded"
                          title="View Analytics"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </Link>

                        <button
                          onClick={() => setTestSendCampaignId(c.id)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                          title="Send Test Email"
                        >
                          <Send className="w-4 h-4" />
                        </button>

                        {c.status === 'DRAFT' && (
                          <button
                            onClick={() => openPreflight(c.id)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Launch Campaign"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}

                        {c.status === 'RUNNING' && (
                          <button
                            onClick={() => handlePause(c.id)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                            title="Pause Campaign"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}

                        {c.status === 'PAUSED' && (
                          <button
                            onClick={() => handleResume(c.id)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Resume Campaign"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}

                        {(c.status === 'RUNNING' || c.status === 'PAUSED') && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                            title="Cancel Campaign"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No campaigns created yet. Click "Create New Campaign" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preflight Campaign Review Modal (Section 5, Module 3 Requirement) */}
      {isPreflightOpen && preflightData && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Final Preflight Campaign Review</h3>
              <p className="text-xs text-slate-500">Audience eligibility and exclusion verification before launch.</p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p><strong>Campaign:</strong> {preflightData.campaignName}</p>
                <p><strong>Subject:</strong> {preflightData.subject}</p>
                <p><strong>Sender:</strong> {preflightData.sender}</p>
                <p><strong>Target List:</strong> {preflightData.targetList}</p>
              </div>

              {/* Required Non-Negotiable Review Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-800 uppercase">Eligible to Send</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {preflightData.eligibleRecipients?.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-emerald-600">Opted-in & verified</p>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <p className="text-xs font-semibold text-rose-800 uppercase">Excluded Prior to Launch</p>
                  <p className="text-2xl font-bold text-rose-700 mt-1">
                    {preflightData.excludedRecipients?.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-rose-600">Suppressed or bounced</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Hard Bounces Suppressed:</span>
                  <span className="font-semibold text-slate-900">{preflightData.excludedBreakdown?.bounced || 0}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Unsubscribed Addresses Excluded:</span>
                  <span className="font-semibold text-slate-900">{preflightData.excludedBreakdown?.unsubscribed || 0}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Permanent Blacklist Suppression:</span>
                  <span className="font-semibold text-slate-900">{preflightData.excludedBreakdown?.suppressed || 0}</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                <strong>Delivery Engine Configuration:</strong>
                <p className="mt-0.5">
                  Controlled dispatch at <strong>{preflightData.maxSendingRate} msgs/sec</strong>. Circuit breaker will automatically halt campaign if bounce rate reaches <strong>{preflightData.bounceThreshold}%</strong> or complaints reach <strong>{preflightData.complaintThreshold}%</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsPreflightOpen(false)}
                className="px-4 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={launchLoading || preflightData.eligibleRecipients === 0}
                onClick={handleLaunchConfirmed}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>{launchLoading ? 'Queueing Jobs...' : 'Approve & Launch Campaign'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Send Modal */}
      {testSendCampaignId && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Send Test Email</h3>
            <p className="text-xs text-slate-500">
              Dispatches a sample message rendered with test personalizations directly to your inbox.
            </p>
            <form onSubmit={handleSendTestEmail} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Email Address</label>
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="admin@yourdomain.com"
                  className="w-full text-sm border p-2.5 rounded-lg"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setTestSendCampaignId(null)}
                  className="px-4 py-2 border rounded-lg text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testSendLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {testSendLoading ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
