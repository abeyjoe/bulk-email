import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { ShieldAlert, Plus, Search, Trash2, AlertOctagon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Suppression: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Add suppression modal
  const [isOpen, setIsOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('ADMIN_MANUAL');
  const [newNotes, setNewNotes] = useState('');

  const loadSuppression = async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(search ? { search } : {}),
        ...(reasonFilter ? { reason: reasonFilter } : {}),
      });

      const res = await apiRequest(`/compliance/suppression?${params.toString()}`);
      setRecords(res.records);
      setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuppression(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, reasonFilter]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/compliance/suppression', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail, reason: newReason, notes: newNotes }),
      });
      setIsOpen(false);
      setNewEmail('');
      setNewNotes('');
      loadSuppression(1);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from the permanent suppression list?`)) return;
    try {
      await apiRequest(`/compliance/suppression/${encodeURIComponent(email)}`, { method: 'DELETE' });
      loadSuppression(pagination.page);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppression & Compliance List</h1>
          <p className="text-sm text-slate-500 mt-1">
            Permanent exclusion database ensuring hard bounces, complainants, and unsubscribed contacts are never emailed.
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Email to Suppression</span>
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search suppressed emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 w-full md:w-auto"
        >
          <option value="">All Suppression Reasons</option>
          <option value="HARD_BOUNCE">Hard Bounce (Undeliverable)</option>
          <option value="COMPLAINT">Spam Complaint</option>
          <option value="UNSUBSCRIBE">Unsubscribe Request</option>
          <option value="ADMIN_MANUAL">Admin Manual Block</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Suppressed Email Address</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Date Suppressed</th>
                {user?.role === 'ADMIN' && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">Loading suppression list...</td>
                </tr>
              ) : records.length > 0 ? (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">{r.email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          r.reason === 'HARD_BOUNCE'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : r.reason === 'COMPLAINT'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : r.reason === 'UNSUBSCRIBE'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {r.reason}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 font-mono">{r.source}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                    {user?.role === 'ADMIN' && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleRemove(r.email)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                          title="Remove from Suppression List"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">No suppressed records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <p>
            Showing {records.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} records
          </p>
          <div className="flex space-x-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => loadSuppression(pagination.page - 1)}
              className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadSuppression(pagination.page + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add to Suppression List</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full text-sm border p-2 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <select
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full text-sm border p-2 rounded-lg bg-white"
                >
                  <option value="ADMIN_MANUAL">Admin Manual Block</option>
                  <option value="HARD_BOUNCE">Hard Bounce</option>
                  <option value="COMPLAINT">Spam Complaint</option>
                  <option value="UNSUBSCRIBE">Unsubscribe Request</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Notes</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="w-full text-sm border p-2 rounded-lg"
                  placeholder="Reason for manual suppression..."
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
                  Suppress Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
