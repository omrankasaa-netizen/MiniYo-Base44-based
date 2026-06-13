import React, { useState } from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Pencil, Trash2, Star, X } from 'lucide-react';

const LEBANON_CITIES = ['Tripoli', 'Beirut', 'Jounieh', 'Sidon', 'Tyre', 'Zahle', 'Batroun', 'Other'];
const EMPTY = { full_name: '', phone: '', city: '', district: '', street: '', building: '', floor: '', apartment: '', landmark: '', is_default: false };

function AddressModal({ address, customerId, onClose, onSaved }) {
  const { t } = useLang();
  const [form, setForm] = useState(address ? { ...address } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (address?.id) {
        await base44.entities.CustomerAddress.update(address.id, form);
      } else {
        await base44.entities.CustomerAddress.create({ ...form, customer_id: customerId });
      }
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">{address?.id ? t('Edit Address', 'تعديل العنوان') : t('New Address', 'عنوان جديد')}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          {[
            { k: 'full_name', label: t('Full Name *', 'الاسم الكامل *'), required: true },
            { k: 'phone', label: t('Phone', 'الهاتف'), type: 'tel' },
          ].map(({ k, label, required, type }) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground block mb-1">{label}</label>
              <input required={required} type={type || 'text'} value={form[k]} onChange={e => setF(k, e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('City *', 'المدينة *')}</label>
              <select required value={form.city} onChange={e => setF('city', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option value="">--</option>
                {LEBANON_CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('District', 'المنطقة')}</label>
              <input value={form.district} onChange={e => setF('district', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
            </div>
          </div>
          {[
            { k: 'street', label: t('Street', 'الشارع') },
            { k: 'building', label: t('Building', 'البناية') },
            { k: 'floor', label: t('Floor / Apt', 'الطابق / الشقة') },
            { k: 'landmark', label: t('Landmark', 'علامة مميزة') },
          ].map(({ k, label }) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground block mb-1">{label}</label>
              <input value={form[k]} onChange={e => setF(k, e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
            </div>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_default} onChange={e => setF('is_default', e.target.checked)} className="rounded" />
            <span className="text-sm">{t('Set as default address', 'تعيين كعنوان افتراضي')}</span>
          </label>
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-50">
            {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save Address', 'حفظ العنوان')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AddressesPage() {
  const { currentUser } = useAuthUser();
  const { t } = useLang();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | 'new' | address object

  const { data: customers = [] } = useQuery({
    queryKey: ['my-customer', currentUser?.id],
    queryFn: () => base44.entities.Customer.filter({ user_id: currentUser.id }, 'name', 1),
    enabled: !!currentUser?.id,
  });
  const customer = customers[0];

  const { data: addresses = [] } = useQuery({
    queryKey: ['my-addresses', customer?.id],
    queryFn: () => base44.entities.CustomerAddress.filter({ customer_id: customer.id }, '-is_default', 20),
    enabled: !!customer?.id,
  });

  async function deleteAddr(id) {
    await base44.entities.CustomerAddress.delete(id);
    qc.invalidateQueries({ queryKey: ['my-addresses'] });
  }

  async function setDefault(addr) {
    await Promise.all(addresses.map(a => base44.entities.CustomerAddress.update(a.id, { is_default: a.id === addr.id })));
    qc.invalidateQueries({ queryKey: ['my-addresses'] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" /> {t('Saved Addresses', 'عناوين محفوظة')}
        </h1>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> {t('Add', 'إضافة')}
        </button>
      </div>
      {addresses.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('No addresses saved yet.', 'لا توجد عناوين محفوظة.')}</p>
        </div>
      )}
      {addresses.map(addr => (
        <div key={addr.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-foreground text-sm">{addr.full_name}</p>
                {addr.is_default && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{t('Default', 'افتراضي')}</span>}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {[addr.city, addr.district, addr.street, addr.building, addr.floor].filter(Boolean).join(', ')}
              </p>
              {addr.phone && <p className="text-xs text-muted-foreground mt-0.5">{addr.phone}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              {!addr.is_default && (
                <button onClick={() => setDefault(addr)} title={t('Set default', 'تعيين كافتراضي')}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary">
                  <Star className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setModal(addr)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => deleteAddr(addr.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
      {modal && (
        <AddressModal
          address={modal === 'new' ? null : modal}
          customerId={customer?.id}
          onClose={() => setModal(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['my-addresses'] })}
        />
      )}
    </div>
  );
}