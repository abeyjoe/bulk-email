import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  Users,
  Upload,
  UserPlus,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Trash2,
  FileSpreadsheet,
} from 'lucide-react';

export const Recipients: React.FC = () => {
  const [recipients, setRecipients] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [lists, setLists] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [loading, setLoading] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState({
    email: '',
    firstName: '',
    lastName: '',
    organisation: '',
  });
  const [importListId, setImportListId] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);

  // Add Recipient Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [singleRecipient, setSingleRecipient] = useState({
    email: '',
    firstName: '',
    lastName: '',
    organisation: '',
    listId: '',
  });

  const loadRecipients = async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(selectedList ? { listId: selectedList } : {}),
      });

      const res = await apiRequest(`/recipients?${params.toString()}`);
      setRecipients(res.recipients);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to load recipients', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const res = await apiRequest('/recipients/lists');
      setLists(res.lists);
    } catch (err) {
      console.error('Failed to load lists', err);
    }
  };

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRecipients(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, selectedList]);

  // Handle File Selection and Header Detection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportSummary(null);

    // Read first line to detect headers
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const firstLine = text.split(/\r\n|\n/)[0];
      const headers = firstLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
      setCsvHeaders(headers);

      // Auto-detect columns
      const mapping = { email: '', firstName: '', lastName: '', organisation: '' };
      for (const h of headers) {
        const lower = h.toLowerCase();
        if (lower.includes('email')) mapping.email = h;
        else if (lower.includes('first')) mapping.firstName = h;
        else if (lower.includes('last')) mapping.lastName = h;
        else if (lower.includes('org') || lower.includes('company')) mapping.organisation = h;
      }
      setColumnMapping(mapping);
    };
    reader.readAsText(file.slice(0, 4096)); // read first 4kb for headers
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !columnMapping.email || !consentConfirmed) return;

    try {
      setImportLoading(true);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileContent = reader.result as string;
          const res = await apiRequest('/recipients/import', {
            method: 'POST',
            body: JSON.stringify({
              fileContent,
              fileName: importFile.name,
              columnMapping,
              listId: importListId || undefined,
              consentSource: 'Admin Bulk CSV Import with Documented Consent',
            }),
          });

          setImportSummary(res.summary);
          loadRecipients(1);
          loadLists();
        } catch (err: any) {
          alert(`Import failed: ${err.message}`);
        } finally {
          setImportLoading(false);
        }
      };
      reader.readAsText(importFile);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
      setImportLoading(false);
    }
  };

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/recipients', {
        method: 'POST',
        body: JSON.stringify(singleRecipient),
      });
      setIsAddModalOpen(false);
      setSingleRecipient({ email: '', firstName: '', lastName: '', organisation: '', listId: '' });
      loadRecipients(1);
      loadLists();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recipient record?')) return;
    try {
      await apiRequest(`/recipients/${id}`, { method: 'DELETE' });
      loadRecipients(pagination.page);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Recipients & List Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Segment, validate, and manage permission-based subscriber audiences.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV / Excel</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Single</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by email, name, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Subscription Statuses</option>
            <option value="SUBSCRIBED">Subscribed (Valid)</option>
            <option value="UNSUBSCRIBED">Unsubscribed</option>
            <option value="BOUNCED">Bounced</option>
            <option value="SUPPRESSED">Suppressed</option>
          </select>

          <select
            value={selectedList}
            onChange={(e) => setSelectedList(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Lists</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.recipientCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recipients Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Email Address</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Organisation</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Lists</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading recipients...
                  </td>
                </tr>
              ) : recipients.length > 0 ? (
                recipients.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900">{r.email}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {r.firstName || r.lastName ? `${r.firstName || ''} ${r.lastName || ''}`.trim() : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.organisation || '—'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          r.status === 'SUBSCRIBED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.status === 'UNSUBSCRIBED'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : r.status === 'BOUNCED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {r.listMembers && r.listMembers.length > 0
                        ? r.listMembers.map((m: any) => m.list.name).join(', ')
                        : 'None'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteRecipient(r.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                        title="Delete Recipient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No recipients found matching your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <p>
            Showing {recipients.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} recipients
          </p>
          <div className="flex space-x-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => loadRecipients(pagination.page - 1)}
              className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadRecipients(pagination.page + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* High-Performance 50,000+ CSV / Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">High-Performance Bulk Import (50,000+ Records)</h3>
                <p className="text-xs text-slate-500">Streams and chunks records into PostgreSQL with deduplication.</p>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Select CSV or Excel File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="w-full text-sm border border-slate-200 p-2 rounded-lg bg-slate-50"
                  required
                />
              </div>

              {csvHeaders.length > 0 && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Column Mapping</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Email Column (Required)</label>
                      <select
                        value={columnMapping.email}
                        onChange={(e) => setColumnMapping({ ...columnMapping, email: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white"
                        required
                      >
                        <option value="">Select column</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">First Name Column</label>
                      <select
                        value={columnMapping.firstName}
                        onChange={(e) => setColumnMapping({ ...columnMapping, firstName: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white"
                      >
                        <option value="">(None / Optional)</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Last Name Column</label>
                      <select
                        value={columnMapping.lastName}
                        onChange={(e) => setColumnMapping({ ...columnMapping, lastName: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white"
                      >
                        <option value="">(None / Optional)</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Organisation / Company Column</label>
                      <select
                        value={columnMapping.organisation}
                        onChange={(e) => setColumnMapping({ ...columnMapping, organisation: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white"
                      >
                        <option value="">(None / Optional)</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Assign to List (Optional)</label>
                <select
                  value={importListId}
                  onChange={(e) => setImportListId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white"
                >
                  <option value="">Do not assign to a specific list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Compliance Opt-in Confirmation */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentConfirmed}
                    onChange={(e) => setConsentConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                    required
                  />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <strong>CAN-SPAM & Data Protection Compliance Declaration:</strong>
                    <p className="mt-0.5 text-amber-800">
                      I certify that all recipients in this file have provided verifiable consent to receive email marketing communications. Never upload unverified third-party email lists.
                    </p>
                  </div>
                </label>
              </div>

              {importSummary && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
                  <p className="font-bold">Import Completed Successfully!</p>
                  <div className="grid grid-cols-2 gap-2 text-emerald-800">
                    <div>Total Processed: <strong>{importSummary.totalRows}</strong></div>
                    <div>Valid Recipients: <strong>{importSummary.validRecords}</strong></div>
                    <div>Imported/Updated: <strong>{importSummary.importedCount}</strong></div>
                    <div>Duplicates Filtered: <strong>{importSummary.duplicateCount}</strong></div>
                    <div>Invalid Formats Removed: <strong>{importSummary.invalidEmailCount}</strong></div>
                    <div>Pre-Suppressed: <strong>{importSummary.suppressedCount}</strong></div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !consentConfirmed || !importFile}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {importLoading ? 'Processing Records...' : 'Start Asynchronous Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Single Recipient Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Individual Recipient</h3>
            <form onSubmit={handleAddSingle} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={singleRecipient.email}
                  onChange={(e) => setSingleRecipient({ ...singleRecipient, email: e.target.value })}
                  className="w-full text-sm border p-2 rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={singleRecipient.firstName}
                    onChange={(e) => setSingleRecipient({ ...singleRecipient, firstName: e.target.value })}
                    className="w-full text-sm border p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={singleRecipient.lastName}
                    onChange={(e) => setSingleRecipient({ ...singleRecipient, lastName: e.target.value })}
                    className="w-full text-sm border p-2 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Organisation</label>
                <input
                  type="text"
                  value={singleRecipient.organisation}
                  onChange={(e) => setSingleRecipient({ ...singleRecipient, organisation: e.target.value })}
                  className="w-full text-sm border p-2 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to List</label>
                <select
                  value={singleRecipient.listId}
                  onChange={(e) => setSingleRecipient({ ...singleRecipient, listId: e.target.value })}
                  className="w-full text-sm border p-2 rounded-lg bg-white"
                >
                  <option value="">(None)</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
                >
                  Save Recipient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
