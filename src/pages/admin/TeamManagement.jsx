import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser, ROLES } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import { UserPlus, Shield, ChevronDown } from 'lucide-react';
import AccessDenied from './AccessDenied';

const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer' };
const ROLE_COLORS = {
  super_admin: 'bg-primary/10 text-primary',
  admin: 'bg-secondary/20 text-foreground',
  staff: 'bg-muted text-muted-foreground',
  customer: 'bg-accent/40 text-accent-foreground',
};

const PERMISSION_MATRIX = [
  { permission: 'View Products',    super_admin: true,  admin: true,  staff: true  },
  { permission: 'Edit Products',    super_admin: true,  admin: true,  staff: true  },
  { permission: 'View Orders',      super_admin: true,  admin: true,  staff: true  },
  { permission: 'Edit Orders',      super_admin: true,  admin: true,  staff: true  },
  { permission: 'Manage Inventory', super_admin: true,  admin: true,  staff: true  },
  { permission: 'Manage CMS',       super_admin: true,  admin: true,  staff: false },
  { permission: 'View Finances',    super_admin: true,  admin: true,  staff: false },
  { permission: 'Manage Promos',    super_admin: true,  admin: true,  staff: false },
  { permission: 'Manage Settings',  super_admin: true,  admin: true,  staff: false },
  { permission: 'Manage Team',      super_admin: true,  admin: false, staff: false },
  { permission: 'View Audit Log',   super_admin: true,  admin: true,  staff: false },
];

export default function TeamManagement() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(ROLES.STAFF);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => base44.entities.User.list(),
  });

  const isSuperAdmin = currentUser?.role === ROLES.SUPER_ADMIN;

  const staffUsers = useMemo(() => {
    const base = users.filter(u => [ROLES.STAFF, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(u.role));
    return roleFilter ? base.filter(u => u.role === roleFilter) : base;
  }, [users, roleFilter]);

  const invitableRoles = isSuperAdmin
    ? [ROLES.STAFF, ROLES.ADMIN, ROLES.SUPER_ADMIN]
    : [ROLES.STAFF];

  if (!canAccess('manage_team')) return <AdminLayout><AccessDenied /></AdminLayout>;

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg('');
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      await logAction({ action: 'invited', entity: 'User', entityId: inviteEmail, userName: currentUser?.full_name || currentUser?.email });
      setInviteMsg(`✓ Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      setInviteMsg('Failed: ' + err.message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId, newRole) {
    if (!isSuperAdmin && newRole !== ROLES.STAFF) return;
    await base44.entities.User.update(userId, { role: newRole });
    await logAction({ action: 'role_changed', entity: 'User', entityId: userId, userName: currentUser?.full_name || currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  }

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Team & Roles</h1>
            <p className="text-sm text-muted-foreground">Super Admin only</p>
          </div>
        </div>

        {/* Invite */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite Team Member
          </h2>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-3">
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
              placeholder="email@example.com"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm">
              {invitableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button type="submit" disabled={inviting}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
          {inviteMsg && (
            <p className={`mt-2 text-sm px-3 py-2 rounded-lg ${inviteMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
              {inviteMsg}
            </p>
          )}
        </div>

        {/* Members table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Team Members ({staffUsers.length})</h2>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-input bg-background">
              <option value="">All roles</option>
              {[ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="divide-y divide-border">
            {staffUsers.map(u => {
              const isMe = u.id === currentUser?.id;
              const canChangeThisUser = isSuperAdmin && !isMe;
              return (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(u.full_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.full_name || '—'} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  {canChangeThisUser ? (
                    <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg border-0 font-medium cursor-pointer ${ROLE_COLORS[u.role] || 'bg-muted'}`}>
                      {[ROLES.STAFF, ROLES.ADMIN, ROLES.SUPER_ADMIN].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${ROLE_COLORS[u.role] || 'bg-muted'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  )}
                </div>
              );
            })}
            {staffUsers.length === 0 && (
              <p className="px-5 py-8 text-sm text-muted-foreground text-center">No team members found.</p>
            )}
          </div>
        </div>

        {/* Permission matrix */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <button onClick={() => setShowMatrix(p => !p)}
            className="w-full flex items-center justify-between px-5 py-3 border-b border-border hover:bg-muted/20 transition-colors">
            <h2 className="text-sm font-semibold text-foreground">Role → Permission Matrix</h2>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showMatrix ? 'rotate-180' : ''}`} />
          </button>
          {showMatrix && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Permission</th>
                    <th className="px-4 py-3 text-center">Super Admin</th>
                    <th className="px-4 py-3 text-center">Admin</th>
                    <th className="px-4 py-3 text-center">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PERMISSION_MATRIX.map(row => (
                    <tr key={row.permission} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-foreground text-sm">{row.permission}</td>
                      {['super_admin', 'admin', 'staff'].map(role => (
                        <td key={role} className="px-4 py-2.5 text-center">
                          {row[role]
                            ? <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold leading-5">✓</span>
                            : <span className="inline-block w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs leading-5">—</span>}
                        </td>
                      ))}
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