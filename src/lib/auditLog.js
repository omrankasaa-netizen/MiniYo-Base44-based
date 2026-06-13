import { base44 } from '@/api/base44Client';

export async function logAction({ action, entity, entityId, userName }) {
  try {
    await base44.entities.AuditLog.create({
      action,
      entity,
      entity_id: entityId || '',
      user_name: userName || 'unknown',
      created_at: new Date().toISOString(),
      details: '',
    });
  } catch (e) {
    // Non-blocking — don't let audit failures break the UI
    console.error('Audit log failed:', e);
  }
}