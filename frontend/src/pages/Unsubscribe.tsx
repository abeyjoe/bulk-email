import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react';

export const Unsubscribe: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const recipientId = searchParams.get('recipientId') || '';
  const campaignId = searchParams.get('campaignId') || '';

  const [reason, setReason] = useState('I receive too many emails');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/v1/compliance/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          token,
          recipientId,
          campaignId,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process unsubscribe request');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Email Subscription Preferences</h1>
          <p className="text-xs text-slate-500">
            Manage your subscription status for <strong>{email || 'your email address'}</strong>
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h3 className="font-bold text-sm">Successfully Unsubscribed</h3>
            <p className="text-xs text-emerald-700">
              Your email address has been added to our permanent suppression list. You will not receive future marketing campaigns from this platform.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for unsubscribing (Optional)</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs border rounded-lg p-2.5 bg-white text-slate-700"
              >
                <option value="I receive too many emails">I receive too many emails</option>
                <option value="Content is no longer relevant">Content is no longer relevant to me</option>
                <option value="I never opted in">I do not remember signing up</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Unsubscribe'}
            </button>

            <p className="text-[11px] text-slate-400 text-center">
              Processed in compliance with CAN-SPAM and International Data Protection Guidelines.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
