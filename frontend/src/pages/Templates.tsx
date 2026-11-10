import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { FileCode, Plus, Trash2, Edit3, Eye, Tag } from 'lucide-react';

export const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    subject: '',
    category: 'General',
    htmlContent: '<h1>Hello {{firstName}},</h1><p>Thank you for subscribing.</p>',
    plainTextContent: '',
  });

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/templates');
      setTemplates(res.templates);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await apiRequest(`/templates/${formData.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiRequest('/templates', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setIsOpen(false);
      setFormData({ id: '', name: '', subject: '', category: 'General', htmlContent: '', plainTextContent: '' });
      loadTemplates();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await apiRequest(`/templates/${id}`, { method: 'DELETE' });
      loadTemplates();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Reusable responsive layouts equipped with CAN-SPAM footers and personalization tags.
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({ id: '', name: '', subject: '', category: 'General', htmlContent: '<h1>Hello {{firstName}},</h1>', plainTextContent: '' });
            setIsOpen(true);
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Template</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                  {t.category || 'General'}
                </span>
                <span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base mt-2">{t.name}</h3>
              <p className="text-xs text-slate-500 mt-1 truncate">Subject: {t.subject}</p>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <button
                onClick={() => setPreviewTemplate(t)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setFormData(t);
                    setIsOpen(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Template Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">{formData.id ? 'Edit Template' : 'New Template'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-sm border p-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full text-sm border p-2 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Subject Line</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full text-sm border p-2 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">HTML Content</label>
                <textarea
                  value={formData.htmlContent}
                  onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                  rows={10}
                  className="w-full font-mono text-xs border p-3 rounded-lg bg-slate-900 text-slate-100"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-900">{previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <iframe
              title="Preview"
              srcDoc={previewTemplate.htmlContent}
              className="w-full h-96 border rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};
