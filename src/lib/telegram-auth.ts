import crypto from 'node:crypto';
import { db } from '@/prisma/db';

export type StaffRole = 'super_admin' | 'admin' | 'seller';

export interface TelegramUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  fullName: string;
}

export interface AuthContext {
  telegramUser: TelegramUser;
  staffRole: StaffRole | null;
}

/**
 * Verifies Telegram Mini App `initData` using HMAC-SHA256 as specified by Telegram.
 * Returns the parsed Telegram user or null if invalid.
 */
export function verifyTelegramInitData(initData: string): TelegramUser | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return null;
  }

  params.delete('hash');
  const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const hashBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (hashBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hashBuf, expectedBuf)) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(userJson) as {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    const firstName = parsed.first_name ?? 'Customer';
    const lastName = parsed.last_name;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return {
      id: String(parsed.id),
      firstName,
      lastName,
      username: parsed.username,
      fullName: fullName || 'Customer',
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated Telegram user from request headers.
 * In development, allows `x-dev-telegram-id` if `DEV_BYPASS_INITDATA=true` for local browser testing.
 */
export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const initData = request.headers.get('x-telegram-init-data') ?? '';
  let telegramUser = verifyTelegramInitData(initData);

  if (!telegramUser && process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_INITDATA === 'true') {
    const devId = request.headers.get('x-dev-telegram-id');
    if (devId) {
      telegramUser = {
        id: devId,
        firstName: 'Dev',
        lastName: 'User',
        username: 'devuser',
        fullName: 'Dev User',
      };
    }
  }

  if (!telegramUser) {
    return null;
  }

  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.trim();
  if (superAdminId && telegramUser.id === superAdminId) {
    return { telegramUser, staffRole: 'super_admin' };
  }

  try {
    const staff = await db.orm.public.StaffUser
      .where({ telegramId: telegramUser.id, isActive: true })
      .first();
    const role = staff?.role as StaffRole | undefined;
    return {
      telegramUser,
      staffRole: role ?? null,
    };
  } catch {
    return { telegramUser, staffRole: null };
  }
}

export function hasRole(role: StaffRole | null, allowed: StaffRole[]): boolean {
  return role !== null && allowed.includes(role);
}
