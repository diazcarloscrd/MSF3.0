// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OFFLINE_QUEUE_KEY,
  PARTNER_DRAFT_KEY,
  clearOfflineQueue,
  clearPartnerDraft,
  enqueueOfflinePartner,
  flushOfflineQueue,
  generateClientRequestId,
  getOfflineQueue,
  isNetworkError,
  loadPartnerDraft,
  markOfflinePartnerAttempt,
  registerOnlineQueueFlush,
  removeOfflinePartner,
  savePartnerDraft,
} from './offlineQueue';

describe('offlineQueue - Borradores locales, UUID v4, clasificación de errores y cola idempotente', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('genera client_request_id UUID v4 único y soporta fallback sin randomUUID', () => {
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const id1 = generateClientRequestId();
    const id2 = generateClientRequestId();
    expect(id1).toMatch(uuidV4Regex);
    expect(id2).toMatch(uuidV4Regex);
    expect(id1).not.toBe(id2);

    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
    });
    try {
      const fallbackId = generateClientRequestId();
      expect(fallbackId).toMatch(uuidV4Regex);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it('persiste, aísla por userId y limpia el borrador del formulario en localStorage', () => {
    savePartnerDraft({
      age: '34',
      amount: '18000',
      paymentType: 'credit_card',
      targetDate: '2026-11-10',
      userId: 'user-a',
    });

    expect(window.localStorage.getItem(PARTNER_DRAFT_KEY)).not.toBeNull();
    const loadedForA = loadPartnerDraft('user-a');
    expect(loadedForA?.age).toBe('34');
    expect(loadedForA?.amount).toBe('18000');
    expect(loadedForA?.paymentType).toBe('credit_card');

    // Aislamiento entre captadores en celulares compartidos
    expect(loadPartnerDraft('user-b')).toBeNull();

    clearPartnerDraft();
    expect(loadPartnerDraft('user-a')).toBeNull();
  });

  it('distingue errores de red de errores de validación/RLS de PostgreSQL', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkError({ message: 'Request timed out' })).toBe(true);

    expect(isNetworkError({ code: '22023', message: 'No podés registrar ni mover socios a una fecha futura.' })).toBe(false);
    expect(isNetworkError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isNetworkError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isNetworkError({ code: 'PGRST116', status: 400, message: 'Bad request' })).toBe(false);

    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isNetworkError({ message: 'Unknown failure' })).toBe(true);
    expect(isNetworkError({ code: '22023', message: 'Fecha inválida' })).toBe(false);
  });

  it('encola sin duplicar por clientRequestId, registra intentos y limpia por usuario', () => {
    const req1 = generateClientRequestId();
    const req2 = generateClientRequestId();

    enqueueOfflinePartner({
      clientRequestId: req1,
      userId: 'user-a',
      age: 30,
      amount: 15000,
      paymentType: 'credit_card',
      targetDate: '2026-11-10',
    });
    // Reintento de encolado con el mismo clientRequestId no duplica
    enqueueOfflinePartner({
      clientRequestId: req1,
      userId: 'user-a',
      age: 30,
      amount: 15000,
      paymentType: 'credit_card',
      targetDate: '2026-11-10',
    });
    enqueueOfflinePartner({
      clientRequestId: req2,
      userId: 'user-b',
      age: 40,
      amount: 20000,
      paymentType: 'debit_card',
      targetDate: '2026-11-10',
    });

    expect(getOfflineQueue()).toHaveLength(2);
    expect(getOfflineQueue('user-a')).toHaveLength(1);
    expect(getOfflineQueue('user-b')).toHaveLength(1);

    markOfflinePartnerAttempt(req1, 'Failed to fetch');
    expect(getOfflineQueue('user-a')[0].attempts).toBe(1);
    expect(getOfflineQueue('user-a')[0].lastError).toBe('Failed to fetch');

    clearOfflineQueue('user-a');
    expect(getOfflineQueue('user-a')).toHaveLength(0);
    expect(getOfflineQueue('user-b')).toHaveLength(1);

    removeOfflinePartner(req2);
    expect(window.localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
  });

  it('ejecuta flushOfflineQueue con idempotencia (duplicate: true), preserva clientRequestId y serializa concurrencia', async () => {
    const req1 = generateClientRequestId();
    const req2 = generateClientRequestId();
    const req3 = generateClientRequestId();

    enqueueOfflinePartner({
      clientRequestId: req1,
      userId: 'user-a',
      age: 28,
      amount: 12000,
      paymentType: 'credit_card',
      targetDate: '2026-11-10',
    });
    enqueueOfflinePartner({
      clientRequestId: req2,
      userId: 'user-a',
      age: 35,
      amount: 18000,
      paymentType: 'debit_card',
      targetDate: '2026-11-10',
    });
    enqueueOfflinePartner({
      clientRequestId: req3,
      userId: 'user-a',
      age: 45,
      amount: 25000,
      paymentType: 'bank_cbu',
      targetDate: '2026-11-10',
    });

    const seenIds: string[] = [];
    const submitFn = vi.fn(async (item) => {
      seenIds.push(item.clientRequestId);
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (item.clientRequestId === req1) return { ok: true };
      if (item.clientRequestId === req2) return { ok: true, duplicate: true };
      return { ok: false, retryable: true, error: 'Timeout' };
    });

    const [res1, res2] = await Promise.all([
      flushOfflineQueue(submitFn, 'user-a'),
      flushOfflineQueue(submitFn, 'user-a'),
    ]);

    // La segunda llamada concurrente reutiliza la promesa en vuelo sin reenviar los 3 ítems
    expect(submitFn).toHaveBeenCalledTimes(3);
    expect(seenIds).toEqual([req1, req2, req3]);
    expect(res1).toEqual(res2);
    expect(res1.sent).toBe(1);
    expect(res1.deduplicated).toBe(1);
    expect(res1.failed).toBe(1);
    expect(res1.remaining).toHaveLength(1);
    expect(res1.remaining[0].clientRequestId).toBe(req3);
    expect(res1.remaining[0].attempts).toBe(1);
  });

  it('permite flushOfflineQueue concurrente entre usuarios distintos sin colisión', async () => {
    const reqA = generateClientRequestId();
    const reqB = generateClientRequestId();

    enqueueOfflinePartner({
      clientRequestId: reqA,
      userId: 'user-a',
      age: 29,
      amount: 15000,
      paymentType: 'credit_card',
      targetDate: '2026-11-10',
    });
    enqueueOfflinePartner({
      clientRequestId: reqB,
      userId: 'user-b',
      age: 36,
      amount: 21000,
      paymentType: 'debit_card',
      targetDate: '2026-11-10',
    });

    const seenByA: string[] = [];
    const seenByB: string[] = [];

    const submitA = vi.fn(async (item) => {
      seenByA.push(item.clientRequestId);
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { ok: true };
    });
    const submitB = vi.fn(async (item) => {
      seenByB.push(item.clientRequestId);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true };
    });

    const [resA, resB] = await Promise.all([
      flushOfflineQueue(submitA, 'user-a'),
      flushOfflineQueue(submitB, 'user-b'),
    ]);

    expect(seenByA).toEqual([reqA]);
    expect(seenByB).toEqual([reqB]);
    expect(resA.sent).toBe(1);
    expect(resA.remaining).toHaveLength(0);
    expect(resB.sent).toBe(1);
    expect(resB.remaining).toHaveLength(0);
    expect(getOfflineQueue('user-a')).toHaveLength(0);
    expect(getOfflineQueue('user-b')).toHaveLength(0);
  });

  it('dispara reintento automático cuando window emite el evento online', async () => {
    const reqId = generateClientRequestId();
    enqueueOfflinePartner({
      clientRequestId: reqId,
      userId: 'user-a',
      age: 31,
      amount: 14000,
      paymentType: 'prepaid_wallet',
      targetDate: '2026-11-10',
    });

    let flushed = false;
    const unregister = registerOnlineQueueFlush(async () => {
      await flushOfflineQueue(async () => ({ ok: true }), 'user-a');
      flushed = true;
    });

    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    unregister();

    expect(flushed).toBe(true);
    expect(getOfflineQueue('user-a')).toHaveLength(0);
  });
});
