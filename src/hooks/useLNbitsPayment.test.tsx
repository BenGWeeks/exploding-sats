import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LightningUnavailableError, useLNbitsPayment } from './useLNbitsPayment';

const HASH = 'ab'.repeat(32);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

/** Answers POST /invoice with `invoice` and each status poll with the next entry of `statuses`. */
function mockApi({ invoice = json(200, { invoice: 'lnbc210n1test', paymentHash: HASH }), statuses = [] as Response[] } = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return invoice;
    return statuses.shift() ?? json(200, { paid: false });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('useLNbitsPayment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks the game server for the invoice and never sends an API key', async () => {
    const fetchMock = mockApi();
    const { result } = renderHook(() => useLNbitsPayment());

    await act(async () => {
      await result.current.createInvoice(21);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.invoice).toBe('lnbc210n1test');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/lightning/invoice', `/api/lightning/payments/${HASH}`]);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url.startsWith('/api/')).toBe(true); // same-origin only
      expect(JSON.stringify(init?.headers ?? {}).toLowerCase()).not.toContain('api-key');
    }
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ amountSats: 21 });
  });

  it('keeps polling through transient errors and reports the payment', async () => {
    mockApi({ statuses: [json(503, {}), json(429, {}), json(200, { paid: false }), json(200, { paid: true })] });
    const onPaid = vi.fn();
    const { result } = renderHook(() => useLNbitsPayment({ onPaid }));

    await act(async () => {
      await result.current.createInvoice(21);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(result.current.isPaid).toBe(false);
    expect(result.current.isPolling).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.isPaid).toBe(true);
    expect(result.current.isPolling).toBe(false);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the server no longer knows the invoice', async () => {
    const fetchMock = mockApi({ statuses: [json(404, { error: 'Unknown or expired invoice' })] });
    const { result } = renderHook(() => useLNbitsPayment());

    await act(async () => {
      await result.current.createInvoice(21);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.isPolling).toBe(false);
    expect(result.current.isPaid).toBe(false);
    expect(result.current.error).toMatch(/expired/);

    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('reports Lightning as unavailable on 503 and rate limiting on 429', async () => {
    mockApi({ invoice: json(503, { error: 'Lightning payments are temporarily unavailable' }) });
    const { result } = renderHook(() => useLNbitsPayment());
    await act(async () => {
      await expect(result.current.createInvoice(21)).rejects.toBeInstanceOf(LightningUnavailableError);
    });
    expect(result.current.invoice).toBeNull();

    mockApi({ invoice: json(429, { error: 'Too many requests' }) });
    await act(async () => {
      await expect(result.current.createInvoice(21)).rejects.toThrow(/Too many attempts/);
    });
  });

  it('rejects a response without a valid payment hash', async () => {
    mockApi({ invoice: json(200, { invoice: 'lnbc210n1test', paymentHash: 'nope' }) });
    const { result } = renderHook(() => useLNbitsPayment());
    await act(async () => {
      await expect(result.current.createInvoice(21)).rejects.toThrow(/No invoice returned/);
    });
    expect(result.current.isPolling).toBe(false);
  });
});
