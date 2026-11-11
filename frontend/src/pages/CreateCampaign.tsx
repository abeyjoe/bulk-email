import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import {
  Send,
  Eye,
  Smartphone,
  Monitor,
  Code,
  Tag,
  ShieldAlert,
  Sliders,
  Check,
} from 'lucide-react';

export const CreateCampaign: React.FC = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [campaign, setCampaign] = useState({
    name: '',
    subject: '',
    senderName: 'Bulk Email Operations',
    senderEmail: 'noreply@bulkemail.cloud',
    replyTo: '',
    targetListId: '',
    templateId: '',
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    h2 { color: #0f172a; margin-top: 0; }
    p { color: #334155; line-height: 1.6; }
    .btn { display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 20px 0; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Special Update for {{firstName|Friend}}</h2>
    <p>Hello <strong>{{firstName}}</strong>,</p>
    <p>We are reaching out from <strong>Bulk Email</strong> regarding your subscription for <strong>{{organisation}}</strong>.</p>
    <a href="https://example.com" class="btn">View Platform Updates</a>
    <p>If you have any questions, simply reply to this email.</p>
    <div class="footer">
      <p>Sent to {{email}} • {{physicalPostalAddress}}</p>
      <p><a href="{{unsubscribeUrl}}">Unsubscribe from these emails</a></p>
    </div>
  </div>
</body>
</html>`,
    plainTextContent: '',
    maxSendingRate: 5.0,
    bounceThreshold: 5.0,
    complaintThreshold: 0.1,
    routingMode: 'PRIORITY',
  });

  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  useEffect(() => {
    apiRequest('/recipients/lists').then((r) => setLists(r.lists || []));
    apiRequest('/templates').then((r) => setTemplates(r.templates || []));
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setCampaign((prev) => ({
        ...prev,
        templateId,
        subject: tmpl.subject,
        htmlContent: tmpl.htmlContent,
        plainTextContent: tmpl.plainTextContent || '',
      }));
    }
  };

  const insertVariable = (varName: string) => {
    setCampaign((prev) => ({
      ...prev,
      htmlContent: prev.htmlContent + ` {{${varName}}}`,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await apiRequest('/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaign),
      });
      navigate(`/campaigns`);
    } catch (err: any) {
      alert(`Failed to create campaign: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Mock preview rendering
  const renderPreviewHtml = () => {
    return campaign.htmlContent
      .replace(/\{\{firstName\}\}/g, 'David')
      .replace(/\{\{lastName\}\}/g, 'Adeyemi')
      .replace(/\{\{organisation\}\}/g, 'TechCorp Global')
      .replace(/\{\{email\}\}/g, 'david@techcorp.com')
      .replace(/\{\{unsubscribeUrl\}\}/g, 'https://app.yourdomain.com/unsubscribe?test=true')
      .replace(/\{\{physicalPostalAddress\}\}/g, '100 Tech Innovation Blvd, Lagos, Nigeria');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Compose Email Campaign</h1>
          <p className="text-sm text-slate-500 mt-1">
            Build responsive, personalized email campaigns with deliverability controls.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Settings Grid */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Campaign Parameters</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign Name (Internal)</label>
              <input
                type="text"
                value={campaign.name}
                onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                placeholder="e.g. Q4 Platform Architecture & Delivery Notice"
                className="w-full text-sm border p-2 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Audience List</label>
              <select
                value={campaign.targetListId}
                onChange={(e) => setCampaign({ ...campaign, targetListId: e.target.value })}
                className="w-full text-sm border p-2 rounded-lg bg-white"
              >
                <option value="">All Registered Subscribers</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.recipientCount} subscribers)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Subject Line</label>
              <input
                type="text"
                value={campaign.subject}
                onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
                placeholder="Important updates for {{firstName}}"
                className="w-full text-sm border p-2 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sender Name</label>
              <input
                type="text"
                value={campaign.senderName}
                onChange={(e) => setCampaign({ ...campaign, senderName: e.target.value })}
                className="w-full text-sm border p-2 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sender Email</label>
              <input
                type="email"
                value={campaign.senderEmail}
                onChange={(e) => setCampaign({ ...campaign, senderEmail: e.target.value })}
                className="w-full text-sm border p-2 rounded-lg"
                required
              />
            </div>
          </div>

          {/* Template Preset Selector */}
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Load from Template Preset</label>
              <select
                value={campaign.templateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full text-sm border p-2 rounded-lg bg-white"
              >
                <option value="">Custom Email (Manual)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category || 'General'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Deliverability & Safety Configuration */}
        <div className="bg-slate-900 text-slate-200 p-6 rounded-xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Sliders className="w-5 h-5" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">
              Autonomous Delivery Speed & Safety Circuit Breakers
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-300">Max Sending Rate:</span>
                <span className="font-bold text-indigo-400">{campaign.maxSendingRate} msg/sec</span>
              </div>
              <input
                type="range"
                min="1"
                max="14"
                step="0.5"
                value={campaign.maxSendingRate}
                onChange={(e) => setCampaign({ ...campaign, maxSendingRate: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Shared token-bucket limit across all workers.</p>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-300">Bounce Circuit Breaker:</span>
                <span className="font-bold text-amber-400">{campaign.bounceThreshold}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={campaign.bounceThreshold}
                onChange={(e) => setCampaign({ ...campaign, bounceThreshold: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Auto-pauses campaign if hard bounces exceed this rate.</p>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-slate-300">Complaint Circuit Breaker:</span>
                <span className="font-bold text-rose-400">{campaign.complaintThreshold}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.01"
                value={campaign.complaintThreshold}
                onChange={(e) => setCampaign({ ...campaign, complaintThreshold: parseFloat(e.target.value) })}
                className="w-full accent-rose-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Stops campaign immediately if spam complaints spike.</p>
            </div>
          </div>
        </div>

        {/* Multi-Provider Intelligent Routing Mode Selector */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Multi-Provider Routing Strategy</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select how jobs are distributed across connected providers (Amazon SES, Brevo, Mailchimp, Mock).
              </p>
            </div>
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-md border border-indigo-200">
              Active Strategy: {campaign.routingMode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                id: 'PRIORITY',
                title: 'Priority-Based',
                desc: 'Fill primary provider (SES) first, cascade to Brevo/secondary on limit.',
              },
              {
                id: 'CAPACITY',
                title: 'Capacity-Based',
                desc: 'Distribute proportionally based on live remaining daily quotas.',
              },
              {
                id: 'COST',
                title: 'Cost-Optimized',
                desc: 'Route to lowest cost-per-thousand healthy provider first.',
              },
              {
                id: 'MANUAL',
                title: 'Manual Split',
                desc: 'Fixed percentages configured across designated providers.',
              },
              {
                id: 'HYBRID',
                title: 'Hybrid Tiered',
                desc: 'SES until 80% quota threshold, then balance with secondaries.',
              },
            ].map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                onClick={() => setCampaign({ ...campaign, routingMode: strategy.id as any })}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  campaign.routingMode === strategy.id
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${
                    campaign.routingMode === strategy.id ? 'text-indigo-900' : 'text-slate-800'
                  }`}>
                    {strategy.title}
                  </span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    campaign.routingMode === strategy.id
                      ? 'border-indigo-600 bg-indigo-600'
                      : 'border-slate-300'
                  }`}>
                    {campaign.routingMode === strategy.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-normal">{strategy.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Email Content Editor & Live Layout Preview */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                  activeTab === 'editor' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>HTML Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                  activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Rendering Preview</span>
              </button>
            </div>

            {activeTab === 'preview' && (
              <div className="flex items-center space-x-1 bg-slate-200 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className={`p-1.5 rounded text-xs ${previewMode === 'desktop' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                  title="Desktop Preview"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className={`p-1.5 rounded text-xs ${previewMode === 'mobile' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                  title="Mobile Preview (375px)"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-xs text-slate-400 flex items-center mr-1">
                  <Tag className="w-3.5 h-3.5 mr-1" /> Insert Variable:
                </span>
                {['firstName', 'lastName', 'organisation', 'email', 'unsubscribeUrl'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertVariable(tag)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono text-indigo-600 hover:bg-indigo-50"
                  >
                    {`{{${tag}}}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            {activeTab === 'editor' ? (
              <textarea
                value={campaign.htmlContent}
                onChange={(e) => setCampaign({ ...campaign, htmlContent: e.target.value })}
                rows={16}
                className="w-full font-mono text-xs border border-slate-200 rounded-lg p-4 bg-slate-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            ) : (
              <div className="flex justify-center bg-slate-100 p-6 rounded-lg min-h-[450px]">
                <div
                  className={`bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden transition-all ${
                    previewMode === 'mobile' ? 'w-[375px]' : 'w-full max-w-[650px]'
                  }`}
                >
                  <div className="p-3 bg-slate-200 text-slate-600 text-xs border-b flex items-center justify-between">
                    <span className="truncate">Subject: {campaign.subject || 'Important Platform Update'}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">{previewMode}</span>
                  </div>
                  <iframe
                    title="Email Preview"
                    srcDoc={renderPreviewHtml()}
                    className="w-full h-[500px] border-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-md shadow-indigo-500/20 flex items-center space-x-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{loading ? 'Saving Campaign...' : 'Save & Prepare Campaign'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
