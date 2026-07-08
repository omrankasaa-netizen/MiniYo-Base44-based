import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Search } from 'lucide-react';

export default function MembershipPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();

  // Settings form
  const [settings, setSettings] = useState({
    bronze_credits: 2,
    bronze_discount_pct: 5,
    silver_threshold_usd: 100,
    silver_credits: 4,
    silver_discount_pct: 10,
    gold_threshold_usd: 250,
    gold_credits: 6,
    gold_discount_pct: 15,
    credit_expiry_days: 0,
  });

  // Customer search
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [creditAdjustment, setCreditAdjustment] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const { data: memSettings = [] } = useQuery({
    queryKey: ['membership-settings'],
    queryFn: () => base44.entities.MembershipSettings.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => base44.entities.Customer.list('-created_date', 500),
  });

  const { data: credits = [] } = useQuery({
    queryKey: ['free-delivery-credits'],
    queryFn: () => base44.entities.FreeDeliveryCredit.list('-granted_at', 1000),
  });

  useEffect(() => {
    if (memSettings.length > 0) {
      setSettings(memSettings[0]);
    }
  }, [memSettings]);

  const filteredCustomers = customers.filter(c =>
    !search || c.email?.toLowerCase().includes(search.toLowerCase()) || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const customerCredits = selectedCustomer
    ? credits.filter(c => c.customer_id === selectedCustomer.id)
    : [];

  const availableCredits = customerCredits.filter(c => c.status === 'available').length;

  async function handleSaveSettings() {
    setSaving(true);
    setMsg('');
    try {
      if (memSettings.length > 0) {
        await base44.entities.MembershipSettings.update(memSettings[0].id, settings);
      } else {
        await base44.entities.MembershipSettings.create(settings);
      }
      qc.invalidateQueries({ queryKey: ['membership-settings'] });
      setMsg('Settings saved!');
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  async function handleAdjustCredits() {
    if (!selectedCustomer || !creditAdjustment) return;
    setSaving(true);
    try {
      const amount = parseInt(creditAdjustment);
      const newBalance = selectedCustomer.free_delivery_credits_remaining + amount;
      await base44.entities.Customer.update(selectedCustomer.id, {
        free_delivery_credits_remaining: Math.max(0, newBalance)
      });
      qc.invalidateQueries({ queryKey: ['customers-list'] });
      setMsg(`Added ${amount} credits to ${selectedCustomer.name}`);
      setCreditAdjustment('');
      setCreditReason('');
      setSelectedCustomer(null);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  const tierColors = {
    Bronze: 'bg-amber-50 text-amber-700',
    Silver: 'bg-slate-50 text-slate-700',
    Gold: 'bg-yellow-50 text-yellow-700'
  };

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        <h1 className="text-2xl font-heading font-bold text-foreground">Membership Settings</h1>

        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-xl text-sm">
            {msg}
          </div>
        )}

        {/* Settings Form */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Tier Configuration</h2>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Bronze */}
            <div className="border border-border rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-amber-700">Bronze (Entry)</h3>
              <div>
                <label className="text-xs text-muted-foreground">Credits on Register</label>
                <input
                  type="number"
                  value={settings.bronze_credits}
                  onChange={(e) => setSettings(s => ({ ...s, bronze_credits: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Discount %</label>
                <input
                  type="number"
                  value={settings.bronze_discount_pct}
                  onChange={(e) => setSettings(s => ({ ...s, bronze_discount_pct: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            </div>

            {/* Silver */}
            <div className="border border-border rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-slate-700">Silver</h3>
              <div>
                <label className="text-xs text-muted-foreground">Threshold ($)</label>
                <input
                  type="number"
                  value={settings.silver_threshold_usd}
                  onChange={(e) => setSettings(s => ({ ...s, silver_threshold_usd: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Credits</label>
                <input
                  type="number"
                  value={settings.silver_credits}
                  onChange={(e) => setSettings(s => ({ ...s, silver_credits: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Discount %</label>
                <input
                  type="number"
                  value={settings.silver_discount_pct}
                  onChange={(e) => setSettings(s => ({ ...s, silver_discount_pct: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            </div>

            {/* Gold */}
            <div className="border border-border rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-yellow-700">Gold</h3>
              <div>
                <label className="text-xs text-muted-foreground">Threshold ($)</label>
                <input
                  type="number"
                  value={settings.gold_threshold_usd}
                  onChange={(e) => setSettings(s => ({ ...s, gold_threshold_usd: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Credits</label>
                <input
                  type="number"
                  value={settings.gold_credits}
                  onChange={(e) => setSettings(s => ({ ...s, gold_credits: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Discount %</label>
                <input
                  type="number"
                  value={settings.gold_discount_pct}
                  onChange={(e) => setSettings(s => ({ ...s, gold_discount_pct: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Credit Expiry (days; 0 = never)</label>
            <input
              type="number"
              value={settings.credit_expiry_days}
              onChange={(e) => setSettings(s => ({ ...s, credit_expiry_days: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
            />
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Save Settings
          </button>
        </div>

        {/* Customer Management (super_admin only) */}
        {currentUser?.role === 'super_admin' && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Customer Membership & Credits</h2>

            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="bg-transparent flex-1 outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredCustomers.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className={`w-full p-3 rounded-xl border text-left transition-colors ${
                    selectedCustomer?.id === c.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${tierColors[c.current_tier] || 'bg-muted'}`}>
                      {c.current_tier}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selectedCustomer && (
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <h3 className="font-bold text-foreground mb-2">{selectedCustomer.name}'s Info</h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Tier: <span className={`font-bold ${tierColors[selectedCustomer.current_tier]}`}>{selectedCustomer.current_tier}</span></p>
                    <p>Lifetime Spend: ${(selectedCustomer.lifetime_spend_usd || 0).toFixed(2)}</p>
                    <p>Available Credits: {availableCredits}</p>
                    <p>Current Balance: {selectedCustomer.free_delivery_credits_remaining || 0}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Adjust Credits</label>
                  <input
                    type="number"
                    value={creditAdjustment}
                    onChange={(e) => setCreditAdjustment(e.target.value)}
                    placeholder="e.g. +2 or -1"
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Reason (optional)</label>
                  <input
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    placeholder="Manual adjustment reason…"
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
                  />
                </div>

                <button
                  onClick={handleAdjustCredits}
                  disabled={saving || !creditAdjustment}
                  className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  Apply Adjustment
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}