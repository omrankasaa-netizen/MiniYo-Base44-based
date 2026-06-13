import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied from './AccessDenied';
import { Mail, CheckCircle2, AlertCircle, RotateCcw, Search } from 'lucide-react';

export default function EmailLogPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, sent, failed
  const [resending, setResending] = useState(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['email-logs'],
    queryFn: () => base44.entities.EmailLog.list('-created_date', 100),
  });

  const filtered = logs.filter(log => {
    const matchesSearch = log.recipient_email.toLowerCase().includes(search.toLowerCase()) ||
      log.subject.toLowerCase().includes(search.toLowerCase()) ||
      log.order_id?.includes(search);
    const matchesFilter = filter === 'all' || log.status === filter;
    return matchesSearch && matchesFilter;
  });

  async function handleResend(log) {
    setResending(log.id);
    try {
      let result;
      if (log.email_type === 'order_confirmation') {
        result = await base44.functions.invoke('sendOrderConfirmation', { order_id: log.order_id });
      } else if (log.email_type === 'welcome') {
        result = await base44.functions.invoke('sendWelcomeEmailNew', { customer_id: log.customer_id });
      } else if (log.email_type === 'order_status_update') {
        const order = await base44.entities.Order.get(log.order_id);
        result = await base44.functions.invoke('sendOrderStatusUpdate', { order_id: log.order_id, new_status: order.order_status });
      }

      // Update the log record
      if (!result.error) {
        await base44.entities.EmailLog.update(log.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null
        });
        qc.invalidateQueries({ queryKey: ['email-logs'] });
      }
    } catch (err) {
      alert('Resend failed: ' + err.message);
    } finally {
      setResending(null);
    }
  }

  if (!canAccess('manage_settings')) return <AdminLayout><AccessDenied /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Email Log</h1>
            <p className="text-sm text-muted-foreground">Track transactional emails and resend if needed</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input bg-background">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search email, subject, order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-input bg-background text-sm"
            >
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} emails</p>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No emails found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Recipient</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Subject</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Sent</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 text-sm text-foreground">{log.recipient_email}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {log.email_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground max-w-xs truncate">{log.subject}</td>
                      <td className="px-5 py-3 text-sm">
                        {log.status === 'sent' ? (
                          <div className="flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Sent</span>
                          </div>
                        ) : log.status === 'failed' ? (
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="w-4 h-4" />
                            <span>Failed</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        {log.sent_at ? new Date(log.sent_at).toLocaleDateString() + ' ' + new Date(log.sent_at).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {log.status === 'failed' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResend(log)}
                              disabled={resending === log.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {resending === log.id ? 'Sending...' : 'Resend'}
                            </button>
                            {log.error_message && (
                              <div className="relative group">
                                <AlertCircle className="w-4 h-4 text-destructive cursor-help" />
                                <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-destructive text-white text-xs rounded-lg p-2 max-w-xs z-10 whitespace-pre-wrap">
                                  {log.error_message}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}