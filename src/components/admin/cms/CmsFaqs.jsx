import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/auditLog';
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';

function FaqRow({ faq, index, total, onMove, onDelete, onSave }) {
  const [form, setForm] = useState({
    question: faq.question || '',
    question_ar: faq.question_ar || '',
    answer: faq.answer || '',
    answer_ar: faq.answer_ar || '',
    is_active: faq.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    await onSave(faq.id, { ...form, sort_order: index });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={`bg-card border rounded-2xl p-4 space-y-3 shadow-sm ${form.is_active ? 'border-border' : 'border-border opacity-60'}`}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMove(index, -1)} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground font-mono w-5">#{index + 1}</span>
        <div className="flex-1" />
        <div onClick={() => setF('is_active', !form.is_active)}
          className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted'}`}>
          <div className={`w-3 h-3 m-0.5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
        </div>
        <button onClick={() => onDelete(faq.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Question (EN)</label>
          <input value={form.question} onChange={e => setF('question', e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
        </div>
        <div dir="rtl">
          <label className="text-xs text-muted-foreground block mb-1">السؤال (AR)</label>
          <input value={form.question_ar} onChange={e => setF('question_ar', e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Answer (EN)</label>
          <textarea value={form.answer} onChange={e => setF('answer', e.target.value)} rows={2}
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
        </div>
        <div dir="rtl">
          <label className="text-xs text-muted-foreground block mb-1">الجواب (AR)</label>
          <textarea value={form.answer_ar} onChange={e => setF('answer_ar', e.target.value)} rows={2}
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
        <Save className="w-3 h-3" /> {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function CmsFaqs({ faqs, onRefresh, currentUser }) {
  async function addFaq() {
    await base44.entities.Faq.create({ question: 'New Question', answer: 'Answer here', is_active: false, sort_order: faqs.length });
    await logAction({ action: 'faq_created', entity: 'Faq', userName: currentUser?.email });
    onRefresh();
  }

  async function deleteFaq(id) {
    await base44.entities.Faq.delete(id);
    await logAction({ action: 'faq_deleted', entity: 'Faq', entityId: id, userName: currentUser?.email });
    onRefresh();
  }

  async function saveFaq(id, data) {
    await base44.entities.Faq.update(id, data);
    onRefresh();
  }

  async function moveFaq(index, direction) {
    const sorted = [...faqs];
    const other = sorted[index + direction];
    if (!other) return;
    await base44.entities.Faq.update(sorted[index].id, { sort_order: index + direction });
    await base44.entities.Faq.update(other.id, { sort_order: index });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{faqs.length} FAQ{faqs.length !== 1 ? 's' : ''}</p>
        <button onClick={addFaq}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add FAQ
        </button>
      </div>
      {faqs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-2xl">
          No FAQs yet. Add one above.
        </div>
      )}
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <FaqRow key={faq.id} faq={faq} index={i} total={faqs.length}
            onMove={moveFaq} onDelete={deleteFaq} onSave={saveFaq} />
        ))}
      </div>
    </div>
  );
}