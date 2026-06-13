import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { Settings, Key } from 'lucide-react';
import AccessDenied from './AccessDenied';

export default function AdminSettings() {
  const { currentUser, canAccess } = useAuthUser();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Staff can at least change their own password
  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPw !== confirmPw) { setMsg('Passwords do not match.'); return; }
    if (newPw.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setMsg('');
    try {
      // Use reset password flow via email
      await base44.auth.resetPasswordRequest(currentUser.email);
      setMsg('Password reset email sent! Check your inbox to complete the change.');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch {
      setMsg('Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>
        </div>

        {/* Password change */}
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Key className="w-4 h-4" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
              />
            </div>
            {msg && <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-lg">{msg}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send Reset Email'}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            For security, password changes are processed via email reset link.
          </p>
        </div>

        {canAccess('manage_settings') && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-2">Site Settings</h2>
            <p className="text-sm text-muted-foreground">Advanced site configuration coming soon.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}