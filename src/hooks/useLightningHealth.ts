import { useQuery } from '@tanstack/react-query';

export type LightningStatus = 'ok' | 'unavailable';

const HEALTH_URL = '/api/lightning/health';
const REFRESH_MS = 60 * 1000;

async function fetchLightningHealth(): Promise<LightningStatus> {
  const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  const data: { lightning?: string } = await response.json();
  if (data.lightning !== 'ok' && data.lightning !== 'unavailable') {
    throw new Error('Unexpected health response');
  }
  return data.lightning;
}

/**
 * Whether Lightning payments (LNbits) are currently reachable, checked by the
 * score service. Fetched on mount and every 60s.
 *
 * Only a definite "unavailable" from the server marks payments as down: if the
 * health check itself fails we don't know, so play is never blocked on it.
 */
export function useLightningHealth() {
  const { data, isError, refetch } = useQuery({
    queryKey: ['lightning-health'],
    queryFn: fetchLightningHealth,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
    retry: false,
  });

  return {
    // React Query keeps the last data after an error; a failed check must not block
    lightningUnavailable: !isError && data === 'unavailable',
    refreshLightningHealth: refetch,
  };
}
