import { db } from '@/prisma/db';

export interface AuditLogInput {
  actorTelegramId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: 'order' | 'product' | 'staff' | 'settings';
  targetId?: string | number | null;
  details?: string | null;
}

/**
 * Records a staff activity entry in AuditLog. Never throws so primary actions aren't blocked.
 */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.orm.public.AuditLog.create({
      actorTelegramId: input.actorTelegramId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId !== undefined && input.targetId !== null ? String(input.targetId) : null,
      details: input.details ?? null,
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
