import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLightningHealth } from './useLightningHealth';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('useLightningHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unavailable when the server says so', async () => {
    const fetchMock = mockFetch(async () => new Response(JSON.stringify({ lightning: 'unavailable' }), { status: 200 }));
    const { result } = renderHook(() => useLightningHealth(), { wrapper });
    await waitFor(() => expect(result.current.lightningUnavailable).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/lightning/health', expect.anything());
  });

  it('is available when the server says ok', async () => {
    const fetchMock = mockFetch(async () => new Response(JSON.stringify({ lightning: 'ok' }), { status: 200 }));
    const { result } = renderHook(() => useLightningHealth(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.lightningUnavailable).toBe(false);
  });

  it('does not block play when the health check itself fails', async () => {
    const fetchMock = mockFetch(async () => new Response('Bad Gateway', { status: 502 }));
    const { result } = renderHook(() => useLightningHealth(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.lightningUnavailable).toBe(false);
  });

  it('stops blocking if a later health check fails after an unavailable result', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ lightning: 'unavailable' }), { status: 200 })
        : new Response('Bad Gateway', { status: 502 });
    });
    const { result } = renderHook(() => useLightningHealth(), { wrapper });
    await waitFor(() => expect(result.current.lightningUnavailable).toBe(true));
    await result.current.refreshLightningHealth();
    await waitFor(() => expect(result.current.lightningUnavailable).toBe(false));
  });
});
