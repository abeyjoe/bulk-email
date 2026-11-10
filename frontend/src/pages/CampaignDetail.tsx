import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Mail,
  ShieldAlert,
  Send,
  Clock,
  Activity,
} from 'lucide-react';

export const CampaignDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/analytics/campaigns/${id}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    const interval = setInterval(fetchReport, 8000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center text-slate-500">Campaign analytics not found.</div>;
  }

  const { campaign, metrics, recipientStatusBreakdown, eventLogPreview } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Link to="/campaigns" className="p-2 border rounded-lg text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{campaign.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Subject: <strong>{campaign.subject}</strong> • Sender: {campaign.senderName} &lt;{campaign.senderEmail}&gt;
          </p>
        </div>
      </div>

      {/* Campaign Status Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              campaign.status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : campaign.status === 'RUNNING'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                : campaign.status === 'PAUSED'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {campaign.status}
          </span>
          <span className="text-xs text-slate-500">
            Started: {campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : 'Not started'}
          </span>
        </div>

        {campaign.safetyPausedReason && (
          <div className="text-xs p-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 max-w-xl">
            <strong>Safety Circuit Breaker Notice:</strong> {campaign.safetyPausedReason}
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Target Audience</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{metrics.totalTargeted?.toLocaleString() || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Eligible: <strong className="text-emerald-600">{metrics.eligible?.toLocaleString()}</strong>
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Accepted by SES</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{metrics.acceptedByProvider?.toLocaleString() || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Queued jobs: {metrics.queued?.toLocaleString()}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Confirmed Delivered</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{metrics.confirmedDelivered?.toLocaleString() || 0}</p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">
            Deliverability Rate: {metrics.deliveryRatePercent}%
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Bounces & Complaints</p>
          <div className="flex items-baseline space-x-2 mt-2">
            <p className="text-2xl font-bold text-amber-600">{metrics.bounces || 0}</p>
            <span className="text-xs text-slate-400">({metrics.bounceRatePercent}%)</span>
          </div>
          <p className="text-[11px] text-rose-600 font-semibold mt-1">
            {metrics.complaints || 0} complaints ({metrics.complaintRatePercent}%)
          </p>
        </div>
      </div>

      {/* Recipient Breakdown & Event Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
            Recipient Delivery State Distribution
          </h3>
          <div className="space-y-2 text-xs">
            {Object.entries(recipientStatusBreakdown).map(([status, count]: any) => (
              <div key={status} className="flex justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-700">{status}</span>
                <span className="font-bold text-slate-900">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
            Live Delivery Event Log
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
            {eventLogPreview && eventLogPreview.length > 0 ? (
              eventLogPreview.map((evt: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="font-semibold text-slate-700">{evt.eventType}</span>
                  <span className="text-slate-400">{new Date(evt.occurredAt).toLocaleTimeString()}</span>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-6">No events captured yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
