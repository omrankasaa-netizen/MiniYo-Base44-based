import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Plus, Pencil, Trash2, Upload, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';

function Toggle({ value, onChange }) {
  return (
    <div onClick={onChange}
      className={`w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </div>
  );
}

function CategoryForm({ category, parentCategories, onClose, onSaved, currentUser }) {
  const isNew = !category?.id;
  const [form, setForm] = useState({
    name: '', name_ar: '', slug: '', description: '', description_ar: '',
    image_url: '', parent_id: '', sort_order: 0, is_active: true,
    ...category,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setF('image_url', file_url);
    setUploading(false);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    const slug = form.slug || form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const payload = { ...form, slug };
    if (isNew) {
      const c = await base44.entities.Category.create(payload);
      await logAction({ action: 'created', entity: 'Category', entityId: c.id, userName: currentUser?.email });
    } else {
      await base44.entities.Category.update(category.id, payload);
      await logAction({ action: 'updated', entity: 'Category', entityId: category.id, userName: currentUser?.email });
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-foreground">{isNew ? 'Add Category' : 'Edit Category'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground">✕</button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name (EN) *</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)} required
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="e.g. Apparel" />
            </div>
            <div dir="rtl">
              <label className="text-xs text-muted-foreground block mb-1">الاسم (AR)</label>
              <input value={form.name_ar} onChange={e => setF('name_ar', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="مثلاً: ملابس" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Parent Category (leave empty for top-level)</label>
            <select value={form.parent_id} onChange={e => setF('parent_id', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="">— Top-level category —</option>
              {parentCategories.filter(c => !c.parent_id && c.id !== category?.id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Slug (auto-generated)</label>
            <input value={form.slug} onChange={e => setF('slug', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="auto-generated" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description (EN)</label>
              <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>
            <div dir="rtl">
              <label className="text-xs text-muted-foreground block mb-1">الوصف (AR)</label>
              <textarea value={form.description_ar} onChange={e => setF('description_ar', e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Category Image</label>
            <div className="flex items-center gap-3">
              {form.image_url && <img src={form.image_url} alt="" className="w-16 h-12 object-cover rounded-lg border border-border" />}
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border bg-muted hover:bg-muted/70 cursor-pointer text-sm text-muted-foreground">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload Image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sort Order</label>
              <input type="number" value={form.sort_order} onChange={e => setF('sort_order', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Toggle value={form.is_active} onChange={() => setF('is_active', !form.is_active)} />
                <span className="text-sm text-foreground">Active</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [editCat, setEditCat] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: allCategories = [], isLoading } = useQuery({
    queryKey: ['admin-categories-full'],
    queryFn: () => base44.entities.Category.list('sort_order', 200),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['admin-products-count'],
    queryFn: () => base44.entities.Product.list('name', 500),
  });

  // Build tree: parents with children
  const tree = useMemo(() => {
    const parents = allCategories.filter(c => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const childrenMap = {};
    for (const c of allCategories) {
      if (c.parent_id) {
        if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
        childrenMap[c.parent_id].push(c);
      }
    }
    return parents.map(p => ({ ...p, children: (childrenMap[p.id] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) }));
  }, [allCategories]);

  const productCountMap = useMemo(() => {
    const m = {};
    for (const p of products) {
      if (p.category_id) m[p.category_id] = (m[p.category_id] || 0) + 1;
      if (p.subcategory_id) m[p.subcategory_id] = (m[p.subcategory_id] || 0) + 1;
    }
    return m;
  }, [products]);

  async function toggleActive(cat) {
    await base44.entities.Category.update(cat.id, { is_active: !cat.is_active });
    await logAction({ action: 'updated', entity: 'Category', entityId: cat.id, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-categories-full'] });
  }

  async function doDelete(id) {
    await base44.entities.Category.delete(id);
    await logAction({ action: 'deleted', entity: 'Category', entityId: id, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-categories-full'] });
    setConfirmDelete(null);
  }

  function openNew(parentId = '') {
    setEditCat({ parent_id: parentId });
    setShowForm(true);
  }

  function openEdit(cat) {
    setEditCat(cat);
    setShowForm(true);
  }

  if (!canAccess('manage_cms')) return <AdminLayout><AccessDenied /></AdminLayout>;

  function CategoryRow({ cat, isChild = false }) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${isChild ? 'bg-muted/20 pl-10' : ''}`}>
        {isChild && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        {cat.image_url
          ? <img src={cat.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border" />
          : <div className="w-9 h-9 rounded-lg bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs font-bold">
              {cat.name[0]}
            </div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{cat.name}</p>
          {cat.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{cat.name_ar}</p>}
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
          {productCountMap[cat.id] || 0} products
        </span>
        <span className="text-xs font-mono text-muted-foreground hidden sm:block shrink-0">/{cat.slug}</span>
        <Toggle value={cat.is_active} onChange={() => toggleActive(cat)} />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => openEdit(cat)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!isChild && (
            <button onClick={() => openNew(cat.id)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Add subcategory">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setConfirmDelete(cat.id)}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Categories</h1>
            <p className="text-sm text-muted-foreground">{allCategories.length} total · Nest subcategories with the + button</p>
          </div>
          <button onClick={() => openNew('')}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {isLoading && <p className="px-5 py-8 text-sm text-muted-foreground text-center">Loading…</p>}
          {!isLoading && tree.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No categories yet. Add one to get started.</p>
            </div>
          )}
          <div className="divide-y divide-border">
            {tree.map(parent => (
              <div key={parent.id}>
                <CategoryRow cat={parent} />
                {parent.children.map(child => (
                  <CategoryRow key={child.id} cat={child} isChild />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-xs text-muted-foreground">
          <strong>Tip:</strong> Top-level categories (e.g. "Apparel") show as main navigation. Click + next to a parent to add subcategories (e.g. "Overalls", "Sets"). Products can be assigned to both a category and a subcategory in the product editor.
        </div>
      </div>

      {showForm && (
        <CategoryForm
          category={editCat}
          parentCategories={allCategories}
          currentUser={currentUser}
          onClose={() => { setShowForm(false); setEditCat(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-categories-full'] });
            qc.invalidateQueries({ queryKey: ['categories'] });
            setShowForm(false);
            setEditCat(null);
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-heading font-semibold text-foreground mb-2">Delete category?</h3>
            <p className="text-sm text-muted-foreground mb-5">Any subcategories and product links will be orphaned. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(confirmDelete)} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}