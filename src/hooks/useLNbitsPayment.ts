import { useState, useEffect, useCallback, useRef } from 'react';

// Served by the score service (nginx proxies /api). It talks to LNbits server-side,
// so no LNbits key is ever shipped to the browser.
const LIGHTNING_API = '/api/lightning';

interface InvoiceResponse {
  invoice: string;
  paymentHash: string;
}

interface UseLNbitsPaymentOptions {
  onPaid?: () => void;
}

interface UseLNbitsPaymentReturn {
  createInvoice: (amountSats: number, memo?: string) => Promise<string>;
  invoice: string | null;
  paymentHash: string | null;
  isPaid: boolean;
  isPolling: boolean;
  error: string | null;
  reset: () => void;
}

/** Thrown when the server reports that Lightning payments are temporarily unavailable. */
export class LightningUnavailableError extends Error {
  constructor() {
    super('Lightning payments are temporarily unavailable. Please try again a little later.');
    this.name = 'LightningUnavailableError';
  }
}

/**
 * Hook to create invoices and poll for payment status via the game's own API
 */
export function useLNbitsPayment({ onPaid }: UseLNbitsPaymentOptions = {}): UseLNbitsPaymentReturn {
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const checkPaymentStatus = useCallback(async (hash: string): Promise<boolean> => {
    try {
      const response = await fetch(`${LIGHTNING_API}/payments/${hash}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // Transient (LNbits down, rate limited...): treat as not paid yet and keep polling
        console.warn('[Payment] Status check failed:', response.status);
        return false;
      }
      const data: { paid?: boolean } = await response.json();
      return data.paid === true;
    } catch (err) {
      console.warn('[Payment] Error checking status:', err);
      return false;
    }
  }, []);

  const startPolling = useCallback((hash: string) => {
    stopPolling();
    setIsPolling(true);

    pollingRef.current = setInterval(async () => {
      const paid = await checkPaymentStatus(hash);
      if (paid && pollingRef.current) {
        stopPolling();
        setIsPaid(true);
        setIsPolling(false);
        onPaidRef.current?.();
      }
    }, 2000);

    // Stop polling after 10 minutes
    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setIsPolling(false);
    }, 10 * 60 * 1000);
  }, [checkPaymentStatus, stopPolling]);

  const createInvoice = useCallback(async (amountSats: number, memo?: string): Promise<string> => {
    setError(null);
    setIsPaid(false);

    try {
      let response: Response;
      try {
        response = await fetch(`${LIGHTNING_API}/invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountSats, memo }),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw new LightningUnavailableError();
      }

      if (response.status === 503 || response.status === 502 || response.status === 504) {
        throw new LightningUnavailableError();
      }
      if (response.status === 429) {
        throw new Error('Too many attempts. Please wait a minute and try again.');
      }
      if (!response.ok) {
        throw new Error('Failed to get invoice');
      }

      const data: InvoiceResponse = await response.json();
      if (!data.invoice || !/^[0-9a-f]{64}$/.test(data.paymentHash)) {
        throw new Error('No invoice returned');
      }

      setInvoice(data.invoice);
      setPaymentHash(data.paymentHash);

      // Start polling for payment status
      startPolling(data.paymentHash);

      return data.invoice;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invoice';
      setError(message);
      throw err;
    }
  }, [startPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setInvoice(null);
    setPaymentHash(null);
    setIsPaid(false);
    setIsPolling(false);
    setError(null);
  }, [stopPolling]);

  return {
    createInvoice,
    invoice,
    paymentHash,
    isPaid,
    isPolling,
    error,
    reset,
  };
}
