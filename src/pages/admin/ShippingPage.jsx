import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, DollarSign, Loader2 } from 'lucide-react';

export default function ShippingPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [editingZone, setEditingZone] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [thresholdVal, setThresholdVal] = useState('');
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [formData, setFormData] = useState({
    area_name: '',
    area_name_ar: '',
    fee_usd: '',
    is_active: true,
    is_catchall: false,
    sort_order: 0
  });

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['admin-shipping-zones'],
    queryFn: () => base44.entities.ShippingZone.list('sort_order', 100),
  });

  const { data: siteSettings = [] } = useQuery({
    queryKey: ['site-settings-shipping'],
    queryFn: async () => {
      const settings = await base44.entities.SiteSetting.filter({}, 'setting_key', 100);
      return settings;
    },
  });

  const thresholdSetting = siteSettings.find(s => s.setting_key === 'free_shipping_threshold');
  const threshold = thresholdSetting ? parseFloat(thresholdSetting.setting_value) : 50;

  function openNewForm() {
    setFormData({ area_name: '', area_name_ar: '', fee_usd: '', is_active: true, is_catchall: false, sort_order: zones.length });
    setEditingZone(null);
    setShowForm(true);
  }

  function openEditForm(zone) {
    setFormData(zone);
    setEditingZone(zone.id);
    setShowForm(true);
  }

  async function handleSaveZone() {
    if (!formData.area_name || !formData.fee_usd) return;
    try {
      if (editingZone) {
        await base44.entities.ShippingZone.update(editingZone, formData);
        await logAction({ action: 'updated', entity: 'ShippingZone', details: `${formData.area_name}`, userName: currentUser?.email });
      } else {
        await base44.entities.ShippingZone.create(formData);
        await logAction({ action: 'created', entity: 'ShippingZone', details: `${formData.area_name}`, userName: currentUser?.email });
      }
      qc.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
      setShowForm(false);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteZone(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await base44.entities.ShippingZone.delete(id);
      await logAction({ action: 'deleted', entity: 'ShippingZone', details: `${name}`, userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleActive(zone) {
    try {
      await base44.entities.ShippingZone.update(zone.id, { is_active: !zone.is_active });
      await logAction({ action: 'toggled', entity: 'ShippingZone', details: `${zone.area_name} is_active`, userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSaveThreshold() {
    const val = parseFloat(thresholdVal);
    if (isNaN(val) || val < 0) return;
    try {
      if (thresholdSetting) {
        await base44.entities.SiteSetting.update(thresholdSetting.id, { setting_value: val.toString() });
      } else {
        await base44.entities.SiteSetting.create({
          setting_key: 'free_shipping_threshold',
          setting_value: val.toString(),
          description: 'Order subtotal (after member/promo discounts) for free shipping'
        });
      }
      await logAction({ action: 'updated', entity: 'SiteSetting', details: `free_shipping_threshold = $${val}`, userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['site-settings-shipping'] });
      setEditingThreshold(false);
      setThresholdVal('');
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSeedDefaults() {
    if (!confirm('Seed default Lebanese zones (Tripoli $4, Koura $4, Beirut $5, Akkar $5, catch-all $6)?')) return;
    setSeeding(true);
    try {
      const result = await base44.functions.invoke('seedShippingZones', {});
      alert(result.message || 'Zones seeded successfully');
      qc.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
    } catch (err) {
      alert('Seed failed: ' + err.message);
    } finally {
      setSeeding(false);
    }
  }

  if (!canAccess('manage_settings')) return <AdminLayout><AccessDenied /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Shipping Zones</h1>
          <p className="text-sm text-muted-foreground">Manage Lebanese delivery areas and fees</p>
        </div>

        {/* Free shipping threshold */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Free Shipping Threshold
            </h2>
            {!editingThreshold && (
              <button onClick={() => { setThresholdVal(threshold.toString()); setEditingThreshold(true); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted">
                Edit
              </button>
            )}
          </div>
          {editingThreshold ? (
            <div className="flex gap-2">
              <input value={thresholdVal} onChange={e => setThresholdVal(e.target.value)} type="number" step="0.01"
                className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="50" />
              <button onClick={handleSaveThreshold} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold">Save</button>
              <button onClick={() => setEditingThreshold(false)} className="px-4 py-2 border border-border rounded-xl text-xs">Cancel</button>
            </div>
          ) : (
            <p className="text-lg font-bold text-foreground">${threshold.toFixed(2)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">Orders with post-discount subtotal ≥ this amount ship free to any zone</p>
        </div>

        {/* Shipping zones table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Active Zones</h2>
            <div className="flex gap-2">
              {zones.length === 0 && (
                <button onClick={handleSeedDefaults} disabled={seeding}
                  className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50">
                  {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Seed Defaults
                </button>
              )}
              <button onClick={openNewForm}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" /> Add Zone
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left w-6" />
                    <th className="px-4 py-3 text-left">Area</th>
                    <th className="px-4 py-3 text-left">Arabic</th>
                    <th className="px-4 py-3 text-left">Fee</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
                  )}
                  {!isLoading && zones.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No zones yet.</td></tr>
                  )}
                  {zones.map(zone => (
                    <tr key={zone.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3"><GripVertical className="w-4 h-4 text-muted-foreground opacity-50" /></td>
                      <td className="px-4 py-3 font-medium text-foreground">{zone.area_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{zone.area_name_ar || '—'}</td>
                      <td className="px-4 py-3 font-bold text-primary">${zone.fee_usd.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {zone.is_catchall ? (
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full font-medium">Catch-all</span>
                        ) : (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {zone.is_active ? (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full font-medium">Active</span>
                        ) : (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleActive(zone)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            {zone.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => openEditForm(zone)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteZone(zone.id, zone.area_name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Zone form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="font-heading font-bold text-lg text-foreground">{editingZone ? 'Edit Zone' : 'New Zone'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Area Name (EN) *</label>
                <input value={formData.area_name} onChange={e => setFormData({ ...formData, area_name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" placeholder="e.g. Tripoli" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Area Name (AR)</label>
                <input value={formData.area_name_ar} onChange={e => setFormData({ ...formData, area_name_ar: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" placeholder="e.g. طرابلس" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Shipping Fee (USD) *</label>
                <input value={formData.fee_usd} onChange={e => setFormData({ ...formData, fee_usd: parseFloat(e.target.value) || '' })}
                  type="number" step="0.01" className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" placeholder="4" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Sort Order</label>
                <input value={formData.sort_order} onChange={e => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  type="number" className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" placeholder="0" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_catchall} onChange={e => setFormData({ ...formData, is_catchall: e.target.checked })} className="rounded" />
                <span className="text-xs text-muted-foreground">This is the default/catch-all zone</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="rounded" />
                <span className="text-xs text-muted-foreground">Active (available at checkout)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSaveZone} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}