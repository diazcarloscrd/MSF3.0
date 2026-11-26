import { PaymentMethodType } from '../types/database';

export const PARTNER_DRAFT_KEY = 'msf_partner_draft_v1';
export const OFFLINE_QUEUE_KEY = 'msf_offline_partners_queue_v1';

export interface PartnerDraft {
  age: string;
  amount: string;
  paymentType: PaymentMethodType | null;
  targetDate?: string;
  userId?: string;
  updatedAt: string;
}

export interface QueuedPartnerSubmission {
  clientRequestId: string;
  userId: string;
  userName?: string;
  age: number;
  amount: number;
  paymentType: string;
  targetDate: string;
  queuedAt: string;
  attempts: number;
  lastError?: string | null;
}

export interface OfflineFlushSubmitResult {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
  retryable?: boolean;
}

export interface OfflineFlushSummary {
  sent: number;
  deduplicated: number;
  failed: number;
  remaining: QueuedPartnerSubmission[];
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export function generateClientRequestId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 v4 bit-masking
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function savePartnerDraft(
  draft: Omit<PartnerDraft, 'updatedAt'> & { updatedAt?: string }
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload: PartnerDraft = {
      ...draft,
      updatedAt: draft.updatedAt || new Date().toISOString(),
    };
    storage.setItem(PARTNER_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/storage errors
  }
}

export function loadPartnerDraft(userId?: string): PartnerDraft | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PARTNER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerDraft | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (userId && parsed.userId && parsed.userId !== userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPartnerDraft(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(PARTNER_DRAFT_KEY);
  } catch {
    // Ignore storage errors
  }
}

const NON_NETWORK_PG_CODES = new Set([
  '22023',
  '22P02',
  '23502',
  '23503',
  '23505',
  '23514',
  '42501',
  '42601',
  '42P01',
]);

export function isNetworkError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : '';
    if (code && (NON_NETWORK_PG_CODES.has(code) || code.startsWith('PGRST'))) {
      return false;
    }
    const status = typeof record.status === 'number' ? record.status : 0;
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

  return /failed to fetch|networkerror|network request failed|load failed|fetch|timeout|timed out|abort|internet|offline|econnrefused|enotfound|err_name_not_resolved|err_internet_disconnected/i.test(
    message
  );
}

function readAllQueuedItems(): QueuedPartnerSubmission[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedPartnerSubmission =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.clientRequestId === 'string' &&
        typeof item.userId === 'string'
    );
  } catch {
    return [];
  }
}

function writeAllQueuedItems(items: QueuedPartnerSubmission[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (items.length === 0) {
      storage.removeItem(OFFLINE_QUEUE_KEY);
    } else {
      storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getOfflineQueue(userId?: string): QueuedPartnerSubmission[] {
  const all = readAllQueuedItems();
  if (!userId) return all;
  return all.filter((item) => item.userId === userId);
}

export function enqueueOfflinePartner(
  item: Omit<QueuedPartnerSubmission, 'queuedAt' | 'attempts'> & {
    queuedAt?: string;
    attempts?: number;
  }
): QueuedPartnerSubmission[] {
  const all = readAllQueuedItems();
  const existingIdx = all.findIndex(
    (entry) => entry.clientRequestId === item.clientRequestId
  );

  if (existingIdx >= 0) {
    return all;
  }

  const nextItem: QueuedPartnerSubmission = {
    ...item,
    queuedAt: item.queuedAt || new Date().toISOString(),
    attempts: item.attempts ?? 0,
  };
  const updated = [...all, nextItem];
  writeAllQueuedItems(updated);
  return updated;
}

export function removeOfflinePartner(
  clientRequestId: string
): QueuedPartnerSubmission[] {
  const all = readAllQueuedItems();
  const updated = all.filter((item) => item.clientRequestId !== clientRequestId);
  writeAllQueuedItems(updated);
  return updated;
}

export function markOfflinePartnerAttempt(
  clientRequestId: string,
  lastError?: string
): QueuedPartnerSubmission[] {
  const all = readAllQueuedItems();
  const updated = all.map((item) =>
    item.clientRequestId === clientRequestId
      ? {
          ...item,
          attempts: (item.attempts || 0) + 1,
          lastError: lastError ?? item.lastError ?? null,
        }
      : item
  );
  writeAllQueuedItems(updated);
  return updated;
}

export function clearOfflineQueue(userId?: string): void {
  if (!userId) {
    writeAllQueuedItems([]);
    return;
  }
  const all = readAllQueuedItems();
  writeAllQueuedItems(all.filter((item) => item.userId !== userId));
}

const inFlightFlushPromises = new Map<string, Promise<OfflineFlushSummary>>();

export async function flushOfflineQueue(
  submitFn: (item: QueuedPartnerSubmission) => Promise<OfflineFlushSubmitResult>,
  userId?: string
): Promise<OfflineFlushSummary> {
  const flushKey = userId ?? '__all__';
  const existingPromise = inFlightFlushPromises.get(flushKey);
  if (existingPromise) {
    return existingPromise;
  }

  const runFlush = async (): Promise<OfflineFlushSummary> => {
    const snapshot = getOfflineQueue(userId);
    let sent = 0;
    let deduplicated = 0;
    let failed = 0;

    for (const item of snapshot) {
      try {
        const result = await submitFn(item);
        if (result.ok) {
          removeOfflinePartner(item.clientRequestId);
          if (result.duplicate) {
            deduplicated += 1;
          } else {
            sent += 1;
          }
        } else {
          failed += 1;
          markOfflinePartnerAttempt(item.clientRequestId, result.error);
          if (
            result.retryable !== false &&
            typeof navigator !== 'undefined' &&
            navigator.onLine === false
          ) {
            break;
          }
        }
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        markOfflinePartnerAttempt(item.clientRequestId, msg);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          break;
        }
      }
    }

    return {
      sent,
      deduplicated,
      failed,
      remaining: getOfflineQueue(userId),
    };
  };

  const promise = runFlush().finally(() => {
    if (inFlightFlushPromises.get(flushKey) === promise) {
      inFlightFlushPromises.delete(flushKey);
    }
  });

  inFlightFlushPromises.set(flushKey, promise);
  return promise;
}

export function registerOnlineQueueFlush(
  callback: () => void | Promise<void>
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = () => {
    void callback();
  };
  window.addEventListener('online', handler);
  return () => {
    window.removeEventListener('online', handler);
  };
}
